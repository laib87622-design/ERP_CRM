export const normalizeTemplateWorkflow = (workflow = []) => {
  if (!Array.isArray(workflow)) {
    throw new Error('Workflow stages must be an array.');
  }

  return workflow.map((stage, stageIndex) => {
    const stageTitle = String(stage?.title || '').trim();
    if (!stageTitle) throw new Error(`Stage ${stageIndex + 1} must have a title.`);

    return {
      title: stageTitle,
      sort_order: stageIndex,
      steps: (stage.steps || []).map((step, stepIndex) => {
        const stepTitle = String(step?.title || '').trim();
        if (!stepTitle) throw new Error(`Step ${stepIndex + 1} in "${stageTitle}" must have a title.`);

        return {
          title: stepTitle,
          sort_order: stepIndex,
          items: (step.items || []).map((item, itemIndex) => {
            const itemTitle = String(item?.title || '').trim();
            if (!itemTitle) throw new Error(`Item ${itemIndex + 1} in "${stepTitle}" must have a title.`);

            const estimatedPrice = Number(item.estimated_price ?? 0);
            if (!Number.isFinite(estimatedPrice) || estimatedPrice < 0) {
              throw new Error(`Estimated price for "${itemTitle}" must be a valid non-negative amount.`);
            }

            return {
              title: itemTitle,
              standard_note: String(item.standard_note || '').trim(),
              estimated_price: estimatedPrice,
              drive_url: item.drive_url || null,
              is_done: Boolean(item.is_done),
              sort_order: itemIndex,
            };
          }),
        };
      }),
    };
  });
};

export const templateWorkflowQueryKey = (templateId) => ['service-template-workflow', templateId];

export const formatRefreshFailureMessage = (recordName, error) => (
  `${recordName} saved, but refreshing it failed: ${error?.message || 'Unknown refresh error.'}`
);

const normalizedTitle = (record) => String(record?.title || '').trim().toLowerCase();

const findWorkflowMatch = (source, currentRecords, usedRecords, sourceIndex) => {
  const available = currentRecords.filter((record) => !usedRecords.has(record));
  return available.find((record) => record.id && source.id && record.id === source.id)
    || available.find((record) => normalizedTitle(record) === normalizedTitle(source)
      && Number(record.sort_order ?? sourceIndex) === Number(source.sort_order ?? sourceIndex))
    || available.find((record) => normalizedTitle(record) === normalizedTitle(source))
    || available.find((record) => Number(record.sort_order ?? currentRecords.indexOf(record)) === Number(source.sort_order ?? sourceIndex))
    || available[sourceIndex]
    || null;
};

