import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Layers, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const emptyForm = { name: '', description: '' };
const fieldTypeOptions = ['text', 'date', 'number', 'select', 'textarea'];
const DEFAULT_TEMPLATES = {
  'Air Flight Ticket': [
    { name: 'Departure Date', field_key: 'departure_date', field_type: 'date', required: true, options: '' },
    { name: 'Return Date', field_key: 'return_date', field_type: 'date', required: false, options: '' },
    { name: 'Flight Number', field_key: 'flight_number', field_type: 'text', required: false, options: '' },
    { name: 'Departure City', field_key: 'departure_city', field_type: 'text', required: true, options: '' },
    { name: 'Arrival City', field_key: 'arrival_city', field_type: 'text', required: true, options: '' },
    { name: 'Class', field_key: 'travel_class', field_type: 'select', required: false, options: 'Economy, Business, First' },
  ],
  'Hotel Reservation': [
    { name: 'Check-in Date', field_key: 'check_in_date', field_type: 'date', required: true, options: '' },
    { name: 'Check-out Date', field_key: 'check_out_date', field_type: 'date', required: true, options: '' },
    { name: 'Hotel Name', field_key: 'hotel_name', field_type: 'text', required: false, options: '' },
    { name: 'Room Type', field_key: 'room_type', field_type: 'select', required: false, options: 'Single, Double, Suite' },
  ],
  'Omra Package': [
    { name: 'Departure Date', field_key: 'departure_date', field_type: 'date', required: true, options: '' },
    { name: 'Return Date', field_key: 'return_date', field_type: 'date', required: true, options: '' },
    { name: 'Group Size', field_key: 'group_size', field_type: 'number', required: false, options: '' },
    { name: 'Miqat Location', field_key: 'miqat_location', field_type: 'text', required: false, options: '' },
  ],
  'Visa Processing': [
    { name: 'Visa Type', field_key: 'visa_type', field_type: 'text', required: false, options: '' },
    { name: 'Embassy Appointment Date', field_key: 'embassy_appointment_date', field_type: 'date', required: false, options: '' },
    { name: 'Expected Decision Date', field_key: 'expected_decision_date', field_type: 'date', required: false, options: '' },
  ],
};

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_') || 'custom_field';

