import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Expand, Filter, Minimize2, Plus, Rows3, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TASK_FIELDS = [
  { name: 'day', label: 'Day', options: ['SA', 'SU', 'MO', 'TU', 'WE', 'TH', 'FR'], width: 'w-28' },
  { name: 'agent', label: 'Agent', width: 'w-40' },
  { name: 'headline', label: 'Headline', width: 'w-56' },
  {
    name: 'status',
    label: 'Status',
    options: ['IN PROGRESS', 'PLANNED', 'DONE', 'IDEA', 'STOP'],
    width: 'w-40',
  },
  { name: 'description', label: 'Description', width: 'w-64' },
  {
    name: 'subject',
    label: 'Subject',
    options: ['VISA', 'TRIP INT', 'TRIP NAT', 'OMRA', 'FLIGHT', 'HOTEL', 'SER EDUCATION', 'SER IMMIGRATION'],
    width: 'w-48',
  },
  {
    name: 'type_of_content',
    label: 'Type of Content',
    options: ['POST', 'STORY', 'REELS', 'TEXT', 'IMAGE', 'CARROUSEL'],
    width: 'w-44',
  },
  { name: 'source', label: 'Source', width: 'w-40' },
  {
    name: 'channel',
    label: 'Channel',
    options: ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'WHATSAPP'],
    width: 'w-44',
  },
  { name: 'to_do', label: 'To Do', width: 'w-52' },
  { name: 'deadline_draft', label: 'Deadline Draft', type: 'date', width: 'w-44' },
  { name: 'release_date', label: 'Release Date', type: 'date', width: 'w-44' },
];

const TASK_SELECT = `id, ${TASK_FIELDS.map(({ name }) => name).join(', ')}`;
const EMPTY_FORM = Object.fromEntries(TASK_FIELDS.map(({ name }) => [name, '']));

const STATUS_COLORS = {
  'IN PROGRESS': 'bg-amber-100 text-amber-800 ring-amber-200',
  PLANNED: 'bg-orange-100 text-orange-800 ring-orange-200',
  DONE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  IDEA: 'bg-sky-100 text-sky-800 ring-sky-200',
  STOP: 'bg-red-100 text-red-800 ring-red-200',
};

function normalizedValue(value, type) {
  if (value == null) return '';
  const stringValue = String(value);
  return type === 'date' ? stringValue.slice(0, 10) : stringValue;
}

