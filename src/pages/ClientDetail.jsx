import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  IdCard,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { computeStagesProgress } from '../lib/serviceWorkflow';

const getPassportValidityState = (dateString) => {
  if (!dateString) return { label: 'No expiry', tone: 'bg-slate-100 text-slate-700', status: 'valid' };

  const today = new Date();
  const expiryDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(expiryDate.getTime())) {
    return { label: 'Check date', tone: 'bg-slate-100 text-slate-700', status: 'valid' };
  }

  const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { label: 'Expired', tone: 'bg-red-100 text-red-700', status: 'expired' };
  }

  if (daysLeft <= 60) {
    return { label: 'Expiring Soon', tone: 'bg-amber-100 text-amber-700', status: 'expiring_soon' };
  }

  return { label: 'Valid', tone: 'bg-emerald-100 text-emerald-700', status: 'valid' };
};

const getAvatarInitials = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (['paid', 'completed', 'done', 'confirmed'].includes(normalized)) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (['pending', 'in_progress', 'processing', 'in progress'].includes(normalized)) {
    return 'bg-amber-100 text-amber-700';
  }

  if (['overdue', 'cancelled', 'rejected', 'expired'].includes(normalized)) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-700';
};

const formatMoney = (value) =>
  new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
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

  const loadClientDetails = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setClient(null);
        return;
      }

      const [clientResult, bookingsResult, invoicesResult, servicesResult, notesLogResult, serviceTypesResult] = await Promise.all([
        supabase.from('clients').select('*, reference').eq('id', clientId).maybeSingle(),
        supabase
          .from('bookings')
          .select('id, client_id, reference, status, selling_price, finish_date, created_at, package_id, service_id, package_lines, booking_service_lines(id, service_type_id, details, service_types(name))')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('id, client_id, booking_id, invoice_number, subtotal, apply_tva, tva_amount, grand_total, status, payment_method, payment_type, amount_paid, paid_at, account_id, is_expense, expense_category, reference, note, is_template, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('client_services')
          .select('id, client_id, template_id, created_at, stages_data')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('bookings')
          .select('id, reference, note, created_at, status')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase.from('service_types').select('id, name').order('name', { ascending: true }),
      ]);

      if (clientResult.error) throw clientResult.error;
      if (bookingsResult.error) throw bookingsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (notesLogResult.error) throw notesLogResult.error;
      if (serviceTypesResult.error) throw serviceTypesResult.error;

      const bookingIds = (bookingsResult.data || []).map((booking) => booking.id).filter(Boolean);
      const invoiceBookingIds = (invoicesResult.data || []).map((invoice) => invoice.booking_id).filter(Boolean);
      const packageIds = (bookingsResult.data || []).map((booking) => booking.package_id).filter(Boolean);
      const serviceTemplateIds = (bookingsResult.data || []).map((booking) => booking.service_id).filter(Boolean);
      const clientServiceTemplateIds = (servicesResult.data || []).map((row) => row.template_id).filter(Boolean);

      const [packageLookupResult, serviceTemplateLookupResult, bookingReferenceLookupResult, invoiceBookingReferenceLookupResult, clientServiceTemplateLookupResult] = await Promise.all([
        packageIds.length ? supabase.from('packages').select('id, title').in('id', packageIds) : { data: [], error: null },
        serviceTemplateIds.length ? supabase.from('service_templates').select('id, title').in('id', serviceTemplateIds) : { data: [], error: null },
        bookingIds.length ? supabase.from('bookings').select('id, reference').in('id', bookingIds) : { data: [], error: null },
        invoiceBookingIds.length ? supabase.from('bookings').select('id, reference').in('id', invoiceBookingIds) : { data: [], error: null },
        clientServiceTemplateIds.length ? supabase.from('service_templates').select('id, title').in('id', clientServiceTemplateIds) : { data: [], error: null },
      ]);

      if (packageLookupResult.error) throw packageLookupResult.error;
      if (serviceTemplateLookupResult.error) throw serviceTemplateLookupResult.error;
      if (bookingReferenceLookupResult.error) throw bookingReferenceLookupResult.error;
      if (invoiceBookingReferenceLookupResult.error) throw invoiceBookingReferenceLookupResult.error;
      if (clientServiceTemplateLookupResult.error) throw clientServiceTemplateLookupResult.error;

      const mainClient = clientResult.data || null;
      const serviceTypeMap = Object.fromEntries((serviceTypesResult.data || []).map((type) => [type.id, type.name]));
      const packageMap = Object.fromEntries((packageLookupResult.data || []).map((pkg) => [pkg.id, pkg]));
      const serviceTemplateMap = Object.fromEntries((serviceTemplateLookupResult.data || []).map((template) => [template.id, template]));
      const bookingReferenceMap = Object.fromEntries((bookingReferenceLookupResult.data || []).map((booking) => [booking.id, booking]));
      const invoiceBookingReferenceMap = Object.fromEntries((invoiceBookingReferenceLookupResult.data || []).map((booking) => [booking.id, booking]));
      const clientServiceTemplateMap = Object.fromEntries((clientServiceTemplateLookupResult.data || []).map((template) => [template.id, template]));

      const mappedServices = (servicesResult.data || []).map((row) => ({
        ...row,
        templateName: clientServiceTemplateMap[row.template_id]?.title || 'Untitled service',
        progress: computeStagesProgress(row.stages_data || []),
      }));

      const mappedBookings = (bookingsResult.data || []).map((booking) => ({
        ...booking,
        packageTitle: packageMap[booking.package_id]?.title || '—',
        serviceTitle: serviceTemplateMap[booking.service_id]?.title || '—',
        bookingReference: bookingReferenceMap[booking.id]?.reference || null,
        serviceTypeNames: [...new Set((booking.booking_service_lines || []).map((line) => line.service_types?.name || serviceTypeMap[line.service_type_id]).filter(Boolean))],
        detailRows: (booking.booking_service_lines || []).map((line) => ({
          id: line.id,
          serviceTypeName: line.service_types?.name || serviceTypeMap[line.service_type_id] || 'Service line',
          fields: Object.entries(typeof line.details === 'object' && line.details ? line.details : {}).map(([key, value]) => ({
            key,
            value,
          })),
        })),
      }));

      const invoiceNoteLog = (invoicesResult.data || []).map((invoice) => ({
        ...invoice,
        bookingReference: invoiceBookingReferenceMap[invoice.booking_id]?.reference || null,
      })).filter((invoice) => invoice.note && invoice.note.trim());
      const timeline = [
        ...((notesLogResult.data || []).map((booking) => ({
          id: booking.id,
          type: 'booking',
          label: booking.reference || `Booking #${booking.id.slice(0, 6)}`,
          note: booking.note,
          created_at: booking.created_at,
          status: booking.status,
        })) || []),
        ...invoiceNoteLog.map((invoice) => ({
          id: invoice.id,
          type: 'invoice',
          label: `Invoice #${invoice.invoice_number || invoice.id.slice(0, 6)}`,
          note: invoice.note,
          created_at: invoice.created_at,
          status: invoice.status,
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setClient({
        ...(mainClient || {}),
        bookings: mappedBookings,
        invoices: invoicesResult.data || [],
        services: mappedServices,
        noteTimeline: timeline,
      });
      setNotesDraft(mainClient?.notes || '');
    } catch (err) {
      setError(err.message || 'Unable to load client details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) {
      loadClientDetails();
    }
  }, [clientId]);

  const handleNotesBlur = async () => {
    if (!supabase || !clientId || notesDraft === (client?.notes || '')) return;

    try {
      setSavingNotes(true);
      const { error: updateError } = await supabase.from('clients').update({ notes: notesDraft }).eq('id', clientId);
      if (updateError) throw updateError;
      setClient((prev) => (prev ? { ...prev, notes: notesDraft } : prev));
    } catch (err) {
      setError(err.message || 'Unable to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const tabLabels = [
    { key: 'profile', label: 'Profile' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'notes', label: 'Notes' },
  ];

  const profileFields = useMemo(
    () => [
      { label: 'Reference', value: client?.reference },
      { label: 'Full Name', value: client?.full_name },
      { label: 'Phone', value: client?.phone },
      { label: 'Email', value: client?.email },
      { label: 'Address', value: client?.address },
      { label: 'Sex', value: client?.sex },
      { label: 'Birth Date', value: client?.birth_date },
      { label: 'Marital Status', value: client?.marital_status },
      { label: 'Civil Status', value: client?.civil_status },
      { label: 'Father Name', value: client?.father_name },
      { label: 'Mother Name', value: client?.mother_name },
      { label: 'Passport Number', value: client?.passport_number },
      { label: 'Passport Validity Date', value: client?.passport_validity_date },
      { label: 'Visa Location', value: client?.visa_location },
      { label: 'Passport Link', value: client?.passport_link },
    ],
    [client]
  );

  const totalPaidInvoices = (client?.invoices || []).reduce((sum, invoice) => {
    const status = String(invoice?.status || '').toLowerCase();
    if (status === 'paid') return sum + Number(invoice?.grand_total || 0);
    if (status === 'partial') return sum + Number(invoice?.amount_paid || 0);
    return sum;
  }, 0);

  const totalRemainingInvoices = (client?.invoices || []).reduce((sum, invoice) => {
    const status = String(invoice?.status || '').toLowerCase();
    if (status !== 'partial') return sum;
    return sum + Math.max(Number(invoice?.grand_total || 0) - Number(invoice?.amount_paid || 0), 0);
  }, 0);

  const getInvoiceSummary = (invoice) => {
    const grandTotal = Number(invoice?.grand_total || 0);
    const amountPaid = Number(invoice?.amount_paid || 0);
    const remaining = Math.max(grandTotal - amountPaid, 0);
    const percentPaid = grandTotal > 0 ? Math.min((amountPaid / grandTotal) * 100, 100) : 0;
    const normalizedStatus = String(invoice?.status || '').toLowerCase();

    return {
      grandTotal,
      amountPaid,
      remaining,
      percentPaid,
      isPaid: normalizedStatus === 'paid',
      isPending: normalizedStatus === 'pending',
      isPartial: normalizedStatus === 'partial' || (amountPaid > 0 && amountPaid < grandTotal),
    };
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">
        Loading client details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/clients')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to clients
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/clients')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to clients
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">
          Client not found.
        </div>
      </div>
    );
  }

  const passportState = getPassportValidityState(client.passport_validity_date);

  const renderTabContent = () => {
    if (activeTab === 'profile') {
      return (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
            <h3 className="text-lg font-semibold text-brand-navy">Client information</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {profileFields.map((field) => (
                <div key={field.label} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{field.label}</p>
                  <div className="mt-2 text-sm font-medium text-brand-navy">
                    {field.label === 'Reference' && field.value ? (
                      <button
                        type="button"
                        onClick={() => copyReference(field.value, 'Client reference')}
                        className="rounded-md border border-brand-gold bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                      >
                        {field.value}
                      </button>
                    ) : field.label === 'Passport Link' && field.value ? (
                      <a href={field.value} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-brand-gold bg-amber-50 px-3 py-1.5 text-xs font-semibold text-brand-navy hover:underline">
                        Open
                      </a>
                    ) : (
                      <span>{field.value || '—'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
            <h3 className="text-lg font-semibold text-brand-navy">Companions</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {Array.isArray(client.companions) && client.companions.length > 0 ? (
                client.companions.map((companion, index) => {
                  const companionName = companion?.full_name || companion?.relationship || `Companion ${index + 1}`;
                  return (
                    <span key={`${companionName}-${index}`} className="rounded-full border border-slate-200 bg-brand-surface px-2.5 py-1 text-xs font-medium text-brand-navy">
                      {companionName}
                    </span>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">No companions added.</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'bookings') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          {client.bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
              No bookings yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Service / Package</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Selling Price</th>
                    <th className="px-4 py-3">Finish Date</th>
                    <th className="px-4 py-3">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {client.bookings.map((booking) => (
                    <>
                      <tr key={booking.id} className="cursor-pointer border-t border-slate-200 text-sm text-slate-700 transition hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-brand-navy">{booking.reference || `#${booking.id.slice(0, 6)}`}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {(() => {
                            if ((booking.serviceTypeNames || []).length > 0) {
                              return booking.serviceTypeNames.join(', ');
                            }

                            try {
                              const packages = typeof booking.package_lines === 'string'
                                ? JSON.parse(booking.package_lines)
                                : (booking.package_lines || []);

                              if (packages.length > 0) {
                                return packages.map((entry) => entry.package_name || 'Package').join(', ');
                              }

                              return booking.serviceTitle || booking.packageTitle || '—';
                            } catch (error) {
                              return booking.serviceTitle || booking.packageTitle || '—';
                            }
                          })()}
                        </td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(booking.status)}`}>{booking.status || 'Pending'}</span></td>
                        <td className="px-4 py-3 font-mono text-brand-navy">{formatMoney(booking.selling_price)}</td>
                        <td className="px-4 py-3">{booking.finish_date ? new Date(`${booking.finish_date}T00:00:00`).toLocaleDateString('en-GB') : '—'}</td>
                        <td className="px-4 py-3">{booking.created_at ? new Date(booking.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>

                      {booking.detailRows && booking.detailRows.length > 0 && (
                        <tr key={`${booking.id}-details`}>
                          <td colSpan={6} className="px-4 pb-4">
                            <div className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                              {booking.detailRows.map((detailRow) => (
                                <div key={detailRow.id} className="rounded-xl border border-slate-200 bg-white p-3 first:mt-0 mt-3 first:mt-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-gold">{detailRow.serviceTypeName}</p>
                                  <div className="mt-3 space-y-2">
                                    {detailRow.fields.map((field) => (
                                      <div key={`${detailRow.id}-${field.key}`} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-brand-surface px-3 py-2 text-sm">
                                        <span className="font-medium text-brand-navy">{field.key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>
                                        <span className="text-right text-slate-700">{field.value === '' || field.value === null || field.value === undefined ? '—' : String(field.value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'invoices') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          {client.invoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface px-4 py-10 text-center text-sm text-slate-500">
              No invoices yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Invoice #</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Payment Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.invoices.map((invoice) => {
                      const summary = getInvoiceSummary(invoice);
                      const statusText = String(invoice.status || '').toLowerCase();
                      const badgeClass = statusText === 'paid'
                        ? 'bg-emerald-100 text-emerald-700'
                        : statusText === 'partial'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-yellow-100 text-yellow-700';

                      return (
                        <tr key={invoice.id} className="border-t border-slate-200 text-sm text-slate-700">
                          <td className="px-4 py-3 font-medium text-brand-navy">
                            <div>
                              <div>#{invoice.invoice_number || invoice.id.slice(0, 6)}</div>
                              {invoice.bookings?.reference && (
                                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{invoice.bookings.reference}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {summary.isPaid ? (
                              <div className="space-y-1">
                                <div className="font-mono font-semibold text-emerald-700">{formatMoney(summary.grandTotal)}</div>
                              </div>
                            ) : summary.isPending ? (
                              <div className="space-y-1">
                                <div className="font-mono font-semibold text-amber-700">{formatMoney(summary.grandTotal)}</div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="font-mono font-semibold text-emerald-700">Amount Paid: {formatMoney(summary.amountPaid)}</div>
                                <div className="font-mono font-semibold text-red-600">Remaining: {formatMoney(summary.remaining)}</div>
                                <div className="w-32 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${summary.percentPaid}%` }} />
                                </div>
                                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{Math.round(summary.percentPaid)}% paid</div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${badgeClass}`}>
                              {summary.isPaid ? 'PAID' : summary.isPending ? 'PENDING' : summary.isPartial ? 'PARTIAL' : (invoice.status || 'PENDING')}
                            </span>
                          </td>
                          <td className="px-4 py-3">{invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString('en-GB') : '—'}</td>
                          <td className="px-4 py-3">{invoice.payment_method || 'cash'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Total Paid</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800">{formatMoney(totalPaidInvoices)}</p>

                <div className="mt-4 border-t border-emerald-200 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">Total Remaining</p>
                  <p className="mt-2 font-mono text-xl font-semibold text-red-700">{formatMoney(totalRemainingInvoices)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          <label className="mb-2 block text-sm font-semibold text-brand-navy">Client notes</label>
          <textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            onBlur={handleNotesBlur}
            rows="7"
            className="w-full rounded-2xl border border-slate-200 bg-brand-surface px-3 py-3 text-sm text-brand-navy outline-none focus:border-brand-gold"
            placeholder="Add notes about the client, travel plans, or important details."
          />
          {savingNotes && <p className="mt-2 text-xs text-brand-gold">Saving notes...</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <NotebookPen size={18} className="text-brand-gold" />
            <h3 className="text-lg font-semibold text-brand-navy">Related notes log</h3>
          </div>

          {client.noteTimeline.length === 0 ? (
            <p className="text-sm text-slate-500">No booking or invoice notes available.</p>
          ) : (
            <div className="space-y-4">
              {client.noteTimeline.map((item) => (
                <div key={`${item.type}-${item.id}`} className="relative rounded-2xl border border-slate-200 bg-brand-surface p-4 pl-6 before:absolute before:left-3 before:top-5 before:h-3 before:w-3 before:rounded-full before:bg-brand-gold">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">{item.type === 'invoice' ? 'Invoice note' : 'Booking note'}</p>
                      <p className="mt-1 text-sm font-medium text-brand-navy">{item.label}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(item.status)}`}>
                      {item.status || 'Pending'}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.note || 'No note text available.'}</p>
                  <p className="mt-2 text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString('en-GB')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/clients')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} />
          Back to clients
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate('/clients')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
            <Pencil size={16} />
            Edit Client
          </button>
          <button type="button" onClick={() => navigate('/bookings')} className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy">
            <Plus size={16} />
            New Booking
          </button>
          <button type="button" onClick={() => navigate('/invoices')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
            <ReceiptText size={16} />
            New Invoice
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-navy text-2xl font-bold text-brand-gold">
              {getAvatarInitials(client.full_name)}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Client profile</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="font-serif text-4xl text-brand-navy">{client.full_name}</h2>
                {client.reference && (
                  <button
                    type="button"
                    onClick={() => copyReference(client.reference, 'Client reference')}
                    className="rounded-md border border-brand-gold bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                  >
                    {client.reference}
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-navy">
                {client.phone && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-brand-surface px-2.5 py-1"><Phone size={12} className="text-brand-gold" /> {client.phone}</span>
                )}
                {client.email && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-brand-surface px-2.5 py-1"><Mail size={12} className="text-brand-gold" /> {client.email}</span>
                )}
                {client.address && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-brand-surface px-2.5 py-1"><MapPin size={12} className="text-brand-gold" /> {client.address}</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Passport</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-brand-navy">{client.passport_number || '—'}</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${passportState.tone}`}>
                {passportState.label}
              </span>
            </div>
            {client.passport_validity_date && (
              <p className="mt-2 text-[11px] text-slate-500">Expires: {new Date(`${client.passport_validity_date}T00:00:00`).toLocaleDateString('en-GB')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabLabels.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-brand-navy text-white'
                  : 'text-brand-navy hover:bg-brand-surface'
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
    </div>
  );
}
