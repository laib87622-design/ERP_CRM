import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const normalizeClientTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const emptyCompanion = () => ({
  full_name: '',
  relationship: '',
  sex: '',
  birth_date: '',
  passport_number: '',
  passport_validity_date: '',
  passport_link: '',
  phone: '',
  email: '',
});

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  birth_date: '',
  sex: '',
  passport_number: '',
  passport_validity_date: '',
  notes: '',
  passport_link: '',
  father_name: '',
  mother_name: '',
  address: '',
  tags: [],
  companions: [],
};

const getPassportValidityState = (dateString) => {
  if (!dateString) {
    return { label: 'Valid', tone: 'text-emerald-700 bg-emerald-50', status: 'valid', daysLeft: null };
  }

  const today = new Date();
  const expiryDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(expiryDate.getTime())) {
    return { label: 'Check date', tone: 'text-slate-500 bg-slate-100', status: 'valid', daysLeft: null };
  }

  const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { label: 'Expired', tone: 'text-red-600 bg-red-50', status: 'expired', daysLeft };
  }

  if (daysLeft <= 60) {
    return { label: 'Expiring Soon', tone: 'text-amber-700 bg-amber-50', status: 'expiring_soon', daysLeft };
  }

  return { label: 'Valid', tone: 'text-emerald-700 bg-emerald-50', status: 'valid', daysLeft };
};

const getClientInitials = (fullName = '') => {
  const names = fullName.trim().split(/\s+/).filter(Boolean);

  if (names.length === 0) return 'CL';
  if (names.length === 1) return names[0].slice(0, 2).toUpperCase();

  return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
};

