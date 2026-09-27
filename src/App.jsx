import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Bell, Menu, Globe, X, Sun, Moon } from 'lucide-react';
import './index.css';
import airvoyLogo from './assets/airvoy.jpeg';
import { deliverPushNotification, notificationChannels } from './lib/notifications';
import Sidebar from './components/layout/Sidebar';
import Bank from './pages/Bank';
import BankEntriesLedger from './pages/BankEntriesLedger';
import BookingDetail from './pages/BookingDetail';
import InternalTransfer from './pages/InternalTransfer';
import Bookings from './pages/Bookings';
import CashFlowReport from './pages/CashFlowReport';
import ClientDetail from './pages/ClientDetail';
import Clients from './pages/Clients';
import DashboardHome from './pages/DashboardHome';
import FinancialAccountDetail from './pages/FinancialAccountDetail';
import InvoiceDetail from './pages/InvoiceDetail';
import Invoices from './pages/Invoices';
import Login from './pages/Login';
import Marketing from './pages/Marketing';
import MiscellaneousPayment from './pages/MiscellaneousPayment';
import NewFinancialAccount from './pages/NewFinancialAccount';
import PackageDetail from './pages/PackageDetail';
import Packages from './pages/Packages';
import RoleDashboard from './pages/RoleDashboard';
import Services from './pages/Services';
import ServiceTypes from './pages/ServiceTypes';
import AgencySettings from './pages/AgencySettings';
import SupplierDetail from './pages/SupplierDetail';
import Suppliers from './pages/Suppliers';
import TaskDetail from './pages/TaskDetail';
import Tasks from './pages/Tasks';
import TreasuryReconciliation from './pages/TreasuryReconciliation';
import { supabase } from './lib/supabase';

const labels = {
  en: {
    dashboard: 'Dashboard',
    clients: 'Clients',
    bookings: 'Bookings',
    packages: 'Packages',
    invoices: 'Invoices',
    suppliers: 'Suppliers',
    tasks: 'Tasks',
    marketing: 'Marketing Tasks',
    services: 'Visa Workflow',
    serviceTypes: 'Service Types',
    settings: 'Settings',
    employees: 'Employees',
    bank: 'Bank',
    cashFlow: 'Cash Flow',
    reconciliation: 'Reconciliation',
    profileLabel: 'Oussama M.',
    switchToArabic: 'عربي',
    switchToEnglish: 'EN',
    overview: 'Overview',
    revenue: 'Revenue',
    quickActions: 'Quick actions',
    newClient: 'New Client',
    newBooking: 'New Booking',
    newPackage: 'New Package',
  },
  ar: {
    dashboard: 'لوحة القيادة',
    clients: 'العملاء',
    bookings: 'الحجوزات',
    packages: 'الباقات',
    invoices: 'الفواتير',
    suppliers: 'الموردون',
    tasks: 'المهام',
    marketing: 'مهام التسويق',
    services: 'سير العمل - التأشيرة',
    serviceTypes: 'أنواع الخدمات',
    settings: 'الإعدادات',
    employees: 'الموظفين',
    bank: 'البنك',
    cashFlow: 'التدفق النقدي',
    reconciliation: 'المطابقة',
    profileLabel: 'عثمان م.',
    switchToArabic: 'عربي',
    switchToEnglish: 'EN',
    overview: 'نظرة عامة',
    revenue: 'الإيرادات',
    quickActions: 'إجراءات سريعة',
    newClient: 'عميل جديد',
    newBooking: 'حجز جديد',
    newPackage: 'باقة جديدة',
  },
};

