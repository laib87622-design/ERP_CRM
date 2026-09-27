import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { calculateCommissionAmount, fetchAgencySettings, getCommissionRuleForType, getPackageTypeDescription, slugifyCommissionTypeKey } from '../lib/agencySettings';
import { insertBankEntryAndUpdateBalance, recordCommissionPayment } from './BankEntriesLedger';

const statusStyles = {
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-orange-100 text-orange-700',
};

const getInvoicePaymentType = (invoice) => (invoice?.payment_type === 'partial' ? 'partial' : 'full');

const getInvoicePaymentMeta = (invoice, paymentTypeOverride, amountPaidOverride) => {
  const grandTotal = Number(invoice?.grand_total || 0);
  const paymentType = paymentTypeOverride ?? getInvoicePaymentType(invoice);
  const amountPaid = Number(
    amountPaidOverride ?? invoice?.amount_paid ?? ((paymentType === 'full' ? grandTotal : 0) || 0)
  );
  const safeAmountPaid = Math.max(0, Math.min(amountPaid, grandTotal));
  const remaining = Math.max(grandTotal - safeAmountPaid, 0);

  return {
    paymentType,
    amountPaid: safeAmountPaid,
    remaining,
    grandTotal,
  };
};

export default function InvoiceDetail({ language = 'en' }) {
  const translations = {
    en: {
      loading: 'Loading invoice details...',
      back: 'Back to invoices',
      notFound: 'Invoice not found.',
      account: 'Bank account',
      paymentType: 'Payment type',
      amountPaid: 'Amount paid',
      recordPayment: 'Record payment',
      fullPayment: 'Full payment',
      partialPayment: 'Partial payment',
      markPaid: 'Mark Paid',
      markFullPayment: 'Mark Full Payment',
      invoiceSummary: 'Invoice summary',
      customer: 'Customer',
      status: 'Status',
      days: 'Days',
      total: 'Total',
      due: 'Due',
      paymentHistory: 'Payment history',
      noPayment: 'No payment history yet.',
      selectedAccount: 'Selected account',
      close: 'Close',
      invoice: 'Invoice',
      expenseInvoice: 'Expense invoice',
      revenueInvoice: 'Revenue invoice',
      grandTotal: 'Grand total',
      subtotal: 'Subtotal',
      tax: 'TVA',
      reference: 'Reference',
      payment: 'Payment',
      paymentMethod: 'Payment Method',
      paymentTypeLabel: 'Payment Type',
      bankAccount: 'Bank Account',
      amountPaidLabel: 'Amount Paid / المبلغ المدفوع',
      remaining: 'Remaining / المبلغ المتبقي',
      savePartial: 'Save Partial Payment',
      processing: 'Processing...',
      saveFull: 'Mark Paid',
      savePayment: 'Record payment',
      cash: 'Cash',
      creditCard: 'Credit Card',
      baridimob: 'BaridiMob',
      enterValidAmount: 'Please enter a valid amount paid for the partial payment.',
    },
    ar: {
      loading: 'جارٍ تحميل تفاصيل الفاتورة...',
      back: 'العودة إلى الفواتير',
      notFound: 'الفاتورة غير موجودة.',
      account: 'الحساب البنكي',
      paymentType: 'نوع الدفع',
      amountPaid: 'المبلغ المدفوع',
      recordPayment: 'تسجيل الدفع',
      fullPayment: 'الدفع الكامل',
      partialPayment: 'الدفع الجزئي',
      markPaid: 'تحديد كمدفوع',
      markFullPayment: 'تحديد كدفع كامل',
      invoiceSummary: 'ملخص الفاتورة',
      customer: 'العميل',
      status: 'الحالة',
      days: 'أيام',
      total: 'الإجمالي',
      due: 'المستحق',
      paymentHistory: 'سجل المدفوعات',
      noPayment: 'لا يوجد سجل مدفوعات بعد.',
      selectedAccount: 'الحساب المختار',
      close: 'إغلاق',
      invoice: 'فاتورة',
      expenseInvoice: 'فاتورة مصروف',
      revenueInvoice: 'فاتورة إيراد',
      grandTotal: 'الإجمالي الكلي',
      subtotal: 'الإجمالي الفرعي',
      tax: 'الضريبة',
      reference: 'المرجع',
      payment: 'الدفع',
      paymentMethod: 'طريقة الدفع',
      paymentTypeLabel: 'نوع الدفع',
      bankAccount: 'الحساب البنكي',
      amountPaidLabel: 'المبلغ المدفوع / Amount Paid',
      remaining: 'المتبقي / Remaining',
      savePartial: 'حفظ الدفع الجزئي',
      processing: 'جارٍ المعالجة...',
      saveFull: 'تحديد كمدفوع',
      savePayment: 'تسجيل الدفع',
      cash: 'نقدي',
      creditCard: 'بطاقة ائتمان',
      baridimob: 'باريدي موب',
      enterValidAmount: 'يرجى إدخال مبلغ صحيح للدفع الجزئي.',
    },
  };

  const t = translations[language] || translations.en;
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentType, setPaymentType] = useState('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [savingPayment, setSavingPayment] = useState(false);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [agencySettings, setAgencySettings] = useState(null);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setInvoice(null);
          return;
        }

        const [invoiceRes, accountsRes] = await Promise.all([
          supabase
            .from('invoices')
            .select(`
              *,
              clients(full_name, reference, phone, email),
              bookings(
                id,
                reference,
                booking_service_lines(
                  id,
                  description,
                  quantity,
                  unit_price,
                  selling_price,
                  cost_price,
                  tva_rate,
                  service_types(name, name_ar),
                  suppliers(name)
                )
              )
            `)
            .eq('id', invoiceId)
            .maybeSingle(),
          supabase
            .from('financial_accounts')
            .select('id, label, bank_name, current_balance, currency')
            .order('label', { ascending: true }),
        ]);

        const { data, error: fetchError } = invoiceRes;
        const { data: accountsData, error: accountsError } = accountsRes;

        if (fetchError) throw fetchError;
        if (accountsError) throw accountsError;

        const fallbackAccount = (accountsData || []).find((account) => {
          const label = String(account.label || account.bank_name || '').toLowerCase();
          return label.includes('cash') || label.includes('wallet');
        }) || (accountsData || [])[0] || null;

        setFinancialAccounts(accountsData || []);
        setSelectedAccountId((prev) => prev || fallbackAccount?.id || '');

        const bookingServiceLines = data?.bookings?.booking_service_lines || [];
        const packageIds = [...new Set(bookingServiceLines
          .map((line) => {
            const details = (line.details && typeof line.details === 'object') ? line.details : {};
            return line.package_id || details.package_id || null;
          })
          .filter(Boolean))];

        let packageTemplatesById = new Map();
        if (packageIds.length > 0 && supabase) {
          const { data: packageRows } = await supabase
            .from('package_templates')
            .select('id, label, description')
            .in('id', packageIds);

          packageTemplatesById = new Map((packageRows || []).map((item) => [item.id, item]));
        }

        const agencySettingsData = await fetchAgencySettings();
        setAgencySettings(agencySettingsData);

        const invoiceLines = bookingServiceLines.map((line) => {
          const details = (line.details && typeof line.details === 'object') ? line.details : {};
          const packageId = line.package_id || details.package_id || null;
          const packageRecord = packageId ? packageTemplatesById.get(packageId) : null;
          const packageTypeKey = String(packageRecord?.template_type || packageRecord?.type || '').trim().toLowerCase();
          const defaultTypeDescription = getPackageTypeDescription(packageTypeKey || details.package_type || '', agencySettings);
          const serviceTypeName = String(
            line.service_types?.name ||
            line.service_types?.name_ar ||
            packageRecord?.label ||
            details.package_label ||
            'Service type'
          ).trim();
          const description = String(
            line.description ||
            line.service_types?.description ||
            packageRecord?.description ||
            defaultTypeDescription ||
            details.package_description ||
            serviceTypeName ||
            ''
          ).trim();
          const sellingPrice = Number(line.selling_price || line.unit_price || 0);
          const tvaRate = Number(line.tva_rate || 0);
          const tvaAmount = Number((sellingPrice * (tvaRate / 100)).toFixed(2));
          const lineTotal = Number((sellingPrice + tvaAmount).toFixed(2));

          return {
            id: line.id,
            description,
            serviceTypeName,
            supplierName: line.suppliers?.name || '—',
            quantity: Number(line.quantity || 1),
            unitPrice: Number(line.unit_price || line.selling_price || 0),
            costPrice: Number(line.cost_price || 0),
            sellingPrice,
            tvaRate,
            tvaAmount,
            total: lineTotal,
          };
        });

        const resolvedPaymentType = getInvoicePaymentType(data);
        const resolvedAmountPaid = Number(data?.amount_paid ?? 0);

        setPaymentType(resolvedPaymentType);
        setAmountPaid(resolvedAmountPaid);
        setInvoice({ ...data, invoiceLines });
      } catch (err) {
        setError(err.message || 'Unable to load invoice details.');
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) {
      loadInvoice();
    }
  }, [invoiceId]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">{t.loading}</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/invoices')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> {t.back}
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/invoices')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> {t.back}
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">{t.notFound}</div>
      </div>
    );
  }

  const statusClass = statusStyles[invoice.status?.toLowerCase()] || statusStyles.pending;
  const invoiceLines = invoice.invoiceLines || [];
  const computedSubtotal = invoiceLines.length > 0
    ? invoiceLines.reduce((sum, line) => sum + Number(line.sellingPrice || 0), 0)
    : Number(invoice.subtotal || 0);
  const computedTva = invoiceLines.length > 0
    ? invoiceLines.reduce((sum, line) => sum + Number(line.tvaAmount || 0), 0)
    : Number(invoice.tva_amount || 0);
  const computedGrandTotal = Number((computedSubtotal + computedTva).toFixed(2));
  const paymentMeta = getInvoicePaymentMeta({ ...invoice, grand_total: computedGrandTotal }, paymentType, amountPaid);
  const paymentActionLabel = paymentType === 'partial' ? t.markFullPayment : t.markPaid;

  const calculateCommissionPayouts = (lines = []) => {
    const settings = agencySettings || null;
    return lines.map((line) => {
      const serviceTypeName = String(line.serviceTypeName || line.description || 'custom_service').trim();
      const typeKey = slugifyCommissionTypeKey(serviceTypeName);
      const rule = getCommissionRuleForType(typeKey, settings);
      const profit = Math.max(Number(line.sellingPrice || 0) - Number(line.costPrice || 0), 0);
      const amount = rule.enabled ? calculateCommissionAmount(typeKey, profit, settings) : 0;

      return {
        serviceTypeName,
        typeKey,
        amount: Number(amount || 0),
        rule,
      };
    }).filter((entry) => Number(entry.amount || 0) > 0);
  };

  const handleRecordReceipt = async (paymentValue) => {
    const normalizedPayment = Number(paymentValue || 0);
    if (normalizedPayment <= 0) return;

    if (!supabase || !invoice || !selectedAccountId) {
      throw new Error('No financial account is selected for this payment.');
    }

    const targetAccount = (financialAccounts || []).find((account) => account.id === selectedAccountId) || (financialAccounts || [])[0];
    if (!targetAccount) {
      throw new Error('No bank account is available to receive this payment.');
    }

    await insertBankEntryAndUpdateBalance({
      account_id: targetAccount.id,
      description: `Invoice payment received - #${invoice.invoice_number || invoice.id}`,
      operation_date: new Date().toISOString(),
      operation_type: invoice.payment_method || 'cash',
      third_party: invoice.clients?.full_name || 'Customer',
      debit: 0,
      credit: normalizedPayment,
    });

    const commissionPayouts = calculateCommissionPayouts(invoice.invoiceLines || []);
    for (const payout of commissionPayouts) {
      await recordCommissionPayment({
        account_id: targetAccount.id,
        amount: payout.amount,
        target_type: 'service',
        target_id: null,
        third_party: payout.serviceTypeName,
        invoice_id: invoice.id,
        description: `${payout.serviceTypeName} commission payout`,
        agencySettings,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/invoices')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> {t.back}
        </button>

        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClass}`}>
          {invoice.status || 'pending'}
        </span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-brand-navy p-3 text-brand-gold">
              <FileText size={24} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.invoice}</p>
              <h2 className="mt-2 font-serif text-4xl text-brand-navy">#{invoice.invoice_number}</h2>
              <p className="mt-2 text-sm text-slate-500">{invoice.is_expense ? t.expenseInvoice : t.revenueInvoice}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.grandTotal}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(computedGrandTotal)}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.customer}</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{invoice.clients?.full_name || '—'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.subtotal}</p>
            <p className="mt-3 font-mono text-lg font-semibold text-brand-navy">{formatCurrency(computedSubtotal)}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.tax}</p>
            <p className="mt-3 font-mono text-lg font-semibold text-brand-navy">{formatCurrency(computedTva)}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.reference}</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{invoice.reference || '—'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t.payment}</p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-navy">
              <CreditCard size={15} className="text-brand-gold" />
              <span>{invoice.payment_method || 'cash'}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-brand-surface p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.paymentTypeLabel}</label>
              <select
                value={paymentType}
                onChange={(event) => setPaymentType(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="full">{t.fullPayment}</option>
                <option value="partial">{t.partialPayment}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.paymentMethod}</label>
              <select
                value={invoice.payment_method || 'cash'}
                onChange={async (event) => {
                  if (!supabase) return;
                  const nextMethod = event.target.value;
                  await supabase.from('invoices').update({ payment_method: nextMethod }).eq('id', invoice.id);
                  setInvoice((prev) => ({ ...prev, payment_method: nextMethod }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="cash">{t.cash}</option>
                <option value="credit_card">{t.creditCard}</option>
                <option value="baridimob">{t.baridimob}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.bankAccount}</label>
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
              >
                {(financialAccounts || []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label || account.bank_name || 'Account'}
                  </option>
                ))}
              </select>
            </div>

            {paymentType === 'partial' && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.amountPaidLabel}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountPaid || ''}
                  onChange={(event) => setAmountPaid(Number(event.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            )}
          </div>

          {paymentType === 'partial' && (
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.remaining}</label>
              <div className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${paymentMeta.remaining > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {formatCurrency(paymentMeta.remaining)}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            {paymentType === 'partial' && (
              <button
                type="button"
                disabled={savingPayment || invoice.status === 'paid'}
                onClick={async () => {
                  if (!supabase || !invoice) return;
                  setSavingPayment(true);

                  try {
                    const safeAmountPaid = Math.min(Math.max(amountPaid || 0, 0), computedGrandTotal || 0);
                    if (safeAmountPaid <= 0) {
                      setError(t.enterValidAmount);
                      return;
                    }

                    const updatePayload = {
                      status: 'partial',
                      payment_type: 'partial',
                      amount_paid: safeAmountPaid,
                      payment_method: invoice.payment_method || 'cash',
                      paid_at: invoice.paid_at || new Date().toISOString(),
                    };

                    const { error } = await supabase.from('invoices').update(updatePayload).eq('id', invoice.id);
                    if (error) throw error;

                    await handleRecordReceipt(safeAmountPaid);
                    setInvoice((prev) => ({ ...prev, ...updatePayload }));
                    setAmountPaid(safeAmountPaid);
                  } catch (err) {
                    setError(err.message || 'Unable to save partial payment.');
                  } finally {
                    setSavingPayment(false);
                  }
                }}
                className="rounded-xl border border-brand-gold bg-white px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
              >
                {savingPayment ? t.processing : t.savePartial}
              </button>
            )}

            <button
              type="button"
              disabled={savingPayment || invoice.status === 'paid'}
              onClick={async () => {
                if (!supabase || !invoice) return;
                setSavingPayment(true);

                try {
                  const grandTotal = Number(computedGrandTotal || 0);
                  const currentPaid = Number(invoice.amount_paid || amountPaid || 0);
                  const remainingToPay = Math.max(grandTotal - currentPaid, 0);
                  const nextAmountPaid = grandTotal;
                  const statusValue = 'paid';
                  const updatePayload = {
                    status: statusValue,
                    payment_type: 'full',
                    amount_paid: nextAmountPaid,
                    payment_method: invoice.payment_method || 'cash',
                    paid_at: new Date().toISOString(),
                  };

                  const { error } = await supabase.from('invoices').update(updatePayload).eq('id', invoice.id);
                  if (error) throw error;

                  await handleRecordReceipt(remainingToPay);
                  setInvoice((prev) => ({ ...prev, ...updatePayload }));
                  setAmountPaid(nextAmountPaid);
                } catch (err) {
                  setError(err.message || 'Unable to update invoice payment.');
                } finally {
                  setSavingPayment(false);
                }
              }}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {savingPayment ? t.processing : paymentActionLabel}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-brand-surface p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Client contact</p>
          <p className="mt-3 text-sm text-brand-navy">{invoice.clients?.email || '—'}</p>
          <p className="mt-1 text-sm text-brand-navy">{invoice.clients?.phone || '—'}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-brand-surface p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Service lines</p>
          {invoiceLines.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No booking service lines linked to this invoice.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Selling Price</th>
                    <th className="px-3 py-2">TVA Rate</th>
                    <th className="px-3 py-2">TVA Amount</th>
                    <th className="px-3 py-2">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceLines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-200 text-brand-navy">
                      <td className="px-3 py-2">
                        <div className="font-medium">{line.serviceTypeName}</div>
                        {line.description && line.description !== line.serviceTypeName && (
                          <div className="mt-1 text-xs text-slate-500">{line.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{line.supplierName}</td>
                      <td className="px-3 py-2 font-mono">{formatCurrency(line.sellingPrice)}</td>
                      <td className="px-3 py-2 font-mono">{line.tvaRate}%</td>
                      <td className="px-3 py-2 font-mono">{formatCurrency(line.tvaAmount)}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{formatCurrency(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(invoice.note || invoice.is_template || invoice.reference) && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Invoice note / template</p>
            {invoice.reference && <p className="mt-3 text-sm font-medium text-brand-navy">Reference: {invoice.reference}</p>}
            {invoice.note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-brand-navy">{invoice.note}</p> : <p className="mt-3 text-sm text-slate-500">No note recorded.</p>}
            {invoice.is_template && (
              <span className="mt-3 inline-flex rounded-full bg-brand-gold/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-navy">
                Template
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
