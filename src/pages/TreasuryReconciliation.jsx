import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Landmark, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const paymentMethods = ['cash', 'credit_card', 'baridimob'];

const normalizeMethod = (value) => String(value || 'cash').trim().toLowerCase();

export default function TreasuryReconciliation() {
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setFinancialAccounts([]);
          setExpenses([]);
          setSupplierPayments([]);
          setInvoices([]);
          return;
        }

        const [accountsResult, expensesResult, supplierPaymentsResult, invoicesResult] = await Promise.all([
          supabase.from('financial_accounts').select('id, label, current_balance, bank_name, currency').order('label', { ascending: true }),
          supabase.from('expenses').select('id, amount, method, status, category, date').eq('status', 'approved').order('date', { ascending: false }),
          supabase.from('supplier_payments').select('id, amount, payment_method, paid_at').order('paid_at', { ascending: false }),
          supabase
            .from('invoices')
            .select('id, grand_total, payment_method, status, paid_at')
            .eq('status', 'paid')
            .order('paid_at', { ascending: false }),
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (expensesResult.error) throw expensesResult.error;
        if (supplierPaymentsResult.error) throw supplierPaymentsResult.error;
        if (invoicesResult.error) throw invoicesResult.error;

        setFinancialAccounts(accountsResult.data || []);
        setExpenses(expensesResult.data || []);
        setSupplierPayments(supplierPaymentsResult.data || []);
        setInvoices(invoicesResult.data || []);
      } catch (err) {
        setError(err.message || 'Unable to load treasury reconciliation.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const accountTotals = useMemo(() => {
    const map = {
      cash: 0,
      credit_card: 0,
      baridimob: 0,
    };

    financialAccounts.forEach((item) => {
      const label = String(item.label || item.bank_name || '').toLowerCase();

      if (label.includes('cash')) map.cash += Number(item.current_balance || 0);
      else if (label.includes('credit')) map.credit_card += Number(item.current_balance || 0);
      else if (label.includes('baridi') || label.includes('mob')) map.baridimob += Number(item.current_balance || 0);
      else map.cash += Number(item.current_balance || 0);
    });

    return map;
  }, [financialAccounts]);

  const expectedByMethod = useMemo(() => {
    const map = {
      cash: 0,
      credit_card: 0,
      baridimob: 0,
    };

    invoices.forEach((invoice) => {
      const method = normalizeMethod(invoice.payment_method);
      if (!map[method]) return;
      map[method] += Number(invoice.grand_total) || 0;
    });

    expenses.forEach((expense) => {
      const method = normalizeMethod(expense.method);
      if (!map[method]) return;
      map[method] -= Number(expense.amount) || 0;
    });

    supplierPayments.forEach((payment) => {
      const method = normalizeMethod(payment.payment_method);
      if (!map[method]) return;
      map[method] -= Number(payment.amount) || 0;
    });

    return map;
  }, [expenses, invoices, supplierPayments]);

  const summary = useMemo(() => {
    const actualTotal = Object.values(accountTotals).reduce((sum, value) => sum + value, 0);
    const expectedTotal = Object.values(expectedByMethod).reduce((sum, value) => sum + value, 0);
    const difference = actualTotal - expectedTotal;

    return {
      actualTotal,
      expectedTotal,
      difference,
    };
  }, [accountTotals, expectedByMethod]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Treasury control</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">Treasury Reconciliation</h2>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-navy p-2 text-brand-gold"><Landmark size={18} /></div>
            <p className="text-sm text-slate-500">Actual balance</p>
          </div>
          <p className="mt-4 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(summary.actualTotal)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><ArrowUpRight size={18} /></div>
            <p className="text-sm text-slate-500">Expected balance</p>
          </div>
          <p className="mt-4 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(summary.expectedTotal)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${summary.difference === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {summary.difference === 0 ? <CheckCircle2 size={18} /> : <ArrowDownRight size={18} />}
            </div>
            <p className="text-sm text-slate-500">Difference</p>
          </div>
          <p className={`mt-4 font-mono text-2xl font-semibold ${summary.difference === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(summary.difference)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-brand-navy">Payment method reconciliation</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Actual</th>
                <th className="px-5 py-3">Expected</th>
                <th className="px-5 py-3">Difference</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">Loading reconciliation...</td>
                </tr>
              ) : paymentMethods.map((method) => {
                const actual = Number(accountTotals[method] || 0);
                const expected = Number(expectedByMethod[method] || 0);
                const delta = actual - expected;

                return (
                  <tr key={method} className="border-t border-slate-200 text-sm text-slate-700">
                    <td className="px-5 py-4 font-medium text-brand-navy">{method === 'cash' ? 'Cash' : method === 'credit_card' ? 'Credit Card' : 'BaridiMob'}</td>
                    <td className="px-5 py-4 font-mono">{formatCurrency(actual)}</td>
                    <td className="px-5 py-4 font-mono">{formatCurrency(expected)}</td>
                    <td className={`px-5 py-4 font-mono font-semibold ${delta === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
