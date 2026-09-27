import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Plus, TimerReset } from 'lucide-react';
import { supabase } from '../lib/supabase';

const columns = [
  { key: 'todo', title: 'To Do', icon: Clock3, accent: 'bg-slate-100 text-slate-700' },
  { key: 'in_progress', title: 'In Progress', icon: TimerReset, accent: 'bg-amber-100 text-amber-700' },
  { key: 'done', title: 'Done', icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
];

const priorityStyles = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-sky-100 text-sky-700',
};

const emptyForm = {
  title: '',
  status: 'todo',
  priority: 'Medium',
  client_id: '',
  supplier_id: '',
  service_id: '',
};

export default function Tasks({ language = 'en' }) {
  const t = {
    en: { eyebrow: 'Workflow', title: 'Tasks', newTask: 'New Task' },
    ar: { eyebrow: 'سير العمل', title: 'المهام', newTask: 'مهمة جديدة' },
  }[language] || { eyebrow: 'Workflow', title: 'Tasks', newTask: 'New Task' };

  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const navigate = useNavigate();

  const fetchTasks = async () => {
    try {
      if (!supabase) {
        setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        setTasks([]);
        return;
      }

      const { data, error: tasksError } = await supabase
        .from('tasks')
        .select(
          'id, title, status, priority, client_id, supplier_id, service_id, clients(full_name), suppliers(name), service_templates(title)'
        )
        .order('id', { ascending: false });

      if (tasksError) throw tasksError;
      setTasks(data || []);
    } catch (err) {
      setError(err.message || 'Unable to load tasks.');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setTasks([]);
          setClients([]);
          setSuppliers([]);
          return;
        }

        const [clientsRes, suppliersRes, servicesRes, tasksRes] = await Promise.all([
          supabase.from('clients').select('id, full_name').order('full_name', { ascending: true }),
          supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
          supabase.from('service_templates').select('id, title').order('title', { ascending: true }),
          supabase
            .from('tasks')
            .select(
              'id, title, status, priority, client_id, supplier_id, service_id, clients(full_name), suppliers(name), service_templates(title)'
            )
            .order('id', { ascending: false }),
        ]);

        if (clientsRes.error) throw clientsRes.error;
        if (suppliersRes.error) throw suppliersRes.error;
        if (servicesRes.error) throw servicesRes.error;
        if (tasksRes.error) throw tasksRes.error;

        setClients(clientsRes.data || []);
        setSuppliers(suppliersRes.data || []);
        setServiceTemplates(servicesRes.data || []);
        setTasks(tasksRes.data || []);
      } catch (err) {
        setError(err.message || 'Unable to load tasks data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const groupedTasks = useMemo(
    () =>
      columns.reduce((result, column) => {
        result[column.key] = tasks.filter((task) => task.status === column.key);
        return result;
      }, {}),
    [tasks]
  );

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setError('Task title is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        title: trimmedTitle,
        status: form.status,
        priority: form.priority,
        client_id: form.client_id || null,
        supplier_id: form.supplier_id || null,
        service_id: form.service_id || null,
      };

      const { error: insertError } = await supabase.from('tasks').insert([payload]);
      if (insertError) throw insertError;

      setForm(emptyForm);
      setIsFormOpen(false);
      await fetchTasks();
    } catch (err) {
      setError(err.message || 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  const updateTaskPriority = async (taskId, nextPriority) => {
    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update({ priority: nextPriority })
        .eq('id', taskId);

      if (updateError) throw updateError;

      await fetchTasks();
    } catch (err) {
      setError(err.message || 'Unable to update task priority.');
    }
  };

  const moveTask = async (taskId, nextStatus) => {
    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', taskId);

      if (updateError) throw updateError;

      await fetchTasks();
    } catch (err) {
      setError(err.message || 'Unable to update task status.');
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;

    try {
      if (!supabase) {
        setError('Supabase is not configured yet.');
        return;
      }

      const { error: deleteError } = await supabase.from('tasks').delete().eq('id', taskId);
      if (deleteError) throw deleteError;

      await fetchTasks();
    } catch (err) {
      setError(err.message || 'Unable to delete task.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-navy"
        >
          <Plus size={18} />
          {t.newTask}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        {columns.map((column) => {
          const Icon = column.icon;
          const index = columns.findIndex((item) => item.key === column.key);

          return (
            <div key={column.key} className="rounded-2xl border border-slate-200 bg-brand-card shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${column.accent}`}>
                    <Icon size={16} />
                  </div>
                  <h3 className="font-semibold text-brand-navy">{column.title}</h3>
                </div>

                <span className="rounded-full bg-brand-surface px-2 py-1 text-xs font-medium text-slate-600">
                  {groupedTasks[column.key]?.length || 0}
                </span>
              </div>

              <div className="space-y-3 p-4">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-brand-surface p-4 text-center text-sm text-slate-500">
                    Loading tasks...
                  </div>
                ) : groupedTasks[column.key]?.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-brand-surface p-4 text-center text-sm text-slate-500">
                    No tasks here
                  </div>
                ) : (
                  groupedTasks[column.key].map((task) => (
                    <div
                      key={task.id}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-brand-surface p-3 transition hover:border-brand-gold hover:bg-white"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-sm font-semibold text-brand-navy">{task.title}</h4>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(task.id);
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                        <select
                          value={task.priority || 'Medium'}
                          onChange={(event) => {
                            event.stopPropagation();
                            updateTaskPriority(task.id, event.target.value);
                          }}
                          className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-navy outline-none focus:border-brand-gold"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                        <span className="text-slate-500">
                          {task.service_templates?.title || task.clients?.full_name || task.suppliers?.name || 'No link'}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveTask(task.id, columns[index - 1].key);
                            }}
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-brand-navy"
                          >
                            Prev
                          </button>
                        )}

                        {index < columns.length - 1 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveTask(task.id, columns[index + 1].key);
                            }}
                            className="flex-1 rounded-lg bg-brand-gold px-2 py-1.5 text-xs font-bold text-brand-navy"
                          >
                            Next
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-brand-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Workflow</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">New Task</h3>
              </div>

              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                aria-label="Close task form"
              >
                <Plus size={20} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Task title</label>
                <input
                  value={form.title}
                  onChange={(event) => handleFieldChange('title', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  placeholder="Prepare visa documentation"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Status</label>
                  <select
                    value={form.status}
                    onChange={(event) => handleFieldChange('status', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-navy">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(event) => handleFieldChange('priority', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Link Client</label>
                <select
                  value={form.client_id}
                  onChange={(event) => handleFieldChange('client_id', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">No client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Link Supplier</label>
                <select
                  value={form.supplier_id}
                  onChange={(event) => handleFieldChange('supplier_id', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">No supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">Link Service</label>
                <select
                  value={form.service_id}
                  onChange={(event) => handleFieldChange('service_id', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">No service</option>
                  {serviceTemplates.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
