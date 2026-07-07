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

function normalizeLoginCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function normalizeAccount(account: string, loginCode: string) {
  const trimmed = account.trim().toLowerCase().split('@')[0];
  return `${loginCode}.${trimmed}@zaoguanjia.app`;
}

function normalizeAccountId(account: string) {
  return account.trim().toLowerCase().split('@')[0];
}

function slugify(input: string) {
  const ascii = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || `tenant-${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: '服务端 Supabase 环境变量未配置' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const brandName = String(body.brand_name || '').trim();
    const brandLoginCode = normalizeLoginCode(String(body.brand_login_code || ''));
    const storeName = String(body.store_name || '').trim();
    const contactName = String(body.contact_name || '').trim();
    const account = String(body.account || '').trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const password = String(body.password || '');

    if (!brandName || !brandLoginCode || !storeName || !contactName || !account || !password) {
      return json({ error: '品牌、品牌账号、门店、联系人、账号和密码不能为空' }, 400);
    }
    if (password.length < 6) {
      return json({ error: '密码至少 6 位' }, 400);
    }
    const accountId = normalizeAccountId(account);
    if (accountId === '000') {
      return json({ error: '该账号为系统保留账号，不可注册' }, 400);
    }

    const loginAccount = normalizeAccount(accountId, brandLoginCode);
    const baseSlug = slugify(brandName);
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: loginAccount,
      password,
      email_confirm: true,
      user_metadata: { display_name: contactName, tenant_owner: true },
    });
    if (createUserError || !createdUser.user) {
      return json({ error: createUserError?.message || '管理员账号创建失败' }, 400);
    }

    const userId = createdUser.user.id;
    let tenantId: string | null = null;

    try {
      const { data: tenant, error: tenantError } = await adminClient
        .from('tenants')
        .insert({
          name: brandName,
          slug,
          login_code: brandLoginCode,
          contact_name: contactName,
          contact_phone: phone,
          status: 'free_active',
          plan: 'free',
          created_by: userId,
        })
        .select('id')
        .single();
      if (tenantError || !tenant) throw tenantError || new Error('租户创建失败');
      tenantId = tenant.id;

      const { data: store, error: storeError } = await adminClient
        .from('stores')
        .insert({ tenant_id: tenantId, name: storeName, code: 'default' })
        .select('id')
        .single();
      if (storeError || !store) throw storeError || new Error('门店创建失败');

      const { data: departments, error: deptError } = await adminClient
        .from('departments')
        .insert([
          { tenant_id: tenantId, store_id: store.id, name: '厨房', is_system: true },
          { tenant_id: tenantId, store_id: store.id, name: '前厅', is_system: true },
        ])
        .select('id, name');
      if (deptError) throw deptError;
      const kitchen = departments?.find((item) => item.name === '厨房');

      await adminClient.from('positions').insert([
        { tenant_id: tenantId, name: '店长', sort_order: 1, permissions: ['账号管理', '系统配置', '数据统计'] },
        { tenant_id: tenantId, name: '厨师长', sort_order: 2, permissions: ['提交申购单', '审核申购单', '管理食材库'] },
        { tenant_id: tenantId, name: '员工', sort_order: 99, permissions: ['提交申购单', '查看申购历史'] },
      ]);

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: userId,
        email: loginAccount,
        phone,
        display_name: contactName,
        role: 'admin',
        position: '店长',
        account_id: accountId,
        tenant_id: tenantId,
        store_id: store.id,
        department_id: kitchen?.id ?? null,
      }, { onConflict: 'id' });
      if (profileError) throw profileError;

      const { error: membershipError } = await adminClient.from('tenant_memberships').insert({
        tenant_id: tenantId,
        user_id: userId,
        store_id: store.id,
        department_id: kitchen?.id ?? null,
        role: 'owner',
        is_primary: true,
      });
      if (membershipError) throw membershipError;

      await adminClient.from('tenant_registration_requests').insert({
        tenant_id: tenantId,
        brand_name: brandName,
        store_name: storeName,
        contact_name: contactName,
        account: accountId,
        phone,
        status: 'approved',
        created_user_id: userId,
      });

      return json({ success: true, tenant_id: tenantId, login_account: accountId });
    } catch (error) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
