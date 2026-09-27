import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const formatDzd = (value) =>
  new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function CancelBookingModal({ booking, onClose, onSuccess, user = null }) {
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [clientRefundAmount, setClientRefundAmount] = useState(0);
  const [clientRefundAccountId, setClientRefundAccountId] = useState('');
  const [supplierRefundAmount, setSupplierRefundAmount] = useState(0);
  const [supplierRefundAccountId, setSupplierRefundAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadAccounts = async () => {
      if (!supabase) return;

      const { data, error: accountsError } = await supabase
        .from('financial_accounts')
        .select('id, label, current_balance')
        .order('label', { ascending: true });

      if (!accountsError) {
        const accounts = data || [];
        setFinancialAccounts(accounts);

        if (accounts.length > 0) {
          setClientRefundAccountId((current) => current || accounts[0].id);
          setSupplierRefundAccountId((current) => current || accounts[0].id);
        }
      }
    };

    loadAccounts();
  }, []);

  if (!booking) return null;

  const bookingRef = booking.reference || booking.clientRef || `BK-${booking.id}`;
  const clientName = booking.clientName || booking.client?.full_name || 'Client';
  const supplierName = booking.supplierName || booking.suppliers?.[0]?.name || 'Supplier';

  const handleConfirmCancellation = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const bookingId = booking.id;
      const clientRefundValue = Number(clientRefundAmount || 0);
      const supplierRefundValue = Number(supplierRefundAmount || 0);
      const activeUser = user || (await supabase.auth.getUser()).data?.user || null;

      const bookingUpdate = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

      if (bookingUpdate.error) throw bookingUpdate.error;

      const invoiceUpdate = await supabase
        .from('invoices')
        .update({ status: 'cancelled' })
        .eq('booking_id', bookingId);

      if (invoiceUpdate.error) throw invoiceUpdate.error;

      const commissionUpdate = await supabase
        .from('agent_commissions')
        .update({ status: 'CANCELLED' })
        .eq('booking_id', bookingId)
        .in('status', ['PENDING_PAYMENT', 'READY_TO_PAY']);

      if (commissionUpdate.error) throw commissionUpdate.error;

      if (clientRefundValue > 0 && clientRefundAccountId) {
        const { data: clientAccount, error: clientAccountError } = await supabase
          .from('financial_accounts')
          .select('current_balance')
          .eq('id', clientRefundAccountId)
          .single();

        if (clientAccountError) throw clientAccountError;

        const { error: clientLedgerError } = await supabase.from('bank_entries').insert({
          account_id: clientRefundAccountId,
          operation_date: new Date().toISOString(),
          description: `Client Refund (Cancellation) - Booking Ref: ${bookingRef}`,
          operation_type: 'Refund',
          third_party: clientName,
          credit: 0,
          debit: clientRefundValue,
          agent_id: activeUser?.id || null,
        });

        if (clientLedgerError) throw clientLedgerError;

        const nextClientBalance = Number(clientAccount?.current_balance || 0) - Number(clientRefundValue || 0);
        const { error: clientBalanceError } = await supabase
          .from('financial_accounts')
          .update({ current_balance: nextClientBalance })
          .eq('id', clientRefundAccountId);

        if (clientBalanceError) throw clientBalanceError;
      }

      if (supplierRefundValue > 0 && supplierRefundAccountId) {
        const { data: supplierAccount, error: supplierAccountError } = await supabase
          .from('financial_accounts')
          .select('current_balance')
          .eq('id', supplierRefundAccountId)
          .single();

        if (supplierAccountError) throw supplierAccountError;

        const { error: supplierLedgerError } = await supabase.from('bank_entries').insert({
          account_id: supplierRefundAccountId,
          operation_date: new Date().toISOString(),
          description: `Supplier Refund (Cancellation) - Booking Ref: ${bookingRef}`,
          operation_type: 'Refund',
          third_party: supplierName,
          credit: supplierRefundValue,
          debit: 0,
          agent_id: activeUser?.id || null,
        });

        if (supplierLedgerError) throw supplierLedgerError;

        const nextSupplierBalance = Number(supplierAccount?.current_balance || 0) + Number(supplierRefundValue || 0);
        const { error: supplierBalanceError } = await supabase
          .from('financial_accounts')
          .update({ current_balance: nextSupplierBalance })
          .eq('id', supplierRefundAccountId);

        if (supplierBalanceError) throw supplierBalanceError;
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Unable to cancel booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-gold">Booking Cancellation</p>
            <h3 className="mt-2 text-xl font-semibold text-brand-navy">Cancel booking</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
            aria-label="Close cancellation modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reference</p>
            <p className="mt-2 text-lg font-semibold text-brand-navy">{bookingRef}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
              <span>Client: {clientName}</span>
              <span>Supplier: {supplierName}</span>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-brand-surface p-4">
            <div>
              <h4 className="text-base font-semibold text-brand-navy">Confirm cancellation</h4>
              <p className="mt-1 text-sm text-slate-500">
                This will lock the booking, cancel related invoice records, and cancel unpaid commission entries.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-brand-navy">
                <span className="mb-1 block font-medium">Refund to Client (DA)</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={clientRefundAmount}
                  onChange={(event) => setClientRefundAmount(Number(event.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                />
              </label>

              <label className="block text-sm text-brand-navy">
                <span className="mb-1 block font-medium">Client refund account</span>
                <select
                  value={clientRefundAccountId}
                  onChange={(event) => setClientRefundAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                >
                  {financialAccounts.length === 0 ? (
                    <option value="">No accounts available</option>
                  ) : (
                    financialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label} ({formatDzd(account.current_balance || 0)})
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block text-sm text-brand-navy">
                <span className="mb-1 block font-medium">Refund from Supplier (DA)</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={supplierRefundAmount}
                  onChange={(event) => setSupplierRefundAmount(Number(event.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                />
              </label>

              <label className="block text-sm text-brand-navy">
                <span className="mb-1 block font-medium">Supplier refund account</span>
                <select
                  value={supplierRefundAccountId}
                  onChange={(event) => setSupplierRefundAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-brand-gold"
                >
                  {financialAccounts.length === 0 ? (
                    <option value="">No accounts available</option>
                  ) : (
                    financialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label} ({formatDzd(account.current_balance || 0)})
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmCancellation}
              disabled={submitting}
              className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
