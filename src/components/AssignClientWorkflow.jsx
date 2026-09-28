import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const normalizeText = (value) => String(value ?? '').trim();

export default function AssignClientWorkflow({ onAssigned, onCancel }) {
  const [clients, setClients] = useState([]);
  const [matrixOptions, setMatrixOptions] = useState({
    country_id: [],
    visa_type_id: [],
    professional_status: [],
  });
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedVisaType, setSelectedVisaType] = useState('');
  const [selectedProfessionalStatus, setSelectedProfessionalStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!supabase) {
        setClients([]);
        setMatrixOptions({ country_id: [], visa_type_id: [], professional_status: [] });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [clientsRes, templatesRes] = await Promise.all([
          supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
          supabase
            .from('service_templates')
            .select('country_id, visa_type_id, professional_status')
            .is('client_id', null),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (templatesRes.error) throw templatesRes.error;

        const uniqueValues = (key) =>
          [...new Set((templatesRes.data || []).map((row) => row[key]).filter((value) => value && normalizeText(value)))].sort((a, b) => a.localeCompare(b));

        setClients(clientsRes.data || []);
        setMatrixOptions({
          country_id: uniqueValues('country_id'),
          visa_type_id: uniqueValues('visa_type_id'),
          professional_status: uniqueValues('professional_status'),
        });
      } catch (err) {
        setError(err.message || 'Unable to load clients and workflow matrix.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const assignJoinRecord = async (templateId, clientId) => {
    const joinRow = { client_id: clientId, template_id: templateId };

    const { error: primaryError } = await supabase.from('service_clients').insert([joinRow]);
    if (!primaryError) return;

    const fallbackRow = { client_id: clientId, service_template_id: templateId };
    const { error: fallbackError } = await supabase.from('service_clients').insert([fallbackRow]);
    if (fallbackError) throw fallbackError;
  };

  const assignWorkflow = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.');
      return;
    }

    if (!selectedClientId || !selectedCountry || !selectedVisaType || !selectedProfessionalStatus) {
      setError('Please select a client, country, visa type, and professional status.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const { data: masterTemplate, error: masterTemplateError } = await supabase
        .from('service_templates')
        .select('*')
        .eq('country_id', selectedCountry)
        .eq('visa_type_id', selectedVisaType)
        .eq('professional_status', selectedProfessionalStatus)
        .is('client_id', null)
        .limit(1)
        .maybeSingle();

      if (masterTemplateError) throw masterTemplateError;
      if (!masterTemplate) {
        throw new Error('No matching master template was found for the selected matrix.');
      }

      const [stagesRes, stepsRes, itemsRes] = await Promise.all([
        supabase
          .from('service_stages')
          .select('*')
          .eq('service_template_id', masterTemplate.id)
          .order('sort_order', { ascending: true }),
        supabase.from('service_steps').select('*').order('sort_order', { ascending: true }),
        supabase.from('service_items').select('*').order('sort_order', { ascending: true }),
      ]);

      if (stagesRes.error) throw stagesRes.error;
      if (stepsRes.error) throw stepsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const stageIds = (stagesRes.data || []).map((stage) => stage.id);
      const stageSteps = (stepsRes.data || []).filter((step) => stageIds.includes(step.stage_id));
      const stepIds = stageSteps.map((step) => step.id);
      const stepItems = (itemsRes.data || []).filter((item) => stepIds.includes(item.step_id));

      const templatePayload = { ...masterTemplate };
      delete templatePayload.id;
      delete templatePayload.created_at;
      delete templatePayload.updated_at;
      delete templatePayload.client_id;
      delete templatePayload.title;

      const newTitle = `${masterTemplate.title || 'Visa Workflow'} - ${selectedClient.full_name || 'Client'}`;

      const { data: clonedTemplate, error: templateInsertError } = await supabase
        .from('service_templates')
        .insert([
          {
            ...templatePayload,
            client_id: selectedClient.id,
            title: newTitle,
            country_id: selectedCountry,
            visa_type_id: selectedVisaType,
            professional_status: selectedProfessionalStatus,
          },
        ])
        .select('*')
        .single();

      if (templateInsertError) throw templateInsertError;

      const stageIdMap = {};
      if ((stagesRes.data || []).length > 0) {
        const insertedStages = await Promise.all(
          (stagesRes.data || []).map(async (stage) => {
            const { id: _oldStageId, created_at: _stageCreatedAt, updated_at: _stageUpdatedAt, service_template_id: _templateId, ...stagePayload } = stage;

            const { data: insertedStage, error: stageInsertError } = await supabase
              .from('service_stages')
              .insert([
                {
                  ...stagePayload,
                  service_template_id: clonedTemplate.id,
                },
              ])
              .select('id')
              .single();

            if (stageInsertError) throw stageInsertError;
            return { oldStageId: stage.id, newStageId: insertedStage.id };
          })
        );

        insertedStages.forEach(({ oldStageId, newStageId }) => {
          stageIdMap[oldStageId] = newStageId;
        });
      }

      const stepIdMap = {};
      if (stageSteps.length > 0) {
        const insertedSteps = await Promise.all(
          stageSteps.map(async (step) => {
            const { id: _oldStepId, created_at: _stepCreatedAt, updated_at: _stepUpdatedAt, ...stepPayload } = step;

            const { data: insertedStep, error: stepInsertError } = await supabase
              .from('service_steps')
              .insert([
                {
                  ...stepPayload,
                  stage_id: stageIdMap[step.stage_id],
                },
              ])
              .select('id')
              .single();

            if (stepInsertError) throw stepInsertError;
            return { oldStepId: step.id, newStepId: insertedStep.id };
          })
        );

        insertedSteps.forEach(({ oldStepId, newStepId }) => {
          stepIdMap[oldStepId] = newStepId;
        });
      }

      if (stepItems.length > 0) {
        const itemsToInsert = stepItems.map((item) => {
          const { id: _oldItemId, created_at: _itemCreatedAt, updated_at: _itemUpdatedAt, step_id: _ignoredStepId, ...itemPayload } = item;

          return {
            ...itemPayload,
            step_id: stepIdMap[item.step_id],
            is_done: false,
            drive_url: null,
          };
        });

        const { error: itemsInsertError } = await supabase.from('service_items').insert(itemsToInsert);
        if (itemsInsertError) throw itemsInsertError;
      }

      const joinPayload = {
        client_id: selectedClient.id,
        template_id: clonedTemplate.id,
      };

      try {
        await assignJoinRecord(clonedTemplate.id, selectedClient.id);
      } catch (joinError) {
        const fallbackJoinPayload = { client_id: selectedClient.id, service_template_id: clonedTemplate.id };
        const { error: fallbackJoinInsertError } = await supabase.from('client_services').insert([fallbackJoinPayload]);
        if (fallbackJoinInsertError) throw fallbackJoinInsertError;
      }

      if (onAssigned) {
        onAssigned({
          clientId: selectedClient.id,
          templateId: clonedTemplate.id,
          newTitle,
        });
      }

      setSelectedClientId('');
      setSelectedCountry('');
      setSelectedVisaType('');
      setSelectedProfessionalStatus('');
    } catch (err) {
      setError(err.message || 'Unable to assign client workflow.');
    } finally {
      setSaving(false);
    }
  };

  const renderSelect = ({ label, value, onChange, options, placeholder }) => (
    <label className="block text-sm text-brand-navy">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
        disabled={loading || saving}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const optionLabel = option && typeof option === 'object' ? option.label : option;
          const optionValue = option && typeof option === 'object' ? option.value : option;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Visa Workflow</p>
        <h3 className="mt-1 text-xl font-semibold text-brand-navy">Assign Client Workflow</h3>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {renderSelect({
          label: 'Client',
          value: selectedClientId,
          onChange: setSelectedClientId,
          options: clients.map((client) => ({ value: client.id, label: client.full_name || 'Client' })),
          placeholder: 'Select client',
        })}

        {renderSelect({
          label: 'Country',
          value: selectedCountry,
          onChange: setSelectedCountry,
          options: matrixOptions.country_id,
          placeholder: 'Select country',
        })}

        {renderSelect({
          label: 'Visa Type',
          value: selectedVisaType,
          onChange: setSelectedVisaType,
          options: matrixOptions.visa_type_id,
          placeholder: 'Select visa type',
        })}

        {renderSelect({
          label: 'Professional Status',
          value: selectedProfessionalStatus,
          onChange: setSelectedProfessionalStatus,
          options: matrixOptions.professional_status,
          placeholder: 'Select professional status',
        })}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          onClick={assignWorkflow}
          disabled={loading || saving || !selectedClientId || !selectedCountry || !selectedVisaType || !selectedProfessionalStatus}
          className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Assigning...' : 'Assign Client'}
        </button>
      </div>
    </div>
  );
}
