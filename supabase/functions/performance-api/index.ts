/**
 * 绩效看板 Edge Function v5
 * POST /performance-api  body: { action, ...params }
 *
 * action 列表：
 *  list           - 查询绩效记录（游标分页，每页20条）
 *  pending_count  - 待审核数量（角标用）
 *  add            - 管理端直接加分/扣分（status=approved）
 *  apply          - 员工提交申请（status=pending）→ 自动通知有"绩效管理"权限的用户
 *  approve        - 审核通过 → 自动通知申请人 + 自动发放成就标签 + 写日志
 *  reject         - 驳回申请 → 自动通知申请人 + 写日志
 *  delete         - 删除记录
 *  update_record  - 修改已有记录（描述/分值/备注）→ 写日志
 *  leaderboard    - 积分排行榜（本月）
 *  get_templates  - 获取事项/备注模板
 *  save_templates - 保存事项/备注模板（全量覆盖指定type）
 *  logs           - 获取绩效操作日志（游标分页）
 *
 * 权限节点（5个）：
 *  绩效管理         — 管理Tab：预设管理+记录调整+加分扣分+审批他人申请
 *  绩效审核申请     — 可提交申请，可见待审核Tab
 *  绩效查看全部     — 全员记录Tab + 积分排行榜
 *  绩效导出汇总     — 导出功能
 *  绩效提交申请     — 基础提交权限
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hasPerf(perms: string[], key: string) {
  return perms.includes(key);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const PAGE_SIZE = 20;

async function sendPerfNotification(
  supabase: ReturnType<typeof createClient>,
  params: { user_id: string; type: string; title: string; body: string; perf_id: string }
) {
  await supabase.from('notifications').insert({
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    body: params.body,
    order_id: null,
    perf_id: params.perf_id || null,
  });
}

// 通知所有有指定权限的用户
async function notifyByPermission(
  supabase: ReturnType<typeof createClient>,
  permission: string,
  params: { type: string; title: string; body: string; perf_id: string }
) {
  // 从 positions 表查含该权限的岗位名称
  const { data: positions } = await supabase.from('positions').select('name, permissions');
  const targetPositions = (positions ?? [])
    .filter((p: { permissions: string[] }) => Array.isArray(p.permissions) && p.permissions.includes(permission))
    .map((p: { name: string }) => p.name);

  // admin / super_admin 角色默认有绩效审核权限
  const { data: adminUsers } = await supabase.from('profiles').select('id').in('role', ['admin', 'super_admin']);
  let posUsers: { id: string }[] = [];
  if (targetPositions.length > 0) {
    const { data } = await supabase.from('profiles').select('id').in('position', targetPositions);
    posUsers = data ?? [];
  }
  const uniqueIds = [...new Set([...(adminUsers ?? []).map((u: { id: string }) => u.id), ...posUsers.map((u: { id: string }) => u.id)])];
  if (uniqueIds.length === 0) return;

  await supabase.from('notifications').insert(
    uniqueIds.map((id: string) => ({
      user_id: id,
      type: params.type,
      title: params.title,
      body: params.body,
      order_id: null,
      perf_id: params.perf_id || null,
    }))
  );
}

async function writeOpLog(
  supabase: ReturnType<typeof createClient>,
  params: {
    operator_id: string;
    operator_name: string;
    action: string;
    target_type: string;
    target_name?: string;
    detail?: Record<string, unknown>;
  }
) {
  await supabase.from('operation_logs').insert({
    operator_id: params.operator_id,
    operator_name: params.operator_name,
    action: params.action,
    target_type: params.target_type,
    target_name: params.target_name ?? null,
    detail: params.detail ?? null,
  });
}

async function maybeAwardTag(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  description: string
) {
  if (!description) return;
  const { data: tpls } = await supabase
    .from('perf_templates')
    .select('linked_tag, tag_threshold')
    .eq('content', description.trim())
    .not('linked_tag', 'is', null)
    .not('tag_threshold', 'is', null)
    .limit(1);
  const tpl = (tpls ?? [])[0];
  if (!tpl) return;

  const linkedTag = tpl.linked_tag as string;
  const threshold = Number(tpl.tag_threshold);
  if (!linkedTag || Number.isNaN(threshold) || threshold <= 0) return;

  const { count } = await supabase
    .from('performance_scores')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('description', description.trim())
    .eq('status', 'approved');
  if (!count || count < threshold) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('earned_tags, display_name')
    .eq('id', user_id)
    .maybeSingle();
  const earnedTags: { name: string; earned_at: string }[] = (profile?.earned_tags as { name: string; earned_at: string }[]) ?? [];
  if (earnedTags.some((t) => t.name === linkedTag)) return;

  const updatedTags = [...earnedTags, { name: linkedTag, earned_at: new Date().toISOString() }];
  await supabase.from('profiles').update({ earned_tags: updatedTags }).eq('id', user_id);

  const userName = (profile?.display_name as string) || '员工';
  await sendPerfNotification(supabase, {
    user_id,
    type: 'perf_tag_earned',
    title: `🏅 获得成就标签「${linkedTag}」`,
    body: `${userName}，恭喜！您累计完成「${description.slice(0, 12)}」${threshold}次，解锁成就标签「${linkedTag}」`,
    perf_id: '',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, email, position')
    .eq('id', user.id)
    .maybeSingle();
  const role: string = profile?.role ?? 'user';
  const operatorName: string = (profile?.display_name as string) || (profile?.email as string) || '操作员';

  // 从 positions 表查岗位权限（岗位直接关联权限，不经过角色）
  let perms: string[] = [];
  if (role === 'super_admin' || role === 'admin') {
    // super_admin / admin 拥有全量权限
    perms = ['提交申购单','查看申购历史','审核申购单','查看采购汇总','管理食材库','账号管理','系统配置','导出报表','数据统计',
             '绩效提交申请','绩效审核申请','绩效管理','绩效查看全部','绩效导出汇总','绩效删除记录','绩效加分扣分','排休申请','排休管理'];
  } else {
    const posName: string = (profile?.position as string) ?? '';
    if (posName) {
      const { data: posRow } = await supabase.from('positions').select('permissions').eq('name', posName).maybeSingle();
      perms = Array.isArray(posRow?.permissions) ? (posRow.permissions as string[]) : [];
    }
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ========== list ==========
  if (action === 'list') {
    const { user_id: targetUserId, status, cursor, all, date_from, date_to } = body;

    // all=true: 全员记录，需绩效查看全部权限
    if (all) {
      if (!hasPerf(perms, '绩效查看全部')) return json({ error: 'Forbidden' }, 403);
    }

    let query = supabase
      .from('performance_scores')
      .select(`
        id, user_id, date, description, note, score, status, image_url, remark, created_at, reviewed_at,
        user:profiles!user_id(display_name, email, position),
        operator:profiles!operator_id(display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('created_at', cursor);

    if (!all) {
      // 我的绩效：只看自己
      if (targetUserId && targetUserId !== user.id) {
        if (!hasPerf(perms, '绩效查看全部')) return json({ error: 'Forbidden' }, 403);
        query = query.eq('user_id', targetUserId);
      } else {
        query = query.eq('user_id', user.id);
      }
    } else if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    if (status) query = query.eq('status', status);
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    let records = data ?? [];

    // 解析 description 中的 UUID 为模板名称
    const { data: tpls } = await supabase.from('perf_templates').select('id, content');
    const tplMap = new Map<string, string>();
    for (const t of (tpls ?? []) as { id: string; content: string }[]) {
      tplMap.set(t.id, t.content);
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    records = records.map((r: Record<string, unknown>) => {
      const desc = String(r.description || '');
      const itemName = UUID_RE.test(desc) && tplMap.has(desc) ? tplMap.get(desc) : desc;
      return { ...r, item_name: itemName };
    });

    const nextCursor = records.length === PAGE_SIZE ? records[records.length - 1].created_at : null;
    return json({ records, nextCursor });
  }

  // ========== pending_count ==========
  if (action === 'pending_count') {
    const canSeeTab = hasPerf(perms, '绩效审核申请') || hasPerf(perms, '绩效管理');
    if (!canSeeTab) return json({ count: 0 });
    const { count } = await supabase
      .from('performance_scores')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return json({ count: count ?? 0 });
  }

  // ========== add ==========
  if (action === 'add') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { user_id, date, description, score, note } = body;
    if (!user_id || !description || score == null) return json({ error: '参数缺失' }, 400);
    const { data, error } = await supabase.from('performance_scores').insert({
      user_id,
      date: date ?? new Date().toISOString().slice(0, 10),
      description,
      note: note ?? null,
      score,
      operator_id: user.id,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }).select().maybeSingle();
    if (error) return json({ error: error.message }, 500);
    await maybeAwardTag(supabase, user_id, description);
    await writeOpLog(supabase, {
      operator_id: user.id,
      operator_name: operatorName,
      action: '管理员直接加减分',
      target_type: 'performance',
      target_name: description,
      detail: { user_id, score, description },
    });
    return json({ record: data });
  }

  // ========== apply ==========
  if (action === 'apply') {
    if (!hasPerf(perms, '绩效审核申请')) return json({ error: 'Forbidden' }, 403);
    const { description, note, image_url } = body;
    if (!description) return json({ error: '描述不能为空' }, 400);
    const { data, error } = await supabase.from('performance_scores').insert({
      user_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      description,
      note: note ?? null,
      score: 0,
      status: 'pending',
      image_url: image_url ?? null,
      operator_id: null,
    }).select().maybeSingle();
    if (error) return json({ error: error.message }, 500);

    if (data?.id) {
      const applicantName = operatorName;
      await notifyByPermission(supabase, '绩效管理', {
        type: 'perf_submitted',
        title: '新绩效申请待审核 📋',
        body: `${applicantName} 提交了加分申请：${description.slice(0, 20)}${description.length > 20 ? '...' : ''}`,
        perf_id: data.id,
      });
    }

    return json({ record: data });
  }

  // ========== approve ==========
  if (action === 'approve') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { id, score, remark } = body;
    if (!id || score == null) return json({ error: 'id 和 score 必填' }, 400);

    const { data: rec } = await supabase
      .from('performance_scores')
      .select('user_id, description')
      .eq('id', id)
      .eq('status', 'pending')
      .maybeSingle();

    const { error } = await supabase.from('performance_scores')
      .update({
        status: 'approved',
        score,
        remark: remark ?? null,
        operator_id: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id).eq('status', 'pending');
    if (error) return json({ error: error.message }, 500);

    if (rec?.user_id && rec?.description) {
      await maybeAwardTag(supabase, rec.user_id as string, rec.description as string);
    }

    if (rec?.user_id) {
      const scoreText = score > 0 ? `+${score}` : `${score}`;
      await sendPerfNotification(supabase, {
        user_id: rec.user_id,
        type: 'perf_approved',
        title: `绩效申请已通过 ✅（${scoreText}分）`,
        body: `您的申请「${(rec.description as string || '').slice(0, 20)}」已由${operatorName}审核通过，获得${scoreText}分`,
        perf_id: id,
      });
    }

    await writeOpLog(supabase, {
      operator_id: user.id,
      operator_name: operatorName,
      action: '审核通过',
      target_type: 'performance',
      target_name: (rec?.description as string) || '',
      detail: { perf_id: id, score, remark, applicant_id: rec?.user_id },
    });

    return json({ success: true });
  }

  // ========== reject ==========
  if (action === 'reject') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { id, remark } = body;
    if (!id) return json({ error: 'id 必填' }, 400);

    const { data: rec } = await supabase
      .from('performance_scores')
      .select('user_id, description')
      .eq('id', id)
      .eq('status', 'pending')
      .maybeSingle();

    const { error } = await supabase.from('performance_scores')
      .update({
        status: 'rejected',
        remark: remark ?? null,
        operator_id: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id).eq('status', 'pending');
    if (error) return json({ error: error.message }, 500);

    if (rec?.user_id) {
      await sendPerfNotification(supabase, {
        user_id: rec.user_id,
        type: 'perf_rejected',
        title: '绩效申请已驳回 ❌',
        body: `您的申请「${(rec.description as string || '').slice(0, 20)}」已被${operatorName}驳回${remark ? `：${String(remark).slice(0, 20)}` : '，如有疑问请联系管理员'}`,
        perf_id: id,
      });
    }

    await writeOpLog(supabase, {
      operator_id: user.id,
      operator_name: operatorName,
      action: '审核驳回',
      target_type: 'performance',
      target_name: (rec?.description as string) || '',
      detail: { perf_id: id, remark, applicant_id: rec?.user_id },
    });

    return json({ success: true });
  }

  // ========== delete ==========
  if (action === 'delete') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { id } = body;
    if (!id) return json({ error: 'id 必填' }, 400);
    const { error } = await supabase.from('performance_scores').delete().eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ========== update_record ==========
  if (action === 'update_record') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { id, description, score, remark, note, date } = body;
    if (!id) return json({ error: 'id 必填' }, 400);
    const updates: Record<string, unknown> = {};
    if (description != null) updates.description = description;
    if (score != null) updates.score = score;
    if (remark != null) updates.remark = remark;
    if (note != null) updates.note = note;
    if (date != null) updates.date = date;
    const { error } = await supabase.from('performance_scores').update(updates).eq('id', id);
    if (error) return json({ error: error.message }, 500);
    await writeOpLog(supabase, {
      operator_id: user.id,
      operator_name: operatorName,
      action: '记录调整',
      target_type: 'performance',
      target_name: description || '',
      detail: { perf_id: id, score, description, remark },
    });
    return json({ success: true });
  }

  // ========== get_templates ==========
  if (action === 'get_templates') {
    const { data } = await supabase
      .from('perf_templates')
      .select('id, type, content, description, sort_order, linked_tag, tag_threshold')
      .order('sort_order', { ascending: true });
    return json({ templates: data ?? [] });
  }

  // ========== save_templates ==========
  if (action === 'save_templates') {
    if (!hasPerf(perms, '绩效管理')) return json({ error: 'Forbidden' }, 403);
    const { items, type } = body;
    if (!Array.isArray(items)) return json({ error: 'items 必须是数组' }, 400);
    if (type) {
      await supabase.from('perf_templates').delete().eq('type', type);
    } else {
      await supabase.from('perf_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    if (items.length > 0) {
      const rows = items.map((it: Record<string, unknown>, idx: number) => ({
        type: it.type,
        content: it.content,
        description: (it.description as string | null) || null,
        sort_order: it.sort_order ?? idx,
        linked_tag: (it.linked_tag as string | null) || null,
        tag_threshold: (typeof it.tag_threshold === 'number' && !Number.isNaN(it.tag_threshold)) ? it.tag_threshold : null,
      }));
      const { error } = await supabase.from('perf_templates').insert(rows);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ success: true });
  }

  // ========== logs（绩效操作日志，游标分页）==========
  if (action === 'logs') {
    if (!hasPerf(perms, '绩效审核申请') && !hasPerf(perms, '绩效管理')) {
      return json({ error: 'Forbidden' }, 403);
    }
    const { cursor } = body;
    let query = supabase
      .from('operation_logs')
      .select('id, operator_id, operator_name, action, target_type, target_name, detail, created_at')
      .eq('target_type', 'performance')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) query = query.lt('created_at', cursor);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    const logs = data ?? [];
    const nextCursor = logs.length === PAGE_SIZE ? logs[logs.length - 1].created_at : null;
    return json({ logs, nextCursor });
  }

  // ========== leaderboard ==========
  if (action === 'leaderboard') {
    const { month } = body;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = month ? Number(month.split('-')[0]) : now.getFullYear();
    const mm = month ? Number(month.split('-')[1]) : now.getMonth() + 1;
    const start = `${yyyy}-${pad(mm)}-01`;
    const end = `${yyyy}-${pad(mm)}-${pad(new Date(yyyy, mm, 0).getDate())}`;

    const { data: rows, error } = await supabase
      .from('performance_scores')
      .select('user_id, score, user:profiles!user_id(display_name, email, position, earned_tags)')
      .eq('status', 'approved')
      .gte('date', start)
      .lte('date', end);

    if (error) return json({ error: error.message }, 500);

    const userMap = new Map<string, {
      name: string; position: string; total: number;
      add_count: number; deduct_count: number;
      earned_tags: { name: string; earned_at: string }[];
    }>();

    for (const r of rows ?? []) {
      const uid = r.user_id as string;
      const u = r.user as Record<string, unknown>;
      const name = (u?.display_name as string) || (u?.email as string) || uid;
      const position = (u?.position as string) || '';
      // 只保留当月获得的标签（earned_at 在 start~end 范围内）
      const allTags = (u?.earned_tags as { name: string; earned_at: string }[]) ?? [];
      const monthlyTags = allTags.filter(t => {
        const ea = t.earned_at ? t.earned_at.slice(0, 10) : '';
        return ea >= start && ea <= end;
      });
      const score = Number(r.score);
      if (!userMap.has(uid)) {
        userMap.set(uid, { name, position, total: 0, add_count: 0, deduct_count: 0, earned_tags: monthlyTags });
      }
      const entry = userMap.get(uid)!;
      entry.total += score;
      if (score >= 0) entry.add_count++; else entry.deduct_count++;
    }

    const list = Array.from(userMap.entries())
      .map(([uid, e]) => ({ user_id: uid, name: e.name, position: e.position, total: e.total, add_count: e.add_count, deduct_count: e.deduct_count, earned_tags: e.earned_tags }))
      .sort((a, b) => b.total - a.total);

    return json({ month: `${yyyy}-${pad(mm)}`, start, end, leaderboard: list });
  }

  return json({ error: `未知 action: ${action}` }, 400);
});


