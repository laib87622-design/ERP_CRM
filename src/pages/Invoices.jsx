import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Printer, Download, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { openInvoicePdf } from '../lib/invoicePdf';
import { isDuplicateInvoicePayment } from '../lib/financialAudit';
import { calculateCommissionAmount, fetchAgencySettings, getCommissionRuleForType, slugifyCommissionTypeKey } from '../lib/agencySettings';
import exportToCSV from '../utils/exportToCSV';

const statusStyles = {
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  partial: 'bg-orange-100 text-orange-700',
};

const defaultInvoicePaymentMethods = ['cash', 'bank_transfer', 'ccp', 'credit_card', 'baridimob'];

const normalizePaymentMethodValue = (value) => {
  const normalized = String(value || 'cash').trim().toLowerCase();
  const byLabel = {
    cash: 'cash',
    'bank transfer': 'bank_transfer',
    bank_transfer: 'bank_transfer',
    ccp: 'ccp',
    'credit card': 'credit_card',
    credit_card: 'credit_card',
    baridimob: 'baridimob',
    'baridi mob': 'baridimob',
  };

  return byLabel[normalized] || normalized || 'cash';
};

const getPaymentMethodLabel = (value) => {
  const normalized = normalizePaymentMethodValue(value);
  const labels = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    ccp: 'CCP',
    credit_card: 'Credit Card',
    baridimob: 'BaridiMob',
  };

  return labels[normalized] || 'Cash';
};

