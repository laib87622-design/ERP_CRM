import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  Layers,
  Link as LinkIcon,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  buildStagesDataFromTemplate,
  computeStagesProgress,
  duplicateMasterTemplate,
  ensureClientService,
  markTaskDoneIfComplete,
} from '../lib/serviceWorkflow';

const createUniqueTemplateKey = () => {
  const stamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `template-${stamp}-${randomPart}`;
};

const getExternalUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const moveInArray = (arr, fromIndex, toIndex) => {
  if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return arr;
  const newArr = [...arr];
  const [movedItem] = newArr.splice(fromIndex, 1);
  newArr.splice(toIndex, 0, movedItem);
  return newArr;
};

const persistSortOrder = async (table, rows) => {
  const results = await Promise.all(rows.map((row, index) => (
    supabase.from(table).update({ sort_order: index }).eq('id', row.id)
  )));
  const failedUpdate = results.find((result) => result.error);
  if (failedUpdate) throw failedUpdate.error;
};

const translations = {
  en: {
    eyebrow: 'Workflow',
    title: 'Visa Workflow',
    clientServicesTab: 'Client Services',
    templatesTab: 'Templates',
    newClientService: 'Assign Service',
    newTemplate: 'New Template',
    noClientServices: 'No client services assigned yet.',
    noTemplates: 'No templates yet. Create one to define a checklist.',
  },
  ar: {
    eyebrow: 'سير العمل',
    title: 'سير العمل - التأشيرة',
    clientServicesTab: 'خدمات العملاء',
    templatesTab: 'القوالب',
    newClientService: 'تعيين خدمة',
    newTemplate: 'قالب جديد',
    noClientServices: 'لا توجد خدمات معينة للعملاء بعد.',
    noTemplates: 'لا توجد قوالب بعد. أنشئ قالبًا لتحديد قائمة التحقق.',
  },
};

