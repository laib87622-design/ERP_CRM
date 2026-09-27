import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CreditCard, Landmark, Pencil, Trash2, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

const emptyForm = {
  label: '',
  currency: 'DZD',
  country: '',
  initial_balance: '',
  bank_name: '',
  iban: '',
  swift_bic: '',
};

export default function FinancialAccountDetail() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isEditMode = searchParams.get('mode') === 'edit';
  const contentCardClass = isEditMode
    ? 'rounded-3xl border-2 border-amber-300 bg-amber-50/40 p-6 shadow-sm'
    : 'rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm';

  const loadAccount = async () => {
    if (!supabase || !accountId) return;

    try {
      setLoading(true);
      setError('');

      const [accountRes, txRes] = await Promise.all([
        supabase
          .from('financial_accounts')
          .select('*')
          .eq('id', accountId)
          .single(),
        supabase
          .from('financial_account_transactions')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
      ]);

      if (accountRes.error) throw accountRes.error;
      if (txRes.error) throw txRes.error;

      setAccount(accountRes.data);
      setTransactions(txRes.data || []);
      setForm({
        label: accountRes.data.label || '',
        currency: accountRes.data.currency || 'DZD',
        country: accountRes.data.country || '',
        initial_balance: Number(accountRes.data.initial_balance || 0),
        bank_name: accountRes.data.bank_name || '',
        iban: accountRes.data.iban || '',
        swift_bic: accountRes.data.swift_bic || '',
      });
    } catch (err) {
      setError(err.message || 'Unable to load account details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, [accountId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!supabase || !accountId) return;

    const amount = Number(form.initial_balance || 0);
    if (!form.label.trim()) {
      setError('Account label is required.');
      return;
    }

    if (!Number.isFinite(amount)) {
      setError('Initial balance must be a valid number.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const { error: updateError } = await supabase
        .from('financial_accounts')
        .update({
          label: form.label.trim(),
          currency: form.currency || 'DZD',
          country: form.country.trim(),
          initial_balance: amount,
          current_balance: amount,
          bank_name: form.bank_name.trim(),
          iban: form.iban.trim(),
          swift_bic: form.swift_bic.trim(),
        })
        .eq('id', accountId);

      if (updateError) throw updateError;

      const { error: txError } = await supabase.from('financial_account_transactions').insert([
        {
          account_id: accountId,
          type: 'in',
          amount,
          description: 'Account updated to initial balance',
          reference: 'edit_balance',
          created_at: new Date().toISOString(),
        },
      ]);

      if (txError) throw txError;

      setSuccess('Account updated successfully.');
      await loadAccount();
    } catch (err) {
      setError(err.message || 'Unable to update financial account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !accountId) return;
    if (!window.confirm('Delete this financial account?')) return;

    try {
      setError('');
      const { error } = await supabase.from('financial_accounts').delete().eq('id', accountId);
      if (error) throw error;
      navigate('/bank');
    } catch (err) {
      setError(err.message || 'Unable to delete financial account.');
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">Loading account…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Finance</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">Account Details</h2>
        </div>

        <button
          type="button"
          onClick={() => navigate('/bank')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy"
        >
          <ArrowLeft size={16} />
          Back to Bank
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={contentCardClass}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#fffaf0] p-3">
                <Wallet className="h-5 w-5 text-[#c9a84c]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Balance</p>
                <h3 className="mt-1 text-3xl font-bold text-brand-navy">
                  {formatCurrency(Number(account?.current_balance || 0))}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isEditMode && (
                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
                  Edit Mode
                </span>
              )}

              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>

          {isEditMode && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
              Editing financial account details
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Account Label</label>
                <input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Currency</label>
                <select
                  name="currency"
                  value={form.currency}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="DZD">DZD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MAD">MAD</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Country</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Initial Balance</label>
                <input
                  type="number"
                  name="initial_balance"
                  step="0.01"
                  value={form.initial_balance}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">Bank Name</label>
                <div className="relative">
                  <Landmark className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    name="bank_name"
                    value={form.bank_name}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-brand-surface py-2.5 pl-10 pr-3 text-brand-navy outline-none focus:border-brand-gold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-navy">IBAN</label>
                <input
                  type="text"
                  name="iban"
                  value={form.iban}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-brand-navy">BIC / SWIFT</label>
                <input
                  type="text"
                  name="swift_bic"
                  value={form.swift_bic}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/bank')}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-navy"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Pencil size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-brand-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">History</p>
              <h3 className="mt-2 text-xl font-semibold text-brand-navy">Transactions</h3>
            </div>
          </div>

          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No transaction history for this account.</div>
            ) : (
              transactions.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-brand-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-brand-navy">{item.description || 'Account transaction'}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString('en-GB')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-sm font-semibold ${item.type === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.type === 'in' ? '+' : '-'}{formatCurrency(Number(item.amount || 0))}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{item.reference || 'manual'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
