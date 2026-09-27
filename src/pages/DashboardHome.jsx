import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  FileText,
  Package,
  Plus,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const accountMeta = {
  cash: { label: 'Cash', icon: Wallet, border: 'border-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  credit_card: { label: 'Credit Card', icon: CreditCard, border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  baridimob: { label: 'BaridiMob', icon: Smartphone, border: 'border-sky-500', bg: 'bg-sky-50', text: 'text-sky-700' },
};

const priorityStyles = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-sky-100 text-sky-700',
};

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-700',
};

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

const getMonthKey = (date) => {
  const safeDate = new Date(date);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
};

const buildCashBasisRevenueTrend = (entries = []) => {
  const monthlyData = Array.from({ length: 12 }, (_, index) => ({
    name: new Date(0, index).toLocaleString('default', { month: 'short' }),
    Total: 0,
  }));

  entries.forEach((entry) => {
    const dateValue = new Date(entry.operation_date);
    if (Number.isNaN(dateValue.getTime())) return;

    const monthIndex = dateValue.getMonth();
    monthlyData[monthIndex].Total += Number(entry.credit || 0);
  });

  return monthlyData;
};

const formatDeltaText = (value) => {
  const safeValue = Number(value) || 0;
  const sign = safeValue > 0 ? '+' : safeValue < 0 ? '-' : '';
  return `${sign}${Math.abs(safeValue)} this month`;
};

const getStatusBadgeClass = (status) => {
  const normalized = (status || '').toString().toLowerCase();
  if (normalized === 'confirmed') return statusStyles.confirmed;
  if (normalized === 'overdue') return statusStyles.overdue;
  if (normalized === 'cancelled') return statusStyles.cancelled;
  return statusStyles.pending;
};

