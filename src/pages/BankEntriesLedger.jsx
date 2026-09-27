import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import BankingFilterBar from '../components/ui/BankingFilterBar';
import exportToCSV from '../utils/exportToCSV';

export async function insertBankEntryAndUpdateBalance(entryData) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { account_id, debit = 0, credit = 0, description, operation_date, operation_type, third_party, agent_id } = entryData;

  if (!account_id) {
    throw new Error('account_id is required.');
  }

  const normalizedDebit = Number(debit || 0);
  const normalizedCredit = Number(credit || 0);

  const { data: insertedEntry, error: insertError } = await supabase
    .from('bank_entries')
    .insert([
      {
        account_id,
        operation_date: operation_date || new Date().toISOString(),
        description: description || 'Manual entry',
        operation_type: operation_type || 'Cash',
        third_party: third_party || 'N/A',
        debit: normalizedDebit,
        credit: normalizedCredit,
        agent_id: agent_id || null,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (insertError) throw insertError;

  const { data: accountData, error: accountError } = await supabase
    .from('financial_accounts')
    .select('current_balance')
    .eq('id', account_id)
    .single();

  if (accountError) throw accountError;

  const currentBalance = Number(accountData?.current_balance || 0);
  const nextBalance = currentBalance + Number(normalizedCredit || 0) - Number(normalizedDebit || 0);

  const { error: updateError } = await supabase
    .from('financial_accounts')
    .update({ current_balance: nextBalance })
    .eq('id', account_id);

  if (updateError) throw updateError;

  return insertedEntry;
}

export async function recordCommissionPayment({ account_id, amount, target_type, target_id, third_party, invoice_id, description, agencySettings = null, agent_id = null }) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const normalizedAmount = Number(amount || 0);
  if (!account_id || normalizedAmount <= 0) {
    throw new Error('A valid bank account and commission amount are required.');
  }

  const nextDescription = description || `Commission payment - ${target_type || 'package'}${invoice_id ? ` #${invoice_id}` : ''}`;

  const { data: commissionRecord, error: commissionError } = await supabase
    .from('commission_payments')
    .insert([
      {
        invoice_id: invoice_id || null,
        target_type: target_type || 'package',
        target_id: target_id || null,
        amount: normalizedAmount,
        status: 'paid',
        paid_at: new Date().toISOString(),
        notes: nextDescription,
      },
    ])
    .select()
    .single();

  if (commissionError) throw commissionError;

  await insertBankEntryAndUpdateBalance({
    account_id,
    debit: normalizedAmount,
    credit: 0,
    description: nextDescription,
    operation_date: new Date().toISOString(),
    operation_type: 'commission',
    third_party: third_party || 'Commission payout',
    agent_id: agent_id || null,
  });

  return commissionRecord;
}

export default function BankEntriesLedger({ language = 'en' }) {
  const translations = {
    en: {
      finance: 'Finance',
      title: 'Bank Entries',
      records: 'Records',
      export: 'Export to CSV',
      opDate: 'Oper. Date',
      description: 'Description',
      type: 'Type',
      thirdParty: 'Third Party',
      bankAccount: 'Bank Account',
      debit: 'Debit',
      credit: 'Credit',
      loading: 'Loading ledger entries...',
      empty: 'No ledger rows match the selected filters.',
    },
    ar: {
      finance: 'المالية',
      title: 'إدخالات البنك',
      records: 'السجلات',
      export: 'تصدير إلى CSV',
      opDate: 'تاريخ العملية',
      description: 'الوصف',
      type: 'النوع',
      thirdParty: 'الطرف الثالث',
      bankAccount: 'حساب البنك',
      debit: 'المدين',
      credit: 'الدائن',
      loading: 'جارٍ تحميل إدخالات دفتر البنك...',
      empty: 'لا توجد سجلات تطابق المرشحات المحددة.',
    },
  };

  const t = translations[language] || translations.en;

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({
    accountId: 'all',
    dateFrom: '',
    dateTo: '',
    transactionType: 'all',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!supabase) return;

      const { data, error: accountsError } = await supabase
        .from('financial_accounts')
        .select('id, label')
        .order('label', { ascending: true });

      if (!accountsError) {
        setAccounts(data || []);
      }
    };

    const fetchEntries = async () => {
      if (!supabase) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const { data, error: fetchError } = await supabase
          .from('bank_entries')
          .select('id, operation_date, description, operation_type, third_party, debit, credit, account_id, financial_accounts(label)')
          .order('operation_date', { ascending: false });

        if (fetchError) throw fetchError;

        setEntries((data || []).map((row) => ({
          ...row,
          account_label: row.financial_accounts?.label || 'Unknown Account',
        })));
      } catch (err) {
        setError(err.message || 'Unable to load ledger entries.');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
    fetchEntries();
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const date = entry.operation_date ? new Date(entry.operation_date) : null;
      const normalizedDateFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
      const normalizedDateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

      const matchesAccount = filters.accountId === 'all' || entry.account_id === filters.accountId;
      const matchesFrom = !normalizedDateFrom || !date || normalizedDateFrom <= date;
      const matchesTo = !normalizedDateTo || !date || date <= normalizedDateTo;

      let matchesType = true;
      if (filters.transactionType !== 'all') {
        const isCredit = Number(entry.credit || 0) > 0;
        const isDebit = Number(entry.debit || 0) > 0;
        const isInternalTransfer = (entry.operation_type || '').toLowerCase().includes('transfer');
        const isMiscellaneous = !(isInternalTransfer || isCredit || isDebit) || (entry.third_party || '').toLowerCase() === 'manual adjustment';

        if (filters.transactionType === 'debits') {
          matchesType = isDebit;
        } else if (filters.transactionType === 'credits') {
          matchesType = isCredit;
        } else if (filters.transactionType === 'internal_transfer') {
          matchesType = isInternalTransfer;
        } else if (filters.transactionType === 'miscellaneous') {
          matchesType = isMiscellaneous;
        }
      }

      return matchesAccount && matchesFrom && matchesTo && matchesType;
    });
  }, [entries, filters]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.finance}</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>

        <span className="rounded-full bg-[#0a1120] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
          {filteredEntries.length} {t.records}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <BankingFilterBar
          selectedAccount={filters.accountId}
          setSelectedAccount={(value) => setFilters((prev) => ({ ...prev, accountId: value }))}
          dateRange={{ from: filters.dateFrom, to: filters.dateTo }}
          setDateRange={({ from, to }) =>
            setFilters((prev) => ({
              ...prev,
              dateFrom: from,
              dateTo: to,
            }))
          }
          transactionType={filters.transactionType}
          setTransactionType={(value) => setFilters((prev) => ({ ...prev, transactionType: value }))}
          accountsList={accounts}
          showAccountFilter={true}
          showDateRange={true}
          showTransactionType={true}
        />

        <button
          type="button"
          onClick={() =>
            exportToCSV(
              filteredEntries.map((entry) => ({
                operation_date: entry.operation_date || '',
                description: entry.description || '',
                operation_type: entry.operation_type || '',
                third_party: entry.third_party || '',
                account: entry.account_label || '',
                debit: Number(entry.debit || 0),
                credit: Number(entry.credit || 0),
              })),
              'bank-entries-export'
            )
          }
          className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Download size={16} />
          {t.export}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left">
            <thead className="bg-[#0a1120] text-white">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]">{t.opDate}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]">{t.description}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]">{t.type}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]">{t.thirdParty}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em]">{t.bankAccount}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-right">{t.debit}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-right">{t.credit}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    {t.empty}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, index) => (
                  <tr key={entry.id} className={index % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                    <td className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
                      {entry.operation_date ? new Date(entry.operation_date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">{entry.description || '—'}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">{entry.operation_type || '—'}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">{entry.third_party || '—'}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-sm font-medium text-brand-navy">{entry.account_label}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-right text-sm font-bold text-red-600">
                      {Number(entry.debit || 0) > 0 ? formatCurrency(Number(entry.debit || 0)) : '—'}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-right text-sm font-bold text-emerald-600">
                      {Number(entry.credit || 0) > 0 ? formatCurrency(Number(entry.credit || 0)) : '—'}
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
