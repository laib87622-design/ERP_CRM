import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // Handle CORS preflight request strictly
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('PROJECT_URL') ?? '',
      Deno.env.get('PROJECT_SERVICE_ROLE_KEY') ?? '' // CRITICAL: Uses admin privileges
    )

    const { email, password, full_name, role, base_salary } = await req.json()

    // 1. Create the user in Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw authError

   const { error: profileError } = await supabase
      .from('profiles')
      .insert({ 
        id: authData.user.id, // CRITICAL: Link the profile to the Auth user
        full_name, 
        role, 
        base_salary: parseFloat(base_salary) || 0 
      })

    if (profileError) throw profileError

    return new Response(JSON.stringify({ success: true, user: authData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})