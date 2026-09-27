import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Globe,
  Plus,
  ReceiptText,
  Star,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { processSupplierPayment } from '../lib/financialAudit';

const emptyPaymentForm = {
  amount: '',
  account_id: '',
  note: '',
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const getTypeBadgeClass = (type) => {
  if (type === 'Hotel') return 'bg-violet-100 text-violet-700';
  if (type === 'Airline') return 'bg-blue-100 text-blue-700';
  if (type === 'Platform') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
};

class SupplierDetailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Supplier detail crashed unexpectedly.' };
  }

  componentDidCatch(error) {
    console.error('SupplierDetail crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="text-sm font-semibold uppercase tracking-[0.16em]">Supplier detail error</p>
          <p className="text-sm">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
          >
            Go back
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function SupplierDetailInner() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState(null);
  const [allServiceTypes, setAllServiceTypes] = useState([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState('');
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const copyReference = async (value, label) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setToast(`${label} copied`);
    } catch (error) {
      setToast('Copy failed');
    }
  };

  const loadSupplier = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setSupplier(null);
        setAllServiceTypes([]);
        return;
      }

      const [supplierResult, accountsResult] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id, name, reference, phone, fax, address, country, state_province, email, nif, nis, rc, website_url, star_rating, supplier_debt, bookings_count, created_at')
          .eq('id', supplierId)
          .maybeSingle(),
        supabase
          .from('financial_accounts')
          .select('id, label, bank_name, current_balance, currency')
          .order('label', { ascending: true }),
      ]);

      if (supplierResult.error) throw supplierResult.error;
      if (accountsResult.error) throw accountsResult.error;
      setFinancialAccounts(accountsResult.data || []);

      const bookingLinesResult = await supabase
        .from('booking_service_lines')
        .select('booking_id, bookings(id, reference, status, created_at, package_lines, clients(full_name), booking_service_lines(id, service_type_id, service_types(name)))')
        .eq('supplier_id', supplierId);

      if (bookingLinesResult.error && /booking_service_lines|does not exist|relation .* does not exist/i.test(bookingLinesResult.error.message || '')) {
        bookingLinesResult.data = [];
      } else if (bookingLinesResult.error) {
        throw bookingLinesResult.error;
      }

      const bookingsById = new Map();
      (bookingLinesResult.data || []).forEach((row) => {
        const booking = row.bookings;
        if (!booking || !booking.id) return;

        const serviceTypeNames = [...new Set((booking.booking_service_lines || []).map((line) => line.service_types?.name || line.service_type_id).filter(Boolean))];

        bookingsById.set(booking.id, {
          id: booking.id,
          client_id: booking.client_id || null,
          reference: booking.reference || `#${String(booking.id).slice(0, 6)}`,
          status: booking.status || 'pending',
          created_at: booking.created_at,
          service_type_names: serviceTypeNames,
          package_lines: booking.package_lines || [],
          clients: booking.clients || null,
          client_name: booking.clients?.full_name || 'Unknown Client',
        });
      });

      const bookingsResult = {
        data: [...bookingsById.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
      };

      const paymentHistoryResult = await supabase
        .from('bank_entries')
        .select('id, operation_date, debit, operation_type, description')
        .eq('third_party', supplierResult.data?.name || '')
        .gt('debit', 0)
        .order('operation_date', { ascending: false });

      if (paymentHistoryResult.error) throw paymentHistoryResult.error;

      const mappedPayments = (paymentHistoryResult.data || []).map((entry) => ({
        id: entry.id,
        amount: Number(entry.debit || 0),
        payment_method: entry.operation_type || 'bank',
        note: entry.description || 'Supplier payment',
        paid_at: entry.operation_date,
      }));

      setSupplier({
        ...((supplierResult.data || null) || {}),
        type: (supplierResult.data && supplierResult.data.type) || 'General',
        bookings: bookingsResult.data || [],
        payments: mappedPayments,
      });
    } catch (err) {
      setError(err.message || 'Unable to load supplier details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (supplierId) {
      loadSupplier();
    }
  }, [supplierId]);

  const totalBookings = supplier?.bookings?.length || 0;
  const totalCostPrice = useMemo(
    () => (supplier?.bookings || []).reduce((sum, booking) => sum + Number(booking.cost_price || 0), 0),
    [supplier]
  );
  const totalPayments = useMemo(
    () => (supplier?.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [supplier]
  );

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();

    if (!supabase || !supplierId) return;

    const amount = Number(paymentForm.amount);
    const selectedAccountId = paymentForm.account_id || financialAccounts[0]?.id || '';

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (!selectedAccountId) {
      setError('Please select a bank account before paying this supplier.');
      return;
    }

    const currentDebt = Number(supplier?.supplier_debt || 0);
    const amountToApply = Math.min(amount, currentDebt || amount);

    if (!currentDebt || amountToApply <= 0) {
      setError('This supplier has no outstanding debt to pay.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await processSupplierPayment({
        supabase,
        supplierId,
        accountId: selectedAccountId,
        amount: amountToApply,
        method: 'cash',
        note: paymentForm.note.trim() || 'Supplier payment',
        supplierName: supplier?.name,
      });

      setPaymentModalOpen(false);
      setPaymentForm(emptyPaymentForm);
      await loadSupplier();
    } catch (err) {
      setError(err.message || 'Unable to record supplier payment.');
    } finally {
      setSaving(false);
    }
  };

  const tabItems = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'payments', label: 'Payment History' },
  ];

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">
        Loading supplier details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/suppliers')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to suppliers
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/suppliers')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to suppliers
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">
          Supplier not found.
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    if (activeTab === 'overview') {
      return (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
              <h3 className="text-lg font-semibold text-brand-navy">Supplier information</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[
                  ['Reference', supplier.reference],
                  ['Name', supplier.name],
                  ['Type', supplier.type || 'General'],
                  ['Phone', supplier.phone || '—'],
                  ['Fax', supplier.fax || '—'],
                  ['Email', supplier.email || '—'],
                  ['Address', supplier.address || '—'],
                  ['Country', supplier.country || '—'],
                  ['State / Province', supplier.state_province || '—'],
                  ['NIF', supplier.nif || '—'],
                  ['NIS', supplier.nis || '—'],
                  ['RC', supplier.rc || '—'],
                  ['Star Rating', `${Number(supplier.star_rating || 0)} / 5`],
                  ['Website', supplier.website_url || '—'],
                  ['Created At', supplier.created_at ? new Date(supplier.created_at).toLocaleDateString('en-GB') : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <div className="mt-2 text-sm font-medium text-brand-navy">
                      {label === 'Reference' && value ? (
                        <button
                          type="button"
                          onClick={() => copyReference(value, 'Supplier reference')}
                          className="rounded-md border border-brand-gold bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                        >
                          {value}
                        </button>
                      ) : label === 'Website' && supplier.website_url ? (
                        <a href={supplier.website_url} target="_blank" rel="noreferrer" className="inline-flex text-brand-gold underline underline-offset-2">
                          {value}
                        </a>
                      ) : (
                        <span>{value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
              <h3 className="text-lg font-semibold text-brand-navy">Debt summary</h3>
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-600">Current supplier debt</p>
                <p className="mt-3 font-mono text-4xl font-semibold text-red-700">{formatCurrency(Number(supplier.supplier_debt || 0))}</p>
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy"
                >
                  <CircleDollarSign size={16} />
                  Pay Now
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'bookings') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          {supplier.bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
              No bookings linked to this supplier.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Client Name</th>
                      <th className="px-4 py-3">Package / Service</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Selling Price</th>
                      <th className="px-4 py-3">Cost Price</th>
                      <th className="px-4 py-3">Finish Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.bookings.map((booking) => (
                      <tr key={booking.id} className="border-t border-slate-200 text-sm text-slate-700">
                        <td className="px-4 py-3 font-medium text-brand-navy">{booking.clients?.full_name || 'Unknown Client'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {(() => {
                            if ((booking.service_type_names || []).length > 0) {
                              return booking.service_type_names.join(', ');
                            }

                            try {
                              const packages = typeof booking.package_lines === 'string'
                                ? JSON.parse(booking.package_lines)
                                : (booking.package_lines || []);

                              if (packages.length > 0) {
                                return packages.map((entry) => entry.package_name || 'Package').join(', ');
                              }

                              return '—';
                            } catch (error) {
                              return '—';
                            }
                          })()}
                        </td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : booking.status === 'paid' || booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{booking.status || 'Pending'}</span></td>
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

    if (activeTab === 'payments') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          {supplier.payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
              No payment history for this supplier.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-slate-200 text-sm text-slate-700">
                        <td className="px-4 py-3 font-mono font-semibold text-brand-navy">{formatCurrency(Number(payment.amount || 0))}</td>
                        <td className="px-4 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">{payment.payment_method || 'bank'}</span></td>
                        <td className="px-4 py-3">{payment.note || 'Supplier payment'}</td>
                        <td className="px-4 py-3">{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Running total payments</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800">{formatCurrency(totalPayments)}</p>
              </div>
            </>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/suppliers')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to suppliers
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate('/suppliers')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
            <Building2 size={16} />
            Edit Supplier
          </button>
          <button type="button" onClick={() => setPaymentModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy">
            <ReceiptText size={16} />
            Record Payment
          </button>
          <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
            <Plus size={16} />
            New Booking
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-navy text-2xl font-bold text-brand-gold">
              {getInitials(supplier.name)}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Supplier profile</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="font-serif text-4xl text-brand-navy">{supplier.name}</h2>
                {supplier.reference && (
                  <button
                    type="button"
                    onClick={() => copyReference(supplier.reference, 'Supplier reference')}
                    className="rounded-md border border-brand-gold bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                  >
                    {supplier.reference}
                  </button>
                )}
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${getTypeBadgeClass(supplier.type)}`}>
                  {supplier.type || 'General'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1 text-amber-500">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={`${supplier.id}-summary-${index}`}
                    size={16}
                    fill={index < Number(supplier.star_rating || 0) ? 'currentColor' : 'none'}
                    className={index < Number(supplier.star_rating || 0) ? 'text-amber-500' : 'text-slate-300'}
                  />
                ))}
              </div>

              {supplier.website_url && (
                <a href={supplier.website_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-gold underline underline-offset-2">
                  <Globe size={15} />
                  {supplier.website_url}
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Bookings</p>
              <p className="mt-2 font-mono text-xl font-semibold text-brand-navy">{totalBookings}</p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">Total Debt</p>
              <p className="mt-2 font-mono text-xl font-semibold text-red-700">{formatCurrency(Number(supplier.supplier_debt || 0))}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Star Rating</p>
              <p className="mt-2 font-mono text-xl font-semibold text-brand-navy">{Number(supplier.star_rating || 0)}/5</p>
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-xl border border-brand-gold bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-gold shadow-lg">
          {toast}
        </div>
      )}

      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-gold">Supplier payment</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">Record a payment</h3>
              </div>

              <button type="button" onClick={() => setPaymentModalOpen(false)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy" aria-label="Close payment modal">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier</label>
                <div className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy">
                  {supplier.name}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Current debt</label>
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 font-mono font-semibold text-red-600">
                  {formatCurrency(Number(supplier.supplier_debt || 0))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Bank Account</label>
                <select
                  value={paymentForm.account_id}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, account_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">Select account</option>
                  {(financialAccounts || []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label || account.bank_name || 'Account'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Note</label>
                <textarea
                  rows="3"
                  value={paymentForm.note}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Supplier payment note"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setPaymentModalOpen(false)} className="rounded-xl border border-slate-200 bg-brand-surface px-4 py-2.5 text-sm font-semibold text-brand-navy">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierDetail() {
  return (
    <SupplierDetailErrorBoundary>
      <SupplierDetailInner />
    </SupplierDetailErrorBoundary>
  );
}
