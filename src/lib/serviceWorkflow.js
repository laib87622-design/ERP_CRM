import { supabase } from './supabase';

// Reads the normalized template structure and clones it into the JSON shape stored on client_services.stages_data.
export const buildStagesDataFromTemplate = async (templateId) => {
  if (!supabase || !templateId) return [];

  const [stagesRes, stepsRes, itemsRes] = await Promise.all([
    supabase
      .from('service_stages')
      .select('id, title, sort_order')
      .eq('service_template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase.from('service_steps').select('id, stage_id, title, sort_order').order('sort_order', { ascending: true }),
    supabase.from('service_items').select('id, step_id, title, sort_order').order('sort_order', { ascending: true }),
  ]);

  if (stagesRes.error) throw stagesRes.error;
  if (stepsRes.error) throw stepsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return (stagesRes.data || []).map((stage) => ({
    id: stage.id,
    title: stage.title,
    sort_order: stage.sort_order,
    steps: (stepsRes.data || [])
      .filter((step) => step.stage_id === stage.id)
      .map((step) => ({
        id: step.id,
        title: step.title,
        sort_order: step.sort_order,
        items: (itemsRes.data || [])
          .filter((item) => item.step_id === step.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            is_done: false,
            drive_url: null,
            sort_order: item.sort_order,
          })),
      })),
  }));
};

export const computeStagesProgress = (stagesData = []) => {
  let totalItems = 0;
  let completedItems = 0;

  (stagesData || []).forEach((stage) => {
    (stage.steps || []).forEach((step) => {
      (step.items || []).forEach((item) => {
        totalItems += 1;
        if (item.is_done) completedItems += 1;
      });
    });
  });

  const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  return { totalItems, completedItems, percent };
};

// Creates a client_services row from the template on first assignment; returns the existing row otherwise.
export const ensureClientService = async ({ clientId, templateId }) => {
  if (!supabase || !clientId || !templateId) return null;

  const { data: existing, error: fetchError } = await supabase
    .from('client_services')
    .select('id, client_id, template_id, stages_data, created_at')
    .eq('client_id', clientId)
    .eq('template_id', templateId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const stagesData = await buildStagesDataFromTemplate(templateId);

  const { data: created, error: insertError } = await supabase
    .from('client_services')
    .insert([{ client_id: clientId, template_id: templateId, stages_data: stagesData }])
    .select('id, client_id, template_id, stages_data, created_at')
    .single();

  if (insertError) throw insertError;
  return created;
};

// Marks the linked task 'done' once every checklist item for this client/template pair is complete.
export const markTaskDoneIfComplete = async ({ clientId, templateId, stagesData }) => {
  if (!supabase || !clientId || !templateId) return;

  const { totalItems, completedItems } = computeStagesProgress(stagesData);
  if (totalItems === 0 || completedItems !== totalItems) return;

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('service_id', templateId)
    .eq('client_id', clientId);

  if (error) throw error;
};

export const duplicateMasterTemplate = async (templateId) => {
  if (!supabase || !templateId) return null;

  const { data: masterTemplate, error: masterError } = await supabase
    .from('service_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (masterError) throw masterError;

  const [stagesRes, stepsRes, itemsRes] = await Promise.all([
    supabase
      .from('service_stages')
      .select('*')
      .eq('service_template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabase.from('service_steps').select('*').order('sort_order', { ascending: true }),
    supabase.from('service_items').select('*').order('sort_order', { ascending: true }),
  ]);

  if (stagesRes.error) throw stagesRes.error;
  if (stepsRes.error) throw stepsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const { id: _oldTemplateId, created_at: _createdAt, updated_at: _updatedAt, client_id: _clientId, ...templatePayload } = masterTemplate;
  const copiedTitle = `${String(masterTemplate.title || 'Template').trim()} (Copy)`;

  const { data: clonedTemplate, error: templateInsertError } = await supabase
    .from('service_templates')
    .insert([
      {
        ...templatePayload,
        title: copiedTitle,
        client_id: null,
      },
    ])
    .select('*')
    .single();

  if (templateInsertError) throw templateInsertError;

  const stageIdMap = {};
  for (const stage of stagesRes.data || []) {
    const { id: oldStageId, created_at: _stageCreatedAt, updated_at: _stageUpdatedAt, service_template_id: _ignoredTemplateId, ...stagePayload } = stage;

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
    stageIdMap[oldStageId] = insertedStage.id;
  }

  const stepIdMap = {};
  for (const step of stepsRes.data || []) {
    if (!stageIdMap[step.stage_id]) continue;

    const { id: oldStepId, created_at: _stepCreatedAt, updated_at: _stepUpdatedAt, ...stepPayload } = step;

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
    stepIdMap[oldStepId] = insertedStep.id;
  }

  for (const item of itemsRes.data || []) {
    if (!stepIdMap[item.step_id]) continue;

    const { id: _oldItemId, created_at: _itemCreatedAt, updated_at: _itemUpdatedAt, ...itemPayload } = item;

    const { error: itemInsertError } = await supabase
      .from('service_items')
      .insert([
        {
          ...itemPayload,
          step_id: stepIdMap[item.step_id],
        },
      ]);

    if (itemInsertError) throw itemInsertError;
  }

  return clonedTemplate;
};
