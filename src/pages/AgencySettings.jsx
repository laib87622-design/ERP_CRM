import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAgencySettings, saveAgencySettings, defaultAgencySettings, slugifyCommissionTypeKey } from '../lib/agencySettings';

const fieldGroups = {
  en: {
    title: 'Agency settings',
    subtitle: 'Brand and banking details used on invoices and printed documents.',
    save: 'Save settings',
    warning: 'Only super admins can edit this section.',
    basic: 'Agency details',
    bank: 'Bank details',
    teamTitle: 'Team & Access / الفريق والصلاحيات',
    inviteTitle: 'Invite Agent',
    fullName: 'Full Name',
    email: 'Email',
    role: 'Role',
    sendInvite: 'Send Invite',
    successInvite: 'Invitation sent! (coming soon)',
    comingSoon: 'coming soon',
    readOnly: 'Read-only view',
    fullAccess: 'Super Admin — Full access',
    salesAgent: 'Sales Agent — Bookings & clients',
    cashier: 'Cashier — Finance & payments',
    viewer: 'Viewer — Read only',
    members: 'Team members',
    joined: 'Joined date',
    action: 'Actions',
    remove: 'Remove',
    changeRole: 'Change Role',
  },
  ar: {
    title: 'إعدادات الوكالة',
    subtitle: 'تفاصيل العلامة التجارية والمعلومات البنكية المستخدمة في الفواتير والمستندات المطبوعة.',
    save: 'حفظ الإعدادات',
    warning: 'فقط المشرفون الكبار يمكنهم تعديل هذه الصفحة.',
    basic: 'تفاصيل الوكالة',
    bank: 'تفاصيل البنك',
    teamTitle: 'الفريق والصلاحيات / Team & Access',
    inviteTitle: 'دعوة عامل',
    fullName: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    role: 'الدور',
    sendInvite: 'إرسال الدعوة',
    successInvite: 'تم إرسال الدعوة! (قريباً)',
    comingSoon: 'قريباً',
    readOnly: 'عرض للقراءة فقط',
    fullAccess: 'مشرف عام — صلاحيات كاملة',
    salesAgent: 'وكيل مبيعات — الحجوزات والعملاء',
    cashier: 'أمين صندوق — الشؤون المالية والدفع',
    viewer: 'عارض — قراءة فقط',
    members: 'أعضاء الفريق',
    joined: 'تاريخ الانضمام',
    action: 'الإجراءات',
    remove: 'حذف',
    changeRole: 'تغيير الدور',
  },
};

const fields = [
  { name: 'agency_name', label: 'Agency name', group: 'basic' },
  { name: 'logo_url', label: 'Logo URL', group: 'basic' },
  { name: 'address', label: 'Address', group: 'basic' },
  { name: 'city', label: 'City', group: 'basic' },
  { name: 'wilaya', label: 'Wilaya', group: 'basic' },
  { name: 'rc_number', label: 'RC', group: 'basic' },
  { name: 'nif', label: 'NIF', group: 'basic' },
  { name: 'nis', label: 'NIS', group: 'basic' },
  { name: 'ai', label: 'AI', group: 'basic' },
  { name: 'phone', label: 'Phone', group: 'basic' },
  { name: 'fax', label: 'Fax', group: 'basic' },
  { name: 'email', label: 'Email', group: 'basic' },
  { name: 'bank_name', label: 'Bank name', group: 'bank' },
  { name: 'bank_account', label: 'Bank account', group: 'bank' },
  { name: 'iban', label: 'IBAN', group: 'bank' },
];

const packageTypeDescriptionFields = [
  { key: 'trip', label: 'Trip package' },
  { key: 'hajj', label: 'Hajj package' },
  { key: 'omra', label: 'Omra package' },
  { key: 'ticket_promotion', label: 'Ticket promotion' },
  { key: 'hotel_promotion', label: 'Hotel promotion' },
];

const commissionTypeFields = [
  { key: 'trip', label: 'Trip' },
  { key: 'hajj', label: 'Hajj' },
  { key: 'omra', label: 'Omra' },
  { key: 'ticket_promotion', label: 'Ticket Promotion' },
  { key: 'hotel_promotion', label: 'Hotel Promotion' },
];

const roleOptions = [
  { value: 'super_admin', label: 'Super Admin — Full access' },
  { value: 'sales_agent', label: 'Sales Agent — Bookings & clients' },
  { value: 'cashier', label: 'Cashier — Finance & payments' },
  { value: 'viewer', label: 'Viewer — Read only' },
];

