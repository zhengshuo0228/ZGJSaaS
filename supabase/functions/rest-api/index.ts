/**
 * rest-api Edge Function
 * 处理考勤排休通知与催办逻辑
 *
 * action 列表：
 *  notify_managers  - 员工提交申请后通知有「排休管理」权限的角色
 *  notify_applicant - 审批完成后通知申请人（通过/拒绝）
 *  send_reminders   - 超24小时未处理自动催办一次（定时调用）
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 获取有指定权限的用户 ID 列表（从 positions 表查，岗位直接关联权限）
async function getUsersByPermission(
  supabase: ReturnType<typeof createClient>,
  permission: string
): Promise<string[]> {
  // 1. 找出含该权限的岗位名称
  const { data: positions } = await supabase
    .from('positions')
    .select('name, permissions');

  const targetPositions = (positions ?? [])
    .filter((p: { permissions: string[] }) =>
      Array.isArray(p.permissions) && p.permissions.includes(permission)
    )
    .map((p: { name: string }) => p.name);

  // 2. super_admin / admin 角色始终有排休管理权限
  const adminUsers = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin']);

  let positionUsers: { id: string }[] = [];
  if (targetPositions.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('position', targetPositions);
    positionUsers = data ?? [];
  }

  const allIds = [
    ...(adminUsers.data ?? []).map((u: { id: string }) => u.id),
    ...positionUsers.map((u: { id: string }) => u.id),
  ];
  return [...new Set(allIds)];
}

// 发送 Expo Push 通知给指定用户列表
async function sendPushToUsers(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  if (userIds.length === 0) return;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .in('id', userIds)
    .not('expo_push_token', 'is', null);

  const tokens: string[] = (profiles ?? [])
    .map((p: { expo_push_token: string | null }) => p.expo_push_token)
    .filter((t): t is string => !!t && t.startsWith('ExponentPushToken['));

  if (tokens.length === 0) return;

  const messages = tokens.map(token => ({
    to: token, sound: 'default', title, body, data, priority: 'high', channelId: 'default',
  }));

  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
  }
}

// 写入 notifications 表（APP 内通知）
async function insertNotifications(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  extraData: Record<string, string> = {}
) {
  if (userIds.length === 0) return;
  await supabase.from('notifications').insert(
    userIds.map(uid => ({
      user_id: uid, type, title, body, ...extraData,
    }))
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action } = body;

    // ── 1. 员工提交申请 → 通知排休管理员 ──────────────────────
    if (action === 'notify_managers') {
      const { rest_date, rest_type, user_id } = body;

      // 获取申请人信息
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user_id)
        .maybeSingle();
      const name = profile?.display_name ?? '员工';

      // 休假类型映射
      const typeLabels: Record<string, string> = {
        full: '全天休', am: '上午半休', pm: '下午半休',
        late: '迟到', early: '早退', absent: '旷工',
        sick: '病假', personal: '事假', overtime: '加班',
      };
      const typeLabel = typeLabels[rest_type] ?? rest_type;

      // 获取有排休管理权限的用户
      const managerIds = await getUsersByPermission(supabase, '排休管理');
      // 排除申请人自身
      const targetIds = managerIds.filter(id => id !== user_id);

      const title = '新考勤排休申请待审批';
      const notifyBody = `${name} 申请 ${rest_date} ${typeLabel}，请及时处理`;

      // 发送 Push + 写入通知表
      await Promise.all([
        sendPushToUsers(supabase, targetIds, title, notifyBody, {
          type: 'rest_approval', screen: 'rest-manage',
        }),
        insertNotifications(supabase, targetIds, 'rest_approval_pending', title, notifyBody),
      ]);

      return json({ ok: true, notified: targetIds.length });
    }

    // ── 2. 审批完成 → 通知申请人 ─────────────────────────────
    if (action === 'notify_applicant') {
      const { user_id, status, review_note } = body;

      const isApproved = status === 'approved';
      const title = isApproved ? '考勤排休申请已通过 ✅' : '考勤排休申请已被拒绝';
      const notifyBody = isApproved
        ? '您的申请已通过，请查看排班日历'
        : `申请已被拒绝：${review_note ?? ''}`;

      await Promise.all([
        sendPushToUsers(supabase, [user_id], title, notifyBody, {
          type: 'rest_result', screen: 'attendance',
        }),
        insertNotifications(supabase, [user_id], 'rest_approval_result', title, notifyBody),
      ]);

      return json({ ok: true });
    }

    // ── 3. 超24小时未处理 → 自动催办一次 ────────────────────
    if (action === 'send_reminders') {
      const deadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // 查找超24小时未处理且未催办的申请
      const { data: pending } = await supabase
        .from('rest_requests')
        .select('id, user_id, rest_date, rest_type, profiles!rest_requests_user_id_fkey(display_name)')
        .eq('status', 'pending')
        .eq('reminder_sent', false)
        .lt('created_at', deadline);

      if (!pending || pending.length === 0) {
        return json({ ok: true, reminded: 0 });
      }

      // 获取排休管理员
      const managerIds = await getUsersByPermission(supabase, '排休管理');

      const typeLabels: Record<string, string> = {
        full: '全天休', am: '上午半休', pm: '下午半休',
        late: '迟到', early: '早退', absent: '旷工',
        sick: '病假', personal: '事假', overtime: '加班',
      };

      let remindCount = 0;
      for (const req of pending) {
        const name = (req.profiles as { display_name: string | null } | null)?.display_name ?? '员工';
        const typeLabel = typeLabels[(req.rest_type as string)] ?? req.rest_type as string;
        const targetIds = managerIds.filter((id: string) => id !== req.user_id);

        const title = '⏰ 考勤申请待催办';
        const notifyBody = `${name} 的 ${req.rest_date as string} ${typeLabel} 申请已超24小时未处理`;

        await Promise.all([
          sendPushToUsers(supabase, targetIds, title, notifyBody, {
            type: 'rest_reminder', screen: 'rest-manage',
          }),
          insertNotifications(supabase, targetIds, 'rest_reminder', title, notifyBody),
          // 标记已催办
          supabase.from('rest_requests').update({ reminder_sent: true }).eq('id', req.id),
        ]);
        remindCount++;
      }

      return json({ ok: true, reminded: remindCount });
    }

    return json({ error: '未知 action' }, 400);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
