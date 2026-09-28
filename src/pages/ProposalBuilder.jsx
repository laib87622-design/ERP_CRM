import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Printer } from 'lucide-react';
import airvoyLogo from '../assets/airvoy.jpeg';
import { supabase } from '../lib/supabase';

const emptyProposal = {
  requirement_checklist: '',
  destination: '',
  visa: '',
  transportation: '',
  accommodation: '',
  assurance: '',
  add_inclusions: '',
  total_price: '',
};

const defaultEnabledFields = {
  destination: true,
  visa: true,
  transportation: true,
  accommodation: true,
  assurance: true,
};

export default function ProposalBuilder({ request_id }) {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const resolvedRequestId = request_id || requestId;

  const [request, setRequest] = useState(null);
  const [proposal, setProposal] = useState(emptyProposal);
  const [checklist, setChecklist] = useState([]);
  const [inclusions, setInclusions] = useState([]);
  const [enabledFields, setEnabledFields] = useState(defaultEnabledFields);
  const [checklistInput, setChecklistInput] = useState('');
  const [inclusionInput, setInclusionInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const value = Number(proposal.total_price || 0);
    const amount = Number.isFinite(value) ? value : 0;
    return `${new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(amount)} DA`;
  }, [proposal.total_price]);

  useEffect(() => {
    const loadProposalData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase || !resolvedRequestId) {
          setRequest(null);
          setProposal(emptyProposal);
          setLoading(false);
          return;
        }

        const [requestRes, proposalRes] = await Promise.all([
          supabase
            .from('client_requests')
            .select('id, client_name, email, phone, destination, service_type, budget, order_status')
            .eq('id', resolvedRequestId)
            .maybeSingle(),
          supabase.from('proposals').select('*').eq('request_id', resolvedRequestId).maybeSingle(),
        ]);

        if (requestRes.error) throw requestRes.error;
        if (proposalRes.error) throw proposalRes.error;

        setRequest(requestRes.data || null);

        const loadedChecklist = Array.isArray(proposalRes.data?.requirement_check_list)
          ? proposalRes.data.requirement_check_list
          : Array.isArray(proposalRes.data?.requirement_checklist)
            ? proposalRes.data.requirement_checklist
            : [];

        const loadedInclusions = Array.isArray(proposalRes.data?.add_inclusions)
          ? proposalRes.data.add_inclusions
          : [];

        const loadedEnabledFields = {
          ...defaultEnabledFields,
          ...(proposalRes.data?.enabled_fields || {}),
        };

        if (proposalRes.data) {
          setProposal({
            requirement_checklist: proposalRes.data.requirement_checklist || '',
            destination: proposalRes.data.destination || requestRes.data?.destination || '',
            visa: proposalRes.data.visa || '',
            transportation: proposalRes.data.transportation || '',
            accommodation: proposalRes.data.accommodation || '',
            assurance: proposalRes.data.assurance || '',
            add_inclusions: proposalRes.data.add_inclusions || '',
            total_price: proposalRes.data.total_price ?? '',
          });
          setChecklist(loadedChecklist.length ? loadedChecklist : []);
          setInclusions(loadedInclusions.length ? loadedInclusions : []);
          setEnabledFields(loadedEnabledFields);
        } else {
          setProposal((prev) => ({
            ...prev,
            destination: requestRes.data?.destination || '',
            total_price: requestRes.data?.budget || '',
          }));
          setChecklist([]);
          setInclusions([]);
          setEnabledFields(defaultEnabledFields);
        }
      } catch (err) {
        setError(err.message || 'Unable to load proposal data.');
      } finally {
        setLoading(false);
      }
    };

    loadProposalData();
  }, [resolvedRequestId]);

  const updateField = (field, value) => {
    setProposal((prev) => ({ ...prev, [field]: value }));
  };

  const addChecklistItem = () => {
    const trimmed = checklistInput.trim();
    if (!trimmed) return;

    setChecklist((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed, isDone: false }]);
    setChecklistInput('');
  };

  const addInclusionItem = () => {
    const trimmed = inclusionInput.trim();
    if (!trimmed) return;

    setInclusions((prev) => [...prev, trimmed]);
    setInclusionInput('');
  };

  const toggleChecklistItem = (id) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, isDone: !item.isDone } : item)));
  };

  const removeChecklistItem = (id) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  };

  const removeInclusionItem = (index) => {
    setInclusions((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const toggleField = (field) => {
    setEnabledFields((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!supabase || !resolvedRequestId) {
      setError('Supabase is not configured or the request id is missing.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setStatusMessage('');

      const payload = {
        request_id: resolvedRequestId,
        requirement_check_list: checklist,
        destination: proposal.destination,
        visa: proposal.visa,
        transportation: proposal.transportation,
        accommodation: proposal.accommodation,
        assurance: proposal.assurance,
        add_inclusions: inclusions,
        total_price: proposal.total_price === '' ? null : Number(proposal.total_price),
        enabled_fields: enabledFields,
      };

      const { data: existingProposal } = await supabase
        .from('proposals')
        .select('id')
        .eq('request_id', resolvedRequestId)
        .maybeSingle();

      let saveError = null;

      if (existingProposal?.id) {
        const { error } = await supabase.from('proposals').update(payload).eq('id', existingProposal.id);
        saveError = error;
      } else {
        const { error } = await supabase.from('proposals').insert([payload]);
        saveError = error;
      }

      if (saveError) throw saveError;

      setStatusMessage('Proposal saved successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save proposal.');
    } finally {
      setSaving(false);
    }
  };

  if (!resolvedRequestId) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Request id is required to build the proposal.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .proposal-print-shell {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
            background: #fff !important;
          }

          .proposal-form-panel,
          .proposal-topbar,
          .proposal-action-bar {
            display: none !important;
          }
        }
      `}</style>

      <div className="proposal-topbar flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="proposal-action-bar flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold"
          >
            <Printer size={16} /> Print Proposal
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.15fr]">
        <form onSubmit={handleSave} className="proposal-form-panel space-y-5 rounded-3xl border border-slate-200 bg-brand-card p-5 shadow-sm print:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Proposal Builder</p>
            <h1 className="mt-2 font-serif text-4xl text-brand-navy">Request #{resolvedRequestId.slice(0, 8)}</h1>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {statusMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</div>
          )}

          <div className="space-y-3 text-sm font-medium text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span>Requirement Checklist</span>
            </div>
            <div className="flex gap-2">
              <input
                value={checklistInput}
                onChange={(event) => setChecklistInput(event.target.value)}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                placeholder="Add checklist item"
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="rounded-xl bg-brand-navy px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy"
              >
                Add Item
              </button>
            </div>

            <div className="space-y-2">
              {checklist.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No checklist items added yet.
                </div>
              ) : (
                checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      onChange={() => toggleChecklistItem(item.id)}
                      className="h-4 w-4 accent-brand-navy"
                    />
                    <span className={`flex-1 ${item.isDone ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(item.id)}
                      className="text-xs font-semibold text-red-600 transition hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { key: 'destination', label: 'Destination', value: proposal.destination, onChange: (event) => updateField('destination', event.target.value) },
              { key: 'visa', label: 'Visa', value: proposal.visa, onChange: (event) => updateField('visa', event.target.value) },
              { key: 'transportation', label: 'Transportation', value: proposal.transportation, onChange: (event) => updateField('transportation', event.target.value) },
              { key: 'accommodation', label: 'Accommodation', value: proposal.accommodation, onChange: (event) => updateField('accommodation', event.target.value) },
            ].map(({ key, label, value, onChange }) => (
              <label key={key} className="block space-y-2 text-sm font-medium text-slate-700">
                <span className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <input
                      type="checkbox"
                      checked={enabledFields[key]}
                      onChange={() => toggleField(key)}
                      className="h-3.5 w-3.5 accent-brand-navy"
                    />
                    On
                  </label>
                </span>
                <input
                  value={value}
                  onChange={onChange}
                  disabled={!enabledFields[key]}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            ))}

            <label className="block space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              <span className="flex items-center justify-between gap-2">
                <span>Assurance</span>
                <label className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <input
                    type="checkbox"
                    checked={enabledFields.assurance}
                    onChange={() => toggleField('assurance')}
                    className="h-3.5 w-3.5 accent-brand-navy"
                  />
                  On
                </label>
              </span>
              <input
                value={proposal.assurance}
                onChange={(event) => updateField('assurance', event.target.value)}
                disabled={!enabledFields.assurance}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>

          <div className="space-y-3 text-sm font-medium text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span>Add Inclusions</span>
            </div>
            <div className="flex gap-2">
              <input
                value={inclusionInput}
                onChange={(event) => setInclusionInput(event.target.value)}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
                placeholder="Add inclusion"
              />
              <button
                type="button"
                onClick={addInclusionItem}
                className="rounded-xl bg-brand-navy px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy"
              >
                Add Inclusion
              </button>
            </div>

            <div className="space-y-2">
              {inclusions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No inclusions added yet.
                </div>
              ) : (
                inclusions.map((item, index) => (
                  <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-700">{item}</span>
                    <button
                      type="button"
                      onClick={() => removeInclusionItem(index)}
                      className="text-xs font-semibold text-red-600 transition hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Total Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={proposal.total_price}
              onChange={(event) => updateField('total_price', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder="0.00"
            />
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold"
            >
              <Printer size={16} /> Print
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving...' : 'Save Proposal'}
            </button>
          </div>
        </form>

        <div className="proposal-print-shell print:block print:p-0 print:shadow-none print:bg-white print:border-0">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
            <div className="border-b border-slate-200 bg-gradient-to-r from-[#0f172a] via-[#13213c] to-[#1b2d4a] p-6 text-white print:bg-white print:p-4 print:text-slate-900">
              <div className="flex items-center justify-between gap-4 print:items-start">
                <div className="flex items-center gap-4">
                  <img src={airvoyLogo} alt="Airvoy logo" className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-md" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand-gold">AIRVOY</p>
                    <h2 className="mt-1 font-serif text-3xl text-white print:text-brand-navy">Travel Proposal</h2>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right backdrop-blur-sm print:border-slate-200 print:bg-slate-50">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-brand-gold print:text-brand-gold">Total</div>
                  <div className="mt-1 text-xl font-bold text-white print:text-brand-navy">{totals}</div>
                </div>
              </div>
            </div>

            <div className="space-y-6 bg-[radial-gradient(circle_at_top,rgba(240,185,70,0.10),transparent_35%)] p-6 print:p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <InfoCard label="Client" value={request?.client_name || 'Client Name'} />
                <InfoCard
                  label="Contact"
                  value={
                    request?.email || request?.phone
                      ? `${request.email || ''}${request.email && request.phone ? ' / ' : ''}${request.phone || ''}`.trim()
                      : 'No contact provided'
                  }
                />
                <InfoCard label="Reference" value={`#${resolvedRequestId?.slice(0, 8) || 'N/A'}`} />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 print:border-slate-200 print:bg-white">
                <div className="mb-3 flex items-center gap-2 text-brand-navy">
                  <FileText size={16} />
                  <h3 className="text-lg font-semibold">Trip Overview</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {enabledFields.destination && proposal.destination ? <InfoRow label="Destination" value={proposal.destination} /> : null}
                  {enabledFields.visa && proposal.visa ? <InfoRow label="Visa" value={proposal.visa} /> : null}
                  {enabledFields.transportation && proposal.transportation ? <InfoRow label="Transportation" value={proposal.transportation} /> : null}
                  {enabledFields.accommodation && proposal.accommodation ? <InfoRow label="Accommodation" value={proposal.accommodation} /> : null}
                  {enabledFields.assurance && proposal.assurance ? <InfoRow label="Assurance" value={proposal.assurance} /> : null}
                  <InfoRow label="Service Type" value={request?.service_type || '—'} />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 print:hidden print:border-slate-200">
                <div className="mb-3 flex items-center gap-2 text-brand-navy">
                  <FileText size={16} />
                  <h3 className="text-lg font-semibold">Requirement Checklist</h3>
                </div>
                {checklist.length === 0 ? (
                  <p className="text-sm text-slate-500">No requirement checklist items added.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {checklist.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={item.isDone} readOnly className="h-4 w-4 accent-brand-navy" />
                        <span className={item.isDone ? 'line-through text-slate-500' : ''}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 print:border-slate-200">
                <div className="mb-3 flex items-center gap-2 text-brand-navy">
                  <FileText size={16} />
                  <h3 className="text-lg font-semibold">Add Inclusions</h3>
                </div>
                {inclusions.length === 0 ? (
                  <p className="text-sm text-slate-500">No additional inclusions listed.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm leading-7 text-slate-700">
                    {inclusions.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-3xl border border-brand-gold/30 bg-amber-50 p-4 print:border-brand-gold/30 print:bg-amber-50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Proposal Total</div>
                    <div className="mt-2 text-sm text-slate-700">Estimated total for the proposed package</div>
                  </div>
                  <div className="text-2xl font-bold text-brand-navy">{totals}</div>
                </div>
              </div>

              <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-4 print:border-t print:pt-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Prepared By</div>
                  <div className="mt-2 text-sm font-semibold text-brand-navy">AIRVOY Travel & Visa Services</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Signature</div>
                  <div className="mt-2 h-10 w-28 border-b border-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-brand-navy">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 print:border-slate-200 print:bg-white">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}
