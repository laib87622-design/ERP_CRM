import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const allowedOrigin = 'http://localhost:5173';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const supabaseUrl = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env values' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: clientsCount } = await supabase.from('clients').select('id', { count: 'exact', head: true });
    const { data: bookingsCount } = await supabase.from('bookings').select('id', { count: 'exact', head: true });
    const { data: packagesCount } = await supabase.from('packages').select('id', { count: 'exact', head: true });
    const { data: suppliersCount } = await supabase.from('suppliers').select('id', { count: 'exact', head: true });
    const { data: tasksCount } = await supabase.from('tasks').select('id', { count: 'exact', head: true });

    return new Response(
      JSON.stringify({
        user: {
          id: userId,
          full_name: profile?.full_name || userData.user.email || 'User',
          role: profile?.role || 'viewer',
        },
        stats: {
          clients: clientsCount ?? 0,
          bookings: bookingsCount ?? 0,
          packages: packagesCount ?? 0,
          suppliers: suppliersCount ?? 0,
          tasks: tasksCount ?? 0,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
});
