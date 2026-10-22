import { describe, expect, it, vi } from 'vitest';
import {
  fetchTemplateWorkflow,
  formatRefreshFailureMessage,
  mergeClientWorkflowWithTemplate,
  normalizeTemplateWorkflow,
  saveTemplateWorkflow,
} from '../src/lib/templateWorkflow.js';

const workflowFixture = [
  {
    id: 'old-stage-id',
    title: '  Documents  ',
    sort_order: 8,
    steps: [
      {
        id: 'old-step-id',
        title: 'Application',
        items: [
          {
            id: 'old-item-id',
            title: ' Passport copy ',
            standard_note: '  Check validity  ',
            estimated_price: '1250',
            drive_url: 'https://example.test/file',
            is_done: false,
            sort_order: 6,
          },
        ],
      },
    ],
  },
];

describe('normalizeTemplateWorkflow', () => {
  it('normalizes nested titles, item metadata, and ordering', () => {
    expect(normalizeTemplateWorkflow(workflowFixture)).toEqual([
      {
        id: 'old-stage-id',
        title: 'Documents',
        sort_order: 0,
        steps: [
          {
            id: 'old-step-id',
            title: 'Application',
            sort_order: 0,
            items: [
              {
                id: 'old-item-id',
                title: 'Passport copy',
                standard_note: 'Check validity',
                estimated_price: 1250,
                drive_url: 'https://example.test/file',
                is_done: false,
                sort_order: 0,
              },
            ],
          },
        ],
      },
    ]);
  });

  it('omits IDs for new records so Supabase can generate them', () => {
    const [stage] = normalizeTemplateWorkflow([{
      title: 'New stage',
      steps: [{
        title: 'New step',
        items: [{ title: 'New item' }],
      }],
    }]);

    expect(stage).not.toHaveProperty('id');
    expect(stage.steps[0]).not.toHaveProperty('id');
    expect(stage.steps[0].items[0]).not.toHaveProperty('id');
  });

  it('rejects invalid nested titles and prices before saving', () => {
    expect(() => normalizeTemplateWorkflow([{ title: ' ' }])).toThrow('Stage 1 must have a title.');
    expect(() => normalizeTemplateWorkflow([{ title: 'Stage', steps: [{ title: '' }] }]))
      .toThrow('Step 1 in "Stage" must have a title.');
    expect(() => normalizeTemplateWorkflow([{
      title: 'Stage',
      steps: [{ title: 'Step', items: [{ title: 'Item', estimated_price: -1 }] }],
    }])).toThrow('Estimated price for "Item" must be a valid non-negative amount.');
  });
});

