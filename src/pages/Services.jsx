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
import { buildStagesDataFromTemplate, computeStagesProgress, ensureClientService, markTaskDoneIfComplete } from '../lib/serviceWorkflow';

const createUniqueTemplateKey = () => {
  const stamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `template-${stamp}-${randomPart}`;
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

  // Client services state
  const [clientServices, setClientServices] = useState([]);
  const [selectedClientServiceId, setSelectedClientServiceId] = useState(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ client_id: '', template_id: '' });

  // Shared lookups
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [packages, setPackages] = useState([]);

  // Templates builder state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [workflow, setWorkflow] = useState([]);
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [draftTemplateName, setDraftTemplateName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemDraft, setEditingItemDraft] = useState('');

  const loadLookups = async () => {
    if (!supabase) return;

    const [clientsRes, templatesRes, packagesRes] = await Promise.all([
      supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
      supabase
        .from('service_templates')
        .select('id, title, package_id, packages(title)')
        .order('title', { ascending: true }),
      supabase.from('packages').select('id, title').order('title', { ascending: true }),
    ]);

    if (clientsRes.error) throw clientsRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (packagesRes.error) throw packagesRes.error;

    setClients(clientsRes.data || []);
    setTemplates(
      (templatesRes.data || []).map((template) => ({
        ...template,
        packageName: template.packages?.title || '—',
      }))
    );
    setPackages(packagesRes.data || []);
  };

  const loadClientServices = async () => {
    if (!supabase) {
      setClientServices([]);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('client_services')
      .select('id, client_id, template_id, stages_data, created_at, clients(full_name), service_templates(title)')
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

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }

      await Promise.all([loadLookups(), loadClientServices()]);
    } catch (err) {
      setError(err.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectedClientService = clientServices.find((row) => row.id === selectedClientServiceId) || null;

  // ---- Client Services: assign + workflow updates ----

  const openAssignModal = () => {
    setAssignForm({ client_id: '', template_id: '' });
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    if (!assignForm.client_id || !assignForm.template_id) {
      setError('Please select both a client and a service template.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await ensureClientService({ clientId: assignForm.client_id, templateId: assignForm.template_id });

      setIsAssignModalOpen(false);
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

  // ---- Templates: manage stages/steps/items ----

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

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

  const addTemplate = async () => {
    if (!supabase) return;

    try {
      setSaving(true);
      setError('');

      const uniqueKey = createUniqueTemplateKey();
      const { data, error: insertError } = await supabase
        .from('service_templates')
        .insert([{ title: 'New Template', country_id: uniqueKey, visa_type_id: 'general' }])
        .select('id, title, package_id')
        .single();

      if (insertError) throw insertError;

      setTemplates((prev) => [...prev, { ...data, packageName: '—' }].sort((a, b) => a.title.localeCompare(b.title)));
      setSelectedTemplateId(data.id);
      setDraftTemplateName(data.title);
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

  const updateTemplateLinks = async (packageId) => {
    if (!selectedTemplateId) return;

    try {
      setSaving(true);
      const { error: updateError } = await supabase
        .from('service_templates')
        .update({ package_id: packageId || null })
        .eq('id', selectedTemplateId);

      if (updateError) throw updateError;

      setTemplates((prev) =>
        prev.map((template) =>
          template.id === selectedTemplateId
            ? {
                ...template,
                package_id: packageId || null,
                packageName: packages.find((pkg) => pkg.id === packageId)?.title || '—',
              }
            : template
        )
      );
    } catch (err) {
      setError(err.message || 'Unable to update template links.');
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

  const reorderStage = async (stageId, direction) => {
    const orderedStages = [...workflow].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const currentIndex = orderedStages.findIndex((stage) => stage.id === stageId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedStages.length) return;

    const nextStages = [...orderedStages];
    [nextStages[currentIndex], nextStages[targetIndex]] = [nextStages[targetIndex], nextStages[currentIndex]];

    try {
      await Promise.all(
        nextStages.map((stage, index) => supabase.from('service_stages').update({ sort_order: index }).eq('id', stage.id))
      );
      setWorkflow(nextStages);
    } catch (err) {
      setError(err.message || 'Unable to reorder stage.');
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
      return;
    }
    setDraftTemplateName(selectedTemplate.title);
  }, [selectedTemplate]);

  const totalStages = workflow.length;
  const totalSteps = workflow.reduce((sum, stage) => sum + (stage.steps || []).length, 0);
  const totalTemplateItems = workflow.reduce((sum, stage) => sum + (stage.steps || []).reduce((s, step) => s + (step.items || []).length, 0), 0);

  return (
    <div className="space-y-6">
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
            onToggleItem={toggleClientServiceItem}
            onUpdateLink={updateClientServiceItemLink}
            editingItemId={editingItemId}
            setEditingItemId={setEditingItemId}
            editingItemDraft={editingItemDraft}
            setEditingItemDraft={setEditingItemDraft}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
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
            ) : clientServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
                {t.noClientServices}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {clientServices.map((row) => (
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  selectedTemplateId === template.id ? 'bg-brand-navy text-white' : 'bg-brand-surface text-brand-navy hover:bg-slate-200'
                }`}
              >
                {template.title}
              </button>
            ))}

            <button
              type="button"
              onClick={addTemplate}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy"
            >
              <Plus size={16} />
              {t.newTemplate}
            </button>
          </div>

          {templates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">
              {t.noTemplates}
            </div>
          )}

          {selectedTemplate && (
            <div className="space-y-4">
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

                <div className="mt-4 grid gap-3 md:grid-cols-1">
                  <select
                    value={selectedTemplate.package_id || ''}
                    onChange={(event) => updateTemplateLinks(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="">No package linked</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>{pkg.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addStage}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
                >
                  <Plus size={18} />
                  Add Stage
                </button>
              </div>

              <div className="space-y-4">
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
                          {stageIndex > 0 && (
                            <button type="button" onClick={() => reorderStage(stage.id, -1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500">
                              <ArrowUp size={14} />
                            </button>
                          )}
                          {stageIndex < workflow.length - 1 && (
                            <button type="button" onClick={() => reorderStage(stage.id, 1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500">
                              <ArrowDown size={14} />
                            </button>
                          )}
                          <button type="button" onClick={() => deleteStage(stage.id)} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {(stage.steps || []).map((step) => (
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
                                <button type="button" onClick={() => deleteStep(stage.id, step.id)} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {(step.items || []).map((item) => {
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
        </div>
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
              <label className="mb-1 block text-sm font-medium text-brand-navy">Service template</label>
              <select
                value={assignForm.template_id}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, template_id: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold"
                required
              >
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.title}</option>
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
                disabled={saving}
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

function ClientServiceDetail({ row, onBack, onToggleItem, onUpdateLink, editingItemId, setEditingItemId, editingItemDraft, setEditingItemDraft }) {
  const stagesData = row.stages_data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-gold">{row.clientName}</p>
          <h3 className="font-serif text-2xl text-brand-navy">{row.templateName}</h3>
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
                            <div className="flex min-w-0 flex-1 items-center gap-3">
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

                              {item.drive_url && (
                                <a
                                  href={item.drive_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex rounded-lg bg-brand-surface p-2 text-brand-navy transition hover:bg-slate-200"
                                  aria-label="Open item drive link"
                                >
                                  <LinkIcon size={14} />
                                </a>
                              )}
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
