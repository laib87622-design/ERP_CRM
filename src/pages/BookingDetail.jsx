import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, CalendarDays, PackageCheck, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const statusStyles = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-700',
};

export default function BookingDetail() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadBooking = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setBooking(null);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('bookings')
          .select(
            'id, client_id, cost_price, selling_price, status, finish_date, created_at, clients(full_name)'
          )
          .eq('id', bookingId)
          .maybeSingle();

        if (fetchError) throw fetchError;

        let serviceLines = [];
        if (data?.id) {
          const { data: linesData, error: linesError } = await supabase
            .from('booking_service_lines')
            .select('id, service_type_id, supplier_id, cost_price, selling_price, details, service_types(name), suppliers(name)')
            .eq('booking_id', data.id);

          if (linesError) throw linesError;

          serviceLines = (linesData || []).map((line) => ({
            id: line.id,
            serviceTypeName: line.service_types?.name || 'Service type',
            supplierName: line.suppliers?.name || '—',
            costPrice: Number(line.cost_price || 0),
            sellingPrice: Number(line.selling_price || 0),
          }));
        }

        setBooking({ ...(data || {}), serviceLines });
      } catch (err) {
        setError(err.message || 'Unable to load booking details.');
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      loadBooking();
    }
  }, [bookingId]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Loading booking details...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back to bookings
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back to bookings
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Booking not found.</div>
      </div>
    );
  }

  const totalCostPrice = (booking.serviceLines || []).reduce((sum, line) => sum + Number(line.costPrice || 0), 0);
  const totalSellingPrice = (booking.serviceLines || []).reduce((sum, line) => sum + Number(line.sellingPrice || 0), 0);
  const totalProfit = totalSellingPrice - totalCostPrice;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back
        </button>

        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusStyles[booking.status] || 'bg-slate-100 text-slate-700'}`}>
          {booking.status}
        </span>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-brand-navy p-3 text-brand-gold">
              <BriefcaseBusiness size={24} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Booking</p>
              <h2 className="mt-2 font-serif text-4xl text-brand-navy">{booking.clients?.full_name || 'Client booking'}</h2>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Selling price</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(totalSellingPrice || Number(booking.selling_price || 0))}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Cost price / سعر التكلفة</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{formatCurrency(totalCostPrice || Number(booking.cost_price || 0))}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Selling price / سعر البيع</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{formatCurrency(totalSellingPrice || Number(booking.selling_price || 0))}</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-amber-700">Profit / الربح</p>
            <p className="mt-3 text-sm font-semibold text-amber-700">{formatCurrency(totalProfit || Number(booking.selling_price || 0) - Number(booking.cost_price || 0))}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Client</p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-navy">
              <User size={15} className="text-brand-gold" />
              <span>{booking.clients?.full_name || '—'}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Due / Finish date</p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-navy">
              <CalendarDays size={15} className="text-brand-gold" />
              <span>{booking.finish_date || '—'}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-brand-surface p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Service lines</p>
          {(booking.serviceLines || []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No service type lines linked to this booking.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Service type</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Selling</th>
                  </tr>
                </thead>
                <tbody>
                  {(booking.serviceLines || []).map((line) => (
                    <tr key={line.id} className="border-t border-slate-200 text-brand-navy">
                      <td className="px-3 py-2">{line.serviceTypeName}</td>
                      <td className="px-3 py-2">{line.supplierName}</td>
                      <td className="px-3 py-2 font-mono">{formatCurrency(line.costPrice)}</td>
                      <td className="px-3 py-2 font-mono">{formatCurrency(line.sellingPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
