import { useState } from 'react';
import { Mail, Lock, LogIn, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login({ language = 'en', setLanguage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isArabic = language === 'ar';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }
    } catch (err) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-brand-soft p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">
              {isArabic ? 'نظام ERP' : 'ERP System'}
            </p>
            <h1 className="mt-2 font-serif text-3xl text-brand-navy">
              {isArabic ? 'تسجيل الدخول' : 'Sign in'}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setLanguage?.(isArabic ? 'en' : 'ar')}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-brand-navy"
          >
            {isArabic ? 'EN' : 'عربي'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
              {isArabic ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isArabic ? 'name@example.com' : 'name@example.com'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-brand-gold focus:bg-white"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
              {isArabic ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isArabic ? '••••••••' : '••••••••'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-brand-gold focus:bg-white"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (isArabic ? 'جاري تسجيل الدخول...' : 'Signing in...') : (
              <>
                {isArabic ? 'تسجيل الدخول' : 'Login'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          <div className="flex items-center gap-2 font-medium text-slate-600">
            <LogIn size={14} />
            {isArabic ? 'معلومات الدخول' : 'Access info'}
          </div>
          <p className="mt-2">
            {isArabic
              ? 'أنشئ المستخدم من Supabase Authentication أولاً ثم استخدم البريد وكلمة المرور.'
              : 'Create the user in Supabase Auth first, then use the email and password here.'}
          </p>
        </div>
      </div>
    </div>
  );
}
