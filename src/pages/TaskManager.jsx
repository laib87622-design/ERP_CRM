import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, PencilLine, Plus, Trash2, X, Upload, CheckCircle2, Clock3, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

const emptyRequestForm = {
  client_name: '',
  destination: '',
  number_of_persons: '',
  budget: '',
  service_type: '',
  source_of_request: '',
  end_date: '',
  agent: '',
  order_status: 'Pending',
  note: '',
  file: null,
};

const statusOptions = ['Pending', 'Active', 'Converted', 'Closed', 'On Hold', 'Cancelled'];

const normalizeStatus = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'pending';

  if (['pending', 'active', 'in_progress', 'new', 'open', 'processing', 'on hold', 'hold'].includes(text)) {
    return 'active';
  }

  if (['converted', 'closed', 'won', 'completed', 'done', 'approved'].includes(text)) {
    return 'closed';
  }

  return 'active';
};

const formatCurrency = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return '—';

  return `${new Intl.NumberFormat('fr-DZ', {
    maximumFractionDigits: 0,
  }).format(numericValue)} DA`;
};

const formatDate = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function TaskManager() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewAll, setCanViewAll] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('ALL');
  const [filters, setFilters] = useState({
    client: '',
    destination: '',
    service: '',
    status: '',
    budget: '',
    endDate: '',
  });
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [tempNote, setTempNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalRequestId, setProposalRequestId] = useState(null);
  const [proposalForm, setProposalForm] = useState({
    title: '',
    amount: '',
    notes: '',
  });
  const [mode, setMode] = useState('create');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyRequestForm);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [customService, setCustomService] = useState('');
  const [customSource, setCustomSource] = useState('');

  const stats = useMemo(() => {
    const total = requests.length;
    const active = requests.filter((request) => normalizeStatus(request.order_status) === 'active').length;
    const closed = requests.filter((request) => normalizeStatus(request.order_status) === 'closed').length;

    return { total, active, closed };
  }, [requests]);

  const uniqueDestinations = [...new Set(requests.map((request) => request.destination).filter(Boolean))];
  const uniqueServices = [...new Set(requests.map((request) => request.service_type).filter(Boolean))];
  const uniqueSources = [...new Set(requests.map((request) => request.source_of_request).filter(Boolean))];

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((previousFilters) => ({ ...previousFilters, [name]: value }));
  };

  const filteredRequests = useMemo(() => requests.filter((request) => {
    const matchesClient = String(request.client_name || '').toLowerCase().includes(filters.client.toLowerCase());
    const matchesDestination = String(request.destination || '').toLowerCase().includes(filters.destination.toLowerCase());
    const matchesService = String(request.service_type || '').toLowerCase().includes(filters.service.toLowerCase());
    const matchesStatus = !filters.status || String(request.order_status || '').toLowerCase() === filters.status.toLowerCase();
    const matchesBudget = String(request.budget ?? '').includes(filters.budget);
    const matchesEndDate = !filters.endDate || String(request.end_date || '').split('T')[0] === filters.endDate;

    return matchesClient && matchesDestination && matchesService && matchesStatus && matchesBudget && matchesEndDate;
  }), [requests, filters]);

  const loadAgents = async () => {
    if (!supabase) {
      setAgents([]);
      return;
    }

    const { data, error: agentsError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name', { ascending: true });

    if (agentsError) throw agentsError;
    setAgents((data || []).map((agent) => ({ id: agent.id, full_name: agent.full_name || 'Agent' })));
  };

  const loadRequests = useCallback(async (userId, allowAll, agentFilter) => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setRequests([]);
        return;
      }

      if (!userId) {
        setRequests([]);
        return;
      }

      let query = supabase
        .from('client_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!allowAll) {
        query = query.eq('agent_id', userId);
      } else if (agentFilter !== 'ALL') {
        query = query.eq('agent_id', agentFilter);
      }

      const { data, error: requestsError } = await query;

      if (requestsError) throw requestsError;
      setRequests(data || []);
    } catch (err) {
      setError(err.message || 'Unable to load client requests.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadUserAccess = async () => {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        setLoading(false);
        return;
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const user = userData?.user;
        if (!user) {
          setCurrentUser(null);
          setLoading(false);
          return;
        }

        const [{ data: profile, error: profileError }] = await Promise.all([
          supabase.from('profiles').select('role, permissions').eq('id', user.id).maybeSingle(),
          loadAgents(),
        ]);

        if (profileError) throw profileError;
        if (!isActive) return;

        const allowAll = profile?.role === 'super_admin'
          || Boolean(profile?.permissions?.finance && profile?.permissions?.settings);
        setCurrentUser({ ...user, role: profile?.role || 'viewer', permissions: profile?.permissions || {} });
        setCanViewAll(allowAll);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || 'Unable to load task access.');
        setCurrentUser(null);
        setCanViewAll(false);
        setLoading(false);
      }
    };

    loadUserAccess();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadRequests(currentUser.id, canViewAll, selectedAgentFilter);
  }, [currentUser?.id, canViewAll, selectedAgentFilter, loadRequests]);

  const handleSaveNote = async (taskId) => {
    if (!supabase || !taskId) return;

    try {
      const { error: noteError } = await supabase
        .from('client_requests')
        .update({ note: tempNote })
        .eq('id', taskId);

      if (noteError) throw noteError;

      setRequests((previousRequests) => previousRequests.map((request) => (
        request.id === taskId ? { ...request, note: tempNote } : request
      )));
      setEditingNoteId(null);
      setTempNote('');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save note.');
    }
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setMode('create');
    setEditingId(null);
    setForm(emptyRequestForm);
    setEmail('');
    setPhone('');
    setCustomDestination('');
    setCustomService('');
    setCustomSource('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowRequestModal(true);
  };

  const openEditModal = (request) => {
    setMode('edit');
    setEditingId(request.id);
    setForm({
      client_name: request.client_name || '',
      destination: request.destination || '',
      number_of_persons: request.number_of_persons ?? '',
      budget: request.budget ?? '',
      service_type: request.service_type || '',
      source_of_request: request.source_of_request || '',
      end_date: request.end_date ? request.end_date.split('T')[0] : '',
      agent: request.agent_id || request.agent || request.agent_name || '',
      order_status: request.order_status || 'Pending',
      note: request.note || '',
      file: null,
    });
    setEmail(request.email || '');
    setPhone(request.phone || '');
    setCustomDestination(request.destination && !uniqueDestinations.includes(request.destination) ? request.destination : '');
    setCustomService(request.service_type && !uniqueServices.includes(request.service_type) ? request.service_type : '');
    setCustomSource(request.source_of_request && !uniqueSources.includes(request.source_of_request) ? request.source_of_request : '');
    setShowRequestModal(true);
  };

  const handleCreateProposal = (request) => {
    if (request?.id) {
      navigate(`/proposals/${request.id}`);
      return;
    }

    setProposalRequestId(request.id);
    setProposalForm({
      title: `${request.client_name || 'Client'} Proposal`,
      amount: request.budget || '',
      notes: `Proposal for ${request.service_type || 'service'} request.`,
    });
    setShowProposalModal(true);
  };

  const uploadRequestFile = async (file) => {
    if (!file || !supabase) return null;

    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const filePath = `client_requests/${safeName}`;

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client_request_files')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.warn('Attachment upload failed:', uploadError.message);
        return null;
      }

      const { data: publicUrl } = supabase.storage.from('client_request_files').getPublicUrl(uploadData.path);
      return publicUrl?.publicUrl || null;
    } catch (uploadException) {
      console.warn('Attachment upload exception:', uploadException);
      return null;
    }
  };

  const handleSaveRequest = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet.');
      return;
    }

    const destinationValue = form.destination === 'custom' ? customDestination.trim() : form.destination.trim();
    const serviceValue = form.service_type === 'custom' ? customService.trim() : form.service_type.trim();
    const sourceValue = form.source_of_request === 'custom' ? customSource.trim() : form.source_of_request.trim();

    const payload = {
      client_name: form.client_name.trim(),
      destination: destinationValue,
      number_of_persons: form.number_of_persons === '' ? null : Number(form.number_of_persons),
      budget: form.budget === '' ? null : Number(form.budget),
      service_type: serviceValue,
      source_of_request: sourceValue,
      end_date: form.end_date || null,
      order_status: form.order_status || 'Pending',
      note: form.note.trim(),
      email: email.trim(),
      phone: phone.trim(),
    };

    if (form.agent && form.agent.trim()) {
      payload.agent_id = form.agent.trim();
    }

    if (!payload.client_name || (!payload.email && !payload.phone) || !payload.destination || !payload.service_type) {
      setError('Client Name, Email or Phone, Destination, and Service Type are required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const uploadedUrl = form.file ? await uploadRequestFile(form.file) : null;
      if (uploadedUrl) {
        payload.attachment_url = uploadedUrl;
      }

      let saveError = null;

      if (mode === 'edit' && editingId) {
        const { error } = await supabase.from('client_requests').update(payload).eq('id', editingId);
        saveError = error;
      } else {
        const { error } = await supabase.from('client_requests').insert([payload]);
        saveError = error;
      }

      if (saveError && uploadedUrl) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.attachment_url;

        if (mode === 'edit' && editingId) {
          const { error: fallbackError } = await supabase
            .from('client_requests')
            .update(fallbackPayload)
            .eq('id', editingId);
          saveError = fallbackError;
        } else {
          const { error: fallbackError } = await supabase.from('client_requests').insert([fallbackPayload]);
          saveError = fallbackError;
        }
      }

      if (saveError) throw saveError;

      setShowRequestModal(false);
      resetForm();
      await loadRequests();
    } catch (err) {
      setError(err.message || 'Unable to save request.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('Delete this request?')) return;

    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      const { error: deleteError } = await supabase.from('client_requests').delete().eq('id', requestId);
      if (deleteError) throw deleteError;

      await loadRequests();
    } catch (err) {
      setError(err.message || 'Unable to delete request.');
    }
  };

  const handleCreateProposalSubmit = async (event) => {
    event.preventDefault();

    if (!proposalRequestId) return;

    setShowProposalModal(false);
    setProposalRequestId(null);
    setProposalForm({ title: '', amount: '', notes: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">CRM</p>
          <h1 className="mt-2 font-serif text-4xl text-brand-navy">Task Manager</h1>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-200 transition hover:bg-brand-gold hover:text-brand-navy"
        >
          <Plus size={17} /> New Task
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Total Requests</span>
            <span className="rounded-full bg-slate-100 p-2 text-slate-700"><FileText size={16} /></span>
          </div>
          <p className="mt-5 text-4xl font-bold text-brand-navy">{stats.total}</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Pending / Active</span>
            <span className="rounded-full bg-amber-100 p-2 text-amber-700"><Clock3 size={16} /></span>
          </div>
          <p className="mt-5 text-4xl font-bold text-brand-navy">{stats.active}</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-brand-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Converted / Closed</span>
            <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 size={16} /></span>
          </div>
          <p className="mt-5 text-4xl font-bold text-brand-navy">{stats.closed}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={`grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 ${canViewAll ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
        <input
          type="text"
          name="client"
          placeholder="Filter Client..."
          value={filters.client}
          onChange={handleFilterChange}
          className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        />
        <input
          type="date"
          name="endDate"
          value={filters.endDate}
          onChange={handleFilterChange}
          aria-label="Filter by end date"
          className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        />
        <input
          type="text"
          name="destination"
          placeholder="Filter Destination..."
          value={filters.destination}
          onChange={handleFilterChange}
          className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        />
        <input
          type="text"
          name="service"
          placeholder="Filter Service..."
          value={filters.service}
          onChange={handleFilterChange}
          className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        />
        <input
          type="number"
          name="budget"
          placeholder="Filter Budget..."
          value={filters.budget}
          onChange={handleFilterChange}
          className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        />
        <select
          name="status"
          value={filters.status}
          onChange={handleFilterChange}
          className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        {canViewAll && (
          <select
            value={selectedAgentFilter}
            onChange={(event) => setSelectedAgentFilter(event.target.value)}
            className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
            aria-label="Filter tasks by agent"
          >
            <option value="ALL">All Agents</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-brand-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Destination</th>
                <th className="px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Budget</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">End Date</th>
                <th className="px-4 py-3 font-semibold">Note</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                    Loading requests...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                    {requests.length === 0 ? 'No requests found.' : 'No requests match these filters.'}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <tr key={request.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-brand-navy">{request.client_name || '—'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {request.email || request.phone ? `${request.email || ''}${request.email && request.phone ? ' • ' : ''}${request.phone || ''}`.trim() : 'No contact'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{request.destination || '—'}</td>
                    <td className="px-4 py-4 text-slate-600">{request.service_type || '—'}</td>
                    <td className="px-4 py-4 text-slate-600">{formatCurrency(request.budget)}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          normalizeStatus(request.order_status) === 'closed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {request.order_status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(request.end_date)}</td>
                    <td className="max-w-xs px-4 py-3 align-top text-sm">
                      {editingNoteId === request.id ? (
                        <textarea
                          autoFocus
                          value={tempNote}
                          onChange={(event) => setTempNote(event.target.value)}
                          onBlur={() => handleSaveNote(request.id)}
                          rows={3}
                          className="w-full min-w-40 rounded-md border border-slate-200 p-2 text-slate-700 shadow-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-amber-500/20"
                          aria-label={`Edit note for ${request.client_name || 'request'}`}
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingNoteId(request.id);
                            setTempNote(request.note || '');
                          }}
                          className="group min-h-10 cursor-text truncate rounded-md p-2 text-slate-600 transition-all hover:whitespace-normal hover:bg-slate-50"
                          title="Click to edit note"
                        >
                          {request.note || <span className="italic text-slate-400">Click to add note...</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(request)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold"
                        >
                          <PencilLine size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(request.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateProposal(request)}
                          className="inline-flex items-center gap-1 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-gold hover:text-brand-navy"
                        >
                          <Sparkles size={14} /> Create Proposal
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-3xl text-brand-navy">
                {mode === 'edit' ? 'Edit Request' : 'New Request'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowRequestModal(false);
                  resetForm();
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRequest} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Client Name</span>
                  <input value={form.client_name} onChange={(e) => handleFieldChange('client_name', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="Client Name" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="client@email.com" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Phone</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="+123456789" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Destination</span>
                  <select value={form.destination || ''} onChange={(e) => handleFieldChange('destination', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white">
                    <option value="">Select destination</option>
                    {uniqueDestinations.map((destination, index) => (
                      <option key={`${destination}-${index}`} value={destination}>{destination}</option>
                    ))}
                    <option value="custom">Other...</option>
                  </select>
                  {form.destination === 'custom' && (
                    <input
                      value={customDestination}
                      onChange={(e) => setCustomDestination(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                      placeholder="Enter custom destination"
                    />
                  )}
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Number of Persons</span>
                  <input type="number" min="1" value={form.number_of_persons} onChange={(e) => handleFieldChange('number_of_persons', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="2" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Budget</span>
                  <input type="number" min="0" value={form.budget} onChange={(e) => handleFieldChange('budget', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="5000" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Service Type</span>
                  <select value={form.service_type || ''} onChange={(e) => handleFieldChange('service_type', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white">
                    <option value="">Select service type</option>
                    {uniqueServices.map((service, index) => (
                      <option key={`${service}-${index}`} value={service}>{service}</option>
                    ))}
                    <option value="custom">Other...</option>
                  </select>
                  {form.service_type === 'custom' && (
                    <input
                      value={customService}
                      onChange={(e) => setCustomService(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                      placeholder="Enter custom service type"
                    />
                  )}
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Source of Request</span>
                  <select value={form.source_of_request || ''} onChange={(e) => handleFieldChange('source_of_request', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white">
                    <option value="">Select source</option>
                    {uniqueSources.map((source, index) => (
                      <option key={`${source}-${index}`} value={source}>{source}</option>
                    ))}
                    <option value="custom">Other...</option>
                  </select>
                  {form.source_of_request === 'custom' && (
                    <input
                      value={customSource}
                      onChange={(e) => setCustomSource(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                      placeholder="Enter custom source"
                    />
                  )}
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>End Date</span>
                  <input type="date" value={form.end_date} onChange={(e) => handleFieldChange('end_date', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Agent</span>
                  <select value={form.agent} onChange={(e) => handleFieldChange('agent', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white">
                    <option value="">Select agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id || agent.full_name} value={agent.id || agent.full_name}>
                        {agent.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Order Status</span>
                  <select value={form.order_status} onChange={(e) => handleFieldChange('order_status', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white">
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                  <span>File Upload</span>
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                    <Upload size={18} className="text-slate-500" />
                    <input type="file" onChange={(e) => handleFieldChange('file', e.target.files?.[0] || null)} className="w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
                  </div>
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                  <span>Note</span>
                  <textarea value={form.note} onChange={(e) => handleFieldChange('note', e.target.value)} rows="4" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white" placeholder="Additional notes" />
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowRequestModal(false); resetForm(); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-70">
                  {saving ? 'Saving...' : mode === 'edit' ? 'Update Request' : 'Save Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Proposal</p>
                <h3 className="mt-2 font-serif text-3xl text-brand-navy">Create Proposal</h3>
              </div>
              <button type="button" onClick={() => setShowProposalModal(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProposalSubmit} className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                Request ID: <span className="font-semibold text-slate-800">{proposalRequestId}</span>
              </div>

              <label className="block space-y-2 text-sm font-medium text-slate-700">
                <span>Proposal Title</span>
                <input
                  value={proposalForm.title}
                  onChange={(e) => setProposalForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                  placeholder="Proposal title"
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-700">
                <span>Proposal Amount</span>
                <input
                  type="number"
                  min="0"
                  value={proposalForm.amount}
                  onChange={(e) => setProposalForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                  placeholder="2500"
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-700">
                <span>Notes</span>
                <textarea
                  rows="4"
                  value={proposalForm.notes}
                  onChange={(e) => setProposalForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                  placeholder="Proposal details"
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowProposalModal(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy">
                  Save Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
