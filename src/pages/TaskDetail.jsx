import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, TimerReset } from 'lucide-react';
import { supabase } from '../lib/supabase';

const statusMap = {
  todo: { label: 'To Do', icon: Clock3, tone: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In Progress', icon: TimerReset, tone: 'bg-amber-100 text-amber-700' },
  done: { label: 'Done', icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' },
};

const priorityStyles = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-sky-100 text-sky-700',
};

export default function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTask = async () => {
      try {
        setLoading(true);
        setError('');

        if (!supabase) {
          setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
          setTask(null);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('tasks')
          .select('id, title, status, priority, client_id, supplier_id, service_id, clients(full_name), suppliers(name), service_templates(title)')
          .eq('id', taskId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        setTask(data || null);
      } catch (err) {
        setError(err.message || 'Unable to load task details.');
      } finally {
        setLoading(false);
      }
    };

    if (taskId) {
      loadTask();
    }
  }, [taskId]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Loading task details...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/tasks')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back to tasks
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/tasks')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back to tasks
        </button>
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-6 text-sm text-slate-500">Task not found.</div>
      </div>
    );
  }

  const status = statusMap[task.status] || statusMap.todo;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => navigate('/tasks')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-brand-card px-3 py-2 text-sm font-semibold text-brand-navy">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${status.tone}`}>
            <StatusIcon size={12} /> {status.label}
          </span>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${priorityStyles[task.priority] || 'bg-slate-100 text-slate-700'}`}>
            {task.priority || 'Medium'}
          </span>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Task</p>
          <h2 className="mt-2 font-serif text-4xl text-brand-navy">{task.title}</h2>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Client</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{task.clients?.full_name || '—'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Supplier</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{task.suppliers?.name || '—'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Service</p>
            <p className="mt-3 text-sm font-medium text-brand-navy">{task.service_templates?.title || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
