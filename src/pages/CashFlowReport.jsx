import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Filter, TrendingDown, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const emptyFilters = {
  startDate: '',
  endDate: '',
  paymentMethod: 'all',
  entityType: 'all',
  flowType: 'all',
};

export default function CashFlowReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(emptyFilters);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setRows([]);
          return;
        }

        console.log('Cash flow fetch debug: starting queries');

        const [invoiceResult, supplierPaymentResult, expenseResult] = await Promise.all([
          supabase
            .from('invoices')
            .select('id, invoice_number, reference, grand_total, payment_method::text, paid_at, status::text, clients(full_name)')
            .eq('status', 'paid')
            .order('paid_at', { ascending: false })
            .throwOnError(),
          supabase
            .from('supplier_payments')
            .select('id, supplier_id, amount, payment_method::text, note, paid_at, suppliers(name)')
            .order('paid_at', { ascending: false })
            .throwOnError(),
          supabase
            .from('expenses')
            .select('id, category, amount, method::text, date, status::text')
            .eq('status', 'approved')
            .order('date', { ascending: false })
            .throwOnError(),
        ]);

        console.log('Cash flow fetch debug: invoiceResult', invoiceResult);
        console.log('Cash flow fetch debug: supplierPaymentResult', supplierPaymentResult);
        console.log('Cash flow fetch debug: expenseResult', expenseResult);

        const invoiceRows = (invoiceResult.data || []).map((invoice) => ({
          id: `invoice-${invoice.id}`,
          date: invoice.paid_at || invoice.created_at || new Date().toISOString(),
          amount: Number(invoice.grand_total) || 0,
          method: invoice.payment_method || 'cash',
          type: 'invoice',
          flowType: 'profit',
          reference: invoice.reference || `Invoice #${invoice.invoice_number || invoice.id.slice(0, 6)}`,
          label: invoice.clients?.full_name ? `${invoice.clients.full_name} — ${invoice.reference || invoice.invoice_number || 'Invoice'}` : invoice.reference || `Invoice #${invoice.invoice_number || invoice.id.slice(0, 6)}`,
        }));

        const supplierRows = (supplierPaymentResult.data || []).map((payment) => ({
          id: `supplier-${payment.id}`,
          date: payment.paid_at || new Date().toISOString(),
          amount: Number(payment.amount) || 0,
          method: payment.payment_method || 'cash',
          type: 'supplier',
          flowType: 'expense',
          reference: payment.note || 'Supplier payment',
          label: payment.suppliers?.name || 'Supplier',
        }));

        const expenseRows = (expenseResult.data || []).map((expense) => ({
          id: `expense-${expense.id}`,
          date: expense.date || new Date().toISOString(),
          amount: Number(expense.amount) || 0,
          method: expense.method || 'cash',
          type: 'expense',
          flowType: 'expense',
          reference: expense.category || 'Expense',
          label: expense.category || 'Expense',
        }));

        setRows([...invoiceRows, ...supplierRows, ...expenseRows]);
      } catch (err) {
        setError(err.message || 'Unable to load cash flow data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const rowDate = new Date(row.date);
      const isAfterStart = !filters.startDate || rowDate >= new Date(`${filters.startDate}T00:00:00`);
      const isBeforeEnd = !filters.endDate || rowDate <= new Date(`${filters.endDate}T23:59:59`);
      const matchesMethod = filters.paymentMethod === 'all' || row.method === filters.paymentMethod;
      const matchesType = filters.entityType === 'all' || row.type === filters.entityType;
      const matchesFlow = filters.flowType === 'all' || row.flowType === filters.flowType;

      return isAfterStart && isBeforeEnd && matchesMethod && matchesType && matchesFlow;
    });
  }, [filters, rows]);

  const totals = useMemo(() => {
    const income = filteredRows
      .filter((row) => row.flowType === 'profit')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const expense = filteredRows
      .filter((row) => row.flowType === 'expense')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      income,
      expense,
      net: income - expense,
    };
  }, [filteredRows]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Finance</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Cash Flow Report</h2>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
            <Filter size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-brand-navy">Filters</h3>
            <p className="text-sm text-slate-500">Filter by timing, method, and flow category</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm text-slate-600">
            <span className="font-medium text-brand-navy">Start date</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => handleFilterChange('startDate', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            <span className="font-medium text-brand-navy">End date</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => handleFilterChange('endDate', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            <span className="font-medium text-brand-navy">Payment method</span>
            <select
              value={filters.paymentMethod}
              onChange={(event) => handleFilterChange('paymentMethod', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
              <option value="baridimob">BaridiMob</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            <span className="font-medium text-brand-navy">Source</span>
            <select
              value={filters.entityType}
              onChange={(event) => handleFilterChange('entityType', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="all">All sources</option>
              <option value="invoice">Invoice</option>
              <option value="supplier">Supplier payment</option>
              <option value="expense">Expense</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            <span className="font-medium text-brand-navy">Flow type</span>
            <select
              value={filters.flowType}
              onChange={(event) => handleFilterChange('flowType', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="all">Profit & expenses</option>
              <option value="profit">Profit</option>
              <option value="expense">Expenses</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <TrendingUp size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.15em]">Profits</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-brand-navy">
            {formatCurrency(totals.income)}
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <TrendingDown size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.15em]">Expenses</span>
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold text-brand-navy">
            {formatCurrency(totals.expense)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-brand-card p-4">
          <div className="flex items-center gap-2 text-brand-navy">
            <BarChart3 size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.15em]">Net</span>
          </div>
          <p className={`mt-3 font-mono text-2xl font-semibold ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(totals.net)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
            <CalendarRange size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-brand-navy">Cash flow entries</h3>
            <p className="text-sm text-slate-500">Detailed movement history</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Flow</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading cash flow report...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-10 text-center text-sm text-slate-500">
                    No cash flow records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 text-sm text-slate-700">
                    <td className="px-5 py-4 font-medium text-brand-navy">
                      {row.type === 'invoice' ? 'Invoice' : 'Supplier'}
                    </td>
                    <td className="px-5 py-4">{row.label || row.reference}</td>
                    <td className="px-5 py-4">{row.method}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          row.flowType === 'profit'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {row.flowType}
                      </span>
                    </td>
                    <td className={`px-5 py-4 font-mono font-semibold ${row.flowType === 'profit' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.flowType === 'profit' ? '+' : '-'}
                      {formatCurrency(Number(row.amount) || 0)}
                    </td>
                    <td className="px-5 py-4">
                      {new Date(row.date).toLocaleDateString('en-US', {
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