const roleBadgeStyles = {
  super_admin: 'bg-brand-gold text-brand-navy',
  sales_agent: 'bg-blue-100 text-blue-700',
  cashier: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-slate-200 text-slate-700',
};

export default function AgencySettings({ language = 'en', activeSection = 'agency' }) {
  const t = fieldGroups[language] || fieldGroups.en;
  const localizedFieldLabels = {
    en: {
      agency_name: 'Agency name',
      logo_url: 'Logo URL',
      address: 'Address',
      city: 'City',
      wilaya: 'Wilaya',
      rc_number: 'RC',
      nif: 'NIF',
      nis: 'NIS',
      ai: 'AI',
      phone: 'Phone',
      fax: 'Fax',
      email: 'Email',
      bank_name: 'Bank name',
      bank_account: 'Bank account',
      iban: 'IBAN',
    },
    ar: {
      agency_name: 'اسم الوكالة',
      logo_url: 'رابط الشعار',
      address: 'العنوان',
      city: 'المدينة',
      wilaya: 'الولاية',
      rc_number: 'السجل التجاري',
      nif: 'NIF',
      nis: 'NIS',
      ai: 'AI',
      phone: 'الهاتف',
      fax: 'الفاكس',
      email: 'البريد الإلكتروني',
      bank_name: 'اسم البنك',
      bank_account: 'حساب البنك',
      iban: 'IBAN',
    },
  };
  const localizedCommissionLabels = {
    en: {
      packageDefaults: 'Package type defaults',
      packageRules: 'Package rules',
      serviceRules: 'Service type rules',
      filterPlaceholder: 'Filter service types...',
      payoutQueue: 'Commission payout queue',
      payNow: 'Pay now',
      searchPayouts: 'Search payouts...',
      all: 'All',
      paid: 'Paid',
      pending: 'Pending',
      cancelled: 'Cancelled',
      readyToWithdraw: 'Ready to Withdraw',
      pendingClient: 'Pending (Waiting on Client)',
      paidLabel: 'Paid',
      noMatches: 'No service types match your search.',
      noPayouts: 'No commission payouts match the current filter.',
      loadingPayouts: 'Loading commission payout records...',
      accountSelect: 'Select account',
      monthlySalary: 'Monthly Base Salary (DA)',
      sending: 'Sending...',
      loadingTeam: 'Loading team members...',
      roleUpdated: 'Role updated',
      salaryUpdated: 'Base salary updated',
      baseSalary: 'Base salary',
      pendingTitle: 'Pending (Waiting on Client)',
      readyTitle: 'Ready to Withdraw',
      paidTitle: 'Paid',
      noRole: '—',
    },
    ar: {
      packageDefaults: 'الإعدادات الافتراضية لأنواع الباقات',
      packageRules: 'قواعد الباقات',
      serviceRules: 'قواعد أنواع الخدمات',
      filterPlaceholder: 'تصفية أنواع الخدمات...',
      payoutQueue: 'طابور دفع العمولات',
      payNow: 'ادفع الآن',
      searchPayouts: 'بحث في الدفعات...',
      all: 'الكل',
      paid: 'مدفوعة',
      pending: 'قيد الانتظار',
      cancelled: 'ملغية',
      readyToWithdraw: 'جاهزة للسحب',
      pendingClient: 'قيد الانتظار (بانتظار العميل)',
      paidLabel: 'مدفوعة',
      noMatches: 'لا توجد أنواع خدمات تطابق البحث.',
      noPayouts: 'لا توجد دفعات عمولات تطابق الفلتر الحالي.',
      loadingPayouts: 'جارٍ تحميل سجلات دفعات العمولة...',
      accountSelect: 'اختر الحساب',
      monthlySalary: 'الراتب الأساسي الشهري (DA)',
      sending: 'جارٍ الإرسال...',
      loadingTeam: 'جارٍ تحميل أعضاء الفريق...',
      roleUpdated: 'تم تحديث الدور',
      salaryUpdated: 'تم تحديث الراتب الأساسي',
      baseSalary: 'الراتب الأساسي',
      pendingTitle: 'قيد الانتظار (بانتظار العميل)',
      readyTitle: 'جاهزة للسحب',
      paidTitle: 'مدفوعة',
      noRole: '—',
      enabled: 'مفعل',
      disabled: 'معطل',
      targetType: 'نوع الهدف',
      statusLabel: 'الحالة',
      formula: 'الصيغة',
      updated: 'آخر تحديث',
      mathPreview: 'معاينة الحساب',
      calculationType: 'نوع الحساب',
      fixedAmount: 'مبلغ ثابت',
      percentageOfProfit: 'نسبة من الربح',
      amount: 'المبلغ',
      profitPercent: 'نسبة الربح %',
      packageType: 'باقة',
      serviceType: 'نوع الخدمة',
      enabledToggle: 'مفعل',
      disabledToggle: 'معطل',
    },
    en: {
      packageDefaults: 'Package type defaults',
      packageRules: 'Package rules',
      serviceRules: 'Service type rules',
      filterPlaceholder: 'Filter service types...',
      payoutQueue: 'Commission payout queue',
      payNow: 'Pay now',
      searchPayouts: 'Search payouts...',
      all: 'All',
      paid: 'Paid',
      pending: 'Pending',
      cancelled: 'Cancelled',
      readyToWithdraw: 'Ready to Withdraw',
      pendingClient: 'Pending (Waiting on Client)',
      paidLabel: 'Paid',
      noMatches: 'No service types match your search.',
      noPayouts: 'No commission payouts match the current filter.',
      loadingPayouts: 'Loading commission payout records...',
      accountSelect: 'Select account',
      monthlySalary: 'Monthly Base Salary (DA)',
      sending: 'Sending...',
      loadingTeam: 'Loading team members...',
      roleUpdated: 'Role updated',
      salaryUpdated: 'Base salary updated',
      baseSalary: 'Base salary',
      pendingTitle: 'Pending (Waiting on Client)',
      readyTitle: 'Ready to Withdraw',
      paidTitle: 'Paid',
      noRole: '—',
      enabled: 'Enabled',
      disabled: 'Disabled',
      targetType: 'Target type',
      statusLabel: 'Status',
      formula: 'Formula',
      updated: 'Updated',
      mathPreview: 'Profit math preview',
      calculationType: 'Calculation type',
      fixedAmount: 'Fixed amount',
      percentageOfProfit: 'Percentage of profit',
      amount: 'Amount',
      profitPercent: 'Profit %',
      packageType: 'package',
      serviceType: 'service',
      enabledToggle: 'Enabled',
      disabledToggle: 'Disabled',
    },
  };
  const commissionText = localizedCommissionLabels[language] || localizedCommissionLabels.en;
  const section = activeSection || 'agency';
  const [settings, setSettings] = useState(defaultAgencySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState('viewer');
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [commissionSearch, setCommissionSearch] = useState('');
  const [commissionPayoutFilter, setCommissionPayoutFilter] = useState('all');
  const [commissionPayouts, setCommissionPayouts] = useState([]);
  const [commissionPayoutsLoading, setCommissionPayoutsLoading] = useState(false);
  const [commissionSummary, setCommissionSummary] = useState({ pending: 0, ready: 0, paid: 0 });
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [payoutAccountIds, setPayoutAccountIds] = useState({});
  const [expandedCommissionCards, setExpandedCommissionCards] = useState({});
  const [inviteForm, setInviteForm] = useState({
    full_name: '',
    email: '',
    role: 'sales_agent',
    base_salary: 0,
  });
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const userRole = await fetchCurrentRole();
        setRole(userRole);

        if (userRole !== 'super_admin') {
          setSettings(defaultAgencySettings);
          setLoading(false);
          return;
        }

        const data = await fetchAgencySettings();
        setSettings(data);
      } catch (err) {
        setError(err.message || 'Unable to load agency settings.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const fetchCurrentRole = async () => {
    if (!supabase) return 'viewer';

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) return 'viewer';

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError || !profile) return 'viewer';
    return profile.role || 'viewer';
  };

  const loadTeamMembers = async () => {
    if (!supabase) {
      setTeamMembers([]);
      setTeamLoading(false);
      return;
    }

    try {
      setTeamLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (err) {
      console.warn('Unable to fetch team members:', err);
      setTeamMembers([]);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      const userRole = await fetchCurrentRole();
      setRole(userRole);

      if (userRole === 'super_admin') {
        const data = await fetchAgencySettings();
        setSettings(data);
      }

      await loadTeamMembers();
      setLoading(false);
    };

    load();
  }, []);

  const canEdit = role === 'super_admin';
  const canManageTeam = role === 'super_admin';

  useEffect(() => {
    const loadServiceTypes = async () => {
      if (!supabase) {
        setServiceTypes([]);
        return;
      }

      const { data, error } = await supabase
        .from('service_types')
        .select('id, name, description')
        .order('name', { ascending: true });

      if (!error) {
        setServiceTypes(data || []);
      }
    };

    loadServiceTypes();
  }, []);

  useEffect(() => {
    const loadCommissionPayouts = async () => {
      if (!supabase || section !== 'commission_payouts') {
        return;
      }

      try {
        setCommissionPayoutsLoading(true);

        const [{ data: allCommissionData, error: allError }, { data: readyCommissionData, error: readyError }, { data: accountData, error: accountError }] = await Promise.all([
          supabase
            .from('agent_commissions')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('agent_commissions')
            .select('*')
            .eq('status', 'READY_TO_PAY')
            .order('created_at', { ascending: false }),
          supabase.from('financial_accounts').select('id, label, current_balance').order('label', { ascending: true })
        ]);

        if (accountError) throw accountError;

        const normalizedAgentRows = (allCommissionData || []).map((row) => ({
          ...row,
          target_type: row.target_type || 'agent',
          notes: row.notes || `Commission payout - ${row.agent_id || 'agent'}`,
        }));

        const normalizedReadyRows = (readyCommissionData || []).map((row) => ({
          ...row,
          target_type: row.target_type || 'agent',
          notes: row.notes || `Commission payout - ${row.agent_id || 'agent'}`,
        }));

        setCommissionPayouts(normalizedReadyRows.length > 0 ? normalizedReadyRows : normalizedAgentRows.filter((row) => row.status === 'READY_TO_PAY'));
        setCommissionSummary({
          pending: normalizedAgentRows.filter((row) => row.status === 'PENDING_PAYMENT').length,
          ready: normalizedReadyRows.length || normalizedAgentRows.filter((row) => row.status === 'READY_TO_PAY').length,
          paid: normalizedAgentRows.filter((row) => row.status === 'PAID').length,
        });
        setFinancialAccounts(accountData || []);
        setPayoutAccountIds((prev) => {
          const nextState = { ...prev };
          (accountData || []).forEach((account) => {
            if (!nextState[account.id]) {
              nextState[account.id] = account.id;
            }
          });
          return nextState;
        });
      } catch (err) {
        try {
          const [{ data: payoutData, error: payoutError }, { data: accountData, error: accountError }] = await Promise.all([
            supabase
              .from('commission_payments')
              .select('*')
              .order('created_at', { ascending: false }),
            supabase.from('financial_accounts').select('id, label, current_balance').order('label', { ascending: true })
          ]);

          if (payoutError) throw payoutError;
          if (accountError) throw accountError;

          setCommissionPayouts((payoutData || []).filter((row) => row.status === 'paid'));
          setCommissionSummary({
            pending: (payoutData || []).filter((row) => row.status === 'pending').length,
            ready: (payoutData || []).filter((row) => row.status === 'paid').length,
            paid: (payoutData || []).filter((row) => row.status === 'paid').length,
          });
          setFinancialAccounts(accountData || []);
        } catch (fallbackError) {
          console.warn('Unable to load commission payouts', fallbackError);
          setCommissionPayouts([]);
          setFinancialAccounts([]);
          setCommissionSummary({ pending: 0, ready: 0, paid: 0 });
        }
      } finally {
        setCommissionPayoutsLoading(false);
      }
    };

    loadCommissionPayouts();
  }, [section]);

  const packageCommissionRows = useMemo(() => {
    const packageKeys = ['trip', 'hajj', 'omra', 'ticket_promotion', 'hotel_promotion'];
    return packageKeys.map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      description: settings.package_type_descriptions?.[key] || 'Package commission rule',
    }));
  }, [settings.package_type_descriptions]);

  const serviceCommissionRows = useMemo(() => {
    const packageKeys = new Set(['trip', 'hajj', 'omra', 'ticket_promotion', 'hotel_promotion']);

    const rowsFromTypes = (serviceTypes || [])
      .map((type) => ({
        key: slugifyCommissionTypeKey(type.name),
        label: type.name,
        description: type.description || 'Service commission rule',
      }))
      .filter((row) => !packageKeys.has(row.key));

    const extraRows = Object.keys(settings.commission_rules || {})
      .filter((key) => !packageKeys.has(slugifyCommissionTypeKey(key)))
      .map((key) => ({
        key: slugifyCommissionTypeKey(key),
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        description: 'Custom commission rule',
      }));

    const merged = [...rowsFromTypes, ...extraRows];
    const unique = merged.filter((row, index, list) => list.findIndex((candidate) => candidate.key === row.key) === index);
    return unique.sort((a, b) => a.label.localeCompare(b.label));
  }, [serviceTypes, settings.commission_rules]);

  const filteredCommissionRows = useMemo(() => {
    const query = commissionSearch.trim().toLowerCase();
    if (!query) return serviceCommissionRows;
    return serviceCommissionRows.filter((row) => row.label.toLowerCase().includes(query) || row.key.toLowerCase().includes(query));
  }, [serviceCommissionRows, commissionSearch]);

  const filteredCommissionPayouts = useMemo(() => {
    const query = commissionSearch.trim().toLowerCase();
    return (commissionPayouts || []).filter((row) => {
      const matchesFilter =
        commissionPayoutFilter === 'all' ||
        (commissionPayoutFilter === 'paid' && row.status === 'paid') ||
        (commissionPayoutFilter === 'pending' && row.status === 'pending') ||
        (commissionPayoutFilter === 'cancelled' && row.status === 'cancelled');

      const matchesQuery =
        !query ||
        String(row.notes || '').toLowerCase().includes(query) ||
        String(row.target_type || '').toLowerCase().includes(query) ||
        String(row.amount || '').toLowerCase().includes(query);

      return matchesFilter && matchesQuery;
    });
  }, [commissionPayouts, commissionPayoutFilter, commissionSearch]);

  const commissionCardPalette = {
    trip: 'border-amber-200 bg-amber-50/70',
    hajj: 'border-violet-200 bg-violet-50/70',
    omra: 'border-emerald-200 bg-emerald-50/70',
    ticket_promotion: 'border-sky-200 bg-sky-50/70',
    hotel_promotion: 'border-pink-200 bg-pink-50/70',
  };

  const toggleCommissionCard = (key) => {
    setExpandedCommissionCards((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderCommissionCard = (field, index) => {
    const rule = settings.commission_rules?.[field.key] || { enabled: true, method: 'percentage', amount: 0, percentage: 0 };
    const expanded = Boolean(expandedCommissionCards[field.key]);
    const cardTone = commissionCardPalette[field.key] || 'border-slate-200 bg-slate-50/70';
    const methodLabel = rule.method === 'amount' ? 'Fixed amount' : 'Percentage of profit';
    const previewProfit = Number(rule.percentage || 0);
    const previewFormula = rule.method === 'amount'
      ? `${Number(rule.amount || 0).toFixed(2)} DA fixed`
      : `${previewProfit.toFixed(2)}% of profit`;
    const updatedAt = settings.updated_at || new Date().toISOString();

    return (
      <div key={`${field.key}-${index}`} className={`rounded-2xl border p-3 shadow-sm ${cardTone}`}>
        <button
          type="button"
          onClick={() => toggleCommissionCard(field.key)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-brand-navy">{field.label}</h4>
            {field.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{field.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-navy shadow-sm">
              {rule.enabled ? commissionText.enabled : commissionText.disabled}
            </span>
            <span className="text-sm text-brand-navy">{expanded ? '−' : '+'}</span>
          </div>
        </button>

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/60 bg-white/60 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{commissionText.targetType}</p>
                <p className="mt-1 text-xs font-semibold text-brand-navy">{rule.target_type || commissionText.packageType}</p>
              </div>

              <div className="rounded-xl border border-white/60 bg-white/60 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{commissionText.statusLabel}</p>
                <p className={`mt-1 text-xs font-semibold ${rule.enabled ? 'text-emerald-700' : 'text-red-700'}`}>
                  {rule.enabled ? commissionText.enabled : commissionText.disabled}
                </p>
              </div>

              <div className="rounded-xl border border-white/60 bg-white/60 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{commissionText.formula}</p>
                <p className="mt-1 text-xs font-semibold text-brand-navy">{methodLabel}</p>
              </div>

              <div className="rounded-xl border border-white/60 bg-white/60 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{commissionText.updated}</p>
                <p className="mt-1 text-[11px] font-semibold text-brand-navy">
                  {new Date(updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-2.5 text-xs text-brand-navy">
              <span className="font-semibold">{commissionText.mathPreview}:</span> {previewFormula}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-brand-navy">{commissionText.statusLabel}</span>
              <label className="inline-flex items-center gap-2 rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-brand-navy shadow-sm">
                <input
                  type="checkbox"
                  checked={Boolean(rule.enabled)}
                  onChange={(event) => updateCommissionRule(field.key, 'enabled', event.target.checked)}
                />
                {rule.enabled ? commissionText.enabled : commissionText.disabled}
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-xs text-brand-navy">
                <span className="mb-1 block font-medium">{commissionText.calculationType}</span>
                <select
                  value={rule.method || 'percentage'}
                  onChange={(event) => updateCommissionRule(field.key, 'method', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-gold"
                >
                  <option value="percentage">{commissionText.percentageOfProfit}</option>
                  <option value="amount">{commissionText.fixedAmount}</option>
                </select>
              </label>

              <label className="block text-xs text-brand-navy">
                <span className="mb-1 block font-medium">{commissionText.amount}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rule.amount ?? 0}
                  onChange={(event) => updateCommissionRule(field.key, 'amount', Number(event.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-gold"
                  disabled={rule.method !== 'amount'}
                />
              </label>

              <label className="block text-xs text-brand-navy">
                <span className="mb-1 block font-medium">{commissionText.profitPercent}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={rule.percentage ?? 0}
                  onChange={(event) => updateCommissionRule(field.key, 'percentage', Number(event.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-gold"
                  disabled={rule.method !== 'percentage'}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };

  const updateField = (fieldName, value) => {
    setSettings((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const updatePackageTypeDescription = (typeKey, value) => {
    setSettings((prev) => ({
      ...prev,
      package_type_descriptions: {
        ...(prev.package_type_descriptions || {}),
        [typeKey]: value,
      },
    }));
  };

  const updateCommissionRule = (typeKey, field, value) => {
    setSettings((prev) => ({
      ...prev,
      commission_rules: {
        ...(prev.commission_rules || {}),
        [typeKey]: {
          ...(prev.commission_rules?.[typeKey] || {}),
          [field]: value,
        },
      },
    }));
  };

  const processCommissionPayout = async (commissionRow) => {
    if (!supabase) {
      setError('Supabase is not configured yet.');
      return;
    }

    const selectedAccountId = payoutAccountIds[commissionRow.id] || payoutAccountIds[commissionRow.target_id] || financialAccounts[0]?.id || null;
    const amount = Number(commissionRow.amount || 0);
    if (!selectedAccountId || !amount || amount <= 0) {
      setError('Please choose a valid financial account before paying this commission.');
      return;
    }

    try {
      setError('');
      const { data: userData } = await supabase.auth.getUser();

      const { error: ledgerError } = await supabase.from('bank_entries').insert([
        {
          account_id: selectedAccountId,
          operation_date: new Date().toISOString(),
          description: commissionRow.notes || `Commission payout - ${commissionRow.target_type || 'agent'}`,
          operation_type: 'commission',
          third_party: commissionRow.third_party || 'Agent commission',
          debit: amount,
          credit: 0,
          agent_id: userData?.user?.id || null,
        },
      ]);

      if (ledgerError) throw ledgerError;

      const { data: accountData, error: accountFetchError } = await supabase
        .from('financial_accounts')
        .select('current_balance')
        .eq('id', selectedAccountId)
        .single();

      if (accountFetchError) throw accountFetchError;

      const nextBalance = Number(accountData?.current_balance || 0) - Number(amount || 0);
      const { error: accountUpdateError } = await supabase
        .from('financial_accounts')
        .update({ current_balance: nextBalance })
        .eq('id', selectedAccountId);

      if (accountUpdateError) throw accountUpdateError;

      const { error: payoutUpdateError } = await supabase
        .from('commission_payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', commissionRow.id);

      if (payoutUpdateError) throw payoutUpdateError;

      const refreshed = await supabase
        .from('commission_payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!refreshed.error) {
        setCommissionPayouts(refreshed.data || []);
      }

      setToast('Commission paid and ledger updated.');
    } catch (err) {
      setError(err.message || 'Unable to process commission payout.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canEdit) {
      setError('Only super admins can edit agency settings.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const saved = await saveAgencySettings(settings);
      setSettings(saved);
    } catch (err) {
      setError(err.message || 'Unable to save agency settings.');
    } finally {
      setSaving(false);
    }
  };

  const groupedFields = useMemo(
    () => ({
      basic: fields.filter((field) => field.group === 'basic'),
      bank: fields.filter((field) => field.group === 'bank'),
    }),
    []
  );

  const handleSendInvite = async (event) => {
    event.preventDefault();
    if (!inviteForm.full_name.trim() || !inviteForm.email.trim()) return;

    setSubmittingInvite(true);

    try {
      const normalizedSalary = Number(inviteForm.base_salary || 0);

      if (supabase && inviteForm.email.trim()) {
        const { data: existingProfile, error: lookupError } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', inviteForm.email.trim())
          .maybeSingle();

        if (!lookupError && existingProfile?.id) {
          const { error: salaryError } = await supabase
            .from('profiles')
            .update({ base_salary: normalizedSalary })
            .eq('id', existingProfile.id);

          if (salaryError) throw salaryError;
        }
      }

      setToast(t.successInvite);
      setInviteForm({ full_name: '', email: '', role: 'sales_agent', base_salary: 0 });
      await loadTeamMembers();
    } catch (err) {
      setError(err.message || 'Unable to save salary for this agent.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRoleChange = async (userId, nextRole) => {
    if (!canManageTeam || !supabase || !userId) return;

    try {
      const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId);
      if (error) throw error;

      setTeamMembers((prev) => prev.map((member) => (member.id === userId ? { ...member, role: nextRole } : member)));
      setToast('Role updated');
    } catch (err) {
      setError(err.message || 'Unable to update role.');
    }
  };

  const handleBaseSalaryChange = async (userId, nextSalary) => {
    if (!canManageTeam || !supabase || !userId) return;

    try {
      const normalizedSalary = Number(nextSalary || 0);
      const { error } = await supabase.from('profiles').update({ base_salary: normalizedSalary }).eq('id', userId);

      if (error) throw error;

      setTeamMembers((prev) => prev.map((member) => (member.id === userId ? { ...member, base_salary: normalizedSalary } : member)));
      setToast('Base salary updated');
    } catch (err) {
      setError(err.message || 'Unable to update base salary.');
    }
  };

  const handleRemoveMember = (userId) => {
    if (!canManageTeam) return;
    setToast(t.comingSoon);
  };

  const formatJoinedDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return value;
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Loading agency settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Settings</p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!canEdit && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t.warning}</div>
      )}

      {canEdit && section === 'agency' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-brand-navy">{t.basic}</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {groupedFields.basic.map((field) => (
                <label key={field.name} className="block text-sm text-brand-navy">
                  <span className="mb-1 block font-medium">{localizedFieldLabels[language]?.[field.name] || field.label}</span>
                  <input
                    type="text"
                    value={settings[field.name] || ''}
                    onChange={(event) => updateField(field.name, event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 outline-none focus:border-brand-gold"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {saving ? 'Saving...' : t.save}
            </button>
          </div>
        </form>
      )}

      {canEdit && section === 'bank' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-brand-navy">{t.bank}</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {groupedFields.bank.map((field) => (
                <label key={field.name} className="block text-sm text-brand-navy">
                  <span className="mb-1 block font-medium">{localizedFieldLabels[language]?.[field.name] || field.label}</span>
                  <input
                    type="text"
                    value={settings[field.name] || ''}
                    onChange={(event) => updateField(field.name, event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 outline-none focus:border-brand-gold"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {saving ? 'Saving...' : t.save}
            </button>
          </div>
        </form>
      )}

      {canEdit && section === 'package' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-brand-navy">{commissionText.packageDefaults}</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {packageTypeDescriptionFields.map((field) => (
                <label key={field.key} className="block text-sm text-brand-navy">
                  <span className="mb-1 block font-medium">{field.label}</span>
                  <textarea
                    rows="3"
                    value={settings.package_type_descriptions?.[field.key] || ''}
                    onChange={(event) => updatePackageTypeDescription(field.key, event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 outline-none focus:border-brand-gold"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {saving ? 'Saving...' : t.save}
            </button>
          </div>
        </form>
      )}

      {canEdit && section === 'commission' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-lg font-semibold text-brand-navy">{t.commissionTitle || 'Commission rules by package / service type'}</h3>
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={commissionSearch}
                  onChange={(event) => setCommissionSearch(event.target.value)}
                  placeholder={commissionText.filterPlaceholder}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-brand-navy">{commissionText.packageRules}</h4>
                  <span className="rounded-full bg-brand-gold/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-navy">
                    {packageCommissionRows.length} items
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {packageCommissionRows.map((field, index) => renderCommissionCard(field, index))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-brand-navy">{commissionText.serviceRules}</h4>
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                    {filteredCommissionRows.length} items
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCommissionRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                      {commissionText.noMatches}
                    </div>
                  ) : (
                    filteredCommissionRows.map((field, index) => renderCommissionCard(field, index))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {saving ? 'Saving...' : t.save}
            </button>
          </div>
        </form>
      )}

      {canEdit && section === 'commission_payouts' && (
        <div className="space-y-6 rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">{commissionText.pendingClient}</p>
              <p className="mt-2 text-2xl font-bold text-amber-900">{commissionSummary.pending}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{commissionText.readyToWithdraw}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">{commissionSummary.ready}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">{commissionText.paidLabel}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{commissionSummary.paid}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{commissionText.payoutQueue}</p>
              <h3 className="mt-2 text-lg font-semibold text-brand-navy">{t.payCommission || 'Pay commission'}</h3>
            </div>

            <div className="flex w-full max-w-md items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={commissionSearch}
                  onChange={(event) => setCommissionSearch(event.target.value)}
                  placeholder={commissionText.searchPayouts}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <select
                value={commissionPayoutFilter}
                onChange={(event) => setCommissionPayoutFilter(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="all">{commissionText.all}</option>
                <option value="paid">{commissionText.paid}</option>
                <option value="pending">{commissionText.pending}</option>
                <option value="cancelled">{commissionText.cancelled}</option>
              </select>
            </div>
          </div>

          {commissionPayoutsLoading ? (
            <div className="text-sm text-slate-500">Loading commission payout records...</div>
          ) : filteredCommissionPayouts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              {commissionText.noPayouts}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCommissionPayouts.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-brand-surface p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-brand-navy">{row.notes || row.target_type || 'Commission payout'}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${row.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : row.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {row.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.target_type || 'service'} • {row.invoice_id ? `Invoice ${row.invoice_id}` : 'Manual commission'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Amount</p>
                        <p className="mt-1 font-mono text-lg font-semibold text-brand-navy">{Number(row.amount || 0).toFixed(2)} DA</p>
                      </div>

                      <select
                        value={payoutAccountIds[row.id] || ''}
                        onChange={(event) =>
                          setPayoutAccountIds((prev) => ({
                            ...prev,
                            [row.id]: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold"
                        aria-label={commissionText.accountSelect}
                      >
                        <option value="">{commissionText.accountSelect}</option>
                        {(financialAccounts || []).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="rounded-xl bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy disabled:opacity-50"
                        onClick={() => processCommissionPayout(row)}
                        disabled={row.status === 'paid'}
                      >
                        {row.status === 'paid' ? commissionText.paidLabel : commissionText.payNow}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'team' && (
        <div className="space-y-6 rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.teamTitle}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-brand-navy">{t.inviteTitle}</h3>
            </div>

            <form onSubmit={handleSendInvite} className="grid gap-4 md:grid-cols-3">
              <label className="block text-sm text-brand-navy md:col-span-1">
                <span className="mb-1 block font-medium">{t.fullName}</span>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, full_name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                />
              </label>

              <label className="block text-sm text-brand-navy md:col-span-1">
                <span className="mb-1 block font-medium">{t.email}</span>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                />
              </label>

              <label className="block text-sm text-brand-navy md:col-span-1">
                <span className="mb-1 block font-medium">{commissionText.monthlySalary}</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={inviteForm.base_salary}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, base_salary: Number(event.target.value || 0) }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                />
              </label>

              <label className="block text-sm text-brand-navy md:col-span-1">
                <span className="mb-1 block font-medium">{t.role}</span>
                <select
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {language === 'en' ? option.label : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingInvite || !inviteForm.full_name.trim() || !inviteForm.email.trim()}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingInvite ? commissionText.sending : t.sendInvite}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-brand-navy">{t.members}</h3>
              {!canManageTeam && <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{t.readOnly}</span>}
            </div>

            {teamLoading ? (
              <div className="text-sm text-slate-500">{commissionText.loadingTeam}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-3 font-semibold">{t.fullName}</th>
                      <th className="px-3 py-3 font-semibold">{t.role}</th>
                      <th className="px-3 py-3 font-semibold">{t.joined}</th>
                      <th className="px-3 py-3 font-semibold">{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.id} className="border-b border-slate-200 last:border-0">
                        <td className="px-3 py-3 font-medium text-brand-navy">{member.full_name || member.email || '—'}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${roleBadgeStyles[member.role] || 'bg-slate-200 text-slate-700'}`}>
                            {member.role || 'viewer'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{formatJoinedDate(member.created_at)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            {canManageTeam ? (
                              <>
                                <select
                                  value={member.role || 'viewer'}
                                  onChange={(event) => handleRoleChange(member.id, event.target.value)}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-brand-navy outline-none focus:border-brand-gold"
                                >
                                  {roleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>

                                <label className="block text-[11px] text-slate-500">
                                  <span className="mb-1 block">{commissionText.baseSalary}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={Number(member.base_salary || 0)}
                                    onChange={(event) => handleBaseSalaryChange(member.id, event.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-brand-navy outline-none focus:border-brand-gold"
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600"
                                >
                                  {t.remove}
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-xl bg-[#0a1120] px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
