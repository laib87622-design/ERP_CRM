import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarRange,
  TrendingUp,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const roleLabels = {
  super_admin: 'Super Admin',
  sales_agent: 'Sales Agent',
  cashier: 'Cashier',
  viewer: 'Viewer',
};

const emptyStats = {
  totalBookings: 0,
  revenue: 0,
  commissionEarned: 0,
  recentActivity: [],
  clientCount: 0,
};

const bookingStatusOptions = ['all', 'pending', 'processing', 'confirmed', 'overdue', 'cancelled'];

const formatDZD = (value) =>
  new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateValue = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getBookingStatusBadge = (status) => {
  const normalized = String(status || 'pending').toLowerCase();

  if (normalized === 'confirmed') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'processing') return 'bg-sky-100 text-sky-700';
  if (normalized === 'overdue') return 'bg-red-100 text-red-700';
  if (normalized === 'cancelled') return 'bg-slate-200 text-slate-700';
  return 'bg-amber-100 text-amber-700';
};

export default function RoleDashboard() {
  const [employees, setEmployees] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' });
  const [user, setUser] = useState(null);
  const [teamStats, setTeamStats] = useState({
    activeAgents: 0,
    totalBookings: 0,
    totalRevenue: 0,
    totalCommissionEarned: 0,
  });
  const [teamRows, setTeamRows] = useState([]);
  const [agentStats, setAgentStats] = useState(emptyStats);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [payrollAccountId, setPayrollAccountId] = useState('');
  const [payingSalary, setPayingSalary] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        if (!supabase) return;

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) return;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!profileError && profile) {
          setUser({
            id: profile.id,
            full_name: profile.full_name || authData.user.email || 'User',
            role: profile.role || 'viewer',
          });
        }
      } catch {
        setUser(null);
      }
    };

    loadCurrentUser();
  }, []);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setError('');

        if (!supabase) {
          setEmployees([]);
          setSelectedAgentId(null);
          return;
        }

        const { data, error: employeeError } = await supabase
          .from('profiles')
          .select('id, full_name, role, base_salary')
          .in('role', ['super_admin', 'sales_agent', 'cashier'])
          .order('full_name', { ascending: true });

        if (employeeError) throw employeeError;

        const list = data || [];
        setEmployees(list);

        if (list.length > 0) {
          setSelectedAgentId((currentValue) => currentValue || list[0].id);
        } else {
          setSelectedAgentId(null);
        }
      } catch (err) {
        setError(err.message || 'Unable to load employees.');
      }
    };

    loadEmployees();
  }, []);

  const buildBookingQuery = (queryBuilder, forAgentId = null) => {
    let query = queryBuilder
      .select('id, reference, status, created_at, selling_price, agent_id, clients(full_name)')
      .order('created_at', { ascending: false });

    if (forAgentId) {
      query = query.eq('agent_id', forAgentId);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (startDate) {
      query = query.gte('created_at', new Date(`${startDate}T00:00:00.000Z`).toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', new Date(`${endDate}T23:59:59.999Z`).toISOString());
    }

    return query;
  };

  useEffect(() => {
    const loadFinancialAccounts = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, label, current_balance')
        .order('label', { ascending: true });

      if (!error) {
        setFinancialAccounts(data || []);
        if ((data || []).length > 0 && !payrollAccountId) {
          setPayrollAccountId(data[0].id);
        }
      }
    };

    loadFinancialAccounts();
  }, [payrollAccountId]);

  async function fetchAgentStats(agentId) {
    if (!agentId || !supabase) {
      setAgentStats(emptyStats);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const bookingsQuery = buildBookingQuery(supabase.from('bookings'), agentId);
      const commissionsQuery = supabase
        .from('agent_commissions')
        .select('amount, status, created_at, agent_id');

      if (startDate) {
        commissionsQuery.gte('created_at', new Date(`${startDate}T00:00:00.000Z`).toISOString());
      }

      if (endDate) {
        commissionsQuery.lte('created_at', new Date(`${endDate}T23:59:59.999Z`).toISOString());
      }

      commissionsQuery.eq('agent_id', agentId);

      const [bookingsRes, commissionsRes] = await Promise.all([bookingsQuery, commissionsQuery]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (commissionsRes.error) throw commissionsRes.error;

      const bookings = bookingsRes.data || [];
      const totalBookings = bookings.length;
      const revenue = bookings.reduce((sum, booking) => sum + Number(booking.selling_price || 0), 0);
      const commissionEarned = (commissionsRes.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const recentActivity = bookings.slice(0, 5).map((booking) => ({
        id: booking.id,
        reference: booking.reference || `BK-${booking.id}`,
        clientName: booking.clients?.full_name || 'Unknown client',
        created_at: booking.created_at,
        status: booking.status || 'pending',
      }));

      setAgentStats({
        totalBookings,
        revenue,
        commissionEarned,
        recentActivity,
        clientCount: new Set(bookings.map((booking) => booking.agent_id)).size,
      });
    } catch (err) {
      setError(err.message || 'Unable to load agent stats.');
      setAgentStats({
        totalBookings: 0,
        revenue: 0,
        commissionEarned: 0,
        recentActivity: [],
        clientCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentStats(emptyStats);
      return;
    }

    fetchAgentStats(selectedAgentId);
  }, [selectedAgentId, statusFilter, startDate, endDate]);

  useEffect(() => {
    const loadTeamOverview = async () => {
      if (!supabase || employees.length === 0) {
        setTeamRows([]);
        setTeamStats({
          activeAgents: 0,
          totalBookings: 0,
          totalRevenue: 0,
          totalCommissionEarned: 0,
        });
        return;
      }

      try {
        setError('');

        const agentIds = employees.map((employee) => employee.id);

        const bookingsQuery = buildBookingQuery(supabase.from('bookings'));
        const commissionsQuery = supabase
          .from('agent_commissions')
          .select('agent_id, amount, created_at');

        if (agentIds.length > 0) {
          bookingsQuery.in('agent_id', agentIds);
          commissionsQuery.in('agent_id', agentIds);
        }

        if (startDate) {
          commissionsQuery.gte('created_at', new Date(`${startDate}T00:00:00.000Z`).toISOString());
        }

        if (endDate) {
          commissionsQuery.lte('created_at', new Date(`${endDate}T23:59:59.999Z`).toISOString());
        }

        const [bookingsRes, commissionsRes] = await Promise.all([bookingsQuery, commissionsQuery]);

        if (bookingsRes.error) throw bookingsRes.error;
        if (commissionsRes.error) throw commissionsRes.error;

        const bookings = bookingsRes.data || [];
        const commissions = commissionsRes.data || [];

        const bookingsByAgent = new Map();
        bookings.forEach((booking) => {
          const agentId = booking.agent_id;
          if (!agentId) return;

          const current = bookingsByAgent.get(agentId) || { count: 0, revenue: 0, names: new Set() };
          current.count += 1;
          current.revenue += Number(booking.selling_price || 0);
          if (booking.clients?.full_name) current.names.add(booking.clients.full_name);
          bookingsByAgent.set(agentId, current);
        });

        const commissionsByAgent = new Map();
        commissions.forEach((row) => {
          const agentId = row.agent_id;
          if (!agentId) return;
          const current = commissionsByAgent.get(agentId) || 0;
          commissionsByAgent.set(agentId, current + Number(row.amount || 0));
        });

        const nextRows = employees.map((employee) => {
          const bookingSummary = bookingsByAgent.get(employee.id) || { count: 0, revenue: 0, names: new Set() };
          const commissionsTotal = commissionsByAgent.get(employee.id) || 0;
          const lastBooking = bookings.filter((booking) => booking.agent_id === employee.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

          return {
            id: employee.id,
            name: employee.full_name || 'Unknown agent',
            role: employee.role,
            bookings: bookingSummary.count,
            revenue: bookingSummary.revenue,
            commissions: commissionsTotal,
            lastActivity: lastBooking?.created_at || null,
            clients: bookingSummary.names.size,
          };
        });

        const totalBookings = nextRows.reduce((sum, row) => sum + row.bookings, 0);
        const totalRevenue = nextRows.reduce((sum, row) => sum + row.revenue, 0);
        const totalCommissionEarned = nextRows.reduce((sum, row) => sum + row.commissions, 0);

        setTeamRows(nextRows);
        setTeamStats({
          activeAgents: nextRows.filter((row) => row.bookings > 0).length,
          totalBookings,
          totalRevenue,
          totalCommissionEarned,
        });
      } catch (err) {
        setError(err.message || 'Unable to load team overview.');
        setTeamRows([]);
        setTeamStats({
          activeAgents: 0,
          totalBookings: 0,
          totalRevenue: 0,
          totalCommissionEarned: 0,
        });
      }
    };

    loadTeamOverview();
  }, [employees, statusFilter, startDate, endDate]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedTeamRows = useMemo(() => {
    const rows = [...teamRows];

    rows.sort((a, b) => {
      const left = a[sortConfig.key] ?? 0;
      const right = b[sortConfig.key] ?? 0;

      if (typeof left === 'string' && typeof right === 'string') {
        return sortConfig.direction === 'asc'
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }

      if (sortConfig.direction === 'asc') {
        return Number(left) - Number(right);
      }

      return Number(right) - Number(left);
    });

    return rows;
  }, [teamRows, sortConfig]);

  const recentActivity = useMemo(() => {
    return [...agentStats.recentActivity].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [agentStats.recentActivity]);

  const metricCards = useMemo(
    () => [
      {
        key: 'activeAgents',
        label: 'Active Agents',
        value: teamStats.activeAgents,
        icon: Users,
        accent: 'border-t-violet-500',
      },
      {
        key: 'bookings',
        label: 'Bookings',
        value: teamStats.totalBookings,
        icon: BriefcaseBusiness,
        accent: 'border-t-emerald-500',
      },
      {
        key: 'revenue',
        label: 'Revenue',
        value: formatDZD(teamStats.totalRevenue),
        icon: TrendingUp,
        accent: 'border-t-[#c9a84c]',
      },
      {
        key: 'commissions',
        label: 'Commissions',
        value: formatDZD(teamStats.totalCommissionEarned),
        icon: BadgeDollarSign,
        accent: 'border-t-sky-500',
      },
    ],
    [teamStats]
  );

  const handlePaySalary = async () => {
    if (!selectedEmployee || !supabase || !user) {
      setError('Select an employee and an account before making a salary payout.');
      return;
    }

    const baseSalary = Number(selectedEmployee.base_salary || 0);
    const accountId = payrollAccountId || financialAccounts[0]?.id;

    if (!accountId) {
      setError('No financial account is available for salary payout.');
      return;
    }

    if (!baseSalary || baseSalary <= 0) {
      setError('This employee does not have a valid monthly base salary configured.');
      return;
    }

    try {
      setPayingSalary(true);
      setError('');

      const { error: ledgerError } = await supabase.from('bank_entries').insert({
        account_id: accountId,
        operation_date: new Date().toISOString(),
        description: `Monthly Base Salary - ${selectedEmployee.full_name}`,
        operation_type: 'Payroll',
        third_party: selectedEmployee.full_name,
        credit: 0,
        debit: baseSalary,
        agent_id: user.id,
      });

      if (ledgerError) throw ledgerError;

      const { data: accountData, error: accountFetchError } = await supabase
        .from('financial_accounts')
        .select('current_balance')
        .eq('id', accountId)
        .single();

      if (accountFetchError) throw accountFetchError;

      const nextBalance = Number(accountData?.current_balance || 0) - Number(baseSalary || 0);
      const { error: balanceError } = await supabase
        .from('financial_accounts')
        .update({ current_balance: nextBalance })
        .eq('id', accountId);

      if (balanceError) throw balanceError;

      setIsPayrollModalOpen(false);
      setError('');
      setToast('Salary payout recorded successfully.');
    } catch (err) {
      setError(err.message || 'Unable to process salary payout.');
    } finally {
      setPayingSalary(false);
    }
  };

  const selectedEmployee = employees.find((employee) => employee.id === selectedAgentId) || null;

  if (loading && employees.length === 0 && !selectedAgentId) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Loading role dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Employees</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">Manager Dashboard</h2>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {toast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{toast}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3 text-brand-navy">
          <CalendarRange size={18} />
          <h3 className="text-lg font-semibold">Filters</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="agent-select" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Agent
            </label>
            <select
              id="agent-select"
              value={selectedAgentId || ''}
              onChange={(event) => setSelectedAgentId(event.target.value || null)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
            >
              {employees.length === 0 ? (
                <option value="">No employees found</option>
              ) : (
                employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name || employee.id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="status-filter" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
            >
              {bookingStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="start-date" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              From date
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
            />
          </div>

          <div>
            <label htmlFor="end-date" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              To date
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ key, label, value, icon: Icon, accent }) => (
          <div key={key} className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${accent} border-t-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-2 text-brand-navy">
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-5 text-3xl font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Performance</p>
            <h3 className="mt-2 text-xl font-semibold text-brand-navy">Team overview</h3>
          </div>
          {selectedEmployee && (
            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {selectedEmployee.full_name}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-2 font-semibold">
                    Agent <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => handleSort('bookings')} className="flex items-center gap-2 font-semibold">
                    Bookings <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => handleSort('revenue')} className="flex items-center gap-2 font-semibold">
                    Revenue <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => handleSort('commissions')} className="flex items-center gap-2 font-semibold">
                    Commissions <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => handleSort('lastActivity')} className="flex items-center gap-2 font-semibold">
                    Last activity <ArrowUpDown size={12} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTeamRows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-sm text-slate-500">
                    No agent data matches the current filters.
                  </td>
                </tr>
              ) : (
                sortedTeamRows.map((row) => {
                  const isSelected = selectedAgentId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-slate-200 text-sm text-slate-700 transition hover:bg-slate-50 ${isSelected ? 'bg-brand-gold/10' : ''}`}
                      onClick={() => setSelectedAgentId(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedAgentId(row.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Focus ${row.name} details`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-brand-navy">{row.name}</div>
                        <div className="text-xs text-slate-500">{roleLabels[row.role] || row.role}</div>
                      </td>
                      <td className="px-4 py-3">{row.bookings}</td>
                      <td className="px-4 py-3">{formatDZD(row.revenue)}</td>
                      <td className="px-4 py-3">{formatDZD(row.commissions)}</td>
                      <td className="px-4 py-3">{formatDateValue(row.lastActivity)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Focus</p>
            <h3 className="mt-2 text-xl font-semibold text-brand-navy">Recent activity</h3>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {agentStats.totalBookings} bookings in view
          </div>
        </div>

        {recentActivity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No recent activity for this agent yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((activity) => (
                  <tr key={activity.id} className="border-t border-slate-200 text-sm text-slate-700">
                    <td className="px-4 py-3 font-semibold text-brand-navy">{activity.reference}</td>
                    <td className="px-4 py-3">{activity.clientName}</td>
                    <td className="px-4 py-3">{formatDateValue(activity.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${getBookingStatusBadge(activity.status)}`}>
                        {activity.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {user && (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Current logged user</p>
              <h3 className="mt-2 text-2xl font-serif text-brand-navy">{user.full_name}</h3>
            </div>
            <span className="rounded-full bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-brand-navy">
              {roleLabels[user.role] || user.role}
            </span>
          </div>
        </div>
      )}

      {isPayrollModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Payroll</p>
              <h3 className="mt-2 text-xl font-semibold text-brand-navy">Pay Salary</h3>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Employee</p>
                <p className="mt-1 text-lg font-semibold text-brand-navy">{selectedEmployee.full_name}</p>
                <p className="mt-1 text-sm text-slate-600">Monthly base salary: {formatDZD(selectedEmployee.base_salary || 0)}</p>
              </div>

              <label className="block text-sm text-brand-navy">
                <span className="mb-1 block font-medium">Source account</span>
                <select
                  value={payrollAccountId}
                  onChange={(event) => setPayrollAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                >
                  {financialAccounts.length === 0 ? (
                    <option value="">No accounts available</option>
                  ) : (
                    financialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label} ({formatDZD(account.current_balance || 0)})
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPayrollModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePaySalary}
                disabled={payingSalary || !payrollAccountId}
                className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
              >
                {payingSalary ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