const getPaymentMethodsForAccount = (account = null) => {
  const rawMethods = Array.isArray(account?.accepted_payment_methods)
    ? account.accepted_payment_methods
    : [];

  const normalized = rawMethods
    .map((method) => normalizePaymentMethodValue(method))
    .filter(Boolean);

  if (normalized.length > 0) {
    return [...new Set(normalized)];
  }

  return [...defaultInvoicePaymentMethods];
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
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingInvoiceId, setProcessingInvoiceId] = useState(null);
  const [invoicePaymentTypes, setInvoicePaymentTypes] = useState({});
  const [invoicePaymentMethods, setInvoicePaymentMethods] = useState({});
  const [invoicePartialAmounts, setInvoicePartialAmounts] = useState({});
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [selectedInvoiceAccountIds, setSelectedInvoiceAccountIds] = useState({});
  const [invoicePayerOptions, setInvoicePayerOptions] = useState({});
  const [selectedInvoicePayers, setSelectedInvoicePayers] = useState({});
  const navigate = useNavigate();
  const toggleExpand = (id) => {
    setExpandedInvoiceId((prev) => (prev === id ? null : id));
  };

  const createCommissionEntriesForInvoice = async (invoice, totalPaid = 0) => {
    if (!supabase || !invoice?.booking_id) return;

    try {
      const settings = await fetchAgencySettings();
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('id, agent_id, status, package_id, package_ids')
        .eq('id', invoice.booking_id)
        .maybeSingle();

      if (bookingError) throw bookingError;
      if (!bookingData?.agent_id) return;

      const { data: serviceLines, error: linesError } = await supabase
        .from('booking_service_lines')
        .select('id, booking_id, service_type_id, selling_price, cost_price, service_types(name)')
        .eq('booking_id', invoice.booking_id);

      if (linesError) throw linesError;

      const commissionRows = (serviceLines || []).map((line) => {
        const serviceTypeName = String(line?.service_types?.name || 'custom_service').trim();
        const typeKey = slugifyCommissionTypeKey(serviceTypeName);
        const rule = getCommissionRuleForType(typeKey, settings);
        const profit = Math.max(Number(line?.selling_price || 0) - Number(line?.cost_price || 0), 0);
        const amount = rule.enabled ? calculateCommissionAmount(typeKey, profit, settings) : 0;
        return {
          agent_id: bookingData.agent_id,
          booking_id: invoice.booking_id,
          invoice_id: invoice.id,
          amount: Number(amount || 0),
          status: 'PENDING_PAYMENT',
          notes: `${serviceTypeName} commission pending payment`,
        };
      }).filter((row) => Number(row.amount || 0) > 0);

      if (commissionRows.length === 0) return;

      const { data: existingRows, error: existingError } = await supabase
        .from('agent_commissions')
        .select('id, booking_id, invoice_id, agent_id')
        .eq('booking_id', invoice.booking_id)
        .eq('invoice_id', invoice.id);

      if (existingError) throw existingError;

      const existingKeys = new Set((existingRows || []).map((row) => `${row.booking_id}|${row.invoice_id}|${row.agent_id}`));
      const rowsToInsert = commissionRows.filter((row) => !existingKeys.has(`${row.booking_id}|${row.invoice_id}|${row.agent_id}`));

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('agent_commissions').insert(rowsToInsert);
        if (insertError) {
          console.warn('Unable to create commission entries for invoice settlement:', insertError.message || insertError);
        }
      }

      const grandTotal = Number(invoice.grand_total || 0);
      const isFullyPaid = grandTotal > 0 && Number(totalPaid || 0) >= grandTotal;
      const isConfirmed = bookingData?.status === 'confirmed';

      if (isFullyPaid || isConfirmed) {
        const { error } = await supabase
          .from('agent_commissions')
          .update({
            status: 'READY_TO_PAY',
            updated_at: new Date().toISOString(),
          })
          .eq('booking_id', invoice.booking_id)
          .in('status', ['PENDING_PAYMENT', 'READY_TO_PAY']);

        if (error) {
          console.warn('Unable to unlock commission after settlement or confirmation:', error.message || error);
        }
      }
    } catch (err) {
      console.warn('Commission creation check failed:', err?.message || err);
    }
  };

  const unlockCommissionAfterInvoiceSettlement = async (invoice, totalPaid) => {
    if (!supabase || !invoice?.booking_id) return;

    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', invoice.booking_id)
        .maybeSingle();

      if (bookingError) throw bookingError;

      const grandTotal = Number(invoice.grand_total || 0);
      const isFullyPaid = grandTotal > 0 && Number(totalPaid || 0) >= grandTotal;
      const isConfirmed = bookingData?.status === 'confirmed';

      if (!isFullyPaid && !isConfirmed) return;

      const { error } = await supabase
        .from('agent_commissions')
        .update({
          status: 'READY_TO_PAY',
          updated_at: new Date().toISOString(),
        })
        .eq('booking_id', invoice.booking_id)
        .in('status', ['PENDING_PAYMENT', 'READY_TO_PAY']);

      if (error) {
        console.warn('Unable to unlock commission after invoice settlement:', error.message || error);
      }
    } catch (err) {
      console.warn('Commission unlock check failed:', err?.message || err);
    }
  };

  const normalizeUuidValue = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  };

  const recordInvoicePaymentInBanking = async (invoice, amountPaid, selectedAccountId, payerLabel = null) => {
    const safeSelectedAccountId = normalizeUuidValue(selectedAccountId);
    if (!supabase || !safeSelectedAccountId) return;

    const normalizedAmount = Number(amountPaid || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return;

    const selectedAccount = (financialAccounts || []).find((account) => account.id === safeSelectedAccountId);
    const operationTypeLabel = selectedAccount ? selectedAccount.label : 'Direct Deduction';
    const { data: userData } = await supabase.auth.getUser();

    const { error: entryError } = await supabase.from('bank_entries').insert([
      {
        account_id: safeSelectedAccountId,
        operation_date: new Date().toISOString(),
        description: `Invoice Payment - ${invoice?.reference || invoice?.invoice_number || 'N/A'}`,
        operation_type: operationTypeLabel,
        third_party: payerLabel || invoice?.client_name || 'Customer',
        credit: normalizedAmount,
        debit: 0,
        agent_id: normalizeUuidValue(userData?.user?.id),
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

    const total = parseFloat(invoice.grand_total) || 0;
    const alreadyPaid = parseFloat(invoice.amount_paid) || 0;
    const remainingAmount = total - alreadyPaid;

    if (remainingAmount <= 0) {
      setError('This invoice is already fully paid.');
      return;
    }

    const selectedType = options.forceType || invoicePaymentTypes[invoice.id] || getInvoicePaymentType(invoice);
    const partialAmountRaw = Number(invoicePartialAmounts[invoice.id] ?? invoice.amount_paid ?? 0);
    const selectedPayerId = normalizeUuidValue(selectedInvoicePayers[invoice.id] || invoice.client_id || null);
    const selectedPayerLabel = (invoicePayerOptions[invoice.id] || []).find((payer) => payer.id === selectedPayerId)?.label || invoice.client_name || 'Customer';
    const selectedAccountId = normalizeUuidValue(selectedInvoiceAccountIds[invoice.id] || invoice.account_id || null);
    const selectedAccount = (financialAccounts || []).find((account) => account.id === selectedAccountId) || null;
    const selectedPaymentMethod = invoicePaymentMethods[invoice.id] || invoice.payment_method || getPaymentMethodsForAccount(selectedAccount)[0] || 'cash';
    const normalizedPaymentMethod = normalizePaymentMethodValue(selectedPaymentMethod);
    const nextGrandTotal = total;
    const paymentMeta = getInvoicePaymentMeta(invoice, selectedType, partialAmountRaw);
    const amountToRecord = options.forceFull ? remainingAmount : paymentMeta.amountPaid;
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
      setIsProcessing(true);
      setProcessingInvoiceId(invoice.id);
      setError('');

      const fullPayment = options.forceFull || selectedType === 'full' || amountToRecord >= remainingAmount;
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
        payment_method: normalizedPaymentMethod,
        account_id: normalizeUuidValue(selectedAccountId),
        agent_id: normalizeUuidValue(userData?.user?.id),
      };

      const { error: updateError } = await supabase.from('invoices').update(updatePayload).eq('id', invoice.id);
      if (updateError) throw updateError;

      await syncBookingStatusFromInvoice(supabase, { ...invoice, ...updatePayload, booking_id: invoice.booking_id });
      await recordInvoicePaymentInBanking(
        invoice,
        fullPayment ? remainingAmount : amountToRecord,
        selectedAccountId,
        selectedPayerLabel
      );
      await createCommissionEntriesForInvoice({ ...invoice, ...updatePayload }, amountPaidValue);
      await unlockCommissionAfterInvoiceSettlement(invoice, amountPaidValue);
      await fetchInvoices();
    } catch (err) {
      setError(err.message || 'Unable to process invoice payment.');
    } finally {
      setProcessingInvoiceId(null);
      setIsProcessing(false);
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
            'id, booking_id, client_id, invoice_number, subtotal, apply_tva, tva_amount, grand_total, status, payment_type, amount_paid, paid_at, account_id, payment_method, reference, note, is_template, clients(full_name, phone, email, reference)'
          )
          .order('invoice_number', { ascending: false }),
        supabase.from('financial_accounts').select('id, label, bank_name, currency, accepted_payment_methods').order('label', { ascending: true }),
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
      const bookingIds = [...new Set((data || []).map((invoice) => invoice.booking_id).filter(Boolean))];
      let bookingLookup = {};

      if (bookingIds.length > 0) {
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, client_id, co_clients, passengers')
          .in('id', bookingIds);

        if (bookingsError) throw bookingsError;

        bookingLookup = Object.fromEntries((bookingsData || []).map((booking) => [booking.id, booking]));
      }

      const sortedInvoices = (data || []).map((invoice) => ({
        ...invoice,
        bookings: bookingLookup[invoice.booking_id] || null,
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
      setInvoicePaymentMethods(
        Object.fromEntries(sortedInvoices.map((invoice) => [invoice.id, normalizePaymentMethodValue(invoice.payment_method || 'cash')]))
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

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesClient = (invoice.client_name || '').toLowerCase().includes(filterClient.toLowerCase()) ||
      (invoice.invoice_number || '').toString().includes(filterClient);
    const matchesStatus = filterStatus === 'ALL' || String(invoice.status || '').toUpperCase() === filterStatus;
    return matchesClient && matchesStatus;
  });

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

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by Client Name or Invoice #..."
            value={filterClient}
            onChange={(event) => setFilterClient(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-amber-500 focus:ring-amber-500"
          />
        </div>
        <div className="w-full md:w-64">
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:border-amber-500 focus:ring-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>

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
                <th className="w-[16%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoiceNumber}</th>
                <th className="w-[24%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.client}</th>
                <th className="w-[20%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.reference}</th>
                <th className="w-[16%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.total}</th>
                <th className="w-[12%] px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t.status}</th>
                <th className="w-[12%] px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">{t.actions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500 align-top">
                    {t.loading}
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm text-slate-500 align-top">
                    {t.empty}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const normalizedStatus = (invoice.status || 'pending').toLowerCase();
                  const statusClass = statusStyles[normalizedStatus] || statusStyles.pending;
                  const selectedPaymentType = invoicePaymentTypes[invoice.id] || getInvoicePaymentType(invoice);
                  const partialAmount = Number(invoicePartialAmounts[invoice.id] ?? invoice.amount_paid ?? 0);
                  const paymentMeta = getInvoicePaymentMeta(invoice, selectedPaymentType, partialAmount);
                  return (
                    <Fragment key={invoice.id}>
                      <tr
                        aria-expanded={expandedInvoiceId === invoice.id}
                        className="cursor-pointer border-b transition-colors hover:bg-slate-50"
                        onClick={() => toggleExpand(invoice.id)}
                      >
                        <td className="px-4 py-4 text-sm font-medium text-brand-navy">#{invoice.invoice_number}</td>
                        <td className="px-4 py-4 text-sm text-brand-navy">{invoice.client_name || 'Client'}</td>
                        <td className="px-4 py-4 text-sm text-slate-500">{invoice.reference || '—'}</td>
                        <td className="px-4 py-4 text-sm font-bold text-brand-navy">{formatCurrency(Number(invoice.grand_total) || 0)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass}`}>
                            {normalizedStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/invoices/${invoice.id}`);
                              }}
                              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                              title="View Invoice Details"
                              aria-label="View invoice details"
                            >
                              <Eye size={18} />
                            </button>
                            <span className="pointer-events-none w-24 text-right text-sm text-slate-400">
                              {expandedInvoiceId === invoice.id ? '▲ Close' : '▼ Pay / Edit'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {expandedInvoiceId === invoice.id && (
                        <tr className="border-b border-slate-200 bg-slate-50/80">
                          <td colSpan="6" className="p-4 md:p-6">
                            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                              <h4 className="mb-4 border-b pb-2 text-sm font-bold text-slate-700">Process Payment</h4>
                              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                                <label className="space-y-1 text-xs font-semibold text-slate-600">
                                  Payment Type
                                  <select
                                    value={selectedPaymentType}
                                    onChange={(event) => {
                                      const nextType = event.target.value;
                                      setInvoicePaymentTypes((prev) => ({ ...prev, [invoice.id]: nextType }));
                                      if (nextType === 'full') {
                                        setInvoicePartialAmounts((prev) => ({ ...prev, [invoice.id]: Number(invoice.grand_total || 0) }));
                                      }
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-brand-navy outline-none focus:border-brand-gold"
                                    disabled={normalizedStatus === 'paid' || isProcessing}
                                  >
                                    <option value="full">Full Payment</option>
                                    <option value="partial">Partial Payment</option>
                                  </select>
                                </label>

                                <label className="space-y-1 text-xs font-semibold text-slate-600">
                                  Method
                                  <select
                                    value={invoicePaymentMethods[invoice.id] || normalizePaymentMethodValue(invoice.payment_method || 'cash')}
                                    onChange={(event) => {
                                      const nextMethod = normalizePaymentMethodValue(event.target.value);
                                      setInvoicePaymentMethods((prev) => ({ ...prev, [invoice.id]: nextMethod }));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-brand-navy outline-none focus:border-brand-gold"
                                    disabled={normalizedStatus === 'paid' || isProcessing}
                                  >
                                    {getPaymentMethodsForAccount(
                                      (financialAccounts || []).find((account) => account.id === (selectedInvoiceAccountIds[invoice.id] || invoice.account_id)) || null
                                    ).map((method) => (
                                      <option key={method} value={method}>{getPaymentMethodLabel(method)}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-xs font-semibold text-slate-600">
                                  Payer
                                  <select
                                    value={selectedInvoicePayers[invoice.id] || invoice.client_id || ''}
                                    onChange={(event) => {
                                      const nextPayerId = event.target.value;
                                      setSelectedInvoicePayers((prev) => ({ ...prev, [invoice.id]: nextPayerId }));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-brand-navy outline-none focus:border-brand-gold"
                                    disabled={normalizedStatus === 'paid' || isProcessing}
                                  >
                                    <option value="">Select payer</option>
                                    {(invoicePayerOptions[invoice.id] || []).map((payer) => (
                                      <option key={payer.id} value={payer.id}>{payer.label}</option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-xs font-semibold text-slate-600">
                                  Account
                                  <select
                                    value={selectedInvoiceAccountIds[invoice.id] || invoice.account_id || ''}
                                    onChange={async (event) => {
                                      const nextAccountId = event.target.value;
                                      setSelectedInvoiceAccountIds((prev) => ({ ...prev, [invoice.id]: nextAccountId }));

                                      const nextAccount = (financialAccounts || []).find((account) => account.id === nextAccountId) || null;
                                      const allowedMethods = getPaymentMethodsForAccount(nextAccount);
                                      const currentMethod = invoicePaymentMethods[invoice.id] || normalizePaymentMethodValue(invoice.payment_method || 'cash');
                                      const nextMethod = allowedMethods.includes(currentMethod) ? currentMethod : allowedMethods[0] || 'cash';
                                      setInvoicePaymentMethods((prev) => ({ ...prev, [invoice.id]: nextMethod }));

                                      if (!supabase || !invoice.id) return;

                                      try {
                                        await supabase.from('invoices').update({ account_id: nextAccountId || null, payment_method: nextMethod }).eq('id', invoice.id);
                                      } catch (saveError) {
                                        console.warn('Unable to save selected invoice account:', saveError);
                                      }
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-brand-navy outline-none focus:border-brand-gold"
                                    disabled={normalizedStatus === 'paid' || isProcessing}
                                  >
                                    <option value="">Select account</option>
                                    {(financialAccounts || []).map((account) => (
                                      <option key={account.id} value={account.id}>
                                        {account.label || account.bank_name || 'Account'}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                {selectedPaymentType === 'partial' && (
                                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                                    Amount Paid
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={partialAmount || ''}
                                      onChange={(event) => {
                                        const nextValue = Number(event.target.value || 0);
                                        setInvoicePartialAmounts((prev) => ({ ...prev, [invoice.id]: nextValue }));
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-brand-navy outline-none focus:border-brand-gold"
                                      placeholder="Amount paid"
                                      disabled={normalizedStatus === 'paid' || isProcessing}
                                    />
                                    <span className="block text-[11px] font-normal text-slate-500">
                                      Remaining: {formatCurrency(paymentMeta.remaining)}
                                    </span>
                                  </label>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={() => openInvoicePdf(invoice, invoice.clients)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-100"
                                  title="Download invoice PDF"
                                >
                                  <Printer size={14} />
                                  Print Invoice
                                </button>

                                {selectedPaymentType === 'partial' && (
                                  <button
                                    type="button"
                                    onClick={() => handleInvoicePayment(invoice, { forceFull: false })}
                                    disabled={isProcessing}
                                    className="rounded-lg border border-brand-gold bg-white px-4 py-2 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isProcessing && processingInvoiceId === invoice.id ? 'Processing...' : 'Save Partial'}
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleInvoicePayment(invoice, { forceFull: selectedPaymentType === 'partial' })}
                                  disabled={normalizedStatus === 'paid' || isProcessing}
                                  className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isProcessing && processingInvoiceId === invoice.id
                                    ? 'Processing...'
                                    : normalizedStatus === 'paid'
                                      ? 'Paid'
                                      : selectedPaymentType === 'partial'
                                        ? 'Mark Full'
                                        : 'Submit Payment'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