const parseOptions = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (error) {
      // ignore invalid JSON and fall back to CSV parsing below
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const fieldTypeBadge = (fieldType) => {
  const map = {
    date: 'bg-sky-100 text-sky-700',
    text: 'bg-violet-100 text-violet-700',
    number: 'bg-emerald-100 text-emerald-700',
    select: 'bg-amber-100 text-amber-700',
    textarea: 'bg-pink-100 text-pink-700',
  };
  return map[fieldType] || 'bg-slate-100 text-slate-700';
};

export default function ServiceTypes() {
  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceFieldsByType, setServiceFieldsByType] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('custom-fields');
  const [fieldDraft, setFieldDraft] = useState({
    name: '',
    field_key: '',
    field_type: 'text',
    required: false,
    options: '',
  });
  const [isFieldFormOpen, setIsFieldFormOpen] = useState(false);

  const selectedTypeFields = useMemo(
    () => (selectedServiceType ? serviceFieldsByType[selectedServiceType.id] || [] : []),
    [selectedServiceType, serviceFieldsByType]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setServiceTypes([]);
        setSuppliers([]);
        setServiceFieldsByType({});
        return;
      }

      const allFieldsQuery = supabase
        .from('service_type_fields')
        .select('id, service_type_id, name, field_key, field_type, required, options, sort_order');

      let fieldsRes = await allFieldsQuery.order('sort_order', { ascending: true });
      if (
        fieldsRes.error &&
        /sort_order|service_type_fields|does not exist|column .* does not exist/i.test(fieldsRes.error.message || '')
      ) {
        fieldsRes = { data: [], error: null };
      }

      const typesRes = await supabase
        .from('service_types')
        .select('id, name, description')
        .order('name', { ascending: true });

      if (typesRes.error) throw typesRes.error;
      if (fieldsRes.error) throw fieldsRes.error;

      const fieldsByType = {};
      (fieldsRes.data || []).forEach((field) => {
        if (!fieldsByType[field.service_type_id]) {
          fieldsByType[field.service_type_id] = [];
        }
        fieldsByType[field.service_type_id].push(field);
      });

      setServiceTypes(typesRes.data || []);
      setServiceFieldsByType(fieldsByType);
    } catch (err) {
      setError(err.message || 'Unable to load service types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setSelectedServiceType(null);
    setForm(emptyForm);
    setError('');
    setActiveTab('custom-fields');
    setFieldDraft({ name: '', field_key: '', field_type: 'text', required: false, options: '' });
    setIsFieldFormOpen(false);
    setIsModalOpen(true);
  };

  const openEditModal = (serviceType) => {
    setSelectedServiceType(serviceType);
    setForm({ name: serviceType.name || '', description: serviceType.description || '' });
    setError('');
    setActiveTab('custom-fields');
    setFieldDraft({ name: '', field_key: '', field_type: 'text', required: false, options: '' });
    setIsFieldFormOpen(false);
    setIsModalOpen(true);
  };

  const loadTypeFields = async (serviceTypeId) => {
    if (!serviceTypeId || !supabase) return;

    const baseQuery = supabase
      .from('service_type_fields')
      .select('id, service_type_id, name, field_key, field_type, required, options, sort_order')
      .eq('service_type_id', serviceTypeId);

    let result = await baseQuery.order('sort_order', { ascending: true });

    if (
      result.error &&
      /sort_order|service_type_fields|does not exist|column .* does not exist/i.test(result.error.message || '')
    ) {
      result = { data: [], error: null };
    }

    if (!result.error) {
      setServiceFieldsByType((prev) => ({ ...prev, [serviceTypeId]: result.data || [] }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    if (!form.name.trim()) {
      setError('Service type name is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = { name: form.name.trim(), description: form.description.trim() || null };
      let serviceTypeId = selectedServiceType?.id;

      if (serviceTypeId) {
        const { error: updateError } = await supabase.from('service_types').update(payload).eq('id', serviceTypeId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('service_types')
          .insert([payload])
          .select('id')
          .single();
        if (insertError) throw insertError;
        serviceTypeId = data.id;
      }

      setIsModalOpen(false);
      await loadData();
      if (serviceTypeId) {
        await loadTypeFields(serviceTypeId);
      }
    } catch (err) {
      setError(err.message || 'Unable to save service type.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (serviceType) => {
    if (!window.confirm(`Delete the "${serviceType.name}" service type?`)) return;

    try {
      setSaving(true);
      setError('');

      await supabase.from('service_type_fields').delete().eq('service_type_id', serviceType.id);
      const { error: deleteError } = await supabase.from('service_types').delete().eq('id', serviceType.id);
      if (deleteError) throw deleteError;

      setServiceTypes((prev) => prev.filter((type) => type.id !== serviceType.id));
      setServiceFieldsByType((prev) => {
        const next = { ...prev };
        delete next[serviceType.id];
        return next;
      });
    } catch (err) {
      setError(err.message || 'Unable to delete service type.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFieldTemplate = async () => {
    if (!selectedServiceType?.id) return;

    const templateFields = DEFAULT_TEMPLATES[selectedServiceType.name] || [];
    if (templateFields.length === 0) {
      setError('No predefined template is available for this service type.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const rows = templateFields.map((field, index) => ({
        service_type_id: selectedServiceType.id,
        name: field.name,
        field_key: field.field_key || slugify(field.name),
        field_type: field.field_type,
        required: Boolean(field.required),
        options: field.field_type === 'select' ? parseOptions(field.options) : null,
        sort_order: index,
      }));

      const { error: insertError } = await supabase.from('service_type_fields').insert(rows);
      if (insertError) throw insertError;

      await loadTypeFields(selectedServiceType.id);
      setFieldDraft({ name: '', field_key: '', field_type: 'text', required: false, options: '' });
      setIsFieldFormOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to apply the custom field template.');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldSave = async (event) => {
    event.preventDefault();

    if (!selectedServiceType?.id) return;
    const name = fieldDraft.name.trim();
    const fieldKey = (fieldDraft.field_key || slugify(name)).trim();

    if (!name) {
      setError('Field name is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        service_type_id: selectedServiceType.id,
        name,
        field_key: fieldKey,
        field_type: fieldDraft.field_type,
        required: Boolean(fieldDraft.required),
        options: fieldDraft.field_type === 'select' ? parseOptions(fieldDraft.options) : null,
        sort_order: (selectedTypeFields || []).length,
      };

      const { error: insertError } = await supabase.from('service_type_fields').insert([payload]);
      if (insertError) throw insertError;

      setFieldDraft({ name: '', field_key: '', field_type: 'text', required: false, options: '' });
      setIsFieldFormOpen(false);
      await loadTypeFields(selectedServiceType.id);
    } catch (err) {
      setError(err.message || 'Unable to save custom field.');
    } finally {
      setSaving(false);
    }
  };

  const moveField = async (fieldId, direction) => {
    if (!selectedServiceType?.id) return;

    const currentFields = [...(serviceFieldsByType[selectedServiceType.id] || [])];
    const index = currentFields.findIndex((field) => field.id === fieldId);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= currentFields.length) return;

    const reordered = [...currentFields];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    const updatedFields = reordered.map((field, orderIndex) => ({ ...field, sort_order: orderIndex }));
    setServiceFieldsByType((prev) => ({ ...prev, [selectedServiceType.id]: updatedFields }));

    try {
      await Promise.all(
        updatedFields.map((field) =>
          supabase
            .from('service_type_fields')
            .update({ sort_order: field.sort_order })
            .eq('id', field.id)
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to reorder custom fields.');
    }
  };

  const deleteField = async (fieldId) => {
    if (!selectedServiceType?.id || !supabase) return;

    try {
      setSaving(true);
      setError('');

      const { error: deleteError } = await supabase.from('service_type_fields').delete().eq('id', fieldId);
      if (deleteError) throw deleteError;

      await loadTypeFields(selectedServiceType.id);
    } catch (err) {
      setError(err.message || 'Unable to delete custom field.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Catalog</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Service Types</h2>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
        >
          <Plus size={18} />
          New Service Type
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">Loading...</div>
      ) : serviceTypes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
          No service types yet. Create your first one.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {serviceTypes.map((type) => (
            <div key={type.id} className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-navy p-2 text-brand-gold">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-brand-navy">{type.name}</h3>
                    {type.description && <p className="mt-1 text-sm text-slate-500">{type.description}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(type)}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-brand-navy"
                    aria-label={`Edit ${type.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(type)}
                    className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600"
                    aria-label={`Delete ${type.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Fields</p>
                <p className="text-sm text-slate-500">
                  {serviceFieldsByType[type.id]?.length || 0} custom field{(serviceFieldsByType[type.id]?.length || 0) === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-brand-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl text-brand-navy">
                {selectedServiceType ? 'Edit service type' : 'New service type'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Air Flight Ticket"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Description (optional)</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
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
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>

            {!selectedServiceType ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-surface p-6 text-sm text-slate-500">
                Save the service type first to define custom fields.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-brand-navy">Custom fields</h4>
                  <button
                    type="button"
                    onClick={handleAddFieldTemplate}
                    className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2 text-sm font-semibold text-brand-navy"
                  >
                    Use template
                  </button>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-brand-surface p-3">
                  {selectedTypeFields.length === 0 ? (
                    <p className="text-sm text-slate-500">No custom fields defined yet.</p>
                  ) : (
                    selectedTypeFields.map((field) => (
                      <div key={field.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-brand-navy">{field.name}</span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${fieldTypeBadge(field.field_type)}`}>
                              {field.field_type}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{field.field_key}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <input
                              type="checkbox"
                              checked={Boolean(field.required)}
                              readOnly
                              className="h-4 w-4 rounded border-slate-300 text-brand-gold"
                            />
                            Required
                          </label>

                          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-brand-surface p-1">
                            <button
                              type="button"
                              onClick={() => moveField(field.id, -1)}
                              className="rounded-md p-1.5 text-brand-navy hover:bg-slate-100"
                              aria-label={`Move field ${field.name} up`}
                            >
                              <ArrowUpDown size={14} className="rotate-180" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveField(field.id, 1)}
                              className="rounded-md p-1.5 text-brand-navy hover:bg-slate-100"
                              aria-label={`Move field ${field.name} down`}
                            >
                              <ArrowUpDown size={14} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteField(field.id)}
                            className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600"
                            aria-label={`Delete ${field.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setIsFieldFormOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
                  >
                    <Plus size={16} />
                    Add Field
                  </button>
                </div>

                {isFieldFormOpen && (
                  <form onSubmit={handleFieldSave} className="space-y-4 rounded-2xl border border-slate-200 bg-brand-surface p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-brand-navy">Field Name</label>
                        <input
                          value={fieldDraft.name}
                          onChange={(event) => {
                            const nextName = event.target.value;
                            setFieldDraft((prev) => ({
                              ...prev,
                              name: nextName,
                              field_key: prev.field_key || slugify(nextName),
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                          placeholder="Departure Date"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-brand-navy">Field Key</label>
                        <input
                          value={fieldDraft.field_key}
                          onChange={(event) =>
                            setFieldDraft((prev) => ({ ...prev, field_key: event.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-brand-navy">Field Type</label>
                        <select
                          value={fieldDraft.field_type}
                          onChange={(event) =>
                            setFieldDraft((prev) => ({ ...prev, field_type: event.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                        >
                          {fieldTypeOptions.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {fieldDraft.field_type === 'select' && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-brand-navy">Options</label>
                        <input
                          value={fieldDraft.options}
                          onChange={(event) =>
                            setFieldDraft((prev) => ({ ...prev, options: event.target.value }))
                          }
                          placeholder="Economy, Business, First"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm font-medium text-brand-navy">
                      <input
                        type="checkbox"
                        checked={fieldDraft.required}
                        onChange={(event) =>
                          setFieldDraft((prev) => ({ ...prev, required: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-brand-gold"
                      />
                      Required
                    </label>

                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsFieldFormOpen(false)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
