import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, CreditCard, Smartphone, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import BankingFilterBar from '../components/ui/BankingFilterBar';
import SecureDeleteModal from '../components/ui/SecureDeleteModal';

const translations = {
  en: {
    title: 'Bank',
    supplierDebt: 'Supplier Debt Panel',
    noAccess: 'You do not have permission to access the bank screen.',
    noDebt: 'No supplier debt to settle.',
    settle: 'Settle',
    note: 'Note',
    totalLiquidity: 'Total Liquidity',
    totalSupplierDebt: 'Total Supplier Debt',
    loading: 'Loading bank data...',
    noAccounts: 'No financial accounts match the current filters.',
    view: 'View',
    edit: 'Edit',
    delete: 'Delete',
    recentBankActivity: 'Recent Bank Activity',
    noActivity: 'No recent bank activity.',
    viewFullLedger: 'View Full Ledger',
    settleDebt: 'Settle debt',
    amount: 'Amount',
    bankAccount: 'Bank Account',
    cancel: 'Cancel',
    savePayment: 'Save payment',
    saving: 'Saving...',
    selectAccount: 'Select account',
    account: 'Account',
  },
  ar: {
    title: 'البنك',
    supplierDebt: 'لوحة ديون الموردين',
    noAccess: 'ليس لديك صلاحية للوصول إلى شاشة البنك.',
    noDebt: 'لا توجد ديون للموردين لتسويتها.',
    settle: 'تسوية',
    note: 'ملاحظة',
    totalLiquidity: 'إجمالي السيولة',
    totalSupplierDebt: 'إجمالي ديون الموردين',
    loading: 'جارٍ تحميل بيانات البنك...',
    noAccounts: 'لا توجد حسابات مالية تطابق المرشحات الحالية.',
    view: 'عرض',
    edit: 'تعديل',
    delete: 'حذف',
    recentBankActivity: 'آخر النشاطات البنكية',
    noActivity: 'لا توجد أنشطة بنكية حديثة.',
    viewFullLedger: 'عرض دفتر الأستاذ الكامل',
    settleDebt: 'تسوية الديون',
    amount: 'المبلغ',
    bankAccount: 'حساب البنك',
    cancel: 'إلغاء',
    savePayment: 'حفظ الدفع',
    saving: 'جارٍ الحفظ...',
    selectAccount: 'اختر الحساب',
    account: 'الحساب',
  },
};

