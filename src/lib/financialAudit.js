export const normalizeMoney = (value) => Number(value || 0);

export const processSupplierPayment = async ({
  supabase,
  supplierId,
  accountId,
  amount,
  method = 'cash',
  note = 'Supplier payment',
  supplierName = null,
}) => {
  if (!supabase || !supplierId || !accountId) {
    throw new Error('Supplier ID and bank account ID are required.');
  }

  const normalizedAmount = normalizeMoney(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const { data: supplierData, error: supplierError } = await supabase
    .from('suppliers')
    .select('id, name, supplier_debt')
    .eq('id', supplierId)
    .single();

  if (supplierError) throw supplierError;

  const currentDebt = Number(supplierData?.supplier_debt || 0);
  const amountToApply = Math.min(normalizedAmount, currentDebt || normalizedAmount);

  if (!currentDebt || amountToApply <= 0) {
    throw new Error('This supplier has no debt to settle.');
  }

  const { data: accountData, error: accountError } = await supabase
    .from('financial_accounts')
    .select('id, label, current_balance')
    .eq('id', accountId)
    .single();

  if (accountError) throw accountError;

  const nextDebt = Math.max(currentDebt - amountToApply, 0);
  const nextBalance = Number(accountData?.current_balance || 0) - amountToApply;
  const paidNote = String(note || 'Supplier payment').trim() || 'Supplier payment';
  const resolvedSupplierName = String(supplierName || supplierData?.name || 'Supplier').trim() || 'Supplier';
  const operationTypeLabel = String(accountData?.label || method || 'Direct Deduction').trim() || 'Direct Deduction';

  const { error: debtError } = await supabase
    .from('suppliers')
    .update({ supplier_debt: nextDebt })
    .eq('id', supplierId);

  if (debtError) throw debtError;

  const { error: ledgerError } = await supabase.from('bank_entries').insert([
    {
      account_id: accountId,
      operation_date: new Date().toISOString(),
      description: `Supplier Payment - ${paidNote}`,
      operation_type: operationTypeLabel,
      third_party: resolvedSupplierName,
      credit: 0,
      debit: amountToApply,
    },
  ]);

  if (ledgerError) throw ledgerError;

  const { error: accountErrorUpdate } = await supabase
    .from('financial_accounts')
    .update({ current_balance: nextBalance })
    .eq('id', accountId);

  if (accountErrorUpdate) throw accountErrorUpdate;

  const { error: paymentInsertError } = await supabase.from('supplier_payments').insert([
    {
      supplier_id: supplierId,
      account_id: accountId,
      amount: amountToApply,
      payment_method: method || operationTypeLabel || 'cash',
      note: paidNote,
      paid_at: new Date().toISOString(),
    },
  ]);

  if (paymentInsertError) throw paymentInsertError;

  return {
    supplierId,
    accountId,
    amount: amountToApply,
    remainingDebt: nextDebt,
    nextBalance,
  };
};

export const getInvoiceLedgerPaymentSummary = async (invoice) => {
  if (!invoice || !invoice.invoice_number || !globalThis?.supabase) {
    return { total_paid: 0, balance_due: Number(invoice?.grand_total || 0), status: 'pending' };
  }

  const invoiceNumber = String(invoice.invoice_number || '').trim();
  const invoiceReference = String(invoice.reference || '').trim();

  const { data, error } = await supabase
    .from('bank_entries')
    .select('id, credit, debit, description, operation_date')
    .order('operation_date', { ascending: false });

  if (error || !Array.isArray(data)) {
    return { total_paid: 0, balance_due: Number(invoice?.grand_total || 0), status: 'pending' };
  }

  const matchingEntries = (data || []).filter((entry) => {
    const description = String(entry.description || '').toLowerCase();
    const invoiceToken = invoiceNumber.toLowerCase();
    const invoiceRefToken = invoiceReference.toLowerCase();
    return description.includes(invoiceToken) || description.includes(invoiceRefToken) || description.includes('invoice payment received');
  });

  const totalPaid = matchingEntries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  const grandTotal = Number(invoice.grand_total || invoice.total || 0);
  const balanceDue = Math.max(grandTotal - totalPaid, 0);
  let status = 'pending';

  if (balanceDue === 0 && grandTotal > 0) status = 'paid';
  else if (totalPaid > 0 && balanceDue > 0) status = 'partial';

  return { total_paid: totalPaid, balance_due: balanceDue, status };
};

export const isDuplicateSupplierPayment = async ({
  supabase,
  supplierId,
  amount,
  method,
  note,
  lookbackMs = 90_000,
}) => {
  if (!supabase || !supplierId) return false;

  const normalizedAmount = normalizeMoney(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return false;

  const since = new Date(Date.now() - lookbackMs).toISOString();
  const normalizedMethod = String(method || 'cash').trim().toLowerCase();
  const normalizedNote = String(note || 'Supplier payment').trim().toLowerCase();

  const { data, error } = await supabase
    .from('supplier_payments')
    .select('id, amount, payment_method, note, paid_at')
    .eq('supplier_id', supplierId)
    .gte('paid_at', since)
    .limit(50);

  if (error || !Array.isArray(data)) return false;

  return data.some((entry) => {
    const sameMethod = String(entry.payment_method || 'cash').trim().toLowerCase() === normalizedMethod;
    const sameAmount = Math.abs(normalizeMoney(entry.amount) - normalizedAmount) < 0.01;
    const sameNote = !normalizedNote || !String(entry.note || '').trim() || String(entry.note || '').trim().toLowerCase() === normalizedNote;
    return sameMethod && sameAmount && sameNote;
  });
};

export const isDuplicateInvoicePayment = async ({
  supabase,
  invoiceId,
  amount,
  method,
}) => {
  if (!supabase || !invoiceId) return false;

  const normalizedAmount = normalizeMoney(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return false;

  const { data, error } = await supabase
    .from('invoices')
    .select('id, status, grand_total, payment_method, paid_at')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !data) return false;

  const sameAmount = Math.abs(normalizeMoney(data.grand_total) - normalizedAmount) < 0.01;
  const sameMethod = String(data.payment_method || 'cash').trim().toLowerCase() === String(method || 'cash').trim().toLowerCase();

  return Boolean(data.status === 'paid' && sameAmount && sameMethod);
};

export const isDuplicateExpenseRecord = async ({
  supabase,
  category,
  amount,
  method,
  date,
  templateId = null,
  note = '',
  lookbackMs = 90_000,
}) => {
  if (!supabase) return false;

  const normalizedAmount = normalizeMoney(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return false;

  const normalizedCategory = String(category || 'General expense').trim().toLowerCase();
  const normalizedMethod = String(method || 'cash').trim().toLowerCase();
  const normalizedNote = String(note || '').trim().toLowerCase();
  const normalizedDate = String(date || new Date().toISOString().slice(0, 10));
  const since = new Date(Date.now() - lookbackMs).toISOString();

  const { data, error } = await supabase
    .from('expenses')
    .select('id, category, amount, method, date, note, template_id, created_at')
    .gte('created_at', since)
    .limit(60);

  if (error || !Array.isArray(data)) return false;

  return data.some((entry) => {
    const sameCategory = String(entry.category || '').trim().toLowerCase() === normalizedCategory;
    const sameAmount = Math.abs(normalizeMoney(entry.amount) - normalizedAmount) < 0.01;
    const sameMethod = String(entry.method || 'cash').trim().toLowerCase() === normalizedMethod;
    const sameDate = String(entry.date || '').slice(0, 10) === normalizedDate;
    const sameTemplate = templateId ? String(entry.template_id || '') === String(templateId) : true;
    const sameNote = !normalizedNote || !String(entry.note || '').trim() || String(entry.note || '').trim().toLowerCase() === normalizedNote;

    return sameCategory && sameAmount && sameMethod && sameDate && sameTemplate && sameNote;
  });
};