export default function DashboardHome({ language = 'en' }) {
  const labels = {
    en: {
      overview: 'Overview',
      revenue: 'Monthly revenue',
      treasury: 'Treasury snapshot',
      recentBookings: 'Recent bookings',
      pendingTasks: 'Pending tasks',
      supplierDebts: 'Top supplier debts',
      quickActions: 'Quick actions',
      newClient: 'New Client',
      newBooking: 'New Booking',
      newPackage: 'New Package',
      newSupplier: 'New Supplier',
      clients: 'Clients',
      bookings: 'Bookings',
      packages: 'Packages',
      invoices: 'Invoices',
      suppliers: 'Suppliers',
      totalDebt: 'Total Supplier Debt',
      overdue: 'Overdue bookings',
      status: 'Status',
      sellingPrice: 'Selling Price',
      finishDate: 'Finish Date',
      noTasks: 'No pending tasks',
      noSupplierDebts: 'No supplier debt data',
      noBookings: 'No recent bookings',
      viewAll: 'View all',
      open: 'Open',
    },
    ar: {
      overview: 'نظرة عامة',
      revenue: 'الإيرادات الشهرية',
      treasury: 'ملف الخزينة',
      recentBookings: 'أحدث الحجوزات',
      pendingTasks: 'المهام المعلقة',
      supplierDebts: 'أعلى ديون الموردين',
      quickActions: 'إجراءات سريعة',
      newClient: 'عميل جديد',
      newBooking: 'حجز جديد',
      newPackage: 'باقة جديدة',
      newSupplier: 'مورد جديد',
      clients: 'العملاء',
      bookings: 'الحجوزات',
      packages: 'الباقات',
      invoices: 'الفواتير',
      suppliers: 'الموردون',
      totalDebt: 'إجمالي ديون الموردين',
      overdue: 'الحجوزات المتأخرة',
      status: 'الحالة',
      sellingPrice: 'السعر',
      finishDate: 'تاريخ الإنجاز',
      noTasks: 'لا توجد مهام معلقة',
      noSupplierDebts: 'لا توجد ديون للموردين',
      noBookings: 'لا توجد حجوزات حديثة',
      viewAll: 'عرض الكل',
      open: 'فتح',
    },
  };

  const t = labels[language] || labels.en;
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    clients: 0,
    bookings: 0,
    packages: 0,
    invoices: 0,
    suppliers: 0,
    totalSupplierDebt: 0,
    overdueBookings: 0,
    revenue: 0,
  });
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [supplierDebts, setSupplierDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const statCards = useMemo(
    () => [
      { key: 'clients', label: t.clients, icon: Users, accent: 'bg-slate-100 text-slate-700' },
      { key: 'bookings', label: t.bookings, icon: BriefcaseBusiness, accent: 'bg-sky-100 text-sky-700' },
      { key: 'packages', label: t.packages, icon: Package, accent: 'bg-emerald-100 text-emerald-700' },
      { key: 'invoices', label: t.invoices, icon: FileText, accent: 'bg-amber-100 text-amber-700' },
      { key: 'suppliers', label: t.suppliers, icon: Building2, accent: 'bg-rose-100 text-rose-700' },
      { key: 'totalSupplierDebt', label: t.totalDebt, icon: ArrowUpRight, accent: 'bg-red-100 text-red-700' },
    ],
    [t]
  );

  const quickActions = [
    { key: 'clients', label: t.newClient, route: '/clients', filled: true },
    { key: 'bookings', label: t.newBooking, route: '/bookings', filled: false },
    { key: 'packages', label: t.newPackage, route: '/packages', filled: false },
    { key: 'suppliers', label: t.newSupplier, route: '/suppliers', filled: false },
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          return;
        }

        const currentYear = new Date().getFullYear();
        const [clientsRes, bookingsRes, packagesRes, invoicesRes, suppliersRes, accountsRes, recentBookingsRes, tasksRes, bankEntriesRes] = await Promise.all([
          supabase.from('clients').select('id, created_at'),
          supabase.from('bookings').select('id, status, finish_date, selling_price, created_at, clients(full_name)'),
          supabase.from('package_templates').select('id, created_at'),
          supabase.from('invoices').select('id, grand_total, created_at, paid_at, status'),
          supabase.from('suppliers').select('id, name, supplier_debt'),
          supabase.from('financial_accounts').select('id, label, currency, current_balance, bank_name').order('label', { ascending: true }),
          supabase.from('bookings').select('id, status, finish_date, selling_price, clients(full_name)').order('id', { ascending: false }).limit(5),
          supabase.from('tasks').select('id, title, status, priority').in('status', ['todo', 'in_progress']).order('id', { ascending: false }).limit(4),
          supabase
            .from('bank_entries')
            .select('operation_date, credit')
            .gt('credit', 0)
            .gte('operation_date', `${currentYear}-01-01T00:00:00Z`)
            .lte('operation_date', `${currentYear}-12-31T23:59:59Z`),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (bookingsRes.error) throw bookingsRes.error;
        if (packagesRes.error) throw packagesRes.error;
        if (invoicesRes.error) throw invoicesRes.error;
        if (suppliersRes.error) throw suppliersRes.error;
        if (accountsRes.error) throw accountsRes.error;
        if (recentBookingsRes.error) throw recentBookingsRes.error;
        if (tasksRes.error) throw tasksRes.error;
        if (bankEntriesRes.error) throw bankEntriesRes.error;

        const totalRevenue = (bankEntriesRes.data || []).reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
        const overdueBookings = (bookingsRes.data || []).filter((booking) => {
          if (!booking.finish_date || booking.status === 'cancelled') return false;
          const finishDate = new Date(`${booking.finish_date}T00:00:00`);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return finishDate < today || booking.status === 'overdue';
        }).length;

        const currentMonth = new Date();
        const previousMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const getMonthCount = (rows, targetMonth) =>
          (rows || []).filter((row) => {
            if (!row.created_at) return false;
            const createdDate = new Date(row.created_at);
            return createdDate.getFullYear() === targetMonth.getFullYear() && createdDate.getMonth() === targetMonth.getMonth();
          }).length;

        const clientDelta = getMonthCount(clientsRes.data || [], currentMonth) - getMonthCount(clientsRes.data || [], previousMonth);
        const bookingDelta = getMonthCount(bookingsRes.data || [], currentMonth) - getMonthCount(bookingsRes.data || [], previousMonth);
        const packageDelta = getMonthCount(packagesRes.data || [], currentMonth) - getMonthCount(packagesRes.data || [], previousMonth);
        const supplierDelta = getMonthCount(suppliersRes.data || [], currentMonth) - getMonthCount(suppliersRes.data || [], previousMonth);
        const invoiceDelta = (invoicesRes.data || []).filter((invoice) => {
          if (!invoice.created_at) return false;
          const createdDate = new Date(invoice.created_at);
          return createdDate.getFullYear() === currentMonth.getFullYear() && createdDate.getMonth() === currentMonth.getMonth();
        }).reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0) - (invoicesRes.data || []).filter((invoice) => {
          if (!invoice.created_at) return false;
          const createdDate = new Date(invoice.created_at);
          return createdDate.getFullYear() === previousMonth.getFullYear() && createdDate.getMonth() === previousMonth.getMonth();
        }).reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0);

        const totalSupplierDebt = (suppliersRes.data || []).reduce((sum, supplier) => sum + Number(supplier.supplier_debt || 0), 0);

        setStats({
          clients: clientsRes.data?.length || 0,
          bookings: bookingsRes.data?.length || 0,
          packages: packagesRes.data?.length || 0,
          invoices: invoicesRes.data?.length || 0,
          suppliers: suppliersRes.data?.length || 0,
          totalSupplierDebt,
          overdueBookings,
          revenue: totalRevenue,
          clientDelta,
          bookingDelta,
          packageDelta,
          invoiceDelta,
          supplierDelta,
        });

        setRevenueTrend(buildCashBasisRevenueTrend(bankEntriesRes.data || []));
        setAccounts((accountsRes.data || []).map((item) => ({
          id: item.id,
          label: item.label || item.bank_name || 'Account',
          currency: item.currency || 'DZD',
          current_balance: Number(item.current_balance || 0),
        })));
        setRecentBookings((recentBookingsRes.data || []).slice(0, 5));
        setPendingTasks((tasksRes.data || []).slice(0, 4));
        setSupplierDebts((suppliersRes.data || []).sort((a, b) => Number(b.supplier_debt || 0) - Number(a.supplier_debt || 0)).slice(0, 3));
      } catch (err) {
        setError(err.message || 'Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleCardClick = (key) => {
    const routes = {
      clients: '/clients',
      bookings: '/bookings',
      packages: '/packages',
      invoices: '/invoices',
      suppliers: '/suppliers',
      totalSupplierDebt: '/suppliers',
    };

    navigate(routes[key] || '/');
  };

  const chartHeight = 260;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.overview}</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">Airvoy Dashboard</h2>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map(({ key, label, icon: Icon, accent }) => {
          const delta = stats[`${key}Delta`] ?? 0;
          const cardValue = key === 'totalSupplierDebt' ? stats.totalSupplierDebt : stats[key] ?? 0;
          const isRedHighlight = key === 'bookings' && stats.overdueBookings > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCardClick(key)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-md ${
                isRedHighlight ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className={`rounded-xl p-2 ${accent}`}>
                  <Icon size={18} />
                </div>
                <ArrowUpRight size={16} className="text-slate-400" />
              </div>

              <div className="mt-5">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-brand-navy">
                  {key === 'totalSupplierDebt' ? formatCurrency(cardValue) : cardValue}
                </p>
              </div>

              <div className="mt-4 inline-flex rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-navy">
                {delta >= 0 ? '+' : '-'}
                {Math.abs(delta)} this month
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-brand-navy">{t.revenue}</h3>
            <span className="font-mono text-sm text-brand-navy">{formatCurrency(stats.revenue)}</span>
          </div>

          <div className="h-[260px] w-full">
            {!loading && revenueTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={revenueTrend} margin={{ top: 18, right: 10, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'Total']}
                    labelStyle={{ color: '#0a1120', fontWeight: 600 }}
                    contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', backgroundColor: '#fff' }}
                  />
                  <Bar dataKey="Total" fill="#c9a84c" radius={[8, 8, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">{loading ? 'Loading revenue...' : 'No chart data available'}</div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-brand-navy">{t.treasury}</h3>
          <div className="space-y-4">
            {accounts.length === 0 ? (
              <p className="text-sm text-slate-500">No financial accounts set up yet.</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl border border-y border-r border-slate-100 border-l-4 border-[#c9a84c] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-slate-800">{account.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{t.open}</div>
                    <div className="text-lg font-bold text-[#0a1120]">
                      {new Intl.NumberFormat('fr-DZ', {
                        style: 'currency',
                        currency: account.currency || 'DZD',
                        maximumFractionDigits: 0,
                      }).format(account.current_balance || 0)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-brand-navy">{t.recentBookings}</h3>
            <button type="button" onClick={() => navigate('/bookings')} className="text-sm font-semibold text-brand-gold">
              {t.viewAll}
            </button>
          </div>

          {recentBookings.length === 0 ? (
            <p className="text-sm text-slate-500">{t.noBookings}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3 font-medium">Client</th>
                    <th className="px-3 py-3 font-medium">{t.status}</th>
                    <th className="px-3 py-3 font-medium">{t.sellingPrice}</th>
                    <th className="px-3 py-3 font-medium">{t.finishDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-brand-navy">{booking.clients?.full_name || 'Unknown Client'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(booking.status)}`}>
                          {String(booking.status || 'pending').replace(/(^\w|_\w)/g, (match) => match.replace('_', ' ').toUpperCase())}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-brand-navy">{formatCurrency(Number(booking.selling_price || 0))}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {booking.finish_date ? new Date(`${booking.finish_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-brand-navy">{t.pendingTasks}</h3>
            <div className="mt-4 space-y-3">
              {pendingTasks.length === 0 ? (
                <p className="text-sm text-slate-500">{t.noTasks}</p>
              ) : (
                pendingTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-brand-navy">{task.title}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${priorityStyles[task.priority] || priorityStyles.Medium}`}>
                      {task.priority || 'Medium'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-brand-navy">{t.supplierDebts}</h3>
            <div className="mt-4 space-y-3">
              {supplierDebts.length === 0 ? (
                <p className="text-sm text-slate-500">{t.noSupplierDebts}</p>
              ) : (
                supplierDebts.map((supplier) => (
                  <div key={supplier.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                    <span className="text-sm font-medium text-brand-navy">{supplier.name}</span>
                    <span className="font-mono text-sm font-semibold text-red-700">{formatCurrency(Number(supplier.supplier_debt || 0))}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {quickActions.map(({ key, label, route, filled }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(route)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                filled ? 'bg-brand-gold text-brand-navy shadow-sm' : 'border border-slate-200 bg-white text-brand-navy hover:border-brand-gold'
              }`}
            >
              <Plus size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