export default function Services({ language = 'en' }) {
  const t = translations[language] || translations.en;

  const [mode, setMode] = useState('clients'); // 'clients' | 'templates'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'create' | 'edit'
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [templateToCopy, setTemplateToCopy] = useState('');
  const [country, setCountry] = useState('');
  const [visaType, setVisaType] = useState('');
  const [status, setStatus] = useState('');
  const [countrySelect, setCountrySelect] = useState('');
  const [visaSelect, setVisaSelect] = useState('');
  const [statusSelect, setStatusSelect] = useState('');
  const [countryCustom, setCountryCustom] = useState('');
  const [visaCustom, setVisaCustom] = useState('');
  const [statusCustom, setStatusCustom] = useState('');
  const [filterCountry, setFilterCountry] = useState('All');
  const [filterVisa, setFilterVisa] = useState('All');

  // Client services state
  const [clientServices, setClientServices] = useState([]);
  const [selectedClientServiceId, setSelectedClientServiceId] = useState(null);
  const [countryFilter, setCountryFilter] = useState('All');
  const [visaFilter, setVisaFilter] = useState('All');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    client_id: '',
    country_id: '',
    visa_type_id: '',
    professional_status: '',
  });

  // Shared lookups
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [assignMatrixOptions, setAssignMatrixOptions] = useState({
    country_id: [],
    visa_type_id: [],
    professional_status: [],
  });

  // Templates builder state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [workflow, setWorkflow] = useState([]);
  const [templateMatrix, setTemplateMatrix] = useState({ country_id: '', visa_type_id: '', professional_status: '' });
  const [matrixOptions, setMatrixOptions] = useState({ country_id: [], visa_type_id: [], professional_status: [] });
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [draftTemplateName, setDraftTemplateName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemDraft, setEditingItemDraft] = useState('');

  const normalizeUuidOrNull = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed && trimmed !== 'null' && trimmed !== 'undefined' ? trimmed : null;
  };

  const sanitizeTemplateMatrixPayload = (source = {}) => ({
    country_id: String(source.country_id ?? '').trim() || null,
    visa_type_id: String(source.visa_type_id ?? '').trim() || null,
    professional_status: String(source.professional_status ?? '').trim() || null,
    client_id: normalizeUuidOrNull(source.client_id ?? null),
    supplier_id: normalizeUuidOrNull(source.supplier_id ?? null),
    package_id: normalizeUuidOrNull(source.package_id ?? null),
  });

  const loadLookups = async () => {
    if (!supabase) return;

    const [clientsRes, templatesRes] = await Promise.all([
      supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
      supabase
        .from('service_templates')
        .select('id, title, package_id, country_id, visa_type_id, professional_status')
        .is('client_id', null)
        .order('title', { ascending: true }),
    ]);

    if (clientsRes.error) throw clientsRes.error;
    if (templatesRes.error) throw templatesRes.error;

    setClients(clientsRes.data || []);
    setTemplates((templatesRes.data || []).map((template) => ({ ...template })));
  };

  const loadClientServices = async () => {
    if (!supabase) {
      setClientServices([]);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('client_services')
      .select('id, client_id, template_id, stages_data, created_at, clients(full_name), service_templates(title, country_id, visa_type_id)')
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    setClientServices(
      (data || []).map((row) => ({
        ...row,
        clientName: row.clients?.full_name || 'Unknown client',
        templateName: row.service_templates?.title || 'Untitled service',
        progress: computeStagesProgress(row.stages_data),
      }))
    );
  };

  const loadTemplateMatrixOptions = async () => {
    if (!supabase) {
      setMatrixOptions({ country_id: [], visa_type_id: [], professional_status: [] });
      return;
    }

    const { data, error } = await supabase
      .from('service_templates')
      .select('country_id, visa_type_id, professional_status')
      .is('client_id', null);

    if (error) throw error;

    const collect = (key) =>
      [...new Set((data || []).map((row) => row[key]).filter((value) => value && String(value).trim()))].sort((a, b) => a.localeCompare(b));

    setMatrixOptions({
      country_id: collect('country_id'),
      visa_type_id: collect('visa_type_id'),
      professional_status: collect('professional_status'),
    });
  };

  const loadAssignMatrixOptions = async () => {
    if (!supabase) {
      setAssignMatrixOptions({ country_id: [], visa_type_id: [], professional_status: [] });
      return;
    }

    const { data, error } = await supabase
      .from('service_templates')
      .select('country_id, visa_type_id, professional_status')
      .is('client_id', null);

    if (error) throw error;

    const collect = (key) =>
      [...new Set((data || []).map((row) => row[key]).filter((value) => value && String(value).trim()))].sort((a, b) => a.localeCompare(b));

    setAssignMatrixOptions({
      country_id: collect('country_id'),
      visa_type_id: collect('visa_type_id'),
      professional_status: collect('professional_status'),
    });
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }

      await Promise.all([loadLookups(), loadClientServices(), loadTemplateMatrixOptions(), loadAssignMatrixOptions()]);
    } catch (err) {
      setError(err.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const fetchMasterTemplates = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('service_templates')
        .select('*')
        .is('client_id', null);

      if (error) {
        console.error('Error fetching templates:', error);
      } else if (data) {
        setTemplates(data);
      }
    };

    fetchMasterTemplates();
  }, []);

  const selectedClientService = clientServices.find((row) => row.id === selectedClientServiceId) || null;

  const uniqueCountries = [...new Set(templates.map((template) => template.country_id).filter(Boolean))];
  const uniqueVisas = [...new Set(templates.map((template) => template.visa_type_id).filter(Boolean))];
  const uniqueStatuses = [...new Set(templates.map((template) => template.professional_status).filter(Boolean))];

  const matrixCountryOptions = uniqueCountries.length ? uniqueCountries : matrixOptions.country_id;
  const matrixVisaOptions = uniqueVisas.length ? uniqueVisas : matrixOptions.visa_type_id;
  const matrixStatusOptions = uniqueStatuses.length ? uniqueStatuses : matrixOptions.professional_status;

  const clientUniqueCountries = [...new Set(clientServices.map((row) => row.service_templates?.country_id).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const clientUniqueVisaTypes = [...new Set(clientServices.map((row) => row.service_templates?.visa_type_id).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const templateUniqueCountries = ['All', ...new Set(templates.filter((template) => template.client_id === null && template.country_id).map((template) => template.country_id))];
  const templateUniqueVisas = ['All', ...new Set(templates.filter((template) => template.client_id === null && template.visa_type_id).map((template) => template.visa_type_id))];

  const filteredClientServices = clientServices.filter((workflow) => {
    const matchesCountry = countryFilter === 'All' || workflow.service_templates?.country_id === countryFilter;
    const matchesVisa = visaFilter === 'All' || workflow.service_templates?.visa_type_id === visaFilter;
    return matchesCountry && matchesVisa;
  });

  // ---- Client Services: assign + workflow updates ----

  const openAssignModal = async () => {
    setAssignForm({
      client_id: '',
      country_id: '',
      visa_type_id: '',
      professional_status: '',
    });
    setError('');
    setIsAssignModalOpen(true);
    try {
      await loadAssignMatrixOptions();
    } catch (err) {
      setError(err.message || 'Unable to load workflow matrix options.');
    }
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    const { client_id, country_id, visa_type_id, professional_status } = assignForm;
    if (!client_id || !country_id || !visa_type_id || !professional_status) {
      setError('Please select a client, country, visa type, and professional status.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const { data: masterTemplate, error: fetchError } = await supabase
        .from('service_templates')
        .select('*')
        .eq('country_id', country_id)
        .eq('visa_type_id', visa_type_id)
        .eq('professional_status', professional_status)
        .is('client_id', null)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!masterTemplate) {
        setError('No master template found for this matrix combination.');
        return;
      }

      const clientName = clients.find((client) => client.id === client_id)?.full_name || 'Client';
      const templatePayload = {
        title: `${masterTemplate.title || 'Visa Workflow'} - ${clientName}`,
        country_id: masterTemplate.country_id,
        visa_type_id: masterTemplate.visa_type_id,
        professional_status: masterTemplate.professional_status,
        client_id: client_id,
        supplier_id: null,
        package_id: null,
      };

      const { data: newTemplate, error: insertError } = await supabase
        .from('service_templates')
        .insert([templatePayload])
        .select('*')
        .single();

      if (insertError) throw insertError;

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

      const stageIdMap = {};
      for (const stage of stagesRes.data || []) {
        const { id: oldStageId, created_at: _stageCreatedAt, updated_at: _stageUpdatedAt, service_template_id: _ignoredTemplateId, ...stagePayload } = stage;

        const { data: insertedStage, error: stageInsertError } = await supabase
          .from('service_stages')
          .insert([{ ...stagePayload, service_template_id: newTemplate.id }])
          .select('id')
          .single();

        if (stageInsertError) throw stageInsertError;
        stageIdMap[oldStageId] = insertedStage.id;
      }

      const stepIdMap = {};
      const relevantSteps = (stepsRes.data || []).filter((step) => stageIdMap[step.stage_id]);

      for (const step of relevantSteps) {
        const { id: oldStepId, created_at: _stepCreatedAt, updated_at: _stepUpdatedAt, ...stepPayload } = step;

        const { data: insertedStep, error: stepInsertError } = await supabase
          .from('service_steps')
          .insert([{ ...stepPayload, stage_id: stageIdMap[step.stage_id] }])
          .select('id')
          .single();

        if (stepInsertError) throw stepInsertError;
        stepIdMap[oldStepId] = insertedStep.id;
      }

      const relevantItems = (itemsRes.data || []).filter((item) => stepIdMap[item.step_id]);
      const itemsToInsert = relevantItems.map((item) => {
        const { id: _oldItemId, created_at: _itemCreatedAt, updated_at: _itemUpdatedAt, ...itemPayload } = item;
        return {
          ...itemPayload,
          step_id: stepIdMap[item.step_id],
          is_done: false,
          drive_url: null,
        };
      });

      if (itemsToInsert.length > 0) {
        const { error: itemInsertError } = await supabase.from('service_items').insert(itemsToInsert);
        if (itemInsertError) throw itemInsertError;
      }

      const { error: assignmentJoinError } = await supabase
        .from('service_clients')
        .upsert(
          [{ client_id: client_id, service_template_id: newTemplate.id }],
          { onConflict: 'service_template_id,client_id' }
        );

      if (assignmentJoinError) throw assignmentJoinError;

      await ensureClientService({ clientId: client_id, templateId: newTemplate.id });

      setIsAssignModalOpen(false);
      setAssignForm({ client_id: '', country_id: '', visa_type_id: '', professional_status: '' });
      await loadClientServices();
    } catch (err) {
      setError(err.message || 'Unable to assign service to client.');
    } finally {
      setSaving(false);
    }
  };

  const deleteClientService = async (rowId) => {
    if (!window.confirm('Remove this client service and its checklist progress?')) return;

    try {
      setSaving(true);
      setError('');

      const { error: deleteError } = await supabase.from('client_services').delete().eq('id', rowId);
      if (deleteError) throw deleteError;

      setClientServices((prev) => prev.filter((row) => row.id !== rowId));
      if (selectedClientServiceId === rowId) setSelectedClientServiceId(null);
    } catch (err) {
      setError(err.message || 'Unable to delete client service.');
    } finally {
      setSaving(false);
    }
  };

  const persistStagesData = async (rowId, nextStagesData) => {
    const { error: updateError } = await supabase
      .from('client_services')
      .update({ stages_data: nextStagesData })
      .eq('id', rowId);

    if (updateError) throw updateError;

    setClientServices((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, stages_data: nextStagesData, progress: computeStagesProgress(nextStagesData) }
          : row
      )
    );

    const row = clientServices.find((item) => item.id === rowId);
    if (row) {
      await markTaskDoneIfComplete({ clientId: row.client_id, templateId: row.template_id, stagesData: nextStagesData });
    }
  };

  const handleSaveClientService = async () => {
    if (!selectedClientService || !supabase) return;

    try {
      setIsSaving(true);
      setSaveMessage('');
      setError('');
      await persistStagesData(selectedClientService.id, selectedClientService.stages_data || []);
      setSaveMessage('Saved successfully!');
      window.setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Unable to save client service.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClientServiceItem = async (stageId, stepId, itemId, nextValue) => {
    if (!selectedClientService) return;

    const nextStagesData = (selectedClientService.stages_data || []).map((stage) =>
      stage.id === stageId
        ? {
            ...stage,
            steps: (stage.steps || []).map((step) =>
              step.id === stepId
                ? {
                    ...step,
                    items: (step.items || []).map((item) =>
                      item.id === itemId ? { ...item, is_done: nextValue } : item
                    ),
                  }
                : step
            ),
          }
        : stage
    );

    try {
      await persistStagesData(selectedClientService.id, nextStagesData);
    } catch (err) {
      setError(err.message || 'Unable to update checklist item.');
    }
  };

  const updateClientServiceItemLink = async (stageId, stepId, itemId, driveUrl) => {
    if (!selectedClientService) return;

    const nextStagesData = (selectedClientService.stages_data || []).map((stage) =>
      stage.id === stageId
        ? {
            ...stage,
            steps: (stage.steps || []).map((step) =>
              step.id === stepId
                ? {
                    ...step,
                    items: (step.items || []).map((item) =>
                      item.id === itemId ? { ...item, drive_url: driveUrl || null } : item
                    ),
                  }
                : step
            ),
          }
        : stage
    );

    try {
      await persistStagesData(selectedClientService.id, nextStagesData);
      setEditingItemId(null);
    } catch (err) {
      setError(err.message || 'Unable to update drive link.');
    }
  };

  const updateClientServiceItemNote = async (stageId, stepId, itemId, note) => {
    if (!selectedClientService) return;

    const nextStagesData = (selectedClientService.stages_data || []).map((stage) => (
      stage.id === stageId
        ? {
            ...stage,
            steps: (stage.steps || []).map((step) => (
              step.id === stepId
                ? {
                    ...step,
                    items: (step.items || []).map((item) => (
                      item.id === itemId ? { ...item, note } : item
                    )),
                  }
                : step
            )),
          }
        : stage
    ));

    try {
      await persistStagesData(selectedClientService.id, nextStagesData);
    } catch (err) {
      setError(err.message || 'Unable to update item note.');
    }
  };

  // ---- Templates: manage stages/steps/items ----

  const selectedTemplate = activeTemplate
    ? templates.find((template) => template.id === activeTemplate.id) || activeTemplate
    : templates.find((template) => template.id === selectedTemplateId) || null;

  const loadWorkflow = async (templateId) => {
    if (!templateId || !supabase) {
      setWorkflow([]);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [stagesRes, stepsRes, itemsRes] = await Promise.all([
        supabase
          .from('service_stages')
          .select('id, service_template_id, title, sort_order')
          .eq('service_template_id', templateId)
          .order('sort_order', { ascending: true }),
        supabase.from('service_steps').select('id, stage_id, title, sort_order').order('sort_order', { ascending: true }),
        supabase.from('service_items').select('id, step_id, title, sort_order').order('sort_order', { ascending: true }),
      ]);

      if (stagesRes.error) throw stagesRes.error;
      if (stepsRes.error) throw stepsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const stages = (stagesRes.data || []).map((stage) => ({
        ...stage,
        steps: (stepsRes.data || [])
          .filter((step) => step.stage_id === stage.id)
          .map((step) => ({
            ...step,
            items: (itemsRes.data || []).filter((item) => item.step_id === step.id),
          })),
      }));

      setWorkflow(stages);
    } catch (err) {
      setError(err.message || 'Unable to load template workflow.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'templates') return;
    loadWorkflow(selectedTemplateId);
  }, [selectedTemplateId, mode]);

  const handleSaveTemplate = async () => {
    if (!supabase || !selectedTemplateId || !selectedTemplate) return;

    const title = String(editingTemplateName ? draftTemplateName : selectedTemplate.title || '').trim();
    if (!title) {
      setError('Template name is required.');
      return;
    }

    const matrixPayload = sanitizeTemplateMatrixPayload({
      ...templateMatrix,
      client_id: null,
      supplier_id: null,
      package_id: null,
    });

    if (!matrixPayload.country_id || !matrixPayload.visa_type_id || !matrixPayload.professional_status) {
      setError('Country, visa type, and professional status are required before saving the template.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage('');
      setError('');

      const { error: templateError } = await supabase
        .from('service_templates')
        .update({ ...matrixPayload, title })
        .eq('id', selectedTemplateId);

      if (templateError) throw templateError;

      const childUpdates = [
        ...workflow.map((stage, stageIndex) =>
          supabase.from('service_stages')
            .update({ title: stage.title, sort_order: stageIndex })
            .eq('id', stage.id)
        ),
        ...workflow.flatMap((stage) => (stage.steps || []).flatMap((step, stepIndex) => [
          supabase.from('service_steps')
            .update({ title: step.title, sort_order: stepIndex })
            .eq('id', step.id),
          ...(step.items || []).map((item, itemIndex) =>
            supabase.from('service_items')
              .update({ title: item.title, sort_order: itemIndex })
              .eq('id', item.id)
          ),
        ])),
      ];
      const childResults = await Promise.all(childUpdates);
      const childError = childResults.find((result) => result.error)?.error;
      if (childError) throw childError;

      const updatedTemplate = { ...selectedTemplate, ...matrixPayload, title };
      setTemplates((previous) => previous.map((template) => (
        template.id === selectedTemplateId ? updatedTemplate : template
      )));
      setActiveTemplate(updatedTemplate);
      setDraftTemplateName(title);
      setEditingTemplateName(false);
      setSaveMessage('Saved successfully!');
      window.setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Unable to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  const findMasterTemplateMatrixConflict = async ({ countryValue, visaValue, professionalValue, excludeId = null }) => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('service_templates')
      .select('id, title, country_id, visa_type_id, professional_status')
      .eq('country_id', countryValue)
      .eq('visa_type_id', visaValue)
      .eq('professional_status', professionalValue)
      .is('client_id', null)
      .neq('id', excludeId || '')
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  };

  const addTemplate = async () => {
    if (!supabase) return;

    try {
      setSaving(true);
      setError('');

      const sourceTemplate = templateToCopy ? templates.find((template) => template.id === templateToCopy) || null : null;
      const countryValue = String(country || templateMatrix.country_id || sourceTemplate?.country_id || '').trim();
      const visaValue = String(visaType || templateMatrix.visa_type_id || sourceTemplate?.visa_type_id || '').trim();
      const professionalValue = String(status || templateMatrix.professional_status || sourceTemplate?.professional_status || '').trim();

      if (!countryValue || !visaValue || !professionalValue) {
        setError('Country, visa type, and professional status are required before saving the master template matrix.');
        return;
      }

      const conflict = await findMasterTemplateMatrixConflict({
        countryValue,
        visaValue,
        professionalValue,
      });

      if (conflict) {
        setError(`A master template already exists for ${countryValue} / ${visaValue} / ${professionalValue}. Please reuse that row instead of creating a duplicate.`);
        return;
      }

      const payload = sanitizeTemplateMatrixPayload({
        title: draftTemplateName.trim() || sourceTemplate?.title || `${countryValue} - ${visaValue} - ${professionalValue}`,
        country_id: countryValue,
        visa_type_id: visaValue,
        professional_status: professionalValue,
        client_id: null,
        supplier_id: null,
        package_id: null,
      });

      const { data: newTemplate, error: insertError } = await supabase
        .from('service_templates')
        .insert([payload])
        .select('id, title, package_id, country_id, visa_type_id, professional_status')
        .single();

      if (insertError) throw insertError;

      if (sourceTemplate) {
        const { data: sourceStages, error: stagesError } = await supabase
          .from('service_stages')
          .select('*')
          .eq('service_template_id', sourceTemplate.id)
          .order('sort_order', { ascending: true });

        if (stagesError) throw stagesError;

        const stageIdMap = {};
        for (const stage of sourceStages || []) {
          const { id: oldStageId, created_at: _stageCreatedAt, updated_at: _stageUpdatedAt, service_template_id: _ignoredTemplateId, ...stagePayload } = stage;

          const { data: insertedStage, error: stageInsertError } = await supabase
            .from('service_stages')
            .insert([{ ...stagePayload, service_template_id: newTemplate.id }])
            .select('id')
            .single();

          if (stageInsertError) throw stageInsertError;
          stageIdMap[oldStageId] = insertedStage.id;
        }

        const sourceStageIds = Object.keys(stageIdMap);
        const { data: sourceSteps, error: stepsError } = await supabase
          .from('service_steps')
          .select('*')
          .in('stage_id', sourceStageIds)
          .order('sort_order', { ascending: true });

        if (stepsError) throw stepsError;

        const stepIdMap = {};
        for (const step of sourceSteps || []) {
          if (!stageIdMap[step.stage_id]) continue;

          const { id: oldStepId, created_at: _stepCreatedAt, updated_at: _stepUpdatedAt, ...stepPayload } = step;

          const { data: insertedStep, error: stepInsertError } = await supabase
            .from('service_steps')
            .insert([{ ...stepPayload, stage_id: stageIdMap[step.stage_id] }])
            .select('id')
            .single();

          if (stepInsertError) throw stepInsertError;
          stepIdMap[oldStepId] = insertedStep.id;
        }

        const sourceStepIds = Object.keys(stepIdMap);
        if (sourceStepIds.length > 0) {
          const { data: sourceItems, error: itemsError } = await supabase
            .from('service_items')
            .select('*')
            .in('step_id', sourceStepIds)
            .order('sort_order', { ascending: true });

          if (itemsError) throw itemsError;

          const itemsToInsert = (sourceItems || [])
            .filter((item) => stepIdMap[item.step_id])
            .map((item) => {
              const { id: _oldItemId, created_at: _itemCreatedAt, updated_at: _itemUpdatedAt, ...itemPayload } = item;
              return {
                ...itemPayload,
                step_id: stepIdMap[item.step_id],
              };
            });

          if (itemsToInsert.length > 0) {
            const { error: itemInsertError } = await supabase.from('service_items').insert(itemsToInsert);
            if (itemInsertError) throw itemInsertError;
          }
        }
      }

      const nextTemplate = { ...newTemplate, packageName: '—' };
      setTemplates((prev) => [...prev, nextTemplate].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))));
      setSelectedTemplateId(newTemplate.id);
      setActiveTemplate(nextTemplate);
      setDraftTemplateName(newTemplate.title);
      setTemplateMatrix({
        country_id: newTemplate.country_id || '',
        visa_type_id: newTemplate.visa_type_id || '',
        professional_status: newTemplate.professional_status || '',
      });
      setCountry('');
      setVisaType('');
      setStatus('');
      setTemplateToCopy('');
      setViewMode('edit');
      await loadTemplateMatrixOptions();
    } catch (err) {
      setError(err.message || 'Unable to create template.');
    } finally {
      setSaving(false);
    }
  };

  const renameTemplate = async () => {
    if (!selectedTemplateId) return;
    const trimmed = draftTemplateName.trim();
    if (!trimmed) {
      setError('Template name is required.');
      return;
    }

    try {
      setSaving(true);
      const { error: updateError } = await supabase.from('service_templates').update({ title: trimmed }).eq('id', selectedTemplateId);
      if (updateError) throw updateError;

      setTemplates((prev) =>
        prev.map((template) => (template.id === selectedTemplateId ? { ...template, title: trimmed } : template))
      );
      setEditingTemplateName(false);
    } catch (err) {
      setError(err.message || 'Unable to rename template.');
    } finally {
      setSaving(false);
    }
  };

  const updateTemplateMatrix = async (nextMatrix) => {
    if (!selectedTemplateId) return;

    try {
      setSaving(true);
      setError('');

      const payload = sanitizeTemplateMatrixPayload({
        country_id: nextMatrix.country_id,
        visa_type_id: nextMatrix.visa_type_id,
        professional_status: nextMatrix.professional_status,
        client_id: null,
        supplier_id: null,
        package_id: null,
      });

      if (!payload.country_id || !payload.visa_type_id || !payload.professional_status) {
        setError('Country, visa type, and professional status are required to save the master template matrix.');
        return;
      }

      const conflict = await findMasterTemplateMatrixConflict({
        countryValue: payload.country_id,
        visaValue: payload.visa_type_id,
        professionalValue: payload.professional_status,
        excludeId: selectedTemplateId,
      });

      if (conflict) {
        setError(`This matrix already exists on another master template (${conflict.title}). Please keep one unique combination.`);
        return;
      }

      const { error: updateError } = await supabase
        .from('service_templates')
        .update(payload)
        .eq('id', selectedTemplateId);

      if (updateError) throw updateError;

      setTemplates((prev) =>
        prev.map((template) =>
          template.id === selectedTemplateId
            ? { ...template, ...payload }
            : template
        )
      );
      setTemplateMatrix({
        country_id: payload.country_id || '',
        visa_type_id: payload.visa_type_id || '',
        professional_status: payload.professional_status || '',
      });
      await loadTemplateMatrixOptions();
    } catch (err) {
      setError(err.message || 'Unable to update the visa matrix.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('Delete this template and its checklist structure?')) return;

    try {
      setSaving(true);
      setError('');

      const { error: deleteError } = await supabase.from('service_templates').delete().eq('id', templateId);
      if (deleteError) throw deleteError;

      const remaining = templates.filter((template) => template.id !== templateId);
      setTemplates(remaining);
      if (selectedTemplateId === templateId) setSelectedTemplateId(remaining[0]?.id || null);
    } catch (err) {
      setError(err.message || 'Unable to delete template.');
    } finally {
      setSaving(false);
    }
  };

  const addStage = async () => {
    if (!selectedTemplateId || !supabase) return;

    try {
      setSaving(true);
      const nextSortOrder = workflow.length;
      const { data, error: insertError } = await supabase
        .from('service_stages')
        .insert([{ service_template_id: selectedTemplateId, title: 'New Stage', sort_order: nextSortOrder }])
        .select('id, service_template_id, title, sort_order')
        .single();

      if (insertError) throw insertError;
      setWorkflow((prev) => [...prev, { ...data, steps: [] }]);
    } catch (err) {
      setError(err.message || 'Unable to add stage.');
    } finally {
      setSaving(false);
    }
  };

  const updateStageTitle = async (stageId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      const { error: updateError } = await supabase.from('service_stages').update({ title: trimmed }).eq('id', stageId);
      if (updateError) throw updateError;

      setWorkflow((prev) => prev.map((stage) => (stage.id === stageId ? { ...stage, title: trimmed } : stage)));
    } catch (err) {
      setError(err.message || 'Unable to update stage title.');
    }
  };

  const deleteStage = async (stageId) => {
    if (!window.confirm('Delete this stage and all its steps/items?')) return;

    try {
      setSaving(true);
      const stage = workflow.find((item) => item.id === stageId);
      const stepIds = (stage?.steps || []).map((step) => step.id);

      if (stepIds.length > 0) {
        const { error: itemsError } = await supabase.from('service_items').delete().in('step_id', stepIds);
        if (itemsError) throw itemsError;

        const { error: stepsError } = await supabase.from('service_steps').delete().in('id', stepIds);
        if (stepsError) throw stepsError;
      }

      const { error: stageError } = await supabase.from('service_stages').delete().eq('id', stageId);
      if (stageError) throw stageError;

      setWorkflow((prev) => prev.filter((item) => item.id !== stageId));
    } catch (err) {
      setError(err.message || 'Unable to delete stage.');
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (stageIndex, direction) => {
    const nextStages = moveInArray(workflow, stageIndex, stageIndex + direction);
    if (nextStages === workflow) return;
    const reorderedStages = nextStages.map((stage, index) => ({ ...stage, sort_order: index }));
    try {
      setSaving(true);
      setError('');
      await persistSortOrder('service_stages', reorderedStages);
      setWorkflow(reorderedStages);
    } catch (err) {
      setError(err.message || 'Unable to reorder stage.');
    } finally {
      setSaving(false);
    }
  };

  const addStep = async (stageId) => {
    if (!supabase) return;

    try {
      setSaving(true);
      const stage = workflow.find((item) => item.id === stageId);
      const nextSortOrder = (stage?.steps || []).length;

      const { data, error: insertError } = await supabase
        .from('service_steps')
        .insert([{ stage_id: stageId, title: 'New Step', sort_order: nextSortOrder }])
        .select('id, stage_id, title, sort_order')
        .single();

      if (insertError) throw insertError;

      setWorkflow((prev) =>
        prev.map((item) => (item.id === stageId ? { ...item, steps: [...(item.steps || []), { ...data, items: [] }] } : item))
      );
    } catch (err) {
      setError(err.message || 'Unable to add step.');
    } finally {
      setSaving(false);
    }
  };

  const moveStep = async (stageId, stepIndex, direction) => {
    const stage = workflow.find((item) => item.id === stageId);
    if (!stage) return;

    const nextSteps = moveInArray(stage.steps || [], stepIndex, stepIndex + direction);
    if (nextSteps === stage.steps) return;
    const reorderedSteps = nextSteps.map((step, index) => ({ ...step, sort_order: index }));

    try {
      setSaving(true);
      setError('');
      await persistSortOrder('service_steps', reorderedSteps);
      setWorkflow((previous) => previous.map((item) => (
        item.id === stageId ? { ...item, steps: reorderedSteps } : item
      )));
    } catch (err) {
      setError(err.message || 'Unable to reorder step.');
    } finally {
      setSaving(false);
    }
  };

  const updateStepTitle = async (stageId, stepId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      const { error: updateError } = await supabase.from('service_steps').update({ title: trimmed }).eq('id', stepId);
      if (updateError) throw updateError;

      setWorkflow((prev) =>
        prev.map((stage) =>
          stage.id === stageId
            ? { ...stage, steps: stage.steps.map((step) => (step.id === stepId ? { ...step, title: trimmed } : step)) }
            : stage
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to update step title.');
    }
  };

  const deleteStep = async (stageId, stepId) => {
    if (!window.confirm('Delete this step and all its items?')) return;

    try {
      setSaving(true);
      const { error: itemsError } = await supabase.from('service_items').delete().eq('step_id', stepId);
      if (itemsError) throw itemsError;

      const { error: stepsError } = await supabase.from('service_steps').delete().eq('id', stepId);
      if (stepsError) throw stepsError;

      setWorkflow((prev) =>
        prev.map((stage) =>
          stage.id === stageId ? { ...stage, steps: stage.steps.filter((step) => step.id !== stepId) } : stage
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to delete step.');
    } finally {
      setSaving(false);
    }
  };

  const addItem = async (stageId, stepId) => {
    if (!supabase) return;

    try {
      setSaving(true);
      const stage = workflow.find((item) => item.id === stageId);
      const step = stage?.steps.find((entry) => entry.id === stepId);
      const nextSortOrder = (step?.items || []).length;

      const { data, error: insertError } = await supabase
        .from('service_items')
        .insert([{ step_id: stepId, title: 'New Item', is_done: false, sort_order: nextSortOrder }])
        .select('id, step_id, title, sort_order')
        .single();

      if (insertError) throw insertError;

      setWorkflow((prev) =>
        prev.map((stageItem) =>
          stageItem.id === stageId
            ? {
                ...stageItem,
                steps: stageItem.steps.map((stepItem) =>
                  stepItem.id === stepId ? { ...stepItem, items: [...(stepItem.items || []), data] } : stepItem
                ),
              }
            : stageItem
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to add item.');
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (stageId, stepId, itemIndex, direction) => {
    const stage = workflow.find((item) => item.id === stageId);
    const step = stage?.steps?.find((item) => item.id === stepId);
    if (!step) return;

    const nextItems = moveInArray(step.items || [], itemIndex, itemIndex + direction);
    if (nextItems === step.items) return;
    const reorderedItems = nextItems.map((item, index) => ({ ...item, sort_order: index }));

    try {
      setSaving(true);
      setError('');
      await persistSortOrder('service_items', reorderedItems);
      setWorkflow((previous) => previous.map((stageItem) => (
        stageItem.id === stageId
          ? {
              ...stageItem,
              steps: stageItem.steps.map((stepItem) => (
                stepItem.id === stepId ? { ...stepItem, items: reorderedItems } : stepItem
              )),
            }
          : stageItem
      )));
    } catch (err) {
      setError(err.message || 'Unable to reorder item.');
    } finally {
      setSaving(false);
    }
  };

  const updateItemTitle = async (stageId, stepId, itemId, title) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Item title is required.');
      return;
    }

    try {
      const { error: updateError } = await supabase.from('service_items').update({ title: trimmed }).eq('id', itemId);
      if (updateError) throw updateError;

      setWorkflow((prev) =>
        prev.map((stage) =>
          stage.id === stageId
            ? {
                ...stage,
                steps: stage.steps.map((step) =>
                  step.id === stepId
                    ? { ...step, items: step.items.map((item) => (item.id === itemId ? { ...item, title: trimmed } : item)) }
                    : step
                ),
              }
            : stage
        )
      );
      setEditingItemId(null);
    } catch (err) {
      setError(err.message || 'Unable to update item.');
    }
  };

  const deleteItem = async (stageId, stepId, itemId) => {
    try {
      setSaving(true);
      const { error: deleteError } = await supabase.from('service_items').delete().eq('id', itemId);
      if (deleteError) throw deleteError;

      setWorkflow((prev) =>
        prev.map((stage) =>
          stage.id === stageId
            ? { ...stage, steps: stage.steps.map((step) => (step.id === stepId ? { ...step, items: step.items.filter((item) => item.id !== itemId) } : step)) }
            : stage
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to delete item.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedTemplate) {
      setEditingTemplateName(false);
      setTemplateMatrix({ country_id: '', visa_type_id: '', professional_status: '' });
      return;
    }
    setDraftTemplateName(selectedTemplate.title);
    setTemplateMatrix({
      country_id: selectedTemplate.country_id || '',
      visa_type_id: selectedTemplate.visa_type_id || '',
      professional_status: selectedTemplate.professional_status || '',
    });
  }, [selectedTemplate]);

  const totalStages = workflow.length;
  const totalSteps = workflow.reduce((sum, stage) => sum + (stage.steps || []).length, 0);
  const totalTemplateItems = workflow.reduce((sum, stage) => sum + (stage.steps || []).reduce((s, step) => s + (step.items || []).length, 0), 0);
  const masterTemplates = templates.filter((template) => template.client_id === null);
  const filteredTemplates = masterTemplates.filter((template) => {
    const matchesCountry = filterCountry === 'All' || template.country_id === filterCountry;
    const matchesVisa = filterVisa === 'All' || template.visa_type_id === filterVisa;
    return matchesCountry && matchesVisa;
  });

  const handleSaveMatrix = async () => {
    const nextCountry = (countryCustom || country).trim();
    const nextVisaType = (visaCustom || visaType).trim();
    const nextStatus = (statusCustom || status).trim();

    if (!nextCountry || !nextVisaType || !nextStatus) {
      setError('Country, visa type, and professional status are required before saving the master template matrix.');
      return;
    }

    const payload = {
      country_id: nextCountry,
      visa_type_id: nextVisaType,
      professional_status: nextStatus,
      title: `${nextCountry} - ${nextVisaType} - ${nextStatus}`,
      client_id: null,
    };

    try {
      setSaving(true);
      setError('');

      const { data: newTemplate, error: insertError } = await supabase
        .from('service_templates')
        .insert([payload])
        .select('*')
        .single();

      if (insertError) throw insertError;

      setTemplates((prev) => [...prev, newTemplate].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))));
      setTemplateMatrix({
        country_id: payload.country_id,
        visa_type_id: payload.visa_type_id,
        professional_status: payload.professional_status,
      });
      setSelectedTemplateId(newTemplate.id);
      setActiveTemplate(newTemplate);
      setCountry('');
      setVisaType('');
      setStatus('');
      setCountrySelect('');
      setVisaSelect('');
      setStatusSelect('');
      setCountryCustom('');
      setVisaCustom('');
      setStatusCustom('');
      setTemplateToCopy('');
      setViewMode('edit');
      await loadTemplateMatrixOptions();
    } catch (err) {
      setError(err.message || 'Unable to save template matrix.');
    } finally {
      setSaving(false);
    }
  };

  const matrixFields = [
    {
      key: 'country_id',
      label: 'Country',
      placeholder: 'e.g. Algeria',
      optionList: matrixOptions.country_id,
    },
    {
      key: 'visa_type_id',
      label: 'Visa Type',
      placeholder: 'e.g. Tourist / Business',
      optionList: matrixOptions.visa_type_id,
    },
    {
      key: 'professional_status',
      label: 'Professional Status',
      placeholder: 'e.g. Employee / Student',
      optionList: matrixOptions.professional_status,
    },
  ];

  const renderMatrixField = (field) => (
    <label key={field.key} className="block text-sm text-brand-navy">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
      <input
        list={`${field.key}-options`}
        type="text"
        value={templateMatrix[field.key] || ''}
        onChange={(event) => {
          const nextValue = event.target.value;
          setTemplateMatrix((prev) => ({ ...prev, [field.key]: nextValue }));
          if (selectedTemplateId) {
            updateTemplateMatrix({ ...templateMatrix, [field.key]: nextValue });
          }
        }}
        placeholder={field.placeholder}
        className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
      />
      <datalist id={`${field.key}-options`}>
        {(field.optionList || []).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card p-1">
          <button
            type="button"
            onClick={() => setMode('clients')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'clients' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-slate-100'
            }`}
          >
            <Users size={16} />
            {t.clientServicesTab}
          </button>
          <button
            type="button"
            onClick={() => setMode('templates')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'templates' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-slate-100'
            }`}
          >
            <Layers size={16} />
            {t.templatesTab}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {mode === 'clients' ? (
        selectedClientService ? (
          <ClientServiceDetail
            row={selectedClientService}
            onBack={() => setSelectedClientServiceId(null)}
            onSave={handleSaveClientService}
            isSaving={isSaving}
            saveMessage={saveMessage}
            onToggleItem={toggleClientServiceItem}
            onUpdateLink={updateClientServiceItemLink}
            onUpdateNote={updateClientServiceItemNote}
            editingItemId={editingItemId}
            setEditingItemId={setEditingItemId}
            editingItemDraft={editingItemDraft}
            setEditingItemDraft={setEditingItemDraft}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="grid w-full max-w-xl gap-3 md:grid-cols-2">
                <label className="block text-sm text-brand-navy">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Country</span>
                  <select
                    value={countryFilter}
                    onChange={(event) => setCountryFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="All">All</option>
                    {clientUniqueCountries.map((countryName) => (
                      <option key={countryName} value={countryName}>{countryName}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-brand-navy">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Visa Type</span>
                  <select
                    value={visaFilter}
                    onChange={(event) => setVisaFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="All">All</option>
                    {clientUniqueVisaTypes.map((visaName) => (
                      <option key={visaName} value={visaName}>{visaName}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={openAssignModal}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
              >
                <Plus size={18} />
                {t.newClientService}
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">Loading...</div>
            ) : filteredClientServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
                {t.noClientServices}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredClientServices.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => setSelectedClientServiceId(row.id)}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-gold">{row.clientName}</p>
                        <h3 className="mt-1 text-lg font-serif text-brand-navy">{row.templateName}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteClientService(row.id);
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mt-4">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${row.progress.percent === 100 ? 'bg-emerald-500' : 'bg-brand-gold'}`}
                          style={{ width: `${row.progress.percent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {row.progress.completedItems} / {row.progress.totalItems} complete · {row.progress.percent}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {viewMode === 'grid' && (
            <div className="mt-6 space-y-6">
              <div className="flex gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex-1">
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Filter by Country</label>
                  <select
                    value={filterCountry}
                    onChange={(event) => setFilterCountry(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    {templateUniqueCountries.map((countryOption) => (
                      <option key={countryOption} value={countryOption}>{countryOption}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Filter by Visa Type</label>
                  <select
                    value={filterVisa}
                    onChange={(event) => setFilterVisa(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    {templateUniqueVisas.map((visaOption) => (
                      <option key={visaOption} value={visaOption}>{visaOption}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div
                  onClick={() => {
                    setActiveTemplate(null);
                    setViewMode('create');
                  }}
                  className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 transition-colors hover:bg-amber-100"
                >
                  <span className="text-lg font-bold text-amber-700">+ Build New Matrix</span>
                </div>

                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => {
                      setActiveTemplate(template);
                      setSelectedTemplateId(template.id);
                      setWorkflow([]);
                      setLoading(true);
                      setViewMode('edit');
                    }}
                    className="flex h-40 cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{template.country_id || 'Unnamed'}</h3>
                      <p className="text-sm font-semibold text-slate-600">{template.visa_type_id || 'No Visa Type'}</p>
                    </div>
                    <div className="mt-4 inline-block w-max rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {template.professional_status || 'Any Status'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'create' && (
            <div className="matrix-card mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Configure New Matrix</h2>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                  <select
                    value={countrySelect || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__other__') {
                        setCountrySelect('__other__');
                        setCountry('');
                        setCountryCustom('');
                        return;
                      }

                      setCountrySelect(value);
                      setCountry(value);
                      setCountryCustom('');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    <option value="">Select country</option>
                    {matrixCountryOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                    <option value="__other__">Other...</option>
                  </select>

                  {countrySelect === '__other__' && (
                    <input
                      type="text"
                      value={countryCustom}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCountryCustom(value);
                        setCountry(value.trim());
                      }}
                      placeholder="Enter country name"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400"
                    />
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Visa Type</label>
                  <select
                    value={visaSelect || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__other__') {
                        setVisaSelect('__other__');
                        setVisaType('');
                        setVisaCustom('');
                        return;
                      }

                      setVisaSelect(value);
                      setVisaType(value);
                      setVisaCustom('');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    <option value="">Select visa type</option>
                    {matrixVisaOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                    <option value="__other__">Other...</option>
                  </select>

                  {visaSelect === '__other__' && (
                    <input
                      type="text"
                      value={visaCustom}
                      onChange={(e) => {
                        const value = e.target.value;
                        setVisaCustom(value);
                        setVisaType(value.trim());
                      }}
                      placeholder="Enter visa type"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400"
                    />
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Professional Status</label>
                  <select
                    value={statusSelect || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__other__') {
                        setStatusSelect('__other__');
                        setStatus('');
                        setStatusCustom('');
                        return;
                      }

                      setStatusSelect(value);
                      setStatus(value);
                      setStatusCustom('');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    <option value="">Select professional status</option>
                    {matrixStatusOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                    <option value="__other__">Other...</option>
                  </select>

                  {statusSelect === '__other__' && (
                    <input
                      type="text"
                      value={statusCustom}
                      onChange={(e) => {
                        const value = e.target.value;
                        setStatusCustom(value);
                        setStatus(value.trim());
                      }}
                      placeholder="Enter professional status"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400"
                    />
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-6">
                <div className="max-w-md flex-1">
                  <label className="text-sm text-slate-600">Optional: Copy from existing template</label>
                  <select
                    value={templateToCopy}
                    onChange={(event) => {
                      const selectedId = event.target.value;
                      setTemplateToCopy(selectedId);

                      if (!selectedId) {
                        setCountry('');
                        setVisaType('');
                        setStatus('');
                        setCountrySelect('');
                        setVisaSelect('');
                        setStatusSelect('');
                        setCountryCustom('');
                        setVisaCustom('');
                        setStatusCustom('');
                        return;
                      }

                      const selectedTemplateCopy = templates.find((template) => template.id === selectedId);
                      if (selectedTemplateCopy) {
                        const nextCountry = selectedTemplateCopy.country_id || '';
                        const nextVisa = selectedTemplateCopy.visa_type_id || '';
                        const nextStatus = selectedTemplateCopy.professional_status || '';

                        setCountry(nextCountry);
                        setVisaType(nextVisa);
                        setStatus(nextStatus);
                        setCountrySelect(nextCountry);
                        setVisaSelect(nextVisa);
                        setStatusSelect(nextStatus);
                        setCountryCustom('');
                        setVisaCustom('');
                        setStatusCustom('');
                        setTemplateMatrix({
                          country_id: nextCountry,
                          visa_type_id: nextVisa,
                          professional_status: nextStatus,
                        });
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  >
                    <option value="">Start from scratch</option>
                    {masterTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.country_id} - {template.visa_type_id} ({template.professional_status})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveMatrix}
                  className="rounded-lg bg-amber-500 px-6 py-2 font-bold text-white hover:bg-amber-600"
                >
                  Save Matrix & Build Workflow
                </button>
              </div>
            </div>
          )}

          {viewMode === 'edit' && activeTemplate && (
            <div className="workflow-editor mt-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className="mb-2 text-sm font-semibold text-amber-600 hover:text-amber-700"
                  >
                    ← Back to Templates
                  </button>
                  <h2 className="text-2xl font-bold text-slate-800">
                    {activeTemplate.country_id} - {activeTemplate.visa_type_id}
                  </h2>
                  <p className="text-slate-500">Status: {activeTemplate.professional_status}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {saveMessage && (
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-600 animate-pulse">
                      {saveMessage}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={isSaving || saving || loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {editingTemplateName ? (
                      <>
                        <input
                          value={draftTemplateName}
                          onChange={(event) => setDraftTemplateName(event.target.value)}
                          className="rounded-xl border border-slate-200 bg-brand-surface px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                        />
                        <button type="button" onClick={renameTemplate} className="rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy">
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold text-brand-navy">{selectedTemplate.title}</h3>
                        <button
                          type="button"
                          onClick={() => setEditingTemplateName(true)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy"
                        >
                          <Pencil size={12} />
                          Rename
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteTemplate(selectedTemplate.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600"
                  >
                    <Trash2 size={14} />
                    Delete template
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stages</p>
                  <p className="mt-2 text-2xl font-bold text-brand-navy">{totalStages}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Steps</p>
                  <p className="mt-2 text-2xl font-bold text-brand-navy">{totalSteps}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Items</p>
                  <p className="mt-2 text-2xl font-bold text-brand-navy">{totalTemplateItems}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={addStage}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
                >
                  <Plus size={18} />
                  Add Stage
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-center text-sm text-slate-500">Loading workflow...</div>
                ) : workflow.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
                    No stages yet. Add your first stage.
                  </div>
                ) : (
                  workflow.map((stage, stageIndex) => (
                    <div key={stage.id} className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
                        <input
                          value={stage.title}
                          onChange={(event) =>
                            setWorkflow((prev) => prev.map((item) => (item.id === stage.id ? { ...item, title: event.target.value } : item)))
                          }
                          onBlur={() => updateStageTitle(stage.id, stage.title)}
                          className="border-b border-transparent bg-transparent text-lg font-semibold text-brand-navy outline-none focus:border-brand-gold"
                        />

                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => addStep(stage.id)} className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy">
                            <Plus size={14} />
                            Add Step
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(stageIndex, -1)}
                            disabled={saving || stageIndex === 0}
                            aria-label={`Move ${stage.title} up`}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(stageIndex, 1)}
                            disabled={saving || stageIndex === workflow.length - 1}
                            aria-label={`Move ${stage.title} down`}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button type="button" onClick={() => deleteStage(stage.id)} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {(stage.steps || []).map((step, stepIndex) => (
                          <div key={step.id} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <FileText size={16} className="text-brand-gold" />
                                <input
                                  value={step.title}
                                  onChange={(event) =>
                                    setWorkflow((prev) =>
                                      prev.map((stageItem) =>
                                        stageItem.id === stage.id
                                          ? { ...stageItem, steps: stageItem.steps.map((stepItem) => (stepItem.id === step.id ? { ...stepItem, title: event.target.value } : stepItem)) }
                                          : stageItem
                                      )
                                    )
                                  }
                                  onBlur={() => updateStepTitle(stage.id, step.id, step.title)}
                                  className="border-b border-transparent bg-transparent font-medium text-brand-navy outline-none focus:border-brand-gold"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => addItem(stage.id, step.id)} className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy">
                                  <Plus size={14} />
                                  Add Item
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStep(stage.id, stepIndex, -1)}
                                  disabled={saving || stepIndex === 0}
                                  aria-label={`Move ${step.title} up`}
                                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStep(stage.id, stepIndex, 1)}
                                  disabled={saving || stepIndex === (stage.steps || []).length - 1}
                                  aria-label={`Move ${step.title} down`}
                                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button type="button" onClick={() => deleteStep(stage.id, step.id)} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {(step.items || []).map((item, itemIndex) => {
                                const isItemEditing = editingItemId === item.id;
                                return (
                                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                                    {isItemEditing ? (
                                      <div className="flex flex-1 items-center gap-2">
                                        <input
                                          value={editingItemDraft}
                                          onChange={(event) => setEditingItemDraft(event.target.value)}
                                          className="flex-1 rounded-lg border border-slate-200 bg-brand-surface px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => updateItemTitle(stage.id, step.id, item.id, editingItemDraft)}
                                          className="rounded-lg bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingItemId(null)}
                                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <ListChecks size={14} className="shrink-0 text-brand-gold" />
                                        <span className="truncate text-sm text-slate-700">{item.title}</span>
                                      </div>
                                    )}

                                    {!isItemEditing && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => moveItem(stage.id, step.id, itemIndex, -1)}
                                          disabled={saving || itemIndex === 0}
                                          aria-label={`Move ${item.title} up`}
                                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                                        >
                                          <ArrowUp size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => moveItem(stage.id, step.id, itemIndex, 1)}
                                          disabled={saving || itemIndex === (step.items || []).length - 1}
                                          aria-label={`Move ${item.title} down`}
                                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-35"
                                        >
                                          <ArrowDown size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingItemId(item.id);
                                            setEditingItemDraft(item.title);
                                          }}
                                          className="rounded-lg border border-slate-200 bg-white p-2 text-brand-navy"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteItem(stage.id, step.id, item.id)}
                                          className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <form onSubmit={handleAssignSubmit} className="w-full max-w-md space-y-4 rounded-2xl bg-brand-card p-6 shadow-2xl">
            <h3 className="font-serif text-xl text-brand-navy">{t.newClientService}</h3>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Client</label>
              <select
                value={assignForm.client_id}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, client_id: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                required
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Country</label>
              <select
                value={assignForm.country_id}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, country_id: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                required
              >
                <option value="">Select country</option>
                {assignMatrixOptions.country_id.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Visa Type</label>
              <select
                value={assignForm.visa_type_id}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, visa_type_id: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                required
              >
                <option value="">Select visa type</option>
                {assignMatrixOptions.visa_type_id.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy">Professional Status</label>
              <select
                value={assignForm.professional_status}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, professional_status: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                required
              >
                <option value="">Select professional status</option>
                {assignMatrixOptions.professional_status.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !assignForm.client_id || !assignForm.country_id || !assignForm.visa_type_id || !assignForm.professional_status}
                className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
              >
                {saving ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ClientServiceDetail({ row, onBack, onSave, isSaving, saveMessage, onToggleItem, onUpdateLink, onUpdateNote, editingItemId, setEditingItemId, editingItemDraft, setEditingItemDraft }) {
  const stagesData = row.stages_data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {saveMessage && (
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-600 animate-pulse">
              {saveMessage}
            </span>
          )}
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-gold">{row.clientName}</p>
            <h3 className="font-serif text-2xl text-brand-navy">{row.templateName}</h3>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Service'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${row.progress.percent === 100 ? 'bg-emerald-500' : 'bg-brand-gold'}`}
            style={{ width: `${row.progress.percent}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          {row.progress.completedItems} / {row.progress.totalItems} complete · {row.progress.percent}%
        </p>
      </div>

      <div className="space-y-4">
        {stagesData.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
            This template has no checklist stages defined yet.
          </div>
        ) : (
          stagesData.map((stage) => (
            <div key={stage.id} className="rounded-2xl border border-slate-200 bg-brand-card p-4 shadow-sm">
              <h4 className="text-lg font-semibold text-brand-navy">{stage.title}</h4>

              <div className="mt-3 space-y-3">
                {(stage.steps || []).map((step) => (
                  <div key={step.id} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                    <p className="mb-2 font-medium text-brand-navy">{step.title}</p>

                    <div className="space-y-2">
                      {(step.items || []).map((item) => {
                        const isItemEditing = editingItemId === item.id;
                        const itemDone = Boolean(item.is_done);

                        return (
                          <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => onToggleItem(stage.id, step.id, item.id, !itemDone)}
                                className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                                  itemDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'
                                }`}
                                aria-label={itemDone ? 'Mark item as undone' : 'Mark item as done'}
                              >
                                <Check size={12} />
                              </button>

                              <span className={`truncate text-sm ${itemDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                {item.title}
                              </span>

                              <input
                                type="text"
                                placeholder="Add notes..."
                                defaultValue={item.note || ''}
                                onBlur={(event) => onUpdateNote(stage.id, step.id, item.id, event.target.value)}
                                className="ml-1 w-full max-w-xs rounded px-2 py-1 text-sm text-slate-600 border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none focus:bg-white transition-all"
                                aria-label={`Notes for ${item.title}`}
                              />
                            </div>

                            {isItemEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={editingItemDraft}
                                  onChange={(event) => setEditingItemDraft(event.target.value)}
                                  placeholder="Paste Google Drive URL"
                                  className="w-56 rounded-lg border border-slate-200 bg-brand-surface px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-gold"
                                />
                                <button
                                  type="button"
                                  onClick={() => onUpdateLink(stage.id, step.id, item.id, editingItemDraft)}
                                  className="rounded-lg bg-brand-gold px-3 py-2 text-xs font-bold text-brand-navy"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingItemId(null)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex shrink-0 items-center gap-2">
                                {item.drive_url && (
                                  <a
                                    href={getExternalUrl(item.drive_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                                  >
                                    <LinkIcon size={12} />
                                    Open Link
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditingItemDraft(item.drive_url || '');
                                  }}
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-navy"
                                >
                                  <LinkIcon size={12} />
                                  {item.drive_url ? 'Edit link' : 'Add Drive link'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
