import { useEffect, useState } from 'react';
import { Mail, Lock, Plane, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login({ language = 'en', setLanguage }) {
  const [agency, setAgency] = useState(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isArabic = language === 'ar';

  useEffect(() => {
    let isActive = true;

    const fetchAgency = async () => {
      if (!supabase) return;

      const { data, error: fetchError } = await supabase
        .from('agency_settings')
        .select('agency_name, logo_url')
        .limit(1)
        .maybeSingle();

      if (isActive && !fetchError && data) setAgency(data);
    };

    fetchAgency();
    return () => {
      isActive = false;
    };
  }, []);

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
    <div className="grid min-h-screen grid-cols-1 bg-slate-50 md:grid-cols-2" dir={isArabic ? 'rtl' : 'ltr'}>
      <section className="relative flex min-h-[340px] flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 px-7 py-8 text-white sm:px-10 md:min-h-screen md:px-14 md:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(#f8fafc 0.7px, transparent 0.7px)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full border border-amber-200/15" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-10 -right-2 h-52 w-52 rounded-full border border-amber-200/10" aria-hidden="true" />

        <div className="relative mb-8 flex items-center gap-3">
          {agency?.logo_url && !logoLoadFailed ? (
            <img
              src={agency.logo_url}
              alt={`${agency.agency_name || 'Agency'} logo`}
              onError={() => setLogoLoadFailed(true)}
              className="h-12 w-12 rounded-md bg-white p-1 object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/20 text-xl font-bold text-white">
              {(agency?.agency_name || 'A').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="max-w-[min(60vw,24rem)] truncate text-2xl font-bold uppercase tracking-widest text-white">
            {agency?.agency_name || 'ERP SYSTEM'}
          </span>
        </div>

        <div className="relative max-w-xl py-12 md:py-0">
          <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-100/20 bg-white/5 text-amber-200">
            <Plane size={20} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
            {isArabic ? 'منصة خدمات السفر' : 'Travel operations'}
          </p>
          <h2 className="mt-4 max-w-lg font-serif text-4xl leading-tight sm:text-5xl">
            {isArabic ? 'مرحباً بعودتك' : 'Welcome back'}
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
            {isArabic
              ? 'كل تفاصيل الرحلة، من أول حجز إلى آخر متابعة، في مكان واحد.'
              : 'Your travel business, in step. Bring bookings, client care, and daily operations together in one place.'}
          </p>
        </div>

        <p className="relative text-xs text-slate-400">
          {isArabic ? 'منصة إدارة عمليات السفر' : 'Travel services management platform'}
        </p>
      </section>

      <section className="flex min-h-[520px] items-center justify-center px-5 py-10 sm:px-8 md:min-h-screen md:px-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-9">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                {isArabic ? 'بوابة الفريق' : 'Team portal'}
              </p>
              <h1 className="mt-2 font-serif text-3xl text-slate-900">
                {isArabic ? 'تسجيل الدخول' : 'Sign in'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {isArabic ? 'أدخل بيانات حسابك للمتابعة.' : 'Enter your account details to continue.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLanguage?.(isArabic ? 'en' : 'ar')}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-amber-400 hover:text-amber-800"
            >
              {isArabic ? 'EN' : 'عربي'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                {isArabic ? 'البريد الإلكتروني' : 'Email address'}
              </label>
              <div className="relative">
                <Mail className={`pointer-events-none absolute top-3.5 h-4 w-4 text-slate-400 ${isArabic ? 'right-3' : 'left-3'}`} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className={`w-full rounded-lg border border-slate-300 bg-white py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isArabic ? 'pr-10 pl-3' : 'pl-10 pr-3'}`}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                {isArabic ? 'كلمة المرور' : 'Password'}
              </label>
              <div className="relative">
                <Lock className={`pointer-events-none absolute top-3.5 h-4 w-4 text-slate-400 ${isArabic ? 'right-3' : 'left-3'}`} />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  className={`w-full rounded-lg border border-slate-300 bg-white py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isArabic ? 'pr-10 pl-3' : 'pl-10 pr-3'}`}
                  required
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {loading ? (isArabic ? 'جاري تسجيل الدخول...' : 'Signing in...') : (
                <>
                  {isArabic ? 'تسجيل الدخول' : 'Sign in'}
                  <ArrowRight size={16} className={isArabic ? 'rotate-180' : ''} />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
            {isArabic
              ? 'يجب إنشاء الحساب من خلال مسؤول النظام قبل تسجيل الدخول.'
              : 'Your account must be created by your system administrator before signing in.'}
          </p>
        </div>
      </section>
    </div>
  );
}
