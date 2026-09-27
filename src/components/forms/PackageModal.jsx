import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const defaultCountryOptions = ['Turkey', 'Tunisia', 'Egypt', 'Algeria', 'France', 'United Arab Emirates', 'Qatar', 'Saudi Arabia'];

export default function PackageModal({ pkg, onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [showCountryInput, setShowCountryInput] = useState(false);
  const [form, setForm] = useState({
    title: '',
    country: '',
    destination: '',
    price: '',
    cost_price: '',
    pricing_mode: 'fixed',
    inclusions: '',
    exclusions: '',
    cancellation_policy: '',
    good_to_know: '',
    is_available: true,
    supplier_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSuppliers = async () => {
      if (!supabase) return;

      try {
        const { data, error } = await supabase.from('suppliers').select('id, name').order('name', { ascending: true });
        if (!error) setSuppliers(data || []);
      } catch (err) {
        setError(err.message || 'Unable to load suppliers.');
      }
    };

    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (pkg) {
      setForm({
        title: pkg.title || '',
        country: pkg.country || '',
        destination: pkg.destination || '',
        price: pkg.price ?? '',
        cost_price: pkg.cost_price ?? '',
        pricing_mode: pkg.pricing_mode || 'fixed',
        inclusions: Array.isArray(pkg.inclusions) ? pkg.inclusions.join(', ') : (pkg.inclusions || ''),
        exclusions: Array.isArray(pkg.exclusions) ? pkg.exclusions.join(', ') : (pkg.exclusions || ''),
        cancellation_policy: pkg.cancellation_policy || '',
        good_to_know: pkg.good_to_know || '',
        is_available: pkg.is_available ?? true,
        supplier_id: pkg.supplier_id || '',
      });
      setShowCountryInput(Boolean(pkg.country && !defaultCountryOptions.includes(pkg.country)));
    } else {
      setForm((prev) => ({ ...prev, country: prev.country || '' }));
      setShowCountryInput(false);
    }
  }, [pkg]);

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

      const listToArray = (value = '') =>
        String(value)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

      const payload = {
        ...form,
        label: form.title || '',
        supplier_id: form.supplier_id || null,
        pricing_mode: 'fixed',
        selling_price: Number(form.price) || 0,
        cost_price: Number(form.cost_price) || 0,
        inclusions: listToArray(form.inclusions),
        exclusions: listToArray(form.exclusions),
        cancellation_policy: form.cancellation_policy?.trim() || '',
        good_to_know: form.good_to_know?.trim() || '',
      };

      delete payload.title;
      delete payload.price;

      if (pkg?.id) {
        const { error } = await supabase.from('package_templates').update(payload).eq('id', pkg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('package_templates').insert([payload]);
        if (error) throw error;
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save package.');
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
              {pkg ? 'Edit package' : 'New package'}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-brand-navy">
              {pkg ? pkg.title : 'Create Package'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
            aria-label="Close package form"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Title</label>
            <input
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Country</label>
              {!showCountryInput ? (
                <select
                  value={form.country || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__custom__') {
                      setForm((prev) => ({ ...prev, country: prev.country || '' }));
                      setShowCountryInput(true);
                      return;
                    }
                    handleChange('country', value);
                    setShowCountryInput(false);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">Select country</option>
                  {defaultCountryOptions.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                  <option value="__custom__">+ Add custom country</option>
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={form.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    placeholder="Enter country"
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCountryInput(false);
                      setForm((prev) => ({ ...prev, country: prev.country || '' }));
                    }}
                    className="text-xs font-medium text-brand-navy underline"
                  >
                    Use saved country list instead
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Destination</label>
              <input
                value={form.destination}
                onChange={(e) => handleChange('destination', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Cost price (DZD)</label>
              <input
                type="number"
                min="0"
                value={form.cost_price}
                onChange={(e) => handleChange('cost_price', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Selling price (DZD)</label>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => handleChange('price', e.target.value)}
                disabled={form.pricing_mode === 'dynamic'}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier</label>
            <select
              value={form.supplier_id}
              onChange={(e) => handleChange('supplier_id', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="">No supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Inclusions</label>
            <textarea
              rows={4}
              value={form.inclusions}
              onChange={(e) => handleChange('inclusions', e.target.value)}
              placeholder="Hotel, Flights, Airport Transfer"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Exclusions</label>
            <textarea
              rows={3}
              value={form.exclusions}
              onChange={(e) => handleChange('exclusions', e.target.value)}
              placeholder="Visa, personal expenses, optional tours"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Cancellation Policy</label>
            <textarea
              rows={4}
              value={form.cancellation_policy}
              onChange={(e) => handleChange('cancellation_policy', e.target.value)}
              placeholder="Refund terms and conditions"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Good to Know</label>
            <textarea
              rows={4}
              value={form.good_to_know}
              onChange={(e) => handleChange('good_to_know', e.target.value)}
              placeholder="Travel tips, required documents, local information"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-brand-surface p-3">
            <span className="text-sm font-medium text-brand-navy">Availability</span>
            <button
              type="button"
              onClick={() => handleChange('is_available', !form.is_available)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                form.is_available ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                  form.is_available ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
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
              {loading ? 'Saving...' : pkg ? 'Save Changes' : 'Create Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
