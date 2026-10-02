import { supabase } from './supabase';

export const notificationChannels = {
  system: { label: 'System', tone: 'bg-slate-200 text-slate-700' },
  email: { label: 'Email', tone: 'bg-blue-100 text-blue-700' },
  sms: { label: 'SMS', tone: 'bg-violet-100 text-violet-700' },
  push: { label: 'Push', tone: 'bg-emerald-100 text-emerald-700' },
};

export const fetchNotificationsForUser = async (userId) => {
  if (!supabase || !userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch notifications from Supabase:', error);
    return [];
  }

  return data || [];
};

export const createFinanceNotification = async (title, message) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .contains('permissions', { finance: true });

  if (profilesError) throw profilesError;

  const outcomes = await Promise.all((profiles || []).map(async (profile) => {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: profile.id,
        title,
        message,
        channel: 'system',
        type: 'info',
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to create finance notification for ${profile.id}:`, error);
      return { userId: profile.id, error };
    }

    return { userId: profile.id, data };
  }));

  return outcomes;
};

export const deliverPushNotification = async ({
  channel = 'system',
  title,
  message,
  userId = null,
  route = null,
  type = 'info',
}) => {
  const payload = {
    channel,
    title,
    message,
    type,
    route,
    sentAt: new Date().toISOString(),
  };

  if (!supabase || !userId) {
    return { ...payload, delivered: true, backend: 'local' };
  }

  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      channel,
      type,
      route,
      is_read: false,
    });

    if (!error) {
      return { ...payload, delivered: true, backend: 'supabase' };
    }

    console.error('Failed to insert notification via Supabase:', error);
    return { ...payload, delivered: false, backend: 'supabase', error };
  } catch (error) {
    console.error('Notification delivery failed:', error);
    return { ...payload, delivered: false, backend: 'supabase', error };
  }
};
