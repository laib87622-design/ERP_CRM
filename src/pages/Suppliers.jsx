import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronUp, Plus, Star, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { isDuplicateSupplierPayment, processSupplierPayment } from '../lib/financialAudit';

const defaultSupplierTypes = ['General', 'Hotel', 'Airline', 'Transport', 'Tour Operator', 'Visa', 'Insurance', 'Agency', 'Other'];

const resolveSupplierType = (value, customValue) => {
  const baseValue = String(value || '').trim();
  if (!baseValue) return 'General';

  if (baseValue === 'Other') {
    const customType = String(customValue || '').trim();
    return customType || 'General';
  }

  return baseValue;
};

const emptySupplierForm = {
  name: '',
  type: 'General',
  phone: '',
  fax: '',
  address: '',
  country: '',
  state_province: '',
  email: '',
  nif: '',
  nis: '',
  rc: '',
  website_url: '',
  star_rating: '0',
  supplier_debt: '0',
};

const isValidWebsiteUrl = (value) => {
  if (!value || !value.trim()) return true;

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
};

const emptyPaymentForm = {
  amount: '',
  account_id: '',
  note: '',
};

const typeBadgeStyles = {
  Airline: 'bg-blue-100 text-blue-700',
  Hotel: 'bg-violet-100 text-violet-700',
  Platform: 'bg-emerald-100 text-emerald-700',
  default: 'bg-slate-100 text-slate-700',
};

const getTypeBadgeClass = (type) => {
  if (type === 'Airline') return typeBadgeStyles.Airline;
  if (type === 'Hotel') return typeBadgeStyles.Hotel;
  if (type === 'Platform') return typeBadgeStyles.Platform;
  return typeBadgeStyles.default;
};

