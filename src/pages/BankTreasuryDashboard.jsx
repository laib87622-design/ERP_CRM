import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CreditCard,
  Plus,
  ReceiptText,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const accountMeta = {
  cash: {
    label: 'Cash',
    icon: Wallet,
    accent: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  credit_card: {
    label: 'Credit Card',
    icon: CreditCard,
    accent: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  baridimob: {
    label: 'BaridiMob',
    icon: Smartphone,
    accent: 'text-sky-600',
    bg: 'bg-sky-50',
  },
};

import { formatCurrency } from '../lib/currency';

export default function BankTreasuryDashboard() {
  const [treasury, setTreasury] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFinancialAccounts = async () => {
      if (!supabase) {
        throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
      }

      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, label, current_balance, bank_name, currency')
        .order('label', { ascending: true });

      if (error) throw error;
      return (data || []).map((account) => ({
        id: account.id,
        account_type: (account.label || account.bank_name || 'cash').toLowerCase().replace(/\s+/g, '_'),
        current_balance: Number(account.current_balance || 0),
        label: account.label || account.bank_name || 'Account',
      }));
    };

    const fetchExpenses = async () => {
      if (!supabase) {
        throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('id, category, amount, method, date')
        .order('date', { ascending: false })
        .limit(8);

      if (error) throw error;
      return data || [];
    };

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [treasuryData, expensesData] = await Promise.all([
          fetchFinancialAccounts(),
          fetchExpenses(),
        ]);

        setTreasury(treasuryData);
        setExpenses(expensesData);
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const balancesByType = useMemo(() => {
    const map = {};

    treasury.forEach((item) => {
      map[item.account_type] = item.current_balance;
    });

    return map;
  }, [treasury]);

  const summaryCards = (treasury.length ? treasury : [
    { account_type: 'cash', current_balance: 0, label: 'Cash' },
    { account_type: 'credit_card', current_balance: 0, label: 'Credit Card' },
    { account_type: 'baridimob', current_balance: 0, label: 'BaridiMob' },
  ]).map((item, index) => {
    const type = item.account_type || ['cash', 'credit_card', 'baridimob'][index] || 'cash';
    const meta = accountMeta[type] || accountMeta.cash;
    const Icon = meta.icon;

    return {
      key: item.id || type,
      label: item.label || meta.label,
      value: Number(item.current_balance || item.balance || 0),
      icon: Icon,
      accent: meta.accent,
      bg: meta.bg,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Treasury overview
          </p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Bank & Treasury Dashboard</h2>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy shadow-sm transition hover:bg-brand-goldHover"
        >
          <Plus size={18} />
          Record Expense
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map(({ key, label, value, icon: Icon, accent, bg }) => (
          <div
            key={key}
            className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-xl p-3 ${bg}`}>
                <Icon className={accent} size={24} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Active
              </span>
            </div>

            <div className="mt-6">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-brand-navy">
                {formatCurrency(value)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
              <ReceiptText size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-brand-navy">Recent Expenses</h3>
              <p className="text-sm text-slate-500">Latest activity</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
            <ArrowUpRight size={16} />
            Updated today
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading expenses...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-8 text-center text-sm text-slate-500">
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-slate-200 text-sm text-slate-700">
                    <td className="px-5 py-4 font-medium text-brand-navy">{expense.category}</td>
                    <td className="px-5 py-4 font-mono font-semibold text-brand-navy">
                      {formatCurrency(Number(expense.amount) || 0)}
                    </td>
                    <td className="px-5 py-4">{expense.method}</td>
                    <td className="px-5 py-4">
                      {new Date(expense.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
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
