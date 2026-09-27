import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Landmark, Plus, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

const defaultForm = {
  label: '',
  currency: 'DZD',
  country: '',
  initial_balance: '',
  date: new Date().toISOString().slice(0, 10),
  bank_name: '',
  iban: '',
  swift_bic: '',
};

export default function NewFinancialAccount() {
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    const amount = Number(form.initial_balance || 0);
    if (!form.label.trim()) {
      setError('Account label is required.');
      return;
    }

    if (!Number.isFinite(amount)) {
      setError('Initial balance must be a valid number.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = {
        label: form.label.trim(),
        currency: form.currency || 'DZD',
        country: form.country.trim(),
        initial_balance: amount,
        current_balance: amount,
        bank_name: form.bank_name.trim(),
        iban: form.iban.trim(),
        swift_bic: form.swift_bic.trim(),
        created_at: new Date().toISOString(),
      };

      const { data: insertedAccount, error: insertError } = await supabase
        .from('financial_accounts')
        .insert([payload])
        .select('id')
        .single();

      if (insertError) throw insertError;

      const { error: txError } = await supabase.from('financial_account_transactions').insert([
        {
          account_id: insertedAccount.id,
          type: 'in',
          amount,
          description: 'Initial account balance',
          reference: 'initial_balance',
          created_at: new Date().toISOString(),
        },
      ]);

      if (txError) throw txError;

      setSuccess('Financial account created successfully.');
      setForm(defaultForm);
      setTimeout(() => navigate('/bank'), 500);
    } catch (err) {
      setError(err.message || 'Unable to create financial account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Finance</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">New Financial Account</h2>
        </div>

        <button
          type="button"
          onClick={() => navigate('/bank')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
        >
          <ArrowLeft size={16} />
          Back to Bank
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Account Label</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={handleChange}
                  placeholder="e.g. Main Treasury"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-3 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Currency</label>
              <select
                name="currency"
                value={form.currency}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="DZD">DZD</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="MAD">MAD</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Country</label>
              <input
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                placeholder="Algeria"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Initial Balance</label>
              <input
                type="number"
                name="initial_balance"
                step="0.01"
                value={form.initial_balance}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Balance Date</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Bank Name</label>
              <div className="relative">
                <Landmark className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  name="bank_name"
                  value={form.bank_name}
                  onChange={handleChange}
                  placeholder="Bank of Algeria"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-3 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">IBAN</label>
              <input
                type="text"
                name="iban"
                value={form.iban}
                onChange={handleChange}
                placeholder="DZ..."
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">BIC / SWIFT</label>
              <input
                type="text"
                name="swift_bic"
                value={form.swift_bic}
                onChange={handleChange}
                placeholder="BNAADZD1"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/bank')}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving...' : 'Save Account'}
              {saving ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
