import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Briefcase,
  Box,
  FileText,
  Truck,
  CheckSquare,
  Layers,
  Tags,
  Building2,
  Megaphone,
  BarChart3,
  Settings,
  Percent,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowLeftRight,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Sidebar({ isOpen, ui, isDarkMode, language = 'en', agency, userProfile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [bankGroupOpen, setBankGroupOpen] = useState(false);
  const [settingsGroupOpen, setSettingsGroupOpen] = useState(false);

  const translations = {
    en: {
      operations: 'OPERATIONS',
      finance: 'FINANCE',
      network: 'NETWORK',
      workflow: 'WORKFLOW',
      admin: 'ADMIN',
      dashboard: 'Dashboard',
      clients: 'Clients',
      bookings: 'Bookings',
      packages: 'Packages',
      invoices: 'Invoices',
      suppliers: 'Suppliers',
      serviceTypes: 'Service Types',
      tasks: 'Tasks',
      marketing: 'Marketing Tasks',
      services: 'Visa Workflow',
      employees: 'Employees',
      settings: 'Settings',
      bankDashboard: 'Bank Dashboard',
      newAccount: 'New Account',
      bankEntries: 'Bank Entries',
      internalTransfer: 'Internal Transfer',
      miscellaneousPayment: 'Misc. Payment',
      agencyDetails: 'Agency Details',
      bankDetails: 'Bank Details',
      packageTypeDefaults: 'Package Type Defaults',
      commissionRules: 'Commission Rules',
      commissionPayouts: 'Commission Payouts',
      teamAccess: 'Team & Access',
    },
    ar: {
      operations: 'العمليات',
      finance: 'المالية',
      network: 'الشبكة',
      workflow: 'سير العمل',
      admin: 'الإدارة',
      dashboard: 'لوحة القيادة',
      clients: 'العملاء',
      bookings: 'الحجوزات',
      packages: 'الباقات',
      invoices: 'الفواتير',
      suppliers: 'الموردون',
      serviceTypes: 'أنواع الخدمات',
      tasks: 'المهام',
      marketing: 'مهام التسويق',
      services: 'سير عمل التأشيرة',
      employees: 'الموظفون',
      settings: 'الإعدادات',
      bankDashboard: 'لوحة البنك',
      newAccount: 'حساب جديد',
      bankEntries: 'إدخالات البنك',
      internalTransfer: 'تحويل داخلي',
      miscellaneousPayment: 'دفعة متنوعة',
      agencyDetails: 'تفاصيل الوكالة',
      bankDetails: 'تفاصيل البنك',
      packageTypeDefaults: 'القيم الافتراضية لأنواع الباقات',
      commissionRules: 'قواعد العمولة',
      commissionPayouts: 'مدفوعات العمولة',
      teamAccess: 'الفريق والصلاحيات',
    },
  };

  const t = translations[language] || translations.en;

  const isAdmin = userProfile?.role === 'super_admin';
  const permissions = userProfile?.permissions || {};
  const canViewModule = (moduleId) => isAdmin || Boolean(permissions[moduleId]);

  const topSections = [
    {
      id: 'operations',
      label: t.operations,
      items: [
        { key: 'dashboard', icon: Home, path: '/', permission: 'dashboard' },
        { key: 'clients', icon: Users, path: '/clients', permission: 'clients' },
        { key: 'bookings', icon: Briefcase, path: '/bookings', permission: 'clients' },
        { key: 'packages', icon: Box, path: '/packages', permission: 'packages' },
      ],
    },
    {
      id: 'finance',
      label: t.finance,
      items: [
        { key: 'invoices', icon: FileText, path: '/invoices', permission: 'finance' },
      ],
      custom: true,
    },
    {
      id: 'network',
      label: t.network,
      items: [
        { key: 'suppliers', icon: Truck, path: '/suppliers', permission: 'finance' },
        { key: 'serviceTypes', icon: Tags, path: '/service-types', permission: 'packages' },
      ],
    },
    {
      id: 'workflow',
      label: t.workflow,
      items: [
        { key: 'services', icon: Layers, path: '/services', permission: 'workflow' },
        { key: 'taskManager', icon: Briefcase, path: '/task-manager', label: 'Task Manager', permission: 'workflow' },
        { key: 'marketing', icon: Megaphone, path: '/marketing', permission: 'workflow' },
      ],
    },
    {
      id: 'admin',
      label: t.admin,
      items: [
        { key: 'employees', icon: Users, path: '/role-dashboard', permission: 'settings' },
      ],
    },
  ];

  const settingsItems = [
    { key: 'agencySettings', icon: Settings, label: t.agencyDetails, path: '/settings/agency' },
    { key: 'bankSettings', icon: Building2, label: t.bankDetails, path: '/settings/bank' },
    { key: 'packageTypeSettings', icon: Tags, label: t.packageTypeDefaults, path: '/settings/package-types' },
    { key: 'commissionSettings', icon: Percent, label: t.commissionRules, path: '/settings/commission' },
    { key: 'commissionPayoutSettings', icon: BarChart3, label: t.commissionPayouts, path: '/settings/commission-payouts' },
    { key: 'teamSettings', icon: Users, label: t.teamAccess, path: '/settings/team' },
  ];

  const bankItems = [
    { key: 'bank', icon: Building2, label: t.bankDashboard, path: '/bank' },
    { key: 'newAccount', icon: Plus, label: t.newAccount, path: '/bank/new-account' },
    { key: 'bankEntries', icon: BarChart3, label: t.bankEntries, path: '/bank/entries' },
    { key: 'internalTransfer', icon: ArrowLeftRight, label: t.internalTransfer, path: '/bank/internal-transfer' },
    { key: 'miscellaneousPayment', icon: Plus, label: t.miscellaneousPayment, path: '/bank/miscellaneous-payment' },
  ];

  useEffect(() => {
    const activeBankRoute = ['/bank', '/bank/new-account', '/bank/entries', '/bank/internal-transfer', '/bank/miscellaneous-payment'].includes(location.pathname);
    setBankGroupOpen((prev) => (activeBankRoute ? true : prev));

    const activeSettingsRoute = ['/settings', '/settings/agency', '/settings/bank', '/settings/package-types', '/settings/commission', '/settings/commission-payouts', '/settings/team'].includes(location.pathname);
    setSettingsGroupOpen((prev) => (activeSettingsRoute ? true : prev));
  }, [location.pathname]);

  const handleBankParentClick = () => {
    const nextState = !bankGroupOpen;
    setBankGroupOpen(nextState);
    navigate('/bank');
  };

  const handleSettingsParentClick = () => {
    const nextState = !settingsGroupOpen;
    setSettingsGroupOpen(nextState);
    navigate('/settings/agency');
  };

  return (
    <aside className={`${isOpen ? 'w-72' : 'w-20'} flex h-screen shrink-0 flex-col overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-[#0a1120] text-brand-surface' : 'bg-brand-navy text-brand-surface'}`}>
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
            <div className={`flex min-w-0 items-center justify-center transition-all ${isOpen ? 'gap-3 px-3' : 'gap-0'}`}>
              {agency?.logo_url ? (
                <img
                  src={agency.logo_url}
                  alt={`${agency.agency_name || 'Agency'} logo`}
                  className={`${isOpen ? 'h-10 w-10' : 'h-8 w-8'} shrink-0 rounded-md object-contain`}
                />
              ) : (
                <div className={`${isOpen ? 'h-10 w-10' : 'h-8 w-8'} flex shrink-0 items-center justify-center rounded-md bg-slate-800 font-bold text-amber-500`}>
                  {(agency?.agency_name || 'AIRVOY').charAt(0).toUpperCase()}
                </div>
              )}
          {isOpen && (
                <h1 className="truncate font-serif text-xl font-bold text-brand-gold">
                  {agency?.agency_name || 'AIRVOY'}
            </h1>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-hidden py-2">
        <div className="h-full space-y-2 overflow-y-auto px-2.5 pb-24 scrollbar-hide">
          {topSections.map((section) => {
            const visibleItems = section.items.filter((item) => canViewModule(item.permission));
            const showCustom = section.custom && canViewModule('finance');
            if (visibleItems.length === 0 && !showCustom) return null;

            return (
            <div key={section.id}>
              {section.label && (
                <div className="mt-3 mb-1 border-t border-white/10 pt-2 first:mt-0 first:border-t-0 first:pt-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-gold/70">{section.label}</p>
                </div>
              )}

              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  const label = item.label || ui?.[item.key] || item.key;

                  return (
                    <li key={item.key}>
                      <Link
                        to={item.path}
                        className={`flex items-center rounded-lg px-3 py-1.5 transition-colors ${
                          isActive ? 'bg-brand-gold font-semibold text-brand-navy' : isDarkMode ? 'text-slate-200 hover:bg-slate-800 hover:text-brand-gold' : 'text-slate-200 hover:bg-gray-800 hover:text-brand-gold'
                        }`}
                      >
                        <Icon size={17} className="shrink-0" />
                        {isOpen && <span className="ms-2.5 font-sans text-[12px]">{label}</span>}
                      </Link>
                    </li>
                  );
                })}

                {showCustom && (
                  <li>
                    <button
                      type="button"
                      onClick={handleBankParentClick}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors ${
                        ['/bank', '/cash-flow', '/reconciliation', '/bank/new-account'].includes(location.pathname)
                          ? 'bg-brand-gold font-semibold text-brand-navy'
                          : isDarkMode ? 'text-slate-200 hover:bg-slate-800 hover:text-brand-gold' : 'text-slate-200 hover:bg-gray-800 hover:text-brand-gold'
                      }`}
                    >
                      <span className="flex items-center">
                        <Building2 size={17} className="shrink-0" />
                        {isOpen && <span className="ms-2.5 font-sans text-[12px]">{ui?.bank || t.bankDashboard}</span>}
                      </span>

                      {isOpen && (
                        <span className="flex items-center text-brand-navy/80">
                          {bankGroupOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      )}
                    </button>

                    {bankGroupOpen && isOpen && (
                      <ul className="mt-1.5 space-y-1 border-l border-brand-gold/60 pl-3">
                        {bankItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.path;
                          const label = item.label || ui?.[item.key] || item.key;

                          return (
                            <li key={item.key}>
                              <Link
                                to={item.path}
                                onClick={() => setBankGroupOpen(true)}
                                className={`flex items-center rounded-r-md border-l px-3 py-1.5 text-[11px] transition-colors ${
                                  isActive
                                    ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                                    : isDarkMode
                                      ? 'border-transparent text-slate-300 hover:border-brand-gold/60 hover:text-brand-gold'
                                      : 'border-transparent text-slate-200 hover:border-brand-gold/60 hover:text-brand-gold'
                                }`}
                              >
                                <Icon size={14} className="shrink-0" />
                                <span className="ms-2.5 font-sans">{label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                )}

                {section.id === 'admin' && canViewModule('settings') && (
                  <li>
                    <button
                      type="button"
                      onClick={handleSettingsParentClick}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors ${
                        ['/settings', '/settings/agency', '/settings/bank', '/settings/package-types', '/settings/commission', '/settings/commission-payouts', '/settings/team'].includes(location.pathname)
                          ? 'bg-brand-gold font-semibold text-brand-navy'
                          : isDarkMode ? 'text-slate-200 hover:bg-slate-800 hover:text-brand-gold' : 'text-slate-200 hover:bg-gray-800 hover:text-brand-gold'
                      }`}
                    >
                      <span className="flex items-center">
                        <Settings size={17} className="shrink-0" />
                        {isOpen && <span className="ms-2.5 font-sans text-[12px]">{ui?.settings || t.settings}</span>}
                      </span>

                      {isOpen && (
                        <span className="flex items-center text-brand-navy/80">
                          {settingsGroupOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      )}
                    </button>

                    {settingsGroupOpen && isOpen && (
                      <ul className="mt-1.5 space-y-1 border-l border-brand-gold/60 pl-3">
                        {settingsItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.path;

                          return (
                            <li key={item.key}>
                              <Link
                                to={item.path}
                                onClick={() => setSettingsGroupOpen(true)}
                                className={`flex items-center rounded-r-md border-l px-3 py-1.5 text-[11px] transition-colors ${
                                  isActive
                                    ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                                    : isDarkMode
                                      ? 'border-transparent text-slate-300 hover:border-brand-gold/60 hover:text-brand-gold'
                                      : 'border-transparent text-slate-200 hover:border-brand-gold/60 hover:text-brand-gold'
                                }`}
                              >
                                <Icon size={14} className="shrink-0" />
                                <span className="ms-2.5 font-sans">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}