import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FinancialPasswordContext } from './financialPasswordContext';

export function FinancialPasswordProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [actionLabel, setActionLabel] = useState('financial action');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const pendingResolve = useRef(null);

  const resolveConfirmation = useCallback((authorized) => {
    pendingResolve.current?.(authorized);
    pendingResolve.current = null;
    setIsOpen(false);
    setPin('');
    setError('');
    setIsVerifying(false);
  }, []);

  const confirmAction = useCallback((label = 'financial action') => {
    if (pendingResolve.current) return Promise.resolve(false);

    setActionLabel(label);
    setPin('');
    setError('');
    setIsOpen(true);

    return new Promise((resolve) => {
      pendingResolve.current = resolve;
    });
  }, []);

  const verifyPin = async (event) => {
    event.preventDefault();
    if (isVerifying) return;

    setIsVerifying(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: settings, error: settingsError } = await supabase
        .from('agency_settings')
        .select('admin_pin, secure_delete_pin')
        .eq('id', '2bacb327-05a7-43a8-9f40-6d3dbfdbc046')
        .maybeSingle();

      if (settingsError) throw settingsError;
      const pinField = actionLabel.toLowerCase().includes('delet') ? 'secure_delete_pin' : 'admin_pin';
      const expectedPin = settings?.[pinField] || (pinField === 'secure_delete_pin' ? settings?.admin_pin : null);
      if (expectedPin === undefined || expectedPin === null || String(expectedPin).trim() === '') {
        throw new Error('Agency PIN is not configured.');
      }
      if (String(pin).trim() !== String(expectedPin)) {
        setError('Incorrect agency PIN. This action was not completed.');
        setPin('');
        setIsVerifying(false);
        return;
      }
      resolveConfirmation(true);
    } catch {
      setError('Unable to verify the agency PIN. This action was not completed.');
      setPin('');
      setIsVerifying(false);
    }
  };

  useEffect(() => () => {
    pendingResolve.current?.(false);
    pendingResolve.current = null;
  }, []);

  return (
    <FinancialPasswordContext.Provider value={confirmAction}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm" role="presentation">
          <form onSubmit={verifyPin} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="financial-pin-title">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Secure Financial Action</p>
            <h2 id="financial-pin-title" className="mt-2 text-xl font-bold text-slate-900">Confirm {actionLabel}</h2>
            <p className="mt-2 text-sm text-slate-600">Enter the agency PIN to continue.</p>
            <label htmlFor="financial-confirmation-pin" className="mt-5 block text-sm font-medium text-slate-700">Agency PIN</label>
            <input
              id="financial-confirmation-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => resolveConfirmation(false)} disabled={isVerifying} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isVerifying || !pin.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50">{isVerifying ? 'Verifying...' : 'Confirm'}</button>
            </div>
          </form>
        </div>
      )}
    </FinancialPasswordContext.Provider>
  );
}
