import { useEffect, useState } from 'react';
import { fetchAgencySettings } from '../../lib/agencySettings';

export default function SecureDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description = 'This action is permanent and affects financial data. Enter admin PIN to proceed.',
  expectedPin = '1234',
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [resolvedPin, setResolvedPin] = useState(expectedPin);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
      return;
    }

    let cancelled = false;

    const loadPin = async () => {
      try {
        const settings = await fetchAgencySettings();
        if (!cancelled) {
          setResolvedPin(String(settings?.admin_pin ?? expectedPin ?? '1234'));
        }
      } catch {
        if (!cancelled) {
          setResolvedPin(String(expectedPin ?? '1234'));
        }
      }
    };

    loadPin();

    return () => {
      cancelled = true;
    };
  }, [isOpen, expectedPin]);

  if (!isOpen) return null;

  const handleVerifyAndDelete = async () => {
    if (String(pin).trim() !== String(resolvedPin)) {
      setError('Incorrect security PIN. Deletion aborted.');
      return;
    }

    setError('');
    setPin('');

    if (typeof onConfirm === 'function') {
      await onConfirm();
    }

    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">Secure action</p>
            <h3 className="mt-2 text-xl font-bold text-brand-navy dark:text-white">{title}</h3>
          </div>

          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>

          <label className="block text-sm font-medium text-brand-navy dark:text-slate-200">
            <span className="mb-2 block">Admin PIN</span>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Enter admin PIN"
              className="w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2.5 text-brand-navy outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleVerifyAndDelete}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