function ToastNotification({ item, handleDismiss, language, isDarkMode }) {
  useEffect(() => {
    if (!item?.id) return undefined;

    const timer = window.setTimeout(() => {
      handleDismiss(item.id);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [item?.id, handleDismiss]);

  return (
    <div
      className={`pointer-events-auto relative rounded-2xl border p-4 shadow-xl backdrop-blur-sm ${
        item.type === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : item.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-slate-200 bg-white text-slate-800'
      } ${isDarkMode ? 'shadow-slate-900/50' : ''}`}
    >
      <button
        type="button"
        onClick={() => handleDismiss(item.id)}
        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
        aria-label={language === 'en' ? 'Dismiss notification' : 'إغلاق الإشعار'}
      >
        ✕
      </button>
      <p className="pr-6 text-xs font-bold uppercase tracking-[0.18em] opacity-75">{item.title}</p>
      <p className="mt-2 pr-6 text-sm leading-6">{item.message}</p>
    </div>
  );
}

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem('airvoy-language') || 'en';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('airvoy-theme') === 'dark';
  });
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationFilter, setNotificationFilter] = useState('all');
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const matchesScope =
        notificationFilter === 'all' ||
        (notificationFilter === 'unread' && !notification.is_read) ||
        (notificationFilter === 'read' && notification.is_read);

      const matchesChannel =
        notificationFilter === 'all' ||
        notificationFilter === 'unread' ||
        notificationFilter === 'read' ||
        notification.channel === notificationFilter;

      return matchesScope && matchesChannel;
    });
  }, [notifications, notificationFilter]);

  const markNotificationRead = async (notificationId) => {
    if (!supabase || !session?.user?.id) {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
      return;
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', session.user.id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
    }
  };

  const handleDismiss = async (notificationId) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));

    if (!supabase || !session?.user?.id) {
      return;
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Failed to dismiss notification:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));

    if (!supabase || !session?.user?.id) {
      return;
    }

    await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', session.user.id);
  };

  const resolveNotificationRoute = (notification = {}) => {
    if (notification.route) return notification.route;

    const text = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
    if (/booking/.test(text)) return '/bookings';
    if (/invoice/.test(text)) return '/invoices';
    if (/client/.test(text)) return '/clients';
    if (/supplier/.test(text)) return '/suppliers';
    if (/bank|payment|cash|ledger/.test(text)) return '/bank';
    if (/service|visa|workflow/.test(text)) return '/services';
    if (/commission/.test(text)) return '/settings/commission';
    if (/team|employee|role/.test(text)) return '/role-dashboard';

    return '/';
  };

  const addNotification = async (notification) => {
    const channel = notification.channel || 'push';
    const title = notification.title || 'System update';
    const message = notification.message || 'An update is available.';
    const route = notification.route || resolveNotificationRoute(notification);
    const nextNotification = {
      id: notification.id || `${Date.now()}-${Math.random()}`,
      user_id: session?.user?.id || null,
      title,
      message,
      channel,
      route,
      is_read: false,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    setNotifications((prev) => [nextNotification, ...prev].slice(0, 12));

    if (supabase && session?.user?.id) {
      const { data, error } = await supabase
        .from('notifications')
        .insert([
          {
            user_id: session.user.id,
            title,
            message,
            channel,
            route,
            type: notification.type || 'info',
            is_read: false,
          },
        ])
        .select()
        .single();

      if (!error && data) {
        setNotifications((prev) =>
          prev.map((item) => (item.id === nextNotification.id ? { ...data, id: data.id } : item))
        );
      }
    }

    try {
      await deliverPushNotification({ channel, title, message });
    } catch (error) {
      // Ignore delivery failures and keep local in-app output.
    }
  };

  const handleNotificationClick = async (item) => {
    if (item?.route) {
      await markNotificationRead(item.id);
      setShowNotificationCenter(false);
      window.location.assign(item.route);
      return;
    }

    await markNotificationRead(item.id);
    setShowNotificationCenter(false);
  };

  const localizeNotification = (item) => {
    if (!item) return item;

    const titleKey = String(item.title || '').trim().toLowerCase();
    const titleMap = {
      'booking saved': language === 'ar' ? 'تم حفظ الحجز' : 'Booking saved',
      'client created': language === 'ar' ? 'تم إنشاء العميل' : 'Client created',
      'supplier created': language === 'ar' ? 'تم إنشاء المورد' : 'Supplier created',
      'package created': language === 'ar' ? 'تم إنشاء الباقة' : 'Package created',
    };

    const messageMap = {
      'booking saved': language === 'ar' ? 'تم حفظ الحجز بنجاح.' : 'Booking saved successfully.',
      'client created': language === 'ar' ? 'تم إنشاء العميل بنجاح.' : 'Client created successfully.',
      'supplier created': language === 'ar' ? 'تم إنشاء المورد بنجاح.' : 'Supplier created successfully.',
      'package created': language === 'ar' ? 'تم إنشاء الباقة بنجاح.' : 'Package created successfully.',
    };

    return {
      ...item,
      title: titleMap[titleKey] || item.title || (language === 'ar' ? 'تحديث النظام' : 'System update'),
      message: messageMap[titleKey] || item.message || (language === 'ar' ? 'تحديث متاح.' : 'An update is available.'),
    };
  };

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const initializeSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setAuthReady(true);
    };

    initializeSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed successfully');
      }

      if (event === 'SIGNED_OUT') {
        setSession(null);
      }

      setSession(newSession || null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!supabase || !session?.user?.id) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!error) {
        setNotifications(data || []);
      }
    };

    loadNotifications();
  }, [session]);

  const isRTL = language === 'ar';
  const ui = useMemo(() => labels[language], [language]);

  useEffect(() => {
    localStorage.setItem('airvoy-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('airvoy-language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">Loading...</div>;
  }

  if (!session) {
    return <Login language={language} setLanguage={setLanguage} />;
  }

  return (
    <Router>
      <div
        data-theme={isDarkMode ? 'dark' : 'light'}
        className={`flex h-screen overflow-hidden font-sans ${isDarkMode ? 'bg-[#0a1120] text-slate-50' : 'bg-brand-surface text-brand-navy'}`}
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
      >
        <Sidebar isOpen={isSidebarOpen} language={language} ui={ui} isDarkMode={isDarkMode} />

        <div className="flex flex-1 flex-col">
          <header className={`flex h-16 items-center justify-between border-b px-6 shadow-sm ${isDarkMode ? 'border-slate-700 bg-[#0f172a] text-slate-100' : 'border-gray-200 bg-brand-card text-brand-navy'}`}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`${isDarkMode ? 'text-slate-100 hover:text-brand-gold' : 'text-brand-navy hover:text-brand-gold'} transition-colors`}
              aria-label={language === 'en' ? 'Toggle sidebar' : 'تبديل الشريط الجانبي'}
            >
              <Menu size={24} />
            </button>

            <div className="flex items-center gap-6">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotificationCenter((prev) => !prev)}
                  className={`relative flex items-center justify-center rounded-md border p-2 ${isDarkMode ? 'border-slate-600 bg-[#111827] text-slate-100 hover:border-brand-gold' : 'border-slate-200 bg-white text-brand-navy hover:border-brand-gold'}`}
                  aria-label={language === 'en' ? 'Open notifications' : 'فتح الإشعارات'}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-brand-navy">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotificationCenter && (
                  <div className={`absolute right-0 top-12 z-50 w-[380px] rounded-2xl border p-4 shadow-2xl ${isDarkMode ? 'border-slate-700 bg-[#111827] text-slate-100' : 'border-slate-200 bg-white text-brand-navy'}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                          {language === 'en' ? 'Notification center' : 'مركز الإشعارات'}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-brand-navy">
                          {language === 'en' ? `Alerts (${unreadCount} unread)` : `التنبيهات (${unreadCount} غير مقروءة)`}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowNotificationCenter(false)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-navy"
                        aria-label={language === 'en' ? 'Close notification center' : 'إغلاق مركز الإشعارات'}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      {['all', 'unread', 'read'].map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setNotificationFilter(filter)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                            notificationFilter === filter
                              ? 'bg-brand-navy text-white'
                              : 'border border-slate-200 bg-brand-surface text-brand-navy'
                          }`}
                        >
                          {filter === 'all' ? (language === 'en' ? 'All' : 'الكل') : filter === 'unread' ? (language === 'en' ? 'Unread' : 'غير المقروءة') : language === 'en' ? 'Read' : 'المقروءة'}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      {filteredNotifications.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                          {language === 'en' ? 'No notifications yet.' : 'لا توجد إشعارات حتى الآن.'}
                        </div>
                      ) : (
                        filteredNotifications.map((item) => {
                          const localizedItem = localizeNotification(item);

                          return (
                            <div key={item.id} className="relative">
                              <button
                                type="button"
                                onClick={() => handleNotificationClick(item)}
                                className={`block w-full rounded-xl border p-3 pr-9 text-left transition ${
                                  item.is_read ? 'border-slate-200 bg-brand-surface' : 'border-brand-gold/40 bg-amber-50'
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-gold">{localizedItem.title}</p>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${notificationChannels[item.channel || 'system']?.tone || 'bg-slate-100 text-slate-700'}`}>
                                    {notificationChannels[item.channel || 'system']?.label || (language === 'en' ? 'System' : 'النظام')}
                                  </span>
                                </div>
                                <p className="text-sm leading-6 text-slate-700">{localizedItem.message}</p>
                                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                                  <span>
                                    {new Date(item.created_at || item.createdAt).toLocaleString(language === 'ar' ? 'ar-DZ' : 'en-GB', {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })}
                                  </span>
                                  {!item.is_read && (
                                    <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-navy">
                                      {language === 'en' ? 'New' : 'جديد'}
                                    </span>
                                  )}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDismiss(item.id)}
                                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                aria-label={language === 'en' ? 'Dismiss notification' : 'إغلاق الإشعار'}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-bold transition-colors hover:text-brand-gold ${isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-gray-100 text-brand-navy'}`}
              >
                <Globe size={18} />
                {language === 'en' ? ui.switchToArabic : ui.switchToEnglish}
              </button>

              <button
                type="button"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${isDarkMode ? 'border-slate-600 bg-[#111827] text-brand-gold hover:border-brand-gold hover:text-brand-gold' : 'border-slate-200 bg-white text-brand-navy hover:border-brand-gold hover:text-brand-gold'}`}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                }}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${isDarkMode ? 'border-slate-600 bg-[#111827] text-slate-100 hover:border-brand-gold' : 'border-slate-200 bg-white text-brand-navy hover:border-brand-gold'}`}
              >
                {language === 'en' ? 'Logout' : 'تسجيل الخروج'}
              </button>

              <div className="flex items-center gap-3">
                <span className="font-sans font-medium text-brand-navy">{ui.profileLabel}</span>
                <img
                  src={airvoyLogo}
                  alt="Airvoy brand"
                  className="h-10 w-10 rounded-full border-2 border-brand-gold object-cover"
                />
              </div>
            </div>
          </header>

          <main className={`flex-1 overflow-y-auto p-8 transition-colors ${isDarkMode ? 'bg-[#0a1120]' : 'bg-brand-surface'}`}>
            <div className="pointer-events-none fixed right-4 top-20 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
              {notifications.slice(0, 3).map((item) => (
                <ToastNotification
                  key={item.id}
                  item={item}
                  handleDismiss={handleDismiss}
                  language={language}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>

            <Routes>
              <Route path="/" element={<DashboardHome language={language} ui={ui} />} />
              <Route path="/login" element={<Login language={language} setLanguage={setLanguage} />} />
              <Route path="/clients" element={<Clients language={language} ui={ui} />} />
              <Route path="/clients/:clientId" element={<ClientDetail />} />
              <Route path="/bookings" element={<Bookings language={language} ui={ui} onNotification={addNotification} />} />
              <Route path="/bookings/:bookingId" element={<BookingDetail />} />
              <Route path="/packages" element={<Packages language={language} ui={ui} />} />
              <Route path="/packages/:packageId" element={<PackageDetail />} />
              <Route path="/invoices" element={<Invoices language={language} ui={ui} />} />
              <Route path="/invoices/:invoiceId" element={<InvoiceDetail />} />
              <Route path="/suppliers" element={<Suppliers language={language} ui={ui} />} />
              <Route path="/suppliers/:supplierId" element={<SupplierDetail />} />
              <Route path="/tasks" element={<Tasks language={language} ui={ui} />} />
              <Route path="/tasks/:taskId" element={<TaskDetail />} />
              <Route path="/marketing" element={<Marketing language={language} ui={ui} />} />
              <Route path="/services" element={<Services language={language} ui={ui} />} />
              <Route path="/service-types" element={<ServiceTypes language={language} ui={ui} />} />
              <Route path="/settings" element={<Navigate to="/settings/agency" replace />} />
              <Route path="/settings/agency" element={<AgencySettings language={language} ui={ui} activeSection="agency" />} />
              <Route path="/settings/bank" element={<AgencySettings language={language} ui={ui} activeSection="bank" />} />
              <Route path="/settings/package-types" element={<AgencySettings language={language} ui={ui} activeSection="package" />} />
              <Route path="/settings/commission" element={<AgencySettings language={language} ui={ui} activeSection="commission" />} />
              <Route path="/settings/commission-payouts" element={<AgencySettings language={language} ui={ui} activeSection="commission_payouts" />} />
              <Route path="/settings/team" element={<AgencySettings language={language} ui={ui} activeSection="team" />} />
              <Route path="/role-dashboard" element={<RoleDashboard language={language} ui={ui} />} />
              <Route path="/bank" element={<Bank language={language} ui={ui} />} />
              <Route path="/bank/new-account" element={<NewFinancialAccount language={language} />} />
              <Route path="/bank/entries" element={<BankEntriesLedger language={language} />} />
              <Route path="/bank/internal-transfer" element={<InternalTransfer language={language} />} />
              <Route path="/bank/miscellaneous-payment" element={<MiscellaneousPayment language={language} />} />
              <Route path="/bank/accounts/:accountId" element={<FinancialAccountDetail language={language} />} />
              <Route path="/cash-flow" element={<CashFlowReport language={language} ui={ui} />} />
              <Route path="/reconciliation" element={<TreasuryReconciliation language={language} ui={ui} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;