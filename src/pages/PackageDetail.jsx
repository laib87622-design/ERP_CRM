import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, PackageCheck, Pencil, Plus, Tag, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import PackageModal from '../components/forms/PackageModal';

const getInitials = (title = '') => {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function PackageDetail() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const loadPackage = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setPkg(null);
        setBookings([]);
        return;
      }

      const [packageResult, supplierResult, directBookingsResult, bridgeBookingsResult] = await Promise.all([
        supabase
          .from('package_templates')
          .select('id, label, destination, selling_price, cost_price, hotels, travel_schedule, departure_date, return_date, departure_point, transport, duration_nights, service_ref, country, cancellation_policy, good_to_know, is_available, supplier_id, created_at')
          .eq('id', packageId)
          .maybeSingle(),
        supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
        supabase
          .from('bookings')
          .select('id, client_id, package_id, status, selling_price, cost_price, finish_date, clients(full_name), suppliers(name)')
          .eq('package_id', packageId)
          .order('finish_date', { ascending: false }),
        supabase
          .from('booking_packages')
          .select('booking_id, bookings(id, client_id, package_id, status, selling_price, cost_price, finish_date, clients(full_name), suppliers(name))')
          .eq('package_id', packageId)
          .order('created_at', { ascending: false }),
      ]);

      if (packageResult.error) throw packageResult.error;
      if (supplierResult.error) throw supplierResult.error;
      if (directBookingsResult.error) throw directBookingsResult.error;
      if (bridgeBookingsResult.error) throw bridgeBookingsResult.error;

      const supplierMap = Object.fromEntries((supplierResult.data || []).map((supplier) => [supplier.id, supplier.name]));

      const bridgeBookings = (bridgeBookingsResult.data || [])
        .map((row) => row.bookings)
        .filter(Boolean);

      const mergedBookings = [...(directBookingsResult.data || []), ...bridgeBookings].filter(
        (booking, index, list) => list.findIndex((item) => item.id === booking.id) === index
      );

      const packageData = packageResult.data ? {
        ...packageResult.data,
        title: packageResult.data.label || packageResult.data.title || 'Untitled package',
        price: packageResult.data.selling_price ?? packageResult.data.price ?? 0,
        inclusions: Array.isArray(packageResult.data.hotels) ? packageResult.data.hotels.map((hotel) => hotel.hotel_name || hotel.name || 'Hotel') : [],
        supplierName: supplierMap[packageResult.data.supplier_id] || 'No supplier assigned',
      } : null;

      setPkg(packageData);
      setBookings(mergedBookings.sort((a, b) => new Date(b.finish_date || 0) - new Date(a.finish_date || 0)));
    } catch (err) {
      setError(err.message || 'Unable to load package details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (packageId) {
      loadPackage();
    }
  }, [packageId]);

  const totalBookings = bookings.length;
  const totalCostPrice = useMemo(
    () => bookings.reduce((sum, booking) => sum + Number(booking.cost_price || 0), 0),
    [bookings]
  );
  const totalSelling = useMemo(
    () => bookings.reduce((sum, booking) => sum + Number(booking.selling_price || 0), 0),
    [bookings]
  );

  const inclusions = Array.isArray(pkg?.inclusions) ? pkg.inclusions : [];

  const getHotelPriceSummary = (hotel) => {
    if (!hotel) return 'Price on request';
    const entries = [];
    if (hotel.prix_single) entries.push(`Single: ${hotel.prix_single}`);
    if (hotel.prix_double) entries.push(`Double: ${hotel.prix_double}`);
    if (hotel.prix_triple) entries.push(`Triple: ${hotel.prix_triple}`);
    if (Array.isArray(hotel.custom_prices)) {
      hotel.custom_prices.forEach((option) => {
        if (option?.name && option?.price !== '' && option?.price !== null && option?.price !== undefined) {
          entries.push(`${option.name}: ${option.price}`);
        }
      });
    }
    return entries.length ? entries.join(' • ') : 'Price on request';
  };

  const travelDates = useMemo(() => {
    const raw = Array.isArray(pkg?.travel_schedule) ? pkg.travel_schedule : [];
    return raw.filter((entry) => entry?.departure_date || entry?.return_date || entry?.departure_time || entry?.return_time);
  }, [pkg]);

  const travelDateHotels = useMemo(() => {
    const hotels = Array.isArray(pkg?.hotels) ? pkg.hotels : [];
    return travelDates.map((travel, index) => {
      const match = hotels.filter((hotel) => {
        if (hotel?.travel_date_id) return hotel.travel_date_id === travel.id;
        if (hotel?.travel_date_label) {
          return hotel.travel_date_label === travel.label || hotel.travel_date_label === `Travel Date ${index + 1}`;
        }
        return true;
      });

      return {
        ...travel,
        label: travel.label || `Travel Date ${index + 1}`,
        hotels: match,
      };
    });
  }, [pkg, travelDates]);

  const tabItems = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'inclusions', label: 'Inclusions' },
  ];

  const renderStatusBadge = (status) => {
    const label = status || 'pending';
    const className =
      label === 'cancelled'
        ? 'bg-slate-200 text-slate-700'
        : label === 'confirmed' || label === 'paid'
          ? 'bg-emerald-100 text-emerald-700'
          : label === 'overdue'
            ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-700';

    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}>{label}</span>;
  };

  const renderTabContent = () => {
    if (activeTab === 'overview') {
      return (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
              <h3 className="text-lg font-semibold text-brand-navy">Package information</h3>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[
                  ['Name', pkg.title],
                  ['Destination', pkg.destination || '—'],
                  ['Supplier', pkg.supplierName || 'No supplier assigned'],
                  ['Availability', pkg.is_available ? 'Available' : 'Unavailable'],
                  ['Cost Price', formatCurrency(Number(pkg.cost_price || 0))],
                  ['Selling Price', formatCurrency(Number(pkg.price || 0))],
                  ['Created At', pkg.created_at ? new Date(pkg.created_at).toLocaleDateString('en-GB') : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <p className="mt-2 text-sm font-medium text-brand-navy">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
              <h3 className="text-lg font-semibold text-brand-navy">Travel dates & room prices</h3>
              <div className="mt-5 space-y-3">
                {travelDateHotels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-brand-surface px-4 py-6 text-sm text-slate-500">
                    No travel dates available.
                  </div>
                ) : (
                  travelDateHotels.map((travel, index) => (
                    <div key={`${travel.id || index}`} className="rounded-2xl border border-slate-200 bg-brand-surface p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-brand-navy">{travel.label || `Travel Date ${index + 1}`}</p>
                        <span className="rounded-full bg-[#fff7dd] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-navy">
                          {travel.departure_date || travel.return_date ? 'Schedule' : 'Dates pending'}
                        </span>
                      </div>
                      <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                        <div><span className="font-medium text-slate-500">Departure:</span> {travel.departure_date || '—'} {travel.departure_time ? `• ${travel.departure_time}` : ''}</div>
                        <div><span className="font-medium text-slate-500">Return:</span> {travel.return_date || '—'} {travel.return_time ? `• ${travel.return_time}` : ''}</div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {travel.hotels.length === 0 ? (
                          <p className="text-xs text-slate-500">No hotels assigned to this date.</p>
                        ) : (
                          travel.hotels.map((hotel, hotelIndex) => (
                            <div key={`${hotel.id || hotelIndex}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-brand-navy">{hotel.hotel_name || 'Hotel'}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${hotel.is_primary === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {hotel.is_primary === false ? 'Optional' : 'General'}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-600">{getHotelPriceSummary(hotel)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
              <h3 className="text-lg font-semibold text-brand-navy">Package summary</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bookings</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-brand-navy">{totalBookings}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cost</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(totalCostPrice)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Revenue realized</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700">{formatCurrency(totalSelling)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'bookings') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
              No bookings linked to this package.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Client Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Selling Price</th>
                      <th className="px-4 py-3">Cost Price</th>
                      <th className="px-4 py-3">Finish Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking.id} className="border-t border-slate-200 text-sm text-slate-700">
                        <td className="px-4 py-3 font-medium text-brand-navy">{booking.clients?.full_name || 'Unknown Client'}</td>
                        <td className="px-4 py-3">{renderStatusBadge(booking.status)}</td>
                        <td className="px-4 py-3 font-mono text-brand-navy">{formatCurrency(Number(booking.selling_price || 0))}</td>
                        <td className="px-4 py-3 font-mono text-brand-navy">{formatCurrency(Number(booking.cost_price || 0))}</td>
                        <td className="px-4 py-3">{booking.finish_date ? new Date(`${booking.finish_date}T00:00:00`).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Cost Price</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-brand-navy">{formatCurrency(totalCostPrice)}</p>
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
        {inclusions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
            No inclusions listed for this package.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {inclusions.map((item, index) => (
              <span key={`${pkg.id}-inclusion-${index}`} className="rounded-full bg-brand-surface px-3 py-2 text-sm font-medium text-brand-navy">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">
        Loading package details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/packages')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to packages
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/packages')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to packages
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Package not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/packages')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to packages
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
            <Pencil size={16} />
            Edit Package
          </button>
          <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy">
            <Plus size={16} />
            New Booking
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-navy text-2xl font-bold text-brand-gold">
              {getInitials(pkg.title)}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Travel package</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="font-serif text-4xl text-brand-navy">{pkg.title}</h2>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${pkg.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {pkg.is_available ? 'Available' : 'Unavailable'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <MapPin size={15} />
                <span>{pkg.destination || 'No destination'}</span>
              </div>

              {pkg.supplierName && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <Building2 size={15} className="text-brand-gold" />
                  <span>{pkg.supplierName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bookings</p>
              <p className="mt-2 font-mono text-xl font-semibold text-brand-navy">{totalBookings}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selling Price</p>
              <p className="mt-2 font-mono text-xl font-semibold text-brand-navy">{formatCurrency(Number(pkg.price || 0))}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cost Price</p>
              <p className="mt-2 font-mono text-xl font-semibold text-brand-navy">{formatCurrency(Number(pkg.cost_price || 0))}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabItems.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-brand-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {renderTabContent()}

      {isModalOpen && (
        <PackageModal
          pkg={pkg}
          onClose={() => setIsModalOpen(false)}
          onSaved={async () => {
            setIsModalOpen(false);
            await loadPackage();
          }}
        />
      )}
    </div>
  );
}
