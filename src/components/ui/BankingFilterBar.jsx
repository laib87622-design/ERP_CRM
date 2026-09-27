import { CalendarDays, ChevronDown, Search, Wallet } from 'lucide-react';

export default function BankingFilterBar({
  searchQuery = '',
  setSearchQuery = () => {},
  selectedAccount = 'all',
  setSelectedAccount = () => {},
  dateRange = { from: '', to: '' },
  setDateRange = () => {},
  transactionType = 'all',
  setTransactionType = () => {},
  accountsList = [],
  showSearch = false,
  showAccountFilter = false,
  showDateRange = false,
  showTransactionType = false,
  showCurrencyFilter = false,
  currencyFilter = 'all',
  setCurrencyFilter = () => {},
  currencyOptions = [],
  className = '',
}) {
  const handleDateChange = (field, value) => {
    setDateRange((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const hasAdvancedFilters = showSearch || showAccountFilter || showDateRange || showTransactionType || showCurrencyFilter;

  if (!hasAdvancedFilters) {
    return null;
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {showSearch && (
          <div className="space-y-1.5 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search account or bank"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
              />
            </div>
          </div>
        )}

        {showAccountFilter && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Account</label>
            <div className="relative">
              <Wallet className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <select
                value={selectedAccount}
                onChange={(event) => setSelectedAccount(event.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
              >
                <option value="all">All accounts</option>
                {accountsList.map((account) => (
                  <option key={account.id} value={account.id}>{account.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        )}

        {showCurrencyFilter && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Currency</label>
            <div className="relative">
              <select
                value={currencyFilter}
                onChange={(event) => setCurrencyFilter(event.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
              >
                <option value="all">All currencies</option>
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        )}

        {showDateRange && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">From</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.from || ''}
                  onChange={(event) => handleDateChange('from', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">To</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.to || ''}
                  onChange={(event) => handleDateChange('to', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
                />
              </div>
            </div>
          </>
        )}

        {showTransactionType && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</label>
            <div className="relative">
              <select
                value={transactionType}
                onChange={(event) => setTransactionType(event.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-sm text-brand-navy outline-none transition focus:border-brand-gold"
              >
                <option value="all">All transactions</option>
                <option value="debits">Debits only</option>
                <option value="credits">Credits only</option>
                <option value="internal_transfer">Internal transfers</option>
                <option value="miscellaneous">Miscellaneous</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
