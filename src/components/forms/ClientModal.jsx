import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    passport_number: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (client) {
      setForm({
        full_name: client.full_name || '',
        phone: client.phone || '',
        email: client.email || '',
        passport_number: client.passport_number || '',
        notes: client.notes || '',
      });
    }
  }, [client]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (client?.id) {
        const { error } = await supabase
          .from('clients')
          .update(form)
          .eq('id', client.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([form]);
        if (error) throw error;
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save client.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">
              {client ? 'Edit client' : 'New client'}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-brand-navy">
              {client ? client.full_name : 'Create Client'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
            aria-label="Close client form"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Full name</label>
            <input
              value={form.full_name}
              onChange={(e) => handleChange('full_name', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Passport number</label>
            <input
              value={form.passport_number}
              onChange={(e) => handleChange('passport_number', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Notes</label>
            <textarea
              rows={5}
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
            >
              {loading ? 'Saving...' : client ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