export const mergeClientWorkflowWithTemplate = (currentStages = [], templateStages = []) => {
  const existingStages = Array.isArray(currentStages) ? currentStages : [];
  const normalizedStages = normalizeTemplateWorkflow(templateStages);
  const sourceStages = normalizedStages.map((stage, stageIndex) => ({
    ...stage,
    id: templateStages[stageIndex]?.id,
    steps: stage.steps.map((step, stepIndex) => ({
      ...step,
      id: templateStages[stageIndex]?.steps?.[stepIndex]?.id,
      items: step.items.map((item, itemIndex) => ({
        ...item,
        id: templateStages[stageIndex]?.steps?.[stepIndex]?.items?.[itemIndex]?.id,
      })),
    })),
  }));
  const usedStages = new Set();

  const mergedStages = sourceStages.map((stage, stageIndex) => {
    const existingStage = findWorkflowMatch(stage, existingStages, usedStages, stageIndex);
    if (existingStage) usedStages.add(existingStage);

    const oldSteps = existingStage?.steps || [];
    const usedSteps = new Set();
    const mergedSteps = stage.steps.map((step, stepIndex) => {
      const existingStep = findWorkflowMatch(step, oldSteps, usedSteps, stepIndex);
      if (existingStep) usedSteps.add(existingStep);

      const oldItems = existingStep?.items || [];
      const usedItems = new Set();
      const mergedItems = step.items.map((item, itemIndex) => {
        const existingItem = findWorkflowMatch(item, oldItems, usedItems, itemIndex);
        if (existingItem) usedItems.add(existingItem);

        return {
          ...item,
          is_done: Boolean(existingItem?.is_done),
          drive_url: existingItem?.drive_url || null,
          note: existingItem?.note || '',
        };
      });

      const completedRemovedItems = oldItems
        .filter((item) => item.is_done && !usedItems.has(item))
        .map((item) => ({ ...item, sync_removed_from_template: true }));

      return {
        ...step,
        items: [...mergedItems, ...completedRemovedItems],
      };
    });

    const completedRemovedSteps = oldSteps
      .filter((step) => !usedSteps.has(step) && (step.items || []).some((item) => item.is_done))
      .map((step) => ({
        ...step,
        sync_removed_from_template: true,
        items: (step.items || []).map((item) => ({ ...item, sync_removed_from_template: true })),
      }));

    return {
      ...stage,
      steps: [...mergedSteps, ...completedRemovedSteps],
    };
  });

  const completedRemovedStages = existingStages
    .filter((stage) => !usedStages.has(stage) && (stage.steps || []).some((step) => (
      (step.items || []).some((item) => item.is_done)
    )))
    .map((stage) => ({
      ...stage,
      sync_removed_from_template: true,
      steps: (stage.steps || []).map((step) => ({
        ...step,
        sync_removed_from_template: true,
        items: (step.items || []).map((item) => ({ ...item, sync_removed_from_template: true })),
      })),
    }));

  return [...mergedStages, ...completedRemovedStages];
};

export const fetchTemplateWorkflow = async ({ supabaseClient, templateId }) => {
  if (!supabaseClient || !templateId) return [];

  const { data, error } = await supabaseClient
    .from('service_templates')
    .select(`
      *,
      service_stages (
        *,
        service_steps (
          *,
          service_items (*)
        )
      )
    `)
    .eq('id', templateId)
    .single();

  if (error) throw error;

  return (data?.service_stages || [])
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((stage, stageIndex) => {
      const { service_steps: rawSteps = [], ...stageFields } = stage;
      return {
        ...stageFields,
        sort_order: Number(stage.sort_order ?? stageIndex),
        steps: rawSteps
          .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
          .map((step, stepIndex) => {
            const { service_items: rawItems = [], ...stepFields } = step;
            return {
              ...stepFields,
              sort_order: Number(step.sort_order ?? stepIndex),
              items: rawItems
                .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
                .map((item, itemIndex) => ({
                  ...item,
                  standard_note: item.standard_note || '',
                  estimated_price: Number(item.estimated_price || 0),
                  sort_order: Number(item.sort_order ?? itemIndex),
                })),
            };
          }),
      };
    });
};

export const saveTemplateWorkflow = async ({ supabaseClient, templateId, title, matrix, workflow }) => {
  if (!supabaseClient?.rpc) throw new Error('Supabase is not configured.');
  if (!templateId) throw new Error('Select a template before saving.');

  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) throw new Error('Template name is required.');

  const countryId = String(matrix?.country_id || '').trim();
  const visaTypeId = String(matrix?.visa_type_id || '').trim();
  const professionalStatus = String(matrix?.professional_status || '').trim();
  if (!countryId || !visaTypeId || !professionalStatus) {
    throw new Error('Country, visa type, and professional status are required before saving the template.');
  }

  const stages = normalizeTemplateWorkflow(workflow);
  const { error } = await supabaseClient.rpc('save_service_template_workflow', {
    p_template_id: templateId,
    p_title: normalizedTitle,
    p_country_id: countryId,
    p_visa_type_id: visaTypeId,
    p_professional_status: professionalStatus,
    p_stages: stages,
  });

  if (error) throw error;
  return stages;
};