const Bank = ({ language = 'en', role: initialRole = 'viewer' }) => {
  const [role, setRole] = useState(initialRole);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [recentBankEntries, setRecentBankEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('all');
  const [settleSupplier, setSettleSupplier] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: '', note: '', selected_account_id: '' });
  const [settleSaving, setSettleSaving] = useState(false);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState(null);

  const canView = role === 'super_admin' || role === 'cashier' || role === 'sales_agent';
  const canWrite = role === 'super_admin' || role === 'cashier';
  const t = translations[language] || translations.en;
  const navigate = useNavigate();

  const loadRole = async () => {
    try {
      if (!supabase) {
        setRole('viewer');
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        setRole('viewer');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        setRole('viewer');
        return;
      }

      setRole(profile.role || 'viewer');
    } catch {
      setRole('viewer');
    }
  };

  const loadBankData = async () => {
    if (!supabase || !canView) {
      setFinancialAccounts([]);
      setSuppliers([]);
      setRecentBankEntries([]);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [financialAccountsRes, suppliersRes, bankEntriesRes] = await Promise.all([
        supabase
          .from('financial_accounts')
          .select('id, label, currency, country, initial_balance, current_balance, bank_name, iban, swift_bic, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('suppliers').select('id, name, supplier_debt').order('name', { ascending: true }),
        supabase
          .from('bank_entries')
          .select('id, operation_date, description, third_party, debit, credit, account_id, financial_accounts(label)')
          .order('operation_date', { ascending: false })
          .limit(5),
      ]);

      if (financialAccountsRes.error) throw financialAccountsRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (bankEntriesRes.error) throw bankEntriesRes.error;

      setFinancialAccounts((financialAccountsRes.data || []).map((row) => ({
        ...row,
        current_balance: Number(row.current_balance || 0),
        initial_balance: Number(row.initial_balance || 0),
      })));
      setSuppliers(suppliersRes.data || []);
      setRecentBankEntries((bankEntriesRes.data || []).map((entry) => ({
        ...entry,
        account_label: entry.financial_accounts?.label || 'Account',
      })));
    } catch (err) {
      setError(err.message || 'Unable to load bank records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRole();
  }, []);

  useEffect(() => {
    if (role) {
      loadBankData();
    }
  }, [role]);

  const supplierDebtRows = useMemo(
    () => (suppliers || []).filter((supplier) => Number(supplier.supplier_debt || 0) > 0),
    [suppliers]
  );

  const filteredFinancialAccounts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return (financialAccounts || []).filter((account) => {
      const matchesSearch =
        !normalizedSearch ||
        (account.label || '').toLowerCase().includes(normalizedSearch) ||
        (account.bank_name || '').toLowerCase().includes(normalizedSearch);

      const matchesCurrency = selectedCurrency === 'all' || (account.currency || '').toUpperCase() === selectedCurrency;

      return matchesSearch && matchesCurrency;
    });
  }, [financialAccounts, searchQuery, selectedCurrency]);

  const accountCurrencies = useMemo(
    () => [...new Set((financialAccounts || []).map((account) => (account.currency || '').toUpperCase()).filter(Boolean))],
    [financialAccounts]
  );

  const totalLiquidity = useMemo(
    () => (financialAccounts || []).reduce((sum, account) => sum + Number(account.current_balance || 0), 0),
    [financialAccounts]
  );

  const totalSupplierDebt = useMemo(
    () => (suppliers || []).reduce((sum, supplier) => sum + Number(supplier.supplier_debt || 0), 0),
    [suppliers]
  );

  const handleSettleSubmit = async (event) => {
    event.preventDefault();
    if (!settleSupplier || !supabase) return;

    const amount = Number(settleForm.amount);
    const selectedAccountId = settleForm.selected_account_id || financialAccounts[0]?.id || '';
    const note = settleForm.note.trim() || 'Debt Settlement';

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Settle amount must be greater than zero.');
      return;
    }

    if (!selectedAccountId) {
      setError('Please choose a bank account before settling the debt.');
      return;
    }

    const sourceAccount = financialAccounts.find((account) => account.id === selectedAccountId);
    if (!sourceAccount) {
      setError('Please select a valid source account.');
      return;
    }

    const transactionAmount = Math.min(amount, Number(settleSupplier.supplier_debt || 0) || amount);
    const availableBalance = parseFloat(sourceAccount.current_balance) || 0;
    if (transactionAmount > availableBalance) {
      setError(`Insufficient funds! This account only has ${availableBalance} ${sourceAccount.currency || 'DA'} available.`);
      return;
    }

    let settlementError = '';

    try {
      setSettleSaving(true);
      setError('');

      const { data: supplierRow, error: supplierFetchError } = await supabase
        .from('suppliers')
        .select('id, supplier_debt')
        .eq('id', settleSupplier.id)
        .single();

      if (supplierFetchError) throw supplierFetchError;

      const currentDebt = Number(supplierRow?.supplier_debt || 0);
      const amountToApply = Math.min(amount, currentDebt || amount);

      if (!currentDebt || amountToApply <= 0) {
        settlementError = 'This supplier has no debt to settle.';
        return;
      }

      const { data: accountRow, error: accountFetchError } = await supabase
        .from('financial_accounts')
        .select('id, label, current_balance')
        .eq('id', selectedAccountId)
        .single();

      if (accountFetchError) throw accountFetchError;

      const currentBalance = Number(accountRow?.current_balance || 0);
      if (amountToApply > currentBalance) {
        settlementError = `Insufficient funds! This account only has ${currentBalance} ${sourceAccount.currency || 'DA'} available.`;
        return;
      }

      const nextAccountBalance = currentBalance - amountToApply;
      const nextSupplierDebt = Math.max(currentDebt - amountToApply, 0);

      const { error: ledgerError } = await supabase.from('bank_entries').insert([
        {
          account_id: selectedAccountId,
          operation_date: new Date().toISOString(),
          description: `Supplier Payment - ${note}`,
          operation_type: String(accountRow?.label || 'Direct Deduction').trim() || 'Direct Deduction',
          third_party: settleSupplier.name,
          credit: 0,
          debit: amountToApply,
        },
      ]);

      if (ledgerError) throw ledgerError;

      const { error: accountUpdateError } = await supabase
        .from('financial_accounts')
        .update({ current_balance: nextAccountBalance })
        .eq('id', selectedAccountId);

      if (accountUpdateError) throw accountUpdateError;

      const { error: supplierUpdateError } = await supabase
        .from('suppliers')
        .update({ supplier_debt: nextSupplierDebt })
        .eq('id', settleSupplier.id);

      if (supplierUpdateError) throw supplierUpdateError;

      const { error: paymentInsertError } = await supabase.from('supplier_payments').insert([
        {
          supplier_id: settleSupplier.id,
          account_id: selectedAccountId,
          amount: amountToApply,
          payment_method: 'cash',
          note,
          paid_at: new Date().toISOString(),
        },
      ]);

      if (paymentInsertError) throw paymentInsertError;

    } catch (err) {
      settlementError = err.message || 'Unable to record supplier payment.';
    } finally {
      setSettleSupplier(null);
      setSettleForm({ amount: '', note: '', selected_account_id: financialAccounts[0]?.id || '' });
      await loadBankData();
      setSettleSaving(false);
      if (settlementError) setError(settlementError);
    }
  };

  const handleOpenAccountDetail = (accountId, mode = 'view') => {
    if (!accountId) return;
    const query = mode === 'edit' ? '?mode=edit' : '';
    navigate(`/bank/accounts/${accountId}${query}`);
  };

  const handleDeleteFinancialAccount = async (accountId) => {
    if (!supabase) {
      return;
    }

    try {
      setError('');
      const { error } = await supabase.from('financial_accounts').delete().eq('id', accountId);
      if (error) throw error;
      await loadBankData();
    } catch (err) {
      setError(err.message || 'Unable to delete financial account.');
    } finally {
      setDeleteAccountTarget(null);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-brand-card p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Bank</p>
        <h2 className="mt-3 font-serif text-3xl text-brand-navy">{t.title}</h2>
        <p className="mt-4 text-sm text-slate-600">{t.noAccess}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">{t.title}</p>
          <h2 className="mt-2 font-serif text-3xl text-brand-navy">{t.title}</h2>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {deleteAccountTarget && (
        <SecureDeleteModal
          isOpen={Boolean(deleteAccountTarget)}
          onClose={() => setDeleteAccountTarget(null)}
          onConfirm={() => handleDeleteFinancialAccount(deleteAccountTarget)}
          title="Delete Bank Account"
        />
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-brand-card p-8 text-center text-sm text-slate-500">{t.loading}</div>
      ) : (
        <>
          <BankingFilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedAccount="all"
            setSelectedAccount={() => {}}
            dateRange={{ from: '', to: '' }}
            setDateRange={() => {}}
            transactionType="all"
            setTransactionType={() => {}}
            accountsList={financialAccounts}
            showSearch={true}
            showCurrencyFilter={true}
            currencyFilter={selectedCurrency}
            setCurrencyFilter={setSelectedCurrency}
            currencyOptions={accountCurrencies}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{t.totalLiquidity}</p>
              <p className="mt-3 font-mono text-3xl font-bold text-emerald-700">{formatCurrency(totalLiquidity)}</p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-700">{t.totalSupplierDebt}</p>
              <p className="mt-3 font-mono text-3xl font-bold text-red-700">{formatCurrency(totalSupplierDebt)}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {filteredFinancialAccounts.length === 0 ? (
              <div className="md:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-brand-card p-6 text-center text-sm text-slate-500">
                {t.noAccounts}
              </div>
            ) : (
              filteredFinancialAccounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-[#fffaf0] p-3">
                      <Wallet className="text-[#c9a84c]" size={20} />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{account.currency || 'DZD'}</span>
                  </div>

                  <div className="mt-6">
                    <p className="text-sm text-slate-500">{account.label || 'Account'}</p>
                    <p className={`mt-2 font-mono text-3xl font-semibold ${Number(account.current_balance || 0) >= 0 ? 'text-brand-navy' : 'text-red-600'}`}>
                      {formatCurrency(Number(account.current_balance || 0))}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{account.bank_name || 'Cash / Personal Account'}</p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenAccountDetail(account.id, 'view')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-navy"
                    >
                      {t.view}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAccountDetail(account.id, 'edit')}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700"
                    >
                      {t.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteAccountTarget(account.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                    >
                      {t.delete}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">{t.supplierDebt}</p>
                  <h3 className="mt-2 text-xl font-semibold text-brand-navy">{t.supplierDebt}</h3>
                </div>
              </div>

              {supplierDebtRows.length === 0 ? (
                <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">{t.noDebt}</div>
              ) : (
                <div className="space-y-3">
                  {supplierDebtRows.map((supplier) => (
                    <div key={supplier.id} className="rounded-xl border border-slate-200 bg-brand-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-brand-navy">{supplier.name}</p>
                          <p className="mt-1 font-mono text-lg font-semibold text-red-600">{formatCurrency(Number(supplier.supplier_debt || 0))}</p>
                        </div>

                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => {
                              setSettleSupplier(supplier);
                              setSettleForm({
                                amount: String(Number(supplier.supplier_debt || 0)),
                                note: '',
                                selected_account_id: financialAccounts[0]?.id || '',
                              });
                            }}
                            className="rounded-xl bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
                          >
                            {t.settle}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-brand-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">{t.recentBankActivity}</p>
                  <h3 className="mt-2 text-xl font-semibold text-brand-navy">{t.recentBankActivity}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/bank/entries')}
                  className="text-xs font-semibold text-brand-gold underline-offset-4 hover:underline"
                >
                  {t.viewFullLedger}
                </button>
              </div>

              <div className="space-y-3">
                {recentBankEntries.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">{t.noActivity}</div>
                ) : (
                  recentBankEntries.map((entry) => {
                    const entryAmount = Number(entry.debit || 0) > 0 ? Number(entry.debit || 0) : Number(entry.credit || 0);
                    const isDebit = Number(entry.debit || 0) > 0;

                    return (
                      <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-brand-surface p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-brand-navy">{entry.description || 'Bank entry'}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span>{entry.operation_date ? new Date(entry.operation_date).toLocaleDateString('en-GB') : '—'}</span>
                            <span>•</span>
                            <span>{entry.third_party || '—'}</span>
                            <span>•</span>
                            <span>{entry.account_label || 'Account'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className={`font-mono text-sm font-semibold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>
                            {isDebit ? '-' : '+'}{formatCurrency(entryAmount)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {settleSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-brand-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">{t.settleDebt}</p>
                <h3 className="mt-2 font-serif text-2xl text-brand-navy">{settleSupplier.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettleSupplier(null);
                  setSettleForm({ amount: '', note: '', selected_account_id: financialAccounts[0]?.id || '' });
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">{t.amount}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settleForm.amount}
                  onChange={(event) => setSettleForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">{t.bankAccount}</label>
                <select
                  value={settleForm.selected_account_id}
                  onChange={(event) => setSettleForm((prev) => ({ ...prev, selected_account_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                >
                  <option value="">{t.selectAccount}</option>
                  {(financialAccounts || []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label || account.bank_name || t.account}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-navy">{t.note}</label>
                <textarea
                  rows={3}
                  value={settleForm.note}
                  onChange={(event) => setSettleForm((prev) => ({ ...prev, note: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSettleSupplier(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy">{t.cancel}</button>
                <button type="submit" disabled={settleSaving} className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-60">
                  {settleSaving ? t.saving : t.savePayment}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bank;
