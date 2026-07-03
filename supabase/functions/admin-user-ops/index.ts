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
      .select('role, position')
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

    // 000@miaoda.app 超管保护：只有 000 自己才能操作自己
    const PROTECTED_EMAIL = '000@miaoda.app';
    const { data: targetProfile } = body.user_id
      ? await adminClient.from('profiles').select('email').eq('id', body.user_id).maybeSingle()
      : { data: null };
    const targetEmail = targetProfile?.email ?? '';
    if (
      targetEmail === PROTECTED_EMAIL &&
      caller.email !== PROTECTED_EMAIL &&
      (action === 'update' || action === 'update_password' || action === 'delete')
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

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
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
