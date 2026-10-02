import { useEffect, useState } from 'react';
import { ChevronRight, Landmark, Plus, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const getCurrentLocalDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const defaultForm = {
  direction: 'debit',
  operation_date: getCurrentLocalDateTime(),
  description: '',
  amount: '',
  account_id: '',
  payment_method: 'Cash',
};

export default function MiscellaneousPayment() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        setError(err.message || 'Unable to load accounts.');
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

    const amount = Number(form.amount || 0);
    const selectedAccount = accounts.find((account) => account.id === form.account_id);

    if (!form.account_id) {
      setError('Please select a bank account.');
      return;
    }

    if (!selectedAccount) {
      setError('Please select a valid source account.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    const normalizedDirection = form.direction === 'credit' ? 'credit' : 'debit';
    const currentBalance = parseFloat(selectedAccount.current_balance) || 0;
    if (normalizedDirection === 'debit' && amount > currentBalance) {
      setError(`Insufficient funds! This account only has ${currentBalance} ${selectedAccount.currency || 'DA'} available.`);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const debitValue = normalizedDirection === 'debit' ? amount : 0;
      const creditValue = normalizedDirection === 'credit' ? amount : 0;
      const { data: userData } = await supabase.auth.getUser();

      const { data: accountData, error: accountError } = await supabase
        .from('financial_accounts')
        .select('current_balance')
        .eq('id', form.account_id)
        .single();

      if (accountError) throw accountError;

      const freshBalance = Number(accountData?.current_balance || 0);
      if (normalizedDirection === 'debit' && amount > freshBalance) {
        throw new Error(`Insufficient funds! This account only has ${freshBalance} ${selectedAccount.currency || 'DA'} available.`);
      }

      const { data: insertedEntry, error: insertError } = await supabase
        .from('bank_entries')
        .insert([
          {
            account_id: form.account_id,
            operation_date: form.operation_date ? new Date(form.operation_date).toISOString() : new Date().toISOString(),
            description: form.description.trim() || 'Miscellaneous adjustment',
            operation_type: form.payment_method,
            third_party: 'Manual adjustment',
            debit: debitValue,
            credit: creditValue,
            agent_id: userData?.user?.id || null,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      const nextBalance = freshBalance + creditValue - debitValue;

      const { error: updateError } = await supabase
        .from('financial_accounts')
        .update({ current_balance: nextBalance })
        .eq('id', form.account_id);

      if (updateError) throw updateError;

      setSuccess('Payment recorded successfully.');
      setForm({ ...defaultForm, operation_date: getCurrentLocalDateTime() });
      setTimeout(() => navigate('/bank/entries'), 500);
    } catch (err) {
      setError(err.message || 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Finance</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Miscellaneous Payment</h2>
        </div>

        <button
          type="button"
          onClick={() => navigate('/bank')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
        >
          <ChevronRight size={16} />
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
              <label className="text-sm font-medium text-brand-navy">Direction</label>
              <select
                name="direction"
                value={form.direction}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Date</label>
              <input
                type="datetime-local"
                name="operation_date"
                value={form.operation_date}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-brand-navy">Label / Description</label>
              <input
                type="text"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Sales Tax Q3"
                className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Amount</label>
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-brand-navy">Bank Account</label>
              <div className="relative">
                <Wallet className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <select
                  name="account_id"
                  value={form.account_id}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-8 text-brand-navy outline-none focus:border-brand-gold"
                  size={Math.min(accounts.length + 1, 8)}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} ({account.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-brand-navy">Payment Method</label>
              <div className="relative">
                <Landmark className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <select
                  name="payment_method"
                  value={form.payment_method}
                  onChange={handleChange}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-3 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="Cash">Cash</option>
                  <option value="Check">Check</option>
                  <option value="Transfer">Transfer</option>
                  <option value="Card">Card</option>
                </select>
              </div>
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
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