const getDebtBadge = (value) => {
  const amount = Number(value) || 0;
  if (amount === 0) {
    return {
      label: 'Clear',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  return {
    label: 'Warning',
    className: 'bg-red-100 text-red-700',
  };
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState(null);
  const [form, setForm] = useState(emptySupplierForm);
  const [customTypeValue, setCustomTypeValue] = useState('');
  const [supplierTypeOptions, setSupplierTypeOptions] = useState(defaultSupplierTypes);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedStarFilter, setSelectedStarFilter] = useState('All');
  const [sortMode, setSortMode] = useState('debt');
  const [expandedSupplierId, setExpandedSupplierId] = useState(null);
  const [supplierBookings, setSupplierBookings] = useState({});
  const [toast, setToast] = useState(null);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const navigate = useNavigate();

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

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setSuppliers([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('suppliers')
        .select('id, name, reference, phone, fax, address, country, state_province, email, nif, nis, rc, website_url, star_rating, supplier_debt, bookings_count, created_at')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;

      const nextOptions = Array.from(new Set([...defaultSupplierTypes])).filter((value) => value && value.length > 0);

      setSuppliers((data || []).map((supplier) => ({ ...supplier, type: supplier.type || 'General' })));
      setSupplierTypeOptions(nextOptions);
    } catch (err) {
      setError(err.message || 'Unable to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const loadFinancialAccounts = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, label, bank_name, current_balance, currency')
        .order('label', { ascending: true });

      if (!error) setFinancialAccounts(data || []);
    };

    loadFinancialAccounts();
  }, []);

  useEffect(() => {
    if (!suppliers.length || !supabase) {
      setSupplierBookings({});
      return;
    }

    const loadRecentBookings = async () => {
      try {
        const supplierIds = suppliers.map((supplier) => supplier.id);

        const { data, error } = await supabase
          .from('booking_service_lines')
          .select('supplier_id, booking_id, bookings(id, reference, status, created_at, clients(full_name))')
          .in('supplier_id', supplierIds);

        if (error) {
          console.warn('Unable to load recent supplier bookings:', error.message || error);
          setSupplierBookings({});
          return;
        }

        const grouped = {};
        (data || []).forEach((row) => {
          const booking = row.bookings;
          if (!row.supplier_id || !booking || !booking.id) return;
          if (!grouped[row.supplier_id]) grouped[row.supplier_id] = [];

          grouped[row.supplier_id].push({
            id: booking.id,
            reference: booking.reference || `Booking #${String(booking.id).slice(0, 6)}`,
            status: booking.status || 'pending',
            created_at: booking.created_at,
            finish_date: booking.created_at,
            selling_price: 0,
            client_name: booking.clients?.full_name || 'Unknown Client',
          });
        });

        Object.keys(grouped).forEach((supplierId) => {
          grouped[supplierId] = grouped[supplierId]
            .slice(0, 3)
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        });

        setSupplierBookings(grouped);
      } catch (err) {
        console.warn('Recent supplier bookings failed to load:', err?.message || err);
        setSupplierBookings({});
      }
    };

    loadRecentBookings();
  }, [suppliers]);

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));

    if (field === 'type' && value !== 'Other') {
      setCustomTypeValue('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) return;

    if (!form.name.trim()) {
      setError('Supplier name is required.');
      return;
    }

    if (!isValidWebsiteUrl(form.website_url)) {
      setError('Website URL must be a valid http or https link.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const resolvedType = resolveSupplierType(form.type, customTypeValue);

      const payload = {
        name: form.name.trim(),
        type: resolvedType,
        phone: form.phone.trim() || null,
        fax: form.fax.trim() || null,
        address: form.address.trim() || null,
        country: form.country.trim() || null,
        state_province: form.state_province.trim() || null,
        email: form.email.trim() || null,
        nif: form.nif.trim() || null,
        nis: form.nis.trim() || null,
        rc: form.rc.trim() || null,
        website_url: form.website_url.trim() || null,
        star_rating: Number(form.star_rating) || 0,
        supplier_debt: Number(form.supplier_debt) || 0,
      };

      const insertPayload = { ...payload, type: resolvedType || 'General' };

      let { error: insertError } = await supabase.from('suppliers').insert([insertPayload]);
      if (insertError && /suppliers\.type|not-null|column .*type.* does not exist|type.*does not exist/i.test(insertError.message || '')) {
        const fallbackPayload = { ...insertPayload, type: 'General' };
        const fallbackResult = await supabase.from('suppliers').insert([fallbackPayload]);
        insertError = fallbackResult.error;
      }

      if (insertError && /column .*type.* does not exist|type.*does not exist/i.test(insertError.message || '')) {
        const fallbackPayload = { ...insertPayload };
        delete fallbackPayload.type;
        const fallbackResult = await supabase.from('suppliers').insert([fallbackPayload]);
        insertError = fallbackResult.error;
      }

      if (insertError) throw insertError;

      setIsModalOpen(false);
      setCustomTypeValue('');
      setForm(emptySupplierForm);
      await fetchSuppliers();
    } catch (err) {
      setError(err.message || 'Unable to create supplier.');
    } finally {
      setSaving(false);
    }
  };

  const updateFinancialAccountBalance = async (accountType, deltaAmount) => {
    if (!supabase || !accountType) return;

    const normalizedDelta = Number(deltaAmount) || 0;
    if (normalizedDelta === 0) return;

    const safeAccountType = String(accountType || '').toLowerCase();
    const { data: accounts, error: fetchError } = await supabase
      .from('financial_accounts')
      .select('id, label, current_balance, bank_name')
      .order('label', { ascending: true });

    if (fetchError) throw fetchError;

    const targetAccount = (accounts || []).find((account) => {
      const label = String(account.label || account.bank_name || '').toLowerCase();
      if (safeAccountType.includes('cash')) return label.includes('cash') || label.includes('wallet');
      if (safeAccountType.includes('credit')) return label.includes('credit') || label.includes('card');
      if (safeAccountType.includes('baridi') || safeAccountType.includes('mob')) return label.includes('baridi') || label.includes('mob');
      return label.includes(safeAccountType);
    }) || (accounts || [])[0];

    if (!targetAccount) return;

    const nextBalance = Number(targetAccount.current_balance || 0) + normalizedDelta;
    const { error: updateError } = await supabase
      .from('financial_accounts')
      .update({ current_balance: nextBalance })
      .eq('id', targetAccount.id);

    if (updateError) throw updateError;
  };

  const filteredSuppliers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return [...suppliers]
      .filter((supplier) => {
        const textMatches = !query || [supplier.name, supplier.reference].filter(Boolean).join(' ').toLowerCase().includes(query);
        const typeMatches = selectedType === 'All' || (supplier.type || 'General') === selectedType;

        const ratingValue = Number(supplier.star_rating || 0);
        const starMatches =
          selectedStarFilter === 'All' ||
          (selectedStarFilter === '3★+' && ratingValue >= 3) ||
          (selectedStarFilter === '4★+' && ratingValue >= 4) ||
          (selectedStarFilter === '5★ only' && ratingValue === 5);

        return textMatches && typeMatches && starMatches;
      })
      .sort((a, b) => {
        if (sortMode === 'bookings') {
          return Number(b.bookings_count || 0) - Number(a.bookings_count || 0);
        }

        if (sortMode === 'rating') {
          return Number(b.star_rating || 0) - Number(a.star_rating || 0);
        }

        return Number(b.supplier_debt || 0) - Number(a.supplier_debt || 0);
      });
  }, [searchTerm, selectedStarFilter, selectedType, sortMode, suppliers]);

  const summaryCards = useMemo(() => {
    const totalSuppliers = suppliers.length;
    const totalBookings = suppliers.reduce((sum, supplier) => sum + Number(supplier.bookings_count || 0), 0);
    const totalDebt = suppliers.reduce((sum, supplier) => sum + Number(supplier.supplier_debt || 0), 0);

    return [
      { label: 'Total Suppliers', value: totalSuppliers },
      { label: 'Total Bookings', value: totalBookings },
      { label: 'Total Supplier Debt', value: formatCurrency(totalDebt), accent: 'text-red-600' },
    ];
  }, [suppliers]);

  const handleSupplierPayment = async (event) => {
    event.preventDefault();

    if (!supabase || !selectedSupplierForPayment) {
      setError('Please select a supplier before recording a payment.');
      return;
    }

    const amount = Number(paymentForm.amount);
    const accountId = paymentForm.account_id || financialAccounts[0]?.id || '';

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (!accountId) {
      setError('Please select a bank account before paying the supplier.');
      return;
    }

    const currentDebt = Number(selectedSupplierForPayment.supplier_debt || 0);
    const amountToApply = Math.min(amount, currentDebt || amount);

    if (!currentDebt || amountToApply <= 0) {
      setError('This supplier has no debt to pay.');
      return;
    }

    try {
      setPaymentSaving(true);
      setError('');

      const alreadyRecorded = await isDuplicateSupplierPayment({
        supabase,
        supplierId: selectedSupplierForPayment.id,
        amount: amountToApply,
        method: 'cash',
        note: paymentForm.note.trim() || 'Supplier payment',
      });

      if (alreadyRecorded) {
        setError('This supplier payment was already recorded. No duplicate ledger entry was created.');
        setIsPaymentModalOpen(false);
        setSelectedSupplierForPayment(null);
        setPaymentForm(emptyPaymentForm);
        await fetchSuppliers();
        return;
      }

      await processSupplierPayment({
        supabase,
        supplierId: selectedSupplierForPayment.id,
        accountId,
        amount: amountToApply,
        method: 'cash',
        note: paymentForm.note.trim() || 'Supplier payment',
        supplierName: selectedSupplierForPayment.name,
      });

      setIsPaymentModalOpen(false);
      setSelectedSupplierForPayment(null);
      setPaymentForm(emptyPaymentForm);
      await fetchSuppliers();
    } catch (err) {
      setError(err.message || 'Unable to record supplier payment.');
    } finally {
      setPaymentSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Directory
          </p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Suppliers</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
        >
          <Plus size={18} />
          New Supplier
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className={`mt-3 font-mono text-3xl font-semibold tracking-tight ${card.accent || 'text-brand-navy'}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex-1">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search supplier name or reference"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {['All', 'Hotel', 'Airline', 'Platform', 'Other'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  selectedType === type ? 'bg-brand-gold text-brand-navy' : 'border border-slate-200 bg-white text-brand-navy hover:border-brand-gold'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedStarFilter}
              onChange={(event) => setSelectedStarFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="All">All</option>
              <option value="3★+">3★+</option>
              <option value="4★+">4★+</option>
              <option value="5★ only">5★ only</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {[
              { key: 'debt', label: 'Sort by Debt ↓' },
              { key: 'bookings', label: 'Sort by Bookings ↓' },
              { key: 'rating', label: 'Sort by Rating ↓' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSortMode(option.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  sortMode === option.key ? 'bg-brand-gold text-brand-navy' : 'border border-slate-200 bg-white text-brand-navy hover:border-brand-gold'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
            <Building2 size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-brand-navy">Supplier directory</h3>
            <p className="text-sm text-slate-500">Hotels, airlines, and B2B partners</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Star Rating</th>
                <th className="px-5 py-3">Bookings</th>
                <th className="px-5 py-3 text-red-600">Supplier Debt</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-5 py-10 text-center text-sm text-slate-500">
                    No suppliers found.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const isExpanded = expandedSupplierId === supplier.id;
                  const debtBadge = getDebtBadge(supplier.supplier_debt);
                  const recentBookings = supplierBookings[supplier.id] || [];

                  return (
                    <Fragment key={supplier.id}>
                      <tr
                        className="cursor-pointer border-t border-slate-200 text-sm text-slate-700 transition hover:bg-slate-50"
                        onClick={() => setExpandedSupplierId((current) => (current === supplier.id ? null : supplier.id))}
                      >
                        <td className="px-5 py-4 font-medium text-brand-navy">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/suppliers/${supplier.id}`);
                              }}
                              className="text-left font-medium text-brand-navy transition hover:text-brand-gold"
                            >
                              {supplier.name}
                            </button>
                            {supplier.reference && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyReference(supplier.reference, 'Vendor code');
                                }}
                                className="rounded-md border border-brand-gold bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                              >
                                {supplier.reference}
                              </button>
                            )}
                            {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getTypeBadgeClass(supplier.type || 'General')}`}>
                            {supplier.type || 'General'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {supplier.website_url ? (
                            <a
                              href={supplier.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-full border border-brand-gold bg-amber-50 px-2.5 py-1 text-xs font-semibold text-brand-navy underline-offset-2 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open site
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 text-amber-500">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${supplier.id}-star-${index}`}
                                size={14}
                                fill={index < Number(supplier.star_rating || 0) ? 'currentColor' : 'none'}
                                className={index < Number(supplier.star_rating || 0) ? 'text-amber-500' : 'text-slate-300'}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">{supplier.bookings_count ?? 0}</td>
                        <td className="px-5 py-4">
                          {Number(supplier.supplier_debt || 0) === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                              <CheckCircle2 size={12} />
                              Clear
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-red-600">
                                {formatCurrency(Number(supplier.supplier_debt) || 0)}
                              </span>
                              {Number(supplier.supplier_debt || 0) > 500000 && (
                                <AlertTriangle size={14} className="text-red-600" />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSupplierForPayment(supplier);
                              setPaymentForm({
                                amount: String(Number(supplier.supplier_debt || 0)),
                                note: '',
                                account_id: financialAccounts[0]?.id || '',
                              });
                              setError('');
                              setIsPaymentModalOpen(true);
                            }}
                            className="rounded-lg border border-slate-200 bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={!Number(supplier.supplier_debt || 0)}
                          >
                            Pay Debt
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1.1fr]">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Website</p>
                                  {supplier.website_url ? (
                                    <a
                                      href={supplier.website_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-flex text-sm font-medium text-brand-gold underline underline-offset-2"
                                    >
                                      {supplier.website_url}
                                    </a>
                                  ) : (
                                    <p className="mt-1 text-sm text-slate-500">—</p>
                                  )}
                                </div>

                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Created</p>
                                  <p className="mt-1 text-sm font-medium text-brand-navy">
                                    {supplier.created_at
                                      ? new Date(supplier.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                      : '—'}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recent bookings</p>
                                <div className="mt-2 space-y-2">
                                  {recentBookings.length === 0 ? (
                                    <p className="text-sm text-slate-500">No recent bookings.</p>
                                  ) : (
                                    recentBookings.map((booking) => (
                                      <button
                                        key={booking.id}
                                        type="button"
                                        onClick={() => navigate(`/bookings/${booking.id}`)}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-brand-surface px-3 py-2 text-left transition hover:border-brand-gold hover:bg-amber-50"
                                      >
                                        <div>
                                          <p className="text-sm font-medium text-brand-navy">{booking.reference || `Booking #${String(booking.id).slice(0, 6)}`}</p>
                                          <p className="text-[11px] text-slate-500">{booking.client_name || 'Unknown Client'}</p>
                                        </div>
                                        <div className="text-right">
                                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                            booking.status === 'cancelled'
                                              ? 'bg-red-100 text-red-700'
                                              : booking.status === 'confirmed'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700'
                                          }`}>
                                            {booking.status || 'Pending'}
                                          </span>
                                          <p className="mt-1 text-[11px] text-slate-500">
                                            {booking.finish_date
                                              ? new Date(`${booking.finish_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                              : booking.created_at
                                                ? new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                : 'No date'}
                                          </p>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-xl border border-brand-gold bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-gold shadow-lg">
          {toast}
        </div>
      )}

      {isPaymentModalOpen && selectedSupplierForPayment && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Supplier payment</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">Settle Debt</h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setSelectedSupplierForPayment(null);
                  setPaymentForm(emptyPaymentForm);
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close payment form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSupplierPayment} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier</label>
                <div className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy">
                  {selectedSupplierForPayment.name}
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
                <label className="mb-1 block text-sm font-medium text-brand-navy">Current debt</label>
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 font-mono font-semibold text-red-600">
                  {formatCurrency(Number(selectedSupplierForPayment.supplier_debt || 0))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Amount to pay (DZD)</label>
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
                  value={paymentForm.note}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))}
                  rows="3"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  placeholder="Supplier settlement note"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsPaymentModalOpen(false);
                    setSelectedSupplierForPayment(null);
                    setPaymentForm(emptyPaymentForm);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={paymentSaving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {paymentSaving ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">New supplier</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">Create Supplier</h3>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close supplier form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-gold">Identity</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier name</label>
                    <input
                      value={form.name}
                      onChange={(event) => handleFieldChange('name', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Type</label>
                    <select
                      value={form.type}
                      onChange={(event) => handleFieldChange('type', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    >
                      {supplierTypeOptions.map((typeOption) => (
                        <option key={typeOption} value={typeOption}>
                          {typeOption}
                        </option>
                      ))}
                    </select>

                    {form.type === 'Other' && (
                      <input
                        value={customTypeValue}
                        onChange={(event) => setCustomTypeValue(event.target.value)}
                        placeholder="Enter custom supplier type"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Star rating</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.5"
                      value={form.star_rating}
                      onChange={(event) => handleFieldChange('star_rating', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-gold">Contact</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
                    <input
                      value={form.phone}
                      onChange={(event) => handleFieldChange('phone', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Fax</label>
                    <input
                      value={form.fax}
                      onChange={(event) => handleFieldChange('fax', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => handleFieldChange('email', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label className="block text-sm font-medium text-brand-navy">Website URL</label>
                      {form.website_url.trim() && isValidWebsiteUrl(form.website_url) && (
                        <a
                          href={form.website_url.trim()}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-brand-gold underline underline-offset-2"
                        >
                          Preview
                        </a>
                      )}
                    </div>
                    <input
                      type="url"
                      value={form.website_url}
                      onChange={(event) => handleFieldChange('website_url', event.target.value)}
                      placeholder="https://example.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                    {!isValidWebsiteUrl(form.website_url) && form.website_url.trim() && (
                      <p className="mt-2 text-xs text-red-600">Please enter a valid http or https URL.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-gold">Location</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Address</label>
                    <textarea
                      value={form.address}
                      onChange={(event) => handleFieldChange('address', event.target.value)}
                      rows="3"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Country</label>
                    <input
                      value={form.country}
                      onChange={(event) => handleFieldChange('country', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">State / Province</label>
                    <input
                      value={form.state_province}
                      onChange={(event) => handleFieldChange('state_province', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-gold">Legal IDs</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">NIF</label>
                    <input
                      value={form.nif}
                      onChange={(event) => handleFieldChange('nif', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">NIS</label>
                    <input
                      value={form.nis}
                      onChange={(event) => handleFieldChange('nis', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">RC</label>
                    <input
                      value={form.rc}
                      onChange={(event) => handleFieldChange('rc', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-navy">Supplier debt (DZD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.supplier_debt}
                      onChange={(event) => handleFieldChange('supplier_debt', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Create Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
