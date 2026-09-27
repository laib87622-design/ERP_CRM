import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Printer, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { openInvoicePdf } from '../lib/invoicePdf';
import { isDuplicateInvoicePayment } from '../lib/financialAudit';
import exportToCSV from '../utils/exportToCSV';

const statusStyles = {
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
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

const syncBookingStatusFromInvoice = async (supabaseClient, invoiceData) => {
  if (!supabaseClient || !invoiceData?.booking_id) return;

  const normalizedStatus = String(invoiceData.status || '').toLowerCase();
  const nextBookingStatus = normalizedStatus === 'paid' ? 'confirmed' : 'processing';

  const { error } = await supabaseClient
    .from('bookings')
    .update({ status: nextBookingStatus })
    .eq('id', invoiceData.booking_id);

  if (error) {
    console.warn('Unable to sync booking status from invoice:', error.message || error);
  }
};

const getInvoicePayerOptions = (invoice, clientLookup = {}) => {
  const booking = invoice?.bookings || null;
  const payerIds = [
    invoice?.client_id,
    booking?.client_id,
    ...(Array.isArray(booking?.co_clients) ? booking.co_clients : []),
    ...(Array.isArray(booking?.passengers)
      ? booking.passengers
          .filter((traveler) => traveler && traveler.client_id)
          .map((traveler) => traveler.client_id)
      : []),
  ].filter(Boolean);

  const uniqueIds = [...new Set(payerIds)];

  return uniqueIds
    .map((payerId) => ({
      id: payerId,
      label: clientLookup[payerId] || 'Client',
    }))
    .filter((payer) => payer.id && payer.label);
};

export default function Invoices({ language = 'en' }) {
  const translations = {
    en: {
      heading: 'Finance',
      title: 'Invoices',
      overview: 'All invoices',
      overviewSubtitle: 'Financial tracking overview',
      export: 'Export to CSV',
      invoiceNumber: 'Invoice #',
      client: 'Client',
      clientRef: 'Client Ref',
      reference: 'Reference',
      subtotal: 'Subtotal',
      total: 'Total',
      status: 'Status',
      actions: 'Actions',
      loading: 'Loading invoices...',
      empty: 'No invoices found.',
      paid: 'Paid',
      partial: 'Partial',
      pending: 'Pending',
      processing: 'Processing',
      overdue: 'Overdue',
      bankAccount: 'Bank account',
      selectBankAccount: 'Select bank account',
      amountPaid: 'Amount paid',
      fullPayment: 'Full payment',
      partialPayment: 'Partial payment',
      close: 'Close',
      recordPayment: 'Record payment',
      invoiceStatus: 'Invoice status',
    },
    ar: {
      heading: 'المالية',
      title: 'الفواتير',
      overview: 'كل الفواتير',
      overviewSubtitle: 'نظرة عامة على التتبع المالي',
      export: 'تصدير إلى CSV',
      invoiceNumber: 'رقم الفاتورة',
      client: 'العميل',
      clientRef: 'مرجع العميل',
      reference: 'المرجع',
      subtotal: 'الإجمالي الفرعي',
      total: 'الإجمالي',
      status: 'الحالة',
      actions: 'الإجراءات',
      loading: 'جارٍ تحميل الفواتير...',
      empty: 'لا توجد فواتير.',
      paid: 'مدفوعة',
      partial: 'جزئي',
      pending: 'قيد الانتظار',
      processing: 'قيد المعالجة',
      overdue: 'متأخرة',
      bankAccount: 'الحساب البنكي',
      selectBankAccount: 'اختر الحساب البنكي',
      amountPaid: 'المبلغ المدفوع',
      fullPayment: 'الدفع الكامل',
      partialPayment: 'الدفع الجزئي',
      close: 'إغلاق',
      recordPayment: 'تسجيل الدفع',
      invoiceStatus: 'حالة الفاتورة',
    },
  };

  const t = translations[language] || translations.en;
  const [invoices, setInvoices] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingInvoiceId, setProcessingInvoiceId] = useState(null);
  const [invoicePaymentTypes, setInvoicePaymentTypes] = useState({});
  const [invoicePartialAmounts, setInvoicePartialAmounts] = useState({});
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [selectedInvoiceAccountIds, setSelectedInvoiceAccountIds] = useState({});
  const [invoicePayerOptions, setInvoicePayerOptions] = useState({});
  const [selectedInvoicePayers, setSelectedInvoicePayers] = useState({});
  const navigate = useNavigate();

  const unlockCommissionAfterInvoiceSettlement = async (invoice, totalPaid) => {
    if (!supabase || !invoice?.booking_id) return;

    const grandTotal = Number(invoice.grand_total || 0);
    if (!(grandTotal > 0) || Number(totalPaid || 0) < grandTotal) return;

    try {
      const { error } = await supabase
        .from('agent_commissions')
        .update({
          status: 'READY_TO_PAY',
          updated_at: new Date().toISOString(),
        })
        .eq('booking_id', invoice.booking_id)
        .eq('status', 'PENDING_PAYMENT');

      if (error) {
        console.warn('Unable to unlock commission after invoice settlement:', error.message || error);
      }
    } catch (err) {
      console.warn('Commission unlock check failed:', err?.message || err);
    }
  };

  const recordInvoicePaymentInBanking = async (invoice, amountPaid, selectedAccountId, payerLabel = null) => {
    if (!supabase || !selectedAccountId) return;

    const normalizedAmount = Number(amountPaid || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return;

    const selectedAccount = (financialAccounts || []).find((account) => account.id === selectedAccountId);
    const operationTypeLabel = selectedAccount ? selectedAccount.label : 'Direct Deduction';
    const { data: userData } = await supabase.auth.getUser();

    const { error: entryError } = await supabase.from('bank_entries').insert([
      {
        account_id: selectedAccountId,
        operation_date: new Date().toISOString(),
        description: `Invoice Payment - ${invoice?.reference || invoice?.invoice_number || 'N/A'}`,
        operation_type: operationTypeLabel,
        third_party: payerLabel || invoice?.client_name || 'Customer',
        credit: normalizedAmount,
        debit: 0,
        agent_id: userData?.user?.id || null,
      },
    ]);

    if (entryError) throw entryError;

    const { data: accountData, error: accountFetchError } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('id', selectedAccountId)
      .single();

    if (accountFetchError) throw accountFetchError;

    if (accountData) {
      const newBalance = Number(accountData.current_balance || 0) + Number(normalizedAmount);
      const { error: accountUpdateError } = await supabase
        .from('financial_accounts')
        .update({ current_balance: newBalance })
        .eq('id', selectedAccountId);

      if (accountUpdateError) throw accountUpdateError;
    }
  };

  const handleInvoicePayment = async (invoice, options = {}) => {
    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const selectedType = options.forceType || invoicePaymentTypes[invoice.id] || getInvoicePaymentType(invoice);
    const partialAmountRaw = Number(invoicePartialAmounts[invoice.id] ?? invoice.amount_paid ?? 0);
    const selectedPayerId = selectedInvoicePayers[invoice.id] || invoice.client_id || null;
    const selectedPayerLabel = (invoicePayerOptions[invoice.id] || []).find((payer) => payer.id === selectedPayerId)?.label || invoice.client_name || 'Customer';
    const selectedAccountId = selectedInvoiceAccountIds[invoice.id] || invoice.account_id || null;
    const nextGrandTotal = Number(invoice.grand_total || 0);
    const paymentMeta = getInvoicePaymentMeta(invoice, selectedType, partialAmountRaw);
    const amountToRecord = options.forceFull ? nextGrandTotal : paymentMeta.amountPaid;
    const alreadyPaid = Number(invoice.amount_paid || 0);
    const newTotalPaid = Math.min(alreadyPaid + amountToRecord, nextGrandTotal);

    if (!selectedAccountId) {
      setError('Please select a bank account before recording this invoice payment.');
      return;
    }

    if (nextGrandTotal <= 0) {
      setError('This invoice has no amount to collect.');
      return;
    }

    if (selectedType === 'partial' && !options.forceFull && amountToRecord <= 0) {
      setError('Please enter a valid amount paid for the partial payment.');
      return;
    }

    try {
      setProcessingInvoiceId(invoice.id);
      setError('');

      const fullPayment = options.forceFull || selectedType === 'full' || amountToRecord >= nextGrandTotal;
      const statusValue = fullPayment ? 'paid' : 'partial';
      const amountPaidValue = fullPayment ? nextGrandTotal : newTotalPaid;
      const hasRemaining = !fullPayment && paymentMeta.remaining > 0;

      if (!fullPayment && hasRemaining) {
        const duplicateCheck = await isDuplicateInvoicePayment({
          supabase,
          invoiceId: invoice.id,
          amount: amountPaidValue,
          method: 'bank_entry',
        });

        if (duplicateCheck) {
          setError('This partial payment was already recorded. No duplicate payment entry was created.');
          await fetchInvoices();
          return;
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const updatePayload = {
        status: statusValue,
        paid_at: fullPayment ? new Date().toISOString() : invoice.paid_at || new Date().toISOString(),
        payment_type: fullPayment ? 'full' : 'partial',
        amount_paid: amountPaidValue,
        account_id: selectedAccountId,
        agent_id: userData?.user?.id || null,
      };

      const { error: updateError } = await supabase.from('invoices').update(updatePayload).eq('id', invoice.id);
      if (updateError) throw updateError;

      await syncBookingStatusFromInvoice(supabase, { ...invoice, ...updatePayload, booking_id: invoice.booking_id });
      await recordInvoicePaymentInBanking(invoice, amountPaidValue, selectedAccountId, selectedPayerLabel);
      await unlockCommissionAfterInvoiceSettlement(invoice, amountPaidValue);
      await fetchInvoices();
    } catch (err) {
      setError(err.message || 'Unable to process invoice payment.');
    } finally {
      setProcessingInvoiceId(null);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setInvoices([]);
        return;
      }

      const [invoicesRes, accountsRes, clientsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'id, booking_id, client_id, invoice_number, subtotal, apply_tva, tva_amount, grand_total, status, payment_type, amount_paid, paid_at, account_id, reference, note, is_template, clients(full_name, phone, email, reference), bookings(client_id, co_clients, passengers)'
          )
          .order('invoice_number', { ascending: false }),
        supabase.from('financial_accounts').select('id, label, bank_name, currency').order('label', { ascending: true }),
        supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
      ]);

      const { data, error } = invoicesRes;
      const { data: accountsData, error: accountsError } = accountsRes;
      const { data: clientRows, error: clientsError } = clientsRes;

      if (accountsError) throw accountsError;
      if (clientsError) throw clientsError;
      setFinancialAccounts(accountsData || []);

      if (error) throw error;

      const clientLookup = Object.fromEntries((clientRows || []).map((client) => [client.id, client.full_name]));

      const sortedInvoices = (data || []).map((invoice) => ({
        ...invoice,
        client_name: invoice.clients?.full_name || 'Client',
        client_reference: invoice.clients?.reference || '—',
      }));

      const nextPayerOptions = Object.fromEntries(
        sortedInvoices.map((invoice) => [invoice.id, getInvoicePayerOptions(invoice, clientLookup)])
      );

      setInvoicePayerOptions(nextPayerOptions);
      setSelectedInvoicePayers((prev) => {
        const nextState = { ...prev };

        sortedInvoices.forEach((invoice) => {
          if (!nextState[invoice.id]) {
            const payerOptions = nextPayerOptions[invoice.id] || [];
            const defaultPayer = payerOptions.find((payer) => payer.id === invoice.client_id) || payerOptions[0] || null;
            nextState[invoice.id] = defaultPayer?.id || invoice.client_id || '';
          }
        });

        return nextState;
      });

      setInvoices(sortedInvoices);
      setSelectedInvoiceAccountIds((prev) => {
        const nextState = { ...prev };
        sortedInvoices.forEach((invoice) => {
          if (!(invoice.id in nextState) && invoice.account_id) nextState[invoice.id] = invoice.account_id;
        });
        return nextState;
      });

      setInvoicePaymentTypes(
        Object.fromEntries(sortedInvoices.map((invoice) => [invoice.id, getInvoicePaymentType(invoice)]))
      );
      setInvoicePartialAmounts(
        Object.fromEntries(sortedInvoices.map((invoice) => [invoice.id, Number(invoice.amount_paid || 0)]))
      );
      setPaymentHistory(
        sortedInvoices
          .filter((invoice) => invoice.status === 'paid')
          .sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0))
          .slice(0, 8)
      );
    } catch (err) {
      setError(err.message || 'Unable to load invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.heading}</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-brand-navy">All invoices</h3>
              <p className="text-sm text-slate-500">Financial tracking overview</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              exportToCSV(
                invoices.map((invoice) => ({
                  invoice_number: invoice.invoice_number,
                  client: invoice.client_name || 'Client',
                  client_reference: invoice.client_reference || '',
                  reference: invoice.reference || '',
                  subtotal: Number(invoice.subtotal || 0),
                  grand_total: Number(invoice.grand_total || 0),
                  amount_paid: Number(invoice.amount_paid || 0),
                  status: invoice.status || 'pending',
                  paid_at: invoice.paid_at || '',
                })),
                'invoices-export'
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download size={16} />
            {t.export}
          </button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-[8%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoiceNumber}</th>
                <th className="w-[15%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.client}</th>
                <th className="w-[12%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.clientRef}</th>
                <th className="w-[15%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.reference}</th>
                <th className="w-[10%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.subtotal}</th>
                <th className="w-[15%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.total}</th>
                <th className="w-[10%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.status}</th>
                <th className="w-[15%] px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">{t.actions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500 align-top">
                    {t.loading}
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500 align-top">
                    {t.empty}
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const normalizedStatus = (invoice.status || 'pending').toLowerCase();
                  const statusClass = statusStyles[normalizedStatus] || statusStyles.pending;
                  const selectedPaymentType = invoicePaymentTypes[invoice.id] || getInvoicePaymentType(invoice);
                  const partialAmount = Number(invoicePartialAmounts[invoice.id] ?? invoice.amount_paid ?? 0);
                  const paymentMeta = getInvoicePaymentMeta(invoice, selectedPaymentType, partialAmount);
                  const subtotal = Number(invoice.subtotal) || 0;

                  return (
                    <tr
                      key={invoice.id}
                      className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                    >
                      <td className="px-4 py-4 align-top text-sm font-medium text-brand-navy">
                        #{invoice.invoice_number}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-brand-navy">
                        {invoice.client_name || 'Client'}
                      </td>
                      <td className="px-4 py-4 align-top text-sm font-mono text-slate-600">
                        {invoice.client_reference || '—'}
                      </td>
                      <td className="px-4 py-4 align-top text-sm font-mono text-brand-navy">
                        {invoice.reference || '—'}
                      </td>
                      <td className="px-4 py-4 align-top text-sm font-mono text-brand-navy">
                        {formatCurrency(subtotal)}
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        <div className="font-mono font-semibold text-brand-navy">
                          {formatCurrency(Number(invoice.grand_total) || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-sm">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass}`}
                        >
                          {normalizedStatus}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-sm" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-col items-end gap-2">
                          <select
                            value={selectedPaymentType}
                            onChange={(event) => {
                              const nextType = event.target.value;
                              setInvoicePaymentTypes((prev) => ({ ...prev, [invoice.id]: nextType }));
                              if (nextType === 'full') {
                                setInvoicePartialAmounts((prev) => ({ ...prev, [invoice.id]: Number(invoice.grand_total || 0) }));
                              }
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            disabled={normalizedStatus === 'paid'}
                          >
                            <option value="full">Full Payment</option>
                            <option value="partial">Partial Payment</option>
                          </select>

                          {selectedPaymentType === 'partial' && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={partialAmount || ''}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value || 0);
                                setInvoicePartialAmounts((prev) => ({ ...prev, [invoice.id]: nextValue }));
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                              placeholder="Amount paid"
                            />
                          )}

                          <select
                            value={selectedInvoicePayers[invoice.id] || invoice.client_id || ''}
                            onChange={(event) => {
                              const nextPayerId = event.target.value;
                              setSelectedInvoicePayers((prev) => ({ ...prev, [invoice.id]: nextPayerId }));
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            disabled={normalizedStatus === 'paid'}
                          >
                            <option value="">Select payer</option>
                            {(invoicePayerOptions[invoice.id] || []).map((payer) => (
                              <option key={payer.id} value={payer.id}>{payer.label}</option>
                            ))}
                          </select>

                          <select
                            value={selectedInvoiceAccountIds[invoice.id] || invoice.account_id || ''}
                            onChange={async (event) => {
                              const nextAccountId = event.target.value;
                              setSelectedInvoiceAccountIds((prev) => ({ ...prev, [invoice.id]: nextAccountId }));

                              if (!supabase || !invoice.id) return;

                              try {
                                await supabase.from('invoices').update({ account_id: nextAccountId || null }).eq('id', invoice.id);
                              } catch (saveError) {
                                console.warn('Unable to save selected invoice account:', saveError);
                              }
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-2.5 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                            disabled={normalizedStatus === 'paid'}
                          >
                            <option value="">Select account</option>
                            {(financialAccounts || []).map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.label || account.bank_name || 'Account'}
                              </option>
                            ))}
                          </select>

                          <div className="flex w-full items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openInvoicePdf(invoice, invoice.clients);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-brand-navy"
                              title="Download invoice PDF"
                            >
                              <Printer size={14} />
                            </button>

                            {selectedPaymentType === 'partial' && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleInvoicePayment(invoice, { forceFull: false });
                                }}
                                disabled={processingInvoiceId === invoice.id}
                                className="rounded-xl border border-brand-gold bg-white px-3 py-2 text-xs font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {processingInvoiceId === invoice.id ? 'Processing...' : 'Save Partial'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleInvoicePayment(invoice, { forceFull: selectedPaymentType === 'partial' });
                              }}
                              disabled={normalizedStatus === 'paid' || processingInvoiceId === invoice.id}
                              className="rounded-xl bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {processingInvoiceId === invoice.id
                                ? 'Processing...'
                                : normalizedStatus === 'paid'
                                  ? 'Paid'
                                  : selectedPaymentType === 'partial'
                                    ? 'Mark Full'
                                    : 'Mark Paid'}
                            </button>
                          </div>

                          {selectedPaymentType === 'partial' && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                              Remaining: {formatCurrency(paymentMeta.remaining)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
            <FileText size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-brand-navy">Payment history</h3>
            <p className="text-sm text-slate-500">Recent invoice settlements</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Paid On</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading payment history...
                  </td>
                </tr>
              ) : paymentHistory.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">
                    No invoice payments recorded yet.
                  </td>
                </tr>
              ) : (
                paymentHistory.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-200 text-sm text-slate-700">
                    <td className="px-5 py-4 font-medium text-brand-navy">#{invoice.invoice_number}</td>
                    <td className="px-5 py-4 font-mono font-semibold text-emerald-600">
                      {formatCurrency(Number(invoice.grand_total) || 0)}
                    </td>
                    <td className="px-5 py-4">{invoice.payment_method || 'bank'}</td>
                    <td className="px-5 py-4">
                      {invoice.paid_at
                        ? new Date(invoice.paid_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
