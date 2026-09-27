import { supabase } from './supabase';

export const defaultPackageTypeDescriptions = {
  trip: 'Standard trip package service.',
  hajj: 'Hajj package service including pilgrimage arrangements and hospitality support.',
  omra: 'Omra package service including travel, accommodation, and pilgrimage support.',
  ticket_promotion: 'Air ticket promotion service with flight arrangements and travel support.',
  hotel_promotion: 'Hotel promotion service with accommodation arrangements and stay support.',
};

export const normalizePackageTypeDescriptions = (value = {}) => {
  const defaults = { ...defaultPackageTypeDescriptions };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const normalized = {};
  Object.entries(value).forEach(([key, description]) => {
    const safeKey = String(key || '').trim().toLowerCase();
    const safeDescription = String(description || '').trim();
    if (safeKey && safeDescription) {
      normalized[safeKey] = safeDescription;
    }
  });

  return { ...defaults, ...normalized };
};

export const slugifyCommissionTypeKey = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_') || 'custom_service';

export const getPackageTypeDescription = (templateType, settings = null) => {
  const normalizedType = String(templateType || '').trim().toLowerCase();
  const aliases = {
    ticket: 'ticket_promotion',
    flight: 'ticket_promotion',
    'ticket promotion': 'ticket_promotion',
    hotel: 'hotel_promotion',
    'hotel promotion': 'hotel_promotion',
  };
  const finalType = aliases[normalizedType] || normalizedType;
  const descriptions = normalizePackageTypeDescriptions(settings?.package_type_descriptions || defaultPackageTypeDescriptions);
  return descriptions[finalType] || 'Standard package service.';
};

export const defaultCommissionRules = {
  trip: { enabled: true, target_type: 'package', method: 'percentage', amount: 0, percentage: 10 },
  hajj: { enabled: true, target_type: 'package', method: 'percentage', amount: 0, percentage: 12 },
  omra: { enabled: true, target_type: 'package', method: 'percentage', amount: 0, percentage: 12 },
  ticket_promotion: { enabled: true, target_type: 'package', method: 'amount', amount: 0, percentage: 0 },
  hotel_promotion: { enabled: true, target_type: 'package', method: 'amount', amount: 0, percentage: 0 },
};

export const normalizeCommissionRules = (value = {}) => {
  const defaults = { ...defaultCommissionRules };
  const safeSource = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const normalized = { ...defaults };
  Object.entries(safeSource).forEach(([key, sourceRule]) => {
    const safeKey = slugifyCommissionTypeKey(key);
    if (!safeKey) return;

    if (!sourceRule || typeof sourceRule !== 'object' || Array.isArray(sourceRule)) {
      normalized[safeKey] = { enabled: false, target_type: 'package', method: 'percentage', amount: 0, percentage: 0 };
      return;
    }

    normalized[safeKey] = {
      enabled: Boolean(sourceRule.enabled ?? true),
      target_type: sourceRule.target_type || 'package',
      method: sourceRule.method || 'percentage',
      amount: Number(sourceRule.amount ?? 0),
      percentage: Number(sourceRule.percentage ?? 0),
    };
  });

  return normalized;
};

export const getCommissionRuleForType = (typeKey, settings = null) => {
  const normalizedType = slugifyCommissionTypeKey(typeKey);
  const aliases = {
    ticket: 'ticket_promotion',
    flight: 'ticket_promotion',
    'ticket promotion': 'ticket_promotion',
    hotel: 'hotel_promotion',
    'hotel promotion': 'hotel_promotion',
  };

  const finalType = aliases[normalizedType] || normalizedType;
  const rules = normalizeCommissionRules(settings?.commission_rules || defaultCommissionRules);
  return rules[finalType] || { enabled: false, target_type: 'package', method: 'percentage', amount: 0, percentage: 0 };
};

export const calculateCommissionAmount = (typeKey, profitAmount, settings = null) => {
  const rule = getCommissionRuleForType(typeKey, settings);
  if (!rule?.enabled) return 0;

  const profit = Number(profitAmount || 0);
  if (rule.method === 'amount') {
    return Number(rule.amount || 0);
  }

  return Number(((profit * Number(rule.percentage || 0)) / 100).toFixed(2));
};

export const defaultAgencySettings = {
  id: null,
  agency_name: 'AIRVOY',
  logo_url: '',
  address: '',
  city: '',
  wilaya: '',
  rc_number: '',
  nif: '',
  nis: '',
  ai: '',
  phone: '',
  fax: '',
  email: '',
  bank_name: '',
  bank_account: '',
  iban: '',
  package_type_descriptions: { ...defaultPackageTypeDescriptions },
  commission_rules: { ...defaultCommissionRules },
  created_at: new Date().toISOString(),
};

export const normalizeAgencySettings = (settings = {}) => ({
  ...defaultAgencySettings,
  ...settings,
  package_type_descriptions: normalizePackageTypeDescriptions(settings.package_type_descriptions || defaultAgencySettings.package_type_descriptions),
  commission_rules: normalizeCommissionRules(settings.commission_rules || defaultAgencySettings.commission_rules),
  created_at: settings.created_at || new Date().toISOString(),
});

export async function fetchAgencySettings() {
  if (!supabase) {
    return normalizeAgencySettings();
  }

  try {
    const { data, error } = await supabase
      .from('agency_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return normalizeAgencySettings();
    }

    return normalizeAgencySettings(data || {});
  } catch (error) {
    return normalizeAgencySettings();
  }
}

export async function saveAgencySettings(payload = {}) {
  if (!supabase) {
    throw new Error('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const nextPayload = normalizeAgencySettings(payload);
  const nextId = nextPayload.id || crypto.randomUUID();

  const { data, error } = await supabase
    .from('agency_settings')
    .upsert(
      [{
        ...nextPayload,
        id: nextId,
        created_at: nextPayload.created_at || new Date().toISOString(),
      }],
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeAgencySettings(data || nextPayload);
}
