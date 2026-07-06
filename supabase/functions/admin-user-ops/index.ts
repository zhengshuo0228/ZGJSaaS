import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 验证调用者身份
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: '身份验证失败' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 检查调用者是否有账号管理权限（super_admin 或拥有"账号管理"权限的岗位）
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, position, tenant_id, store_id, department_id, account_id, email')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: '身份验证失败' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // super_admin / admin 直接放行；其他岗位检查 positions.permissions 中是否含"账号管理"
    const callerRole = callerProfile.role as string;
    if (callerRole !== 'super_admin' && callerRole !== 'admin') {
      const posName: string = (callerProfile.position as string) ?? '';
      let hasAccountMgmt = false;
      if (posName) {
        const { data: posRow } = await adminClient
          .from('positions')
          .select('permissions')
          .eq('name', posName)
          .eq('tenant_id', callerProfile.tenant_id)
          .maybeSingle();
        const perms: string[] = Array.isArray(posRow?.permissions) ? (posRow.permissions as string[]) : [];
        hasAccountMgmt = perms.includes('账号管理');
      }
      if (!hasAccountMgmt) {
        return new Response(JSON.stringify({ error: '仅超级管理员或拥有账号管理权限的岗位可执行此操作' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const body = await req.json();
    const { action } = body;
    const isPlatformAdmin = callerProfile.account_id === '000' || callerRole === 'super_admin';

    const canUseTenant = async (tenantId: string | null) => {
      if (!tenantId) return isPlatformAdmin;
      if (isPlatformAdmin) return true;
      if (tenantId !== callerProfile.tenant_id) return false;
      const { data: membership } = await adminClient
        .from('tenant_memberships')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('user_id', caller.id)
        .maybeSingle();
      return ['owner', 'tenant_admin', 'store_admin'].includes((membership?.role as string) ?? '');
    };

    // 000 超管保护：只有 000 自己才能操作自己，兼容新旧登录域名
    const PROTECTED_EMAILS = ['000@zaoguanjia.app', '000@miaoda.app'];
    const { data: targetProfile } = body.user_id
      ? await adminClient.from('profiles').select('email').eq('id', body.user_id).maybeSingle()
      : { data: null };
    const targetEmail = targetProfile?.email ?? '';
    if (
      PROTECTED_EMAILS.includes(targetEmail) &&
      !PROTECTED_EMAILS.includes(caller.email ?? '') &&
      (action === 'update' || action === 'update_profile' || action === 'update_password' || action === 'delete')
    ) {
      return new Response(
        JSON.stringify({ error: '000 账号受保护，仅本人可操作' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ===== 创建账号 =====
    if (action === 'create') {
      const { email, password, display_name, role = 'user', position } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: '账号和密码不能为空' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const tenantContext = body.tenant_context ?? {};
      const tenantId = body.tenant_id ?? tenantContext.tenant_id ?? callerProfile.tenant_id ?? null;
      const storeId = body.store_id ?? tenantContext.store_id ?? callerProfile.store_id ?? null;
      const departmentId = body.department_id ?? tenantContext.department_id ?? callerProfile.department_id ?? null;

      if (!tenantId && !isPlatformAdmin) {
        return new Response(JSON.stringify({ error: '当前账号未绑定品牌租户，无法创建账号' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!(await canUseTenant(tenantId))) {
        return new Response(JSON.stringify({ error: '无权在该品牌下创建账号' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 确保 profile 存在并写入正确的角色（upsert 防止触发器未及时执行时丢失数据）
      const { error: upsertError } = await adminClient
        .from('profiles')
        .upsert(
          {
            id: newUser.user.id,
            email,
            display_name: display_name || null,
            role,
            position: position || null,
            tenant_id: tenantId,
            store_id: storeId,
            department_id: departmentId,
          },
          { onConflict: 'id' }
        );
      if (upsertError) {
        // profile 写入失败，回滚：删除刚创建的 auth 用户
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        return new Response(JSON.stringify({ error: `账号创建成功但 profile 写入失败：${upsertError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (tenantId) {
        const { error: membershipError } = await adminClient
          .from('tenant_memberships')
          .upsert(
            {
              tenant_id: tenantId,
              user_id: newUser.user.id,
              store_id: storeId,
              department_id: departmentId,
              role: role === 'admin' || role === 'super_admin' ? 'tenant_admin' : 'member',
              is_primary: true,
            },
            { onConflict: 'tenant_id,user_id' }
          );
        if (membershipError) {
          await adminClient.auth.admin.deleteUser(newUser.user.id);
          return new Response(JSON.stringify({ error: `账号创建成功但租户成员写入失败：${membershipError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== 更新账号资料 =====
    if (action === 'update_profile') {
      const { user_id, display_name, role = 'user', position } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: '缺少 user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const tenantContext = body.tenant_context ?? {};
      const tenantId = body.tenant_id ?? tenantContext.tenant_id ?? callerProfile.tenant_id ?? null;
      const storeId = body.store_id ?? null;
      const departmentId = body.department_id ?? null;

      if (!(await canUseTenant(tenantId))) {
        return new Response(JSON.stringify({ error: '无权修改该品牌账号' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { error: profileError } = await adminClient
        .from('profiles')
        .update({
          display_name: display_name || null,
          role,
          position: position || null,
          tenant_id: tenantId,
          store_id: storeId,
          department_id: departmentId,
        })
        .eq('id', user_id);
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (tenantId) {
        const { error: membershipError } = await adminClient
          .from('tenant_memberships')
          .upsert(
            {
              tenant_id: tenantId,
              user_id,
              store_id: storeId,
              department_id: departmentId,
              role: role === 'admin' || role === 'super_admin' ? 'tenant_admin' : 'member',
              is_primary: true,
            },
            { onConflict: 'tenant_id,user_id' }
          );
        if (membershipError) {
          return new Response(JSON.stringify({ error: membershipError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== 删除账号 =====
    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: '缺少 user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 不允许删除自己
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: '不能删除自己的账号' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== 修改密码 =====
    if (action === 'update_password') {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { error: pwError } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (pwError) {
        return new Response(JSON.stringify({ error: pwError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: '未知操作' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
