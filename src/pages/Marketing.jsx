import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Megaphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const platformIcons = {
  Facebook: Megaphone,
  Instagram: BarChart3,
  'Google Ads': Clock3,
  LinkedIn: CheckCircle2,
};

const statusClasses = {
  Active: 'bg-emerald-100 text-emerald-700',
  Scheduled: 'bg-sky-100 text-sky-700',
  Paused: 'bg-amber-100 text-amber-700',
  Completed: 'bg-slate-200 text-slate-700',
};

const emptyForm = {
  platform: 'Facebook',
  budget: '',
  status: 'Active',
};

export default function Marketing({ language = 'en' }) {
  const t = {
    en: { eyebrow: 'Growth', title: 'Marketing', newCampaign: 'New Campaign' },
    ar: { eyebrow: 'النمو', title: 'التسويق', newCampaign: 'حملة جديدة' },
  }[language] || { eyebrow: 'Growth', title: 'Marketing', newCampaign: 'New Campaign' };

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setCampaigns([]);
          return;
        }

        const { data, error } = await supabase
          .from('marketing_campaigns')
          .select('id, platform, budget, status')
          .order('updated_at', { ascending: false });

        if (error) throw error;

        setCampaigns(data || []);
      } catch (err) {
        setError(err.message || 'Unable to load campaigns.');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  const handleCreateCampaign = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const trimmedPlatform = form.platform.trim();
    const budget = Number(form.budget || 0);

    if (!trimmedPlatform) {
      setError('Campaign platform is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        platform: trimmedPlatform,
        budget,
        status: form.status,
      };

      const { data, error: insertError } = await supabase
        .from('marketing_campaigns')
        .insert([payload])
        .select('id, platform, budget, status')
        .single();

      if (insertError) throw insertError;

      setCampaigns((prev) => [data, ...prev]);
      setForm(emptyForm);
      setIsFormOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to create campaign.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
            {t.eyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
        >
          {t.newCampaign}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Platform</th>
                <th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-5 py-10 text-center text-sm text-slate-500">
                    No campaigns found.
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => {
                  const Icon = platformIcons[campaign.platform] || Megaphone;

                  return (
                    <tr key={campaign.id} className="border-t border-slate-200 text-sm text-slate-700">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-brand-surface p-2 text-brand-navy">
                            <Icon size={16} />
                          </div>
                          <span className="font-medium text-brand-navy">{campaign.platform}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-brand-navy">
                        {formatCurrency(campaign.budget)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClasses[campaign.status] || 'bg-slate-100 text-slate-700'}`}>
                          {campaign.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Campaign</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">New Campaign</h3>
              </div>

              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close marketing form"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Platform</label>
                <select
                  value={form.platform}
                  onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="Facebook">Facebook</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="LinkedIn">LinkedIn</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Budget (DZD)</label>
                <input
                  type="number"
                  min="0"
                  value={form.budget}
                  onChange={(event) => setForm((prev) => ({ ...prev, budget: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="Active">Active</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Paused">Paused</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