describe('saveTemplateWorkflow', () => {
  it('sends the full tree in exactly one atomic RPC call', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const stages = await saveTemplateWorkflow({
      supabaseClient: { rpc },
      templateId: 'template-id',
      title: 'Visa workflow',
      matrix: { country_id: 'DZ', visa_type_id: 'Tourist', professional_status: 'Employee' },
      workflow: workflowFixture,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_service_template_workflow', expect.objectContaining({
      p_template_id: 'template-id',
      p_title: 'Visa workflow',
      p_stages: stages,
    }));
    expect(stages[0].steps[0].items[0].standard_note).toBe('Check validity');
    expect(stages[0].steps[0].items[0].estimated_price).toBe(1250);
    expect(stages[0]).toMatchObject({
      id: 'old-stage-id',
      steps: [{
        id: 'old-step-id',
        items: [{ id: 'old-item-id' }],
      }],
    });
  });

  it('surfaces database errors without retrying non-atomic writes', async () => {
    const rpcError = new Error('Template write failed');
    const rpc = vi.fn().mockResolvedValue({ error: rpcError });

    await expect(saveTemplateWorkflow({
      supabaseClient: { rpc },
      templateId: 'template-id',
      title: 'Visa workflow',
      matrix: { country_id: 'DZ', visa_type_id: 'Tourist', professional_status: 'Employee' },
      workflow: workflowFixture,
    })).rejects.toBe(rpcError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('fetchTemplateWorkflow', () => {
  it('maps and sorts nested relational rows for the builder', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({
      data: {
        service_stages: [
          {
            id: 'stage-2',
            title: 'Second',
            sort_order: 2,
            service_steps: [],
          },
          {
            id: 'stage-1',
            title: 'First',
            sort_order: 1,
            service_steps: [{
              id: 'step-1',
              title: 'Step',
              sort_order: 0,
              service_items: [{
                id: 'item-1',
                title: 'Passport',
                standard_note: 'Check validity',
                estimated_price: '1250',
                sort_order: 0,
              }],
            }],
          },
        ],
      },
      error: null,
    });
    const supabaseClient = { from: vi.fn(() => query) };

    const stages = await fetchTemplateWorkflow({ supabaseClient, templateId: 'template-1' });

    expect(supabaseClient.from).toHaveBeenCalledWith('service_templates');
    expect(stages.map((stage) => stage.id)).toEqual(['stage-1', 'stage-2']);
    expect(stages[0].steps[0].items[0]).toMatchObject({
      standard_note: 'Check validity',
      estimated_price: 1250,
    });
  });
});

describe('formatRefreshFailureMessage', () => {
  it('makes a committed save distinct from a failed refresh', () => {
    expect(formatRefreshFailureMessage('Template', new Error('Network unavailable')))
      .toBe('Template saved, but refreshing it failed: Network unavailable');
  });
});

describe('mergeClientWorkflowWithTemplate', () => {
  it('updates template metadata, preserves client progress, adds items, and prunes unfinished removed items', () => {
    const current = [{
      id: 'old-stage',
      title: 'Documents',
      sort_order: 0,
      steps: [{
        id: 'old-step',
        title: 'Application',
        sort_order: 0,
        items: [
          {
            id: 'old-passport',
            title: 'Passport copy',
            is_done: true,
            drive_url: 'https://example.test/passport',
            note: 'Client-specific note',
            standard_note: 'Old instruction',
            estimated_price: 100,
            sort_order: 0,
          },
          { id: 'removed-open', title: 'Old form', is_done: false, sort_order: 1 },
        ],
      }],
    }];
    const template = [{
      id: 'new-stage',
      title: 'Documents',
      sort_order: 0,
      steps: [{
        id: 'new-step',
        title: 'Application',
        sort_order: 0,
        items: [
          {
            id: 'new-passport',
            title: 'Passport copy',
            standard_note: 'Latest instruction',
            estimated_price: 275,
            sort_order: 0,
          },
          { id: 'new-photo', title: 'Photo', standard_note: '', estimated_price: 50, sort_order: 1 },
        ],
      }],
    }];

    const merged = mergeClientWorkflowWithTemplate(current, template);
    const items = merged[0].steps[0].items;

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'new-passport',
      standard_note: 'Latest instruction',
      estimated_price: 275,
      is_done: true,
      drive_url: 'https://example.test/passport',
      note: 'Client-specific note',
    });
    expect(items[1]).toMatchObject({ title: 'Photo', is_done: false, estimated_price: 50 });
  });

  it('retains completed items removed from the template as marked history', () => {
    const current = [{
      id: 'stage',
      title: 'Documents',
      steps: [{
        id: 'step',
        title: 'Application',
        items: [{ id: 'done-item', title: 'Removed form', is_done: true }],
      }],
    }];
    const template = [{ id: 'stage', title: 'Documents', steps: [{ id: 'step', title: 'Application', items: [] }] }];

    const merged = mergeClientWorkflowWithTemplate(current, template);
    expect(merged[0].steps[0].items).toEqual([
      expect.objectContaining({ id: 'done-item', is_done: true, sync_removed_from_template: true }),
    ]);
  });
});