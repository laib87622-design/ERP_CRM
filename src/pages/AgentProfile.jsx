import { useEffect, useState } from 'react';
import { BadgeDollarSign, BriefcaseBusiness, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getRoleLabel = (role) => String(role || 'Team member')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const getStatusClass = (status) => {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'confirmed') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'processing') return 'bg-sky-100 text-sky-700';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'bg-slate-200 text-slate-700';
  if (normalized === 'overdue') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

export default function AgentProfile() {
  const [profile, setProfile] = useState(null);
  const [commissions, setCommissions] = useState({ paid: 0, unpaid: 0 });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    const fetchAgentData = async () => {
      if (!supabase) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error('No signed-in user was found.');

        const [profileResult, commissionResult, bookingResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('agent_commissions').select('amount, status').eq('agent_id', userId),
          supabase
            .from('bookings')
            .select('id, reference, status, selling_price, created_at')
            .eq('agent_id', userId)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (commissionResult.error) throw commissionResult.error;
        if (bookingResult.error) throw bookingResult.error;
        if (!isActive) return;

        const commissionRows = commissionResult.data || [];
        const paid = commissionRows
          .filter((commission) => String(commission.status || '').toUpperCase() === 'PAID')
          .reduce((sum, commission) => sum + (parseFloat(commission.amount) || 0), 0);
        const unpaid = commissionRows
          .filter((commission) => !['PAID', 'CANCELLED', 'CANCELED'].includes(String(commission.status || '').toUpperCase()))
          .reduce((sum, commission) => sum + (parseFloat(commission.amount) || 0), 0);

        setProfile(profileResult.data);
        setCommissions({ paid, unpaid });
        setBookings(bookingResult.data || []);
      } catch (fetchError) {
        if (isActive) setError(fetchError.message || 'Unable to load agent profile.');
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchAgentData();
    return () => {
      isActive = false;
    };
  }, []);

  const handleAvatarUpload = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    input.value = '';

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    if (!profile?.id || !supabase) {
      setError('Your profile is not ready for an avatar upload.');
      return;
    }

    let uploadedPath = '';

    try {
      setUploadingAvatar(true);
      setError('');

      const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      uploadedPath = `${profile.id}-${uniqueId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(uploadedPath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(uploadedPath);
      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) throw new Error('Unable to get a public URL for the uploaded image.');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      setProfile((currentProfile) => ({ ...currentProfile, avatar_url: publicUrl }));
    } catch (uploadError) {
      if (uploadedPath) {
        await supabase.storage.from('avatars').remove([uploadedPath]);
      }
      setError(uploadError.message || 'Unable to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const initials = String(profile?.full_name || 'Agent')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'A';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Agent workspace</p>
        <h1 className="mt-2 font-serif text-3xl text-brand-navy">My Profile</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <UserRound size={17} />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">Account details</h2>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <label
              tabIndex={0}
              role="button"
              aria-label={uploadingAvatar ? 'Uploading profile picture' : 'Change profile picture'}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.currentTarget.querySelector('input')?.click();
                }
              }}
              className="group relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="h-full w-full rounded-full border border-slate-200 object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-amber-100 font-bold text-amber-700">{initials}</span>
              )}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/70 px-1 text-center text-[9px] font-semibold leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {uploadingAvatar ? 'Uploading...' : 'Change Picture'}
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar || loading}
              />
            </label>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-brand-navy">{profile?.full_name || (loading ? 'Loading...' : 'Agent')}</p>
              <p className="mt-1 text-sm capitalize text-slate-500">{getRoleLabel(profile?.role)}</p>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Base salary</p>
            <p className="mt-1 font-mono text-lg font-semibold text-brand-navy">{formatCurrency(profile?.base_salary)}</p>
          </div>
        </article>

        <article className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <BadgeDollarSign size={17} />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">Unpaid commissions</h2>
          </div>
          <p className="mt-6 font-mono text-3xl font-bold text-amber-800">{formatCurrency(commissions.unpaid)}</p>
          <p className="mt-2 text-sm text-amber-700">Outstanding commission balance</p>
        </article>

        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700">
            <BadgeDollarSign size={17} />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">Paid commissions</h2>
          </div>
          <p className="mt-6 font-mono text-3xl font-bold text-emerald-800">{formatCurrency(commissions.paid)}</p>
          <p className="mt-2 text-sm text-emerald-700">Commission already paid</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">Activity</p>
            <h2 className="mt-1 text-lg font-semibold text-brand-navy">Recent bookings</h2>
          </div>
          <BriefcaseBusiness size={18} className="text-slate-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Reference</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Loading bookings...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">No recent bookings found.</td></tr>
              ) : bookings.map((booking) => (
                <tr key={booking.id} className="border-t border-slate-100 text-slate-700">
                  <td className="whitespace-nowrap px-5 py-3">{formatDate(booking.created_at)}</td>
                  <td className="px-5 py-3 font-medium text-brand-navy">{booking.reference || `BK-${String(booking.id).slice(0, 8)}`}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-mono">{formatCurrency(booking.selling_price)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${getStatusClass(booking.status)}`}>
                      {booking.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}