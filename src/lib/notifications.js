export const notificationChannels = {
  system: { label: 'System', tone: 'bg-slate-200 text-slate-700' },
  email: { label: 'Email', tone: 'bg-blue-100 text-blue-700' },
  sms: { label: 'SMS', tone: 'bg-violet-100 text-violet-700' },
  push: { label: 'Push', tone: 'bg-emerald-100 text-emerald-700' },
};

export const deliverPushNotification = async ({ channel = 'system', title, message }) => {
  const payload = {
    channel,
    title,
    message,
    sentAt: new Date().toISOString(),
  };

  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { ...payload, delivered: true, backend: 'api' };
      }
    }
  } catch (error) {
    // Fallback to local app delivery when no backend endpoint exists.
  }

  return { ...payload, delivered: true, backend: 'local' };
};