function FieldControl({ field, value, onChange, id, compact = false, onBlur, onKeyDown, options = field.options }) {
  const listId = options ? `${id}-options` : undefined;
  const inputClass = compact
    ? `block ${field.width} max-w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-slate-700 outline-none transition hover:border-slate-200 focus:border-brand-gold focus:bg-white`
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-amber-100';
  const statusClass = field.name === 'status'
    ? `font-semibold ${STATUS_COLORS[String(value).toUpperCase()] || 'bg-slate-100 text-slate-700 ring-slate-200'}`
    : '';

  return (
    <>
      <input
        id={id}
        type={field.type || 'text'}
        list={listId}
        value={normalizedValue(value, field.type)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className={`${inputClass} ${statusClass} ${compact && field.type === 'date' ? 'min-w-40' : ''}`}
        aria-label={field.label}
        placeholder={compact ? '—' : `Enter ${field.label.toLowerCase()}`}
      />
      {options && (
        <datalist id={listId}>
          {options.map((option) => <option key={option} value={option} />)}
        </datalist>
      )}
    </>
  );
}

function SpreadsheetCell({ task, field, onSave, agentOptions }) {
  const savedValue = normalizedValue(task[field.name], field.type);
  const [value, setValue] = useState(savedValue);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    if (value === savedValue) {
      setEditing(false);
      return;
    }
    const saved = await onSave(task.id, field.name, value);
    if (!saved) setValue(savedValue);
    setEditing(false);
  };

  const statusClass = field.name === 'status'
    ? STATUS_COLORS[savedValue.toUpperCase()] || 'bg-slate-100 text-slate-700 ring-slate-200'
    : '';

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block min-h-9 w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-white hover:ring-1 hover:ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-gold"
        aria-label={`Edit ${field.label}: ${savedValue || 'empty'}`}
      >
        {field.name === 'status' && savedValue ? (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ring-1 ring-inset ${statusClass}`}>
            {savedValue}
          </span>
        ) : (
          <span className={savedValue ? '' : 'text-slate-300'}>{savedValue || '—'}</span>
        )}
      </button>
    );
  }

  if (field.options) {
    return (
      <select
        autoFocus
        value={field.options.includes(value) ? value : ''}
        onChange={async (event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (nextValue !== savedValue) await onSave(task.id, field.name, nextValue);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setValue(savedValue);
            setEditing(false);
          }
        }}
        className={`block ${field.width} max-w-full rounded-md border border-brand-gold bg-white px-2 py-2 text-sm text-slate-700 outline-none ring-2 ring-amber-100`}
        aria-label={`Edit ${field.label}`}
      >
        <option value="">Select {field.label}</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  return (
    <FieldControl
      field={field}
      value={value}
      onChange={setValue}
      onBlur={save}
      options={field.name === 'agent' ? agentOptions : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setValue(savedValue);
          setEditing(false);
        }
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      id={`task-${task.id}-${field.name}`}
      compact
    />
  );
}

export default function Marketing() {
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dayFilter, setDayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const savedDropdownOptions = useMemo(() => {
    const dropdownFields = TASK_FIELDS.filter((field) => field.options || field.name === 'agent');
    return Object.fromEntries(dropdownFields.map((field) => {
      const values = [
        ...(field.options || []),
        ...(field.name === 'agent' ? agents : []),
        ...tasks.map((task) => task[field.name]),
      ];
      const uniqueValues = new Map();
      values.forEach((value) => {
        const label = String(value || '').trim();
        if (label && !uniqueValues.has(label.toLowerCase())) {
          uniqueValues.set(label.toLowerCase(), label);
        }
      });
      return [field.name, [...uniqueValues.values()]];
    }));
  }, [agents, tasks]);

  const filteredTasks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch = !query || TASK_FIELDS.some(({ name }) =>
        String(task[name] ?? '').toLowerCase().includes(query));
      const matchesDay = dayFilter === 'all' || String(task.day || '').toUpperCase() === dayFilter;
      const matchesStatus = statusFilter === 'all' || String(task.status || '').toUpperCase() === statusFilter;
      const matchesChannel = channelFilter === 'all' || String(task.channel || '').toUpperCase() === channelFilter;
      return matchesSearch && matchesDay && matchesStatus && matchesChannel;
    });
  }, [tasks, searchTerm, dayFilter, statusFilter, channelFilter]);

  const fetchPageData = useCallback(async () => {
    if (!supabase) {
      return {
        taskResult: {
          data: null,
          error: { message: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' },
        },
        profileResult: { data: null, error: null },
      };
    }

    const [taskResult, profileResult] = await Promise.all([
      supabase
        .from('marketing_tasks')
        .select(TASK_SELECT)
        .order('release_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name', { ascending: true }),
    ]);
    return { taskResult, profileResult };
  }, []);

  useEffect(() => {
    let active = true;

    fetchPageData()
      .then(({ taskResult, profileResult }) => {
        if (!active) return;
        if (taskResult.error) {
          setError(taskResult.error.message || 'Unable to load marketing tasks.');
          setTasks([]);
        } else {
          setTasks(taskResult.data || []);
        }
        if (profileResult.error) {
          setAgents([]);
          setError((current) => [
            current,
            `Unable to load agent names: ${profileResult.error.message || 'Unknown error.'}`,
          ].filter(Boolean).join(' '));
        } else {
          setAgents((profileResult.data || []).map((profile) => profile.full_name?.trim()).filter(Boolean));
        }
        if (!taskResult.error && !profileResult.error) setError('');
        setLoading(false);
      })
      .catch((fetchError) => {
        if (!active) return;
        setError(fetchError.message || 'Unable to load marketing tasks.');
        setTasks([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPageData]);

  const updateTask = async (id, field, value) => {
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return false;
    }

    setError('');
    const nextValue = field === 'deadline_draft' || field === 'release_date'
      ? (value || null)
      : value;
    try {
      const { data, error: updateError } = await supabase
        .from('marketing_tasks')
        .update({ [field]: nextValue })
        .eq('id', id)
        .select(TASK_SELECT)
        .single();

      if (updateError) {
        setError(updateError.message || 'Unable to update marketing task.');
        return false;
      }

      setTasks((current) => current.map((task) => task.id === id ? data : task));
      return true;
    } catch (updateError) {
      setError(updateError.message || 'Unable to update marketing task.');
      return false;
    }
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setSaving(true);
    setError('');
    const payload = Object.fromEntries(TASK_FIELDS.map(({ name, type }) => {
      const value = form[name].trim();
      return [name, type === 'date' && !value ? null : value];
    }));

    try {
      const { data, error: insertError } = await supabase
        .from('marketing_tasks')
        .insert(payload)
        .select(TASK_SELECT)
        .single();

      if (insertError) {
        setError(insertError.message || 'Unable to create marketing task.');
      } else {
        setTasks((current) => [...current, data]);
        setForm(EMPTY_FORM);
        setIsFormOpen(false);
      }
    } catch (insertError) {
      setError(insertError.message || 'Unable to create marketing task.');
    } finally {
      setSaving(false);
    }
  };

  const openForm = () => {
    setError('');
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  return (
    <main className="w-full min-w-0 max-w-full space-y-6 overflow-hidden">
      <header className="flex w-full min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Growth workspace</p>
          <h1 className="mt-2 font-serif text-3xl text-brand-navy">Marketing Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">Plan, edit, and track your content in one place.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Expand size={16} />
            Expand to Fullscreen
          </button>
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus size={17} />
            New Campaign / Task
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={isFullscreen
        ? 'fixed inset-0 z-50 bg-white p-6 w-screen h-screen overflow-hidden flex flex-col'
        : 'flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Rows3 size={18} /></span>
            <div>
              <h2 className="font-semibold text-brand-navy">Campaign & task board</h2>
              <p className="text-xs text-slate-500">Edit cells directly; dropdowns also accept custom values.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFullscreen && (
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Minimize2 size={16} />
                Exit Fullscreen
              </button>
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {loading ? 'Loading…' : `${filteredTasks.length} of ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tasks…"
              aria-label="Search marketing tasks"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-brand-navy outline-none focus:border-brand-gold focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2 text-slate-400" aria-hidden="true">
            <Filter size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Filter</span>
          </div>
          <select
            value={dayFilter}
            onChange={(event) => setDayFilter(event.target.value)}
            aria-label="Filter by day"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-gold"
          >
            <option value="all">All days</option>
            {TASK_FIELDS.find(({ name }) => name === 'day').options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-gold"
          >
            <option value="all">All statuses</option>
            {TASK_FIELDS.find(({ name }) => name === 'status').options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
            aria-label="Filter by channel"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-gold"
          >
            <option value="all">All channels</option>
            {TASK_FIELDS.find(({ name }) => name === 'channel').options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <div className="block w-full min-h-0 flex-1 overflow-auto">
          <table className="w-max min-w-[1900px] border-collapse text-left">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr>
                <th className="sticky left-0 z-10 w-12 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">#</th>
                {TASK_FIELDS.map((field) => (
                  <th key={field.name} className="border-b border-r border-slate-200 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TASK_FIELDS.length + 1} className="px-5 py-14 text-center text-sm text-slate-500">
                    Loading marketing tasks…
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={TASK_FIELDS.length + 1} className="px-5 py-14 text-center">
                    <CalendarDays className="mx-auto mb-3 text-slate-300" size={25} />
                    <p className="font-medium text-slate-700">No marketing tasks yet</p>
                    <p className="mt-1 text-sm text-slate-500">Create a campaign or task to start filling in your board.</p>
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={TASK_FIELDS.length + 1} className="px-5 py-14 text-center text-sm text-slate-500">
                    No tasks match these filters.
                  </td>
                </tr>
              ) : filteredTasks.map((task, index) => (
                <tr key={task.id} className="group border-b border-slate-100 last:border-0 hover:bg-amber-50/30">
                  <td className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-3 py-2 text-center font-mono text-xs text-slate-400 group-hover:bg-amber-50/60">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  {TASK_FIELDS.map((field) => (
                    <td key={field.name} className="border-r border-slate-100 p-1.5 align-middle">
                      <SpreadsheetCell
                        task={task}
                        field={field}
                        onSave={updateTask}
                        agentOptions={savedDropdownOptions.agent}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs text-slate-500">
          Changes save when you leave a cell. Select a suggested value or type a new one in any dropdown field.
        </div>
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close task form"
            onClick={() => setIsFormOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-task-form-title"
            className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Marketing board</p>
                <h2 id="marketing-task-form-title" className="mt-1 font-serif text-2xl text-brand-navy">New Campaign / Task</h2>
                <p className="mt-1 text-sm text-slate-500">Fill in the details below. Suggested dropdown values are editable.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close marketing task form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 grid-cols-1 gap-x-4 gap-y-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
                {TASK_FIELDS.map((field) => (
                  <div key={field.name} className={field.name === 'description' || field.name === 'headline' || field.name === 'to_do' ? 'sm:col-span-2' : ''}>
                    <label htmlFor={`new-task-${field.name}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                      {field.label}
                    </label>
                    {field.name === 'description' ? (
                      <textarea
                        id={`new-task-${field.name}`}
                        value={form[field.name]}
                        onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                        rows={3}
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-amber-100"
                        placeholder="Enter description"
                      />
                    ) : (
                      <FieldControl
                        field={field}
                        value={form[field.name]}
                        onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                        options={savedDropdownOptions[field.name]}
                        id={`new-task-${field.name}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {error && <p role="alert" className="mx-6 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:bg-brand-goldHover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus size={16} />
                  {saving ? 'Saving…' : 'Create Task'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