const isExpiredJwtError = (errorLike) => {
  const message = (errorLike?.message || errorLike || '').toString().toLowerCase();
  return (
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    message.includes('token expired') ||
    message.includes('authentication required') ||
    message.includes('401')
  );
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sexFilter, setSexFilter] = useState('All');
  const [maritalStatusFilter, setMaritalStatusFilter] = useState('All');
  const [passportStatusFilter, setPassportStatusFilter] = useState('All');
  const [sortMode, setSortMode] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tagOptions, setTagOptions] = useState([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [customTagDraft, setCustomTagDraft] = useState('');
  const [companions, setCompanions] = useState([emptyCompanion()]);
  const [clientMetrics, setClientMetrics] = useState({
    totalClients: 0,
    activeBookings: 0,
    expiringSoon: 0,
  });
  const [toast, setToast] = useState(null);
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

  const fetchTagOptions = async () => {
    if (!supabase) {
      setTagOptions([]);
      return;
    }

    try {
      const { data, error } = await supabase.from('clients').select('tags');
      if (error) throw error;

      const nextOptions = new Set();
      (data || []).forEach((row) => {
        normalizeClientTags(row.tags).forEach((tag) => {
          const cleanTag = tag.trim();
          if (cleanTag) {
            nextOptions.add(cleanTag);
          }
        });
      });

      setTagOptions(Array.from(nextOptions).sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      console.warn('Unable to load client tags:', error?.message || error);
      setTagOptions([]);
    }
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setClients([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('*')
        .order('full_name', { ascending: true });

      if (fetchError) throw fetchError;
      setClients(data || []);
    } catch (err) {
      setError(err.message || 'Unable to load clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchTagOptions();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setClientMetrics({ totalClients: 0, activeBookings: 0, expiringSoon: 0 });
      return;
    }

    const loadClientMetrics = async () => {
      try {
        const [{ data: bookingRows }, { data: clientRows }] = await Promise.all([
          supabase.from('bookings').select('client_id, status'),
          supabase.from('clients').select('id, passport_validity_date'),
        ]);

        const activeClientIds = new Set(
          (bookingRows || [])
            .filter((booking) => booking?.status && booking.status !== 'cancelled')
            .map((booking) => booking.client_id)
            .filter(Boolean)
        );

        const expiringSoonCount = (clientRows || []).filter((client) => {
          const status = getPassportValidityState(client.passport_validity_date).status;
          return status === 'expiring_soon';
        }).length;

        setClientMetrics({
          totalClients: (clientRows || []).length,
          activeBookings: activeClientIds.size,
          expiringSoon: expiringSoonCount,
        });
      } catch (error) {
        console.warn('Unable to load client metrics:', error?.message || error);
      }
    };

    loadClientMetrics();
  }, [clients]);

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const nextClients = clients.filter((client) => {
      const haystack = [
        client.full_name,
        client.phone,
        client.passport_number,
        client.reference,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesSex = sexFilter === 'All' || (client.sex || '').trim().toLowerCase() === sexFilter.toLowerCase();
      const matchesMaritalStatus =
        maritalStatusFilter === 'All' ||
        (client.marital_status || '').trim().toLowerCase() === maritalStatusFilter.toLowerCase();

      const passportStatus = getPassportValidityState(client.passport_validity_date).status;
      const matchesPassportStatus =
        passportStatusFilter === 'All' ||
        (passportStatusFilter === 'valid' && passportStatus === 'valid') ||
        (passportStatusFilter === 'expiring_soon' && passportStatus === 'expiring_soon') ||
        (passportStatusFilter === 'expired' && passportStatus === 'expired');

      return matchesSearch && matchesSex && matchesMaritalStatus && matchesPassportStatus;
    });

    return nextClients.sort((a, b) => {
      if (sortMode === 'name') {
        return (a.full_name || '').localeCompare(b.full_name || '');
      }

      if (sortMode === 'passport') {
        const aDate = a.passport_validity_date ? new Date(`${a.passport_validity_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.passport_validity_date ? new Date(`${b.passport_validity_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      }

      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [clients, maritalStatusFilter, passportStatusFilter, searchTerm, sexFilter, sortMode]);

  const openCreateModal = () => {
    setSelectedClient(null);
    setForm(emptyForm);
    setCustomTagDraft('');
    setTagMenuOpen(false);
    setCompanions([emptyCompanion()]);
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (client) => {
    const clientTags = normalizeClientTags(client.tags);
    setSelectedClient(client);
    setForm({
      ...emptyForm,
      ...client,
      tags: clientTags,
      companions: Array.isArray(client.companions) ? client.companions : [],
    });
    setCustomTagDraft('');
    setTagMenuOpen(false);
    setCompanions(
      Array.isArray(client.companions) && client.companions.length > 0
        ? client.companions.map((companion) => ({
            full_name: companion.full_name || '',
            relationship: companion.relationship || '',
            sex: companion.sex || '',
            birth_date: companion.birth_date || '',
            passport_number: companion.passport_number || '',
            passport_validity_date: companion.passport_validity_date || '',
            passport_link: companion.passport_link || '',
            phone: companion.phone || '',
            email: companion.email || '',
          }))
        : [emptyCompanion()]
    );
    setError('');
    setIsModalOpen(true);
  };

  const addCompanion = () => {
    setCompanions((prev) => [...prev, emptyCompanion()]);
  };

  const removeCompanion = (index) => {
    setCompanions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCompanionChange = (index, field, value) => {
    setCompanions((prev) =>
      prev.map((companion, idx) =>
        idx === index ? { ...companion, [field]: value } : companion
      )
    );
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTagSelection = (tag) => {
    setForm((prev) => {
      const currentTags = normalizeClientTags(prev.tags);
      const nextTags = currentTags.includes(tag)
        ? currentTags.filter((existingTag) => existingTag !== tag)
        : [...currentTags, tag];

      return { ...prev, tags: nextTags };
    });
  };

  const addCustomTag = () => {
    const nextTag = customTagDraft.trim();
    if (!nextTag) {
      return;
    }

    setTagOptions((prev) => Array.from(new Set([...prev, nextTag])));
    setForm((prev) => {
      const currentTags = normalizeClientTags(prev.tags);
      return {
        ...prev,
        tags: currentTags.includes(nextTag) ? currentTags : [...currentTags, nextTag],
      };
    });
    setCustomTagDraft('');
    setTagMenuOpen(false);
  };

  const removeTag = (tagToRemove) => {
    setForm((prev) => ({
      ...prev,
      tags: normalizeClientTags(prev.tags).filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const cleanedCompanions = companions
      .map((companion) => ({
        full_name: companion.full_name?.trim() || '',
        relationship: companion.relationship?.trim() || '',
        sex: companion.sex?.trim() || '',
        birth_date: companion.birth_date || '',
        passport_number: companion.passport_number?.trim() || '',
        passport_validity_date: companion.passport_validity_date || '',
        passport_link: companion.passport_link?.trim() || '',
        phone: companion.phone?.trim() || '',
        email: companion.email?.trim() || '',
      }))
      .filter((companion) => Object.values(companion).some((value) => value !== ''));

    const payload = {
      ...form,
      full_name: form.full_name?.trim(),
      phone: form.phone?.trim(),
      email: form.email?.trim(),
      birth_date: form.birth_date || null,
      sex: form.sex?.trim() || '',
      passport_number: form.passport_number?.trim(),
      passport_validity_date: form.passport_validity_date || null,
      notes: form.notes?.trim(),
      passport_link: form.passport_link?.trim(),
      country: form.country?.trim(),
      city: form.city?.trim(),
      address: form.address?.trim(),
      tags: normalizeClientTags(form.tags),
      companions: cleanedCompanions,
    };

    try {
      setSaving(true);
      setError('');

      if (selectedClient?.id) {
        const { error: updateError } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', selectedClient.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('clients').insert([payload]);
        if (insertError) throw insertError;
      }

      setIsModalOpen(false);
      setSelectedClient(null);
      setForm(emptyForm);
      setTagMenuOpen(false);
      setCustomTagDraft('');
      setCompanions([emptyCompanion()]);
      await Promise.all([fetchClients(), fetchTagOptions()]);
    } catch (err) {
      if (isExpiredJwtError(err)) {
        if (supabase) {
          await supabase.auth.signOut();
        }
        setError('Your session has expired. Please log in again.');
        return;
      }

      setError(err.message || 'Unable to save client.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client?')) {
      return;
    }

    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      const { error: deleteError } = await supabase.from('clients').delete().eq('id', clientId);
      if (deleteError) throw deleteError;

      await fetchClients();
    } catch (err) {
      setError(err.message || 'Unable to delete client.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">CRM</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Clients</h2>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy shadow-sm transition hover:bg-[#b3933b]"
        >
          <Plus size={18} />
          New Client
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Clients</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-navy">{clientMetrics.totalClients}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <p className="text-sm text-slate-500">Clients with Active Bookings</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-navy">{clientMetrics.activeBookings}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Passports Expiring Soon</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-800">{clientMetrics.expiringSoon}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, reference, phone, or passport"
            className="w-full rounded-xl border border-slate-200 bg-brand-surface py-3 pl-10 pr-4 text-brand-navy outline-none transition placeholder:text-slate-400 focus:border-brand-gold"
          />
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-xl border border-brand-gold bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-gold shadow-lg">
          {toast}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {['All', 'Male', 'Female'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSexFilter(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  sexFilter === option ? 'bg-brand-gold text-brand-navy' : 'border border-slate-200 bg-white text-brand-navy hover:border-brand-gold'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={maritalStatusFilter}
              onChange={(event) => setMaritalStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="All">All</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
            </select>

            <select
              value={passportStatusFilter}
              onChange={(event) => setPassportStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="All">All</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring Soon (&lt; 60 days)</option>
              <option value="expired">Expired</option>
            </select>

            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
              className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
            >
              <option value="newest">Newest First</option>
              <option value="name">Name A–Z</option>
              <option value="passport">Passport Expiry</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Passport</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading clients...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="px-5 py-10 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-5 py-10 text-center text-sm text-slate-500">
                    No clients found.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const passportState = getPassportValidityState(client.passport_validity_date);
                  const initials = getClientInitials(client.full_name);

                  return (
                    <tr
                      key={client.id}
                      className="cursor-pointer border-t border-slate-200 text-sm text-slate-700 transition hover:bg-slate-50"
                      onClick={() => navigate(`/clients/${client.id}`)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-brand-gold">
                            {initials}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-brand-navy">{client.full_name}</span>
                            {client.reference && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyReference(client.reference, 'Client reference');
                                }}
                                className="w-fit rounded-md border border-brand-gold bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand-navy"
                              >
                                {client.reference}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">{client.phone || '—'}</td>
                      <td className="px-5 py-4">{client.email || '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span>{client.passport_number || '—'}</span>
                          <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${passportState.tone}`}>
                            {passportState.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(client);
                            }}
                            className="rounded-lg bg-brand-surface p-2 text-brand-navy transition hover:bg-slate-200"
                            aria-label={`Edit ${client.full_name}`}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(client.id);
                            }}
                            className="rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                            aria-label={`Delete ${client.full_name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">
                  {selectedClient ? 'Edit client' : 'New client'}
                </p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">
                  {selectedClient ? selectedClient.full_name : 'Create Client'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedClient(null);
                  setError('');
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close client form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Full name</label>
                  <input
                    value={form.full_name}
                    onChange={(event) => handleFieldChange('full_name', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(event) => handleFieldChange('phone', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => handleFieldChange('email', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Tags</label>
                  <div className="relative">
                    <div
                      onClick={() => setTagMenuOpen((prev) => !prev)}
                      className="flex min-h-[56px] w-full cursor-pointer flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-brand-surface px-3 py-2 text-brand-navy outline-none transition focus-within:border-brand-gold"
                    >
                      {normalizeClientTags(form.tags).length === 0 ? (
                        <span className="text-sm text-slate-400">Select tags</span>
                      ) : (
                        normalizeClientTags(form.tags).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeTag(tag);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-[#c9a84c] px-2.5 py-1 text-xs font-semibold text-brand-navy"
                          >
                            {tag}
                            <X size={12} />
                          </button>
                        ))
                      )}
                    </div>

                    {tagMenuOpen && (
                      <div className="absolute z-10 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                        <div className="max-h-56 space-y-1 overflow-y-auto">
                          {tagOptions.length === 0 ? (
                            <div className="px-2 py-3 text-sm text-slate-500">No saved tags yet</div>
                          ) : (
                            tagOptions.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  toggleTagSelection(tag);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm ${
                                  normalizeClientTags(form.tags).includes(tag)
                                    ? 'bg-[#fff7dd] text-brand-navy'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <span>{tag}</span>
                                {normalizeClientTags(form.tags).includes(tag) && <span className="text-xs font-bold text-brand-navy">✓</span>}
                              </button>
                            ))
                          )}

                          <div className="mt-2 border-t border-slate-200 pt-2">
                            <button
                              type="button"
                              onClick={() => setTagMenuOpen(false)}
                              className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-left text-sm text-slate-600"
                            >
                              Other...
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <input
                            value={customTagDraft}
                            onChange={(event) => setCustomTagDraft(event.target.value)}
                            placeholder="Enter custom tag"
                            className="flex-1 rounded-lg border border-slate-200 bg-brand-surface px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                          />
                          <button
                            type="button"
                            onClick={addCustomTag}
                            className="rounded-lg bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Birth date</label>
                  <input
                    type="date"
                    value={form.birth_date || ''}
                    onChange={(event) => handleFieldChange('birth_date', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Sex</label>
                  <select
                    value={form.sex}
                    onChange={(event) => handleFieldChange('sex', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Passport number</label>
                  <input
                    value={form.passport_number}
                    onChange={(event) => handleFieldChange('passport_number', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Passport validity date</label>
                  <input
                    type="date"
                    value={form.passport_validity_date || ''}
                    onChange={(event) => handleFieldChange('passport_validity_date', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Google Drive Passport Link</label>
                  <input
                    value={form.passport_link}
                    onChange={(event) => handleFieldChange('passport_link', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                    placeholder="https://drive.google.com/..."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Country</label>
                  <input
                    value={form.country || ''}
                    onChange={(event) => handleFieldChange('country', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">City</label>
                  <input
                    value={form.city || ''}
                    onChange={(event) => handleFieldChange('city', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Address</label>
                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(event) => handleFieldChange('address', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Notes</label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => handleFieldChange('notes', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-brand-navy">Additional Clients</h4>
                    <p className="text-sm text-slate-500">Companions saved in the JSONB companions array</p>
                  </div>

                  <button
                    type="button"
                    onClick={addCompanion}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
                  >
                    <Plus size={16} />
                    Add Companion
                  </button>
                </div>

                <div className="space-y-4">
                  {companions.map((companion, index) => (
                    <div key={`${index}-companion`} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                          Companion {index + 1}
                        </p>

                        {companions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCompanion(index)}
                            className="rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                            aria-label={`Remove companion ${index + 1}`}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Full name</label>
                          <input
                            value={companion.full_name}
                            onChange={(event) => handleCompanionChange(index, 'full_name', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Relationship</label>
                          <input
                            value={companion.relationship}
                            onChange={(event) => handleCompanionChange(index, 'relationship', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Sex</label>
                          <select
                            value={companion.sex}
                            onChange={(event) => handleCompanionChange(index, 'sex', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          >
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Birth date</label>
                          <input
                            type="date"
                            value={companion.birth_date || ''}
                            onChange={(event) => handleCompanionChange(index, 'birth_date', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Passport number</label>
                          <input
                            value={companion.passport_number}
                            onChange={(event) => handleCompanionChange(index, 'passport_number', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Passport validity</label>
                          <input
                            type="date"
                            value={companion.passport_validity_date || ''}
                            onChange={(event) => handleCompanionChange(index, 'passport_validity_date', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Passport Link</label>
                          <input
                            value={companion.passport_link}
                            onChange={(event) => handleCompanionChange(index, 'passport_link', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Phone</label>
                          <input
                            value={companion.phone}
                            onChange={(event) => handleCompanionChange(index, 'phone', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-brand-navy">Email</label>
                          <input
                            type="email"
                            value={companion.email}
                            onChange={(event) => handleCompanionChange(index, 'email', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedClient(null);
                    setError('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : selectedClient ? 'Save Changes' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
