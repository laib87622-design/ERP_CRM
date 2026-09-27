import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const defaultForm = {
  client_id: '',
  package_id: '',
  supplier_id: '',
  finish_date: '',
  status: 'pending',
};

export default function BookingModal({ booking, onClose, onSaved }) {
  const [form, setForm] = useState(defaultForm);
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLookupData = async () => {
      if (!supabase) return;

      const [clientsRes, packagesRes, suppliersRes] = await Promise.all([
        supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
        supabase.from('package_templates').select('id, label').order('label', { ascending: true }),
        supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
      ]);

      if (!clientsRes.error) setClients(clientsRes.data || []);
      if (!packagesRes.error) setPackages(packagesRes.data || []);
      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);
    };

    fetchLookupData();

    if (booking) {
      setForm({
        client_id: booking.client_id || '',
        package_id: booking.package_id || '',
        supplier_id: booking.supplier_id || '',
        finish_date: booking.finish_date || '',
        status: booking.status || 'pending',
      });
    } else {
      setForm(defaultForm);
    }
  }, [booking]);

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

      if (booking?.id) {
        const { error } = await supabase.from('bookings').update(form).eq('id', booking.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bookings').insert([form]);
        if (error) throw error;
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save booking.');
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
              {booking ? 'Edit booking' : 'New booking'}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-brand-navy">
              {booking ? 'Booking Details' : 'Create Booking'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
            aria-label="Close booking form"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Client</label>
            <select
              value={form.client_id}
              onChange={(e) => handleChange('client_id', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Package</label>
            <select
              value={form.package_id}
              onChange={(e) => handleChange('package_id', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              required
            >
              <option value="">Select package</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.label || pkg.title || 'Untitled package'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier</label>
            <select
              value={form.supplier_id}
              onChange={(e) => handleChange('supplier_id', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Finish date</label>
              <input
                type="date"
                value={form.finish_date}
                onChange={(e) => handleChange('finish_date', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="pending">Pending</option>
                <option value="processing">Processing / قيد المعالجة</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
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
              {loading ? 'Saving...' : booking ? 'Save Changes' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
