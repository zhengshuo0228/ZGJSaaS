import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: '仅支持 POST 请求' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: '服务端 Supabase 环境变量未配置' }, 500);

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const query = String(body.query || '').trim();
  if (query.length < 1) return json({ results: [] });

  const like = `%${query}%`;
  const { data: tenants, error: tenantError } = await adminClient
    .from('tenants')
    .select('id, name, login_code, status')
    .or(`name.ilike.${like},login_code.ilike.${like},slug.ilike.${like}`)
    .neq('status', 'archived')
    .limit(8);
  if (tenantError) return json({ error: tenantError.message }, 400);

  const { data: stores, error: storeError } = await adminClient
    .from('stores')
    .select('name, tenant:tenants(id, name, login_code, status)')
    .ilike('name', like)
    .eq('is_active', true)
    .limit(8);
  if (storeError) return json({ error: storeError.message }, 400);

  const resultMap = new Map<string, { tenant_id: string; tenant_name: string; login_code: string; matched_store_name: string | null }>();

  for (const tenant of tenants ?? []) {
    if (!tenant.login_code) continue;
    resultMap.set(tenant.id, {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      login_code: tenant.login_code,
      matched_store_name: null,
    });
  }

  for (const row of stores ?? []) {
    const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
    if (!tenant?.id || !tenant.login_code || tenant.status === 'archived') continue;
    const existing = resultMap.get(tenant.id);
    resultMap.set(tenant.id, {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      login_code: tenant.login_code,
      matched_store_name: existing?.matched_store_name ?? row.name,
    });
  }

  return json({ results: Array.from(resultMap.values()).slice(0, 8) });
});
