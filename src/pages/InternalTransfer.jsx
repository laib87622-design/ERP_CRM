import { useEffect, useState } from 'react';
import { ArrowLeftRight, Landmark, Plus, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const getCurrentLocalDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const emptyForm = {
  source_account_id: '',
  target_account_id: '',
  amount: '',
  target_amount: '',
  transfer_date: getCurrentLocalDateTime(),
  description: '',
};

export default function InternalTransfer() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sourceAccount = accounts.find((account) => account.id === form.source_account_id);
  const targetAccount = accounts.find((account) => account.id === form.target_account_id);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!supabase) {
        setError('Supabase is not configured.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const { data, error: fetchError } = await supabase
          .from('financial_accounts')
          .select('id, label, currency, current_balance')
          .order('label', { ascending: true });

        if (fetchError) throw fetchError;
        setAccounts(data || []);
      } catch (err) {
        setError(err.message || 'Unable to load financial accounts.');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    if (!form.source_account_id || !form.target_account_id) {
      setError('Please select both source and target accounts.');
      return;
    }

    if (form.source_account_id === form.target_account_id) {
      setError('Source and target accounts must be different.');
      return;
    }

    const sourceAccount = accounts.find((account) => account.id === form.source_account_id);
    const targetAccount = accounts.find((account) => account.id === form.target_account_id);
    const sourceAmount = Number(form.amount || 0);
    const targetAmount = Number(form.target_amount || 0);

    if (!sourceAccount) {
      setError('Please select a valid source account.');
      return;
    }

    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
      setError('Transfer amount must be greater than zero.');
      return;
    }

    const currentBalance = parseFloat(sourceAccount.current_balance) || 0;
    if (sourceAmount > currentBalance) {
      setError(`Insufficient funds! This account only has ${currentBalance} ${sourceAccount.currency || 'DA'} available.`);
      return;
    }

    const needsTargetAmount = sourceAccount?.currency && targetAccount?.currency && sourceAccount.currency !== targetAccount.currency;
    if (needsTargetAmount && (!Number.isFinite(targetAmount) || targetAmount <= 0)) {
      setError('Please enter the target amount received in the destination currency.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const finalSourceAmount = sourceAmount;
      const finalTargetAmount = needsTargetAmount ? targetAmount : sourceAmount;
      const exchangeRate = finalTargetAmount > 0 ? finalSourceAmount / finalTargetAmount : 0;
      const baseDescription = form.description.trim() || 'Internal transfer';
      const transferDescription = needsTargetAmount
        ? `${baseDescription}. Exchange Rate: 1 ${targetAccount.currency} = ${exchangeRate.toFixed(4)} ${sourceAccount.currency}`
        : baseDescription;

      const payload = {
        source_account_id: form.source_account_id,
        target_account_id: form.target_account_id,
        source_amount: finalSourceAmount,
        target_amount: finalTargetAmount,
        transfer_date: form.transfer_date ? new Date(form.transfer_date).toISOString() : new Date().toISOString(),
        transfer_description: transferDescription,
      };

      const { error: rpcError } = await supabase.rpc('execute_internal_transfer', payload);

      if (rpcError) throw rpcError;

      setSuccess('Transfer completed successfully.');
      setForm({ ...emptyForm, transfer_date: getCurrentLocalDateTime() });
      setTimeout(() => navigate('/bank'), 400);
    } catch (err) {
      setError(err.message || 'Unable to execute transfer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Finance</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Internal Transfer</h2>
        </div>

        <button
          type="button"
          onClick={() => navigate('/bank')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
        >
          <ArrowLeftRight size={16} />
          Back to Bank
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">From</label>
              <div className="relative">
                <Wallet className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <select
                  name="source_account_id"
                  value={form.source_account_id}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-8 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">Select source account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} ({account.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">To</label>
              <div className="relative">
                <Landmark className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <select
                  name="target_account_id"
                  value={form.target_account_id}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-8 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">Select target account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} ({account.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">
                {sourceAccount?.currency && targetAccount?.currency && sourceAccount.currency !== targetAccount.currency
                  ? `Source Amount (${sourceAccount.currency})`
                  : 'Amount'}
              </label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            {sourceAccount?.currency && targetAccount?.currency && sourceAccount.currency !== targetAccount.currency && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Target Amount (Received in {targetAccount.currency})</label>
                <input
                  type="number"
                  name="target_amount"
                  step="0.01"
                  min="0.01"
                  value={form.target_amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Date</label>
              <input
                type="datetime-local"
                name="transfer_date"
                value={form.transfer_date}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-brand-navy">Description</label>
              <input
                type="text"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Moving cash to BaridiMob"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/bank')}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#c9a84c] px-5 py-2.5 text-sm font-bold text-[#0a1120] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus size={16} />
              {saving ? 'Processing...' : 'Execute Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
