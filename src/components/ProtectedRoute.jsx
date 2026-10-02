import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ProtectedRoute({ children, requiredModule }) {
  const [accessState, setAccessState] = useState('loading');

  useEffect(() => {
    let isActive = true;

    const checkAccess = async () => {
      setAccessState('loading');

      try {
        if (!supabase) {
          if (isActive) setAccessState('unauthenticated');
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const user = sessionData?.session?.user;
        if (!user) {
          if (isActive) setAccessState('unauthenticated');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, permissions')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const isAuthorized = profile?.role === 'super_admin'
          || !requiredModule
          || Boolean(profile?.permissions?.[requiredModule]);

        if (isActive) setAccessState(isAuthorized ? 'authorized' : 'forbidden');
      } catch (error) {
        console.error('Unable to check route access:', error);
        if (isActive) setAccessState('forbidden');
      }
    };

    checkAccess();
    return () => {
      isActive = false;
    };
  }, [requiredModule]);

  if (accessState === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Checking access">
        <LoaderCircle className="h-7 w-7 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (accessState === 'unauthenticated') return <Navigate to="/login" replace />;
  if (accessState === 'forbidden') return <Navigate to="/login" replace />;

  return children;
}