import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Package,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-700',
};

const getStatusBadgeClass = (status) => {
  const normalized = (status || '').toString().toLowerCase();
  if (normalized === 'confirmed') return statusStyles.confirmed;
  if (normalized === 'overdue') return statusStyles.overdue;
  if (normalized === 'cancelled') return statusStyles.cancelled;
  return statusStyles.pending;
};

const getCountThisMonth = (items = []) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return items.filter((item) => {
    if (!item.created_at) return false;
    const itemDate = new Date(item.created_at);
    return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth;
  }).length;
};

export default function DashboardHome({ language = 'en', agencyName = '' }) {
  const labels = {
    en: {
      overview: 'Overview',
      recentBookings: 'Recent bookings',
      pendingTasks: 'Pending tasks',
      quickActions: 'Quick actions',
      newClient: 'New Client',
      newBooking: 'New Booking',
      newPackage: 'New Package',
      clients: 'Clients',
      bookings: 'Bookings',
      packages: 'Packages',
      status: 'Status',
      finishDate: 'Finish Date',
      noTasks: 'No pending tasks',
      noBookings: 'No recent bookings',
      viewAll: 'View all',
    },
    ar: {
      overview: 'نظرة عامة',
      recentBookings: 'أحدث الحجوزات',
      pendingTasks: 'المهام المعلقة',
      quickActions: 'إجراءات سريعة',
      newClient: 'عميل جديد',
      newBooking: 'حجز جديد',
      newPackage: 'باقة جديدة',
      clients: 'العملاء',
      bookings: 'الحجوزات',
      packages: 'الباقات',
      status: 'الحالة',
      finishDate: 'تاريخ الإنجاز',
      noTasks: 'لا توجد مهام معلقة',
      noBookings: 'لا توجد حجوزات حديثة',
      viewAll: 'عرض الكل',
    },
  };

  const t = labels[language] || labels.en;
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    clients: 0,
    bookings: 0,
    packages: 0,
    overdueBookings: 0,
  });
  const [recentBookings, setRecentBookings] = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [platformLinks, setPlatformLinks] = useState([]);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [platformForm, setPlatformForm] = useState({ name: '', url: '', category: '' });
  const [isSavingPlatform, setIsSavingPlatform] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const statCards = useMemo(
    () => [
      { key: 'clients', label: t.clients, icon: Users, accent: 'bg-slate-100 text-slate-700' },
      { key: 'bookings', label: t.bookings, icon: BriefcaseBusiness, accent: 'bg-sky-100 text-sky-700' },
      { key: 'packages', label: t.packages, icon: Package, accent: 'bg-emerald-100 text-emerald-700' },
    ],
    [t]
  );

  const quickActions = [
    { key: 'clients', label: t.newClient, route: '/clients', filled: true },
    { key: 'bookings', label: t.newBooking, route: '/bookings', filled: false },
    { key: 'packages', label: t.newPackage, route: '/packages', filled: false },
  ];

  const fetchLinks = useCallback(async () => {
    if (!supabase) return;

    const { data, error: fetchError } = await supabase
      .from('agency_links')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      setError(fetchError.message || 'Unable to load platform links.');
      return;
    }

    setPlatformLinks(data || []);
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleSavePlatform = async (event) => {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    const name = platformForm.name.trim();
    const rawUrl = platformForm.url.trim();
    if (!name || !rawUrl) return;

    let formattedUrl = rawUrl;
    try {
      if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = `https://${formattedUrl}`;
      const parsedUrl = new URL(formattedUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only HTTP and HTTPS links are allowed.');
    } catch (urlError) {
      setError(urlError.message === 'Only HTTP and HTTPS links are allowed.' ? urlError.message : 'Enter a valid platform URL beginning with https://.');
      return;
    }

    setIsSavingPlatform(true);
    try {
      const { error: insertError } = await supabase.from('agency_links').insert({
        name,
        url: formattedUrl,
        category: platformForm.category.trim() || 'General',
      });
      if (insertError) {
        setError(insertError.message || 'Unable to add platform link.');
        return;
      }

      setError('');
      setIsPlatformModalOpen(false);
      setIsNewCategory(false);
      setPlatformForm({ name: '', url: '', category: '' });
      await fetchLinks();
    } catch (saveError) {
      setError(saveError.message || 'Unable to add platform link.');
    } finally {
      setIsSavingPlatform(false);
    }
  };

  const handleDeleteLink = async (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    if (!window.confirm('Delete this link?')) return;

    const { error: deleteError } = await supabase.from('agency_links').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete platform link.');
      return;
    }

    setError('');
    await fetchLinks();
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          return;
        }

        const [clientsRes, bookingsRes, packagesRes, recentBookingsRes, requestsRes] = await Promise.all([
          supabase.from('clients').select('id, created_at'),
          supabase.from('bookings').select('id, status, finish_date, created_at, clients(full_name)'),
          supabase.from('package_templates').select('id, created_at'),
          supabase.from('bookings').select('id, status, finish_date, clients(full_name)').order('id', { ascending: false }).limit(5),
          supabase
            .from('client_requests')
            .select('id, client_name, service_type, end_date')
            .in('order_status', ['Pending', 'Active', 'pending', 'active'])
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (bookingsRes.error) throw bookingsRes.error;
        if (packagesRes.error) throw packagesRes.error;
        if (recentBookingsRes.error) throw recentBookingsRes.error;
        if (requestsRes.error) throw requestsRes.error;

        const overdueBookings = (bookingsRes.data || []).filter((booking) => {
          if (!booking.finish_date || booking.status === 'cancelled') return false;
          const finishDate = new Date(`${booking.finish_date}T00:00:00`);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return finishDate < today || booking.status === 'overdue';
        }).length;

        setStats({
          clients: clientsRes.data?.length || 0,
          bookings: bookingsRes.data?.length || 0,
          packages: packagesRes.data?.length || 0,
          overdueBookings,
          clientsThisMonth: getCountThisMonth(clientsRes.data || []),
          bookingsThisMonth: getCountThisMonth(bookingsRes.data || []),
          packagesThisMonth: getCountThisMonth(packagesRes.data || []),
        });

        setRecentBookings((recentBookingsRes.data || []).slice(0, 5));
        setPendingTasks(requestsRes.data || []);
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
    };

    navigate(routes[key] || '/');
  };

  const groupedLinks = platformLinks.reduce((groups, link) => {
    const category = link.category?.trim() || 'General';
    if (!groups[category]) groups[category] = [];
    groups[category].push(link);
    return groups;
  }, {});
  const existingCategories = [...new Set(platformLinks.map((link) => link.category?.trim()).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.overview}</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">{agencyName ? `${agencyName} Dashboard` : 'Dashboard'}</h2>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map(({ key, label, icon: Icon, accent }) => {
          const countThisMonth = stats[`${key}ThisMonth`] ?? 0;
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
                  {stats[key] ?? 0}
                </p>
              </div>

              <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                +{countThisMonth} this month
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
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
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate('/task-manager')}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800">{task.client_name || 'Client'}</p>
                      <p className="text-xs text-slate-500">{task.service_type || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600">
                      {task.end_date || 'No Date'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-brand-navy">Quick Platforms</h3>
              <button
                type="button"
                onClick={() => {
                  setIsNewCategory(false);
                  setPlatformForm((current) => ({ ...current, category: '' }));
                  setIsPlatformModalOpen(true);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-navy px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus size={14} />
                Add Platform
              </button>
            </div>

            {platformLinks.length === 0 ? (
              <p className="text-sm text-slate-500">No platforms added yet.</p>
            ) : (
                        <div className="space-y-3">
                          {Object.entries(groupedLinks).map(([category, links]) => (
                            <section key={category}>
                              <h4 className="mb-2 mt-3 text-xs font-bold uppercase text-slate-400">{category}</h4>
                              <div className="grid grid-cols-2 gap-2">
                                {links.map((link) => (
                                  <div key={link.id} className="flex min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 transition hover:border-brand-gold">
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-0 flex-1 truncate px-3 py-2.5 text-sm font-medium text-brand-navy"
                                      title={link.name}
                                    >
                                      {link.name}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={(event) => handleDeleteLink(link.id, event)}
                                      className="mr-1 rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                      aria-label={`Delete ${link.name}`}
                                      title={`Delete ${link.name}`}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
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

                  {isPlatformModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="platform-modal-title"
                        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 p-4">
                          <h3 id="platform-modal-title" className="font-bold text-slate-800">Add Quick Platform</h3>
                          <button
                            type="button"
                            onClick={() => setIsPlatformModalOpen(false)}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Close dialog"
                          >
                            <X size={18} />
                          </button>
                        </div>
                        <form onSubmit={handleSavePlatform} className="space-y-4 p-4">
                          <div>
                            <label htmlFor="platform-name" className="mb-1 block text-sm font-medium text-slate-700">Platform Name</label>
                            <input
                              id="platform-name"
                              type="text"
                              required
                              value={platformForm.name}
                              onChange={(event) => setPlatformForm((current) => ({ ...current, name: event.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                              placeholder="e.g., Booking.com"
                            />
                          </div>
                          <div>
                            <label htmlFor="platform-category" className="mb-1 block text-sm font-medium text-slate-700">Category / Group</label>
                            {!isNewCategory && existingCategories.length > 0 ? (
                              <select
                                id="platform-category"
                                required
                                value={platformForm.category}
                                onChange={(event) => {
                                  if (event.target.value === 'NEW_CATEGORY') {
                                    setIsNewCategory(true);
                                    setPlatformForm((current) => ({ ...current, category: '' }));
                                  } else {
                                    setPlatformForm((current) => ({ ...current, category: event.target.value }));
                                  }
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                              >
                                <option value="" disabled>Select a category...</option>
                                {existingCategories.map((category) => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                                <option value="NEW_CATEGORY" className="font-bold text-amber-600">+ Add new category...</option>
                              </select>
                            ) : (
                              <div className="relative">
                                <input
                                  id="platform-category"
                                  type="text"
                                  required
                                  value={platformForm.category}
                                  onChange={(event) => setPlatformForm((current) => ({ ...current, category: event.target.value }))}
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-20 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                                  placeholder="Type new category..."
                                  autoFocus
                                />
                                {existingCategories.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsNewCategory(false);
                                      setPlatformForm((current) => ({ ...current, category: existingCategories[0] }));
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <label htmlFor="platform-url" className="mb-1 block text-sm font-medium text-slate-700">URL</label>
                            <input
                              id="platform-url"
                              type="text"
                              required
                              value={platformForm.url}
                              onChange={(event) => setPlatformForm((current) => ({ ...current, url: event.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                              placeholder="booking.com"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setIsPlatformModalOpen(false)}
                              disabled={isSavingPlatform}
                              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingPlatform}
                              className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
                            >
                              {isSavingPlatform ? 'Saving...' : 'Save Platform'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
    </div>
  );
}
