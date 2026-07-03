import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  user_ids: string[];       // 目标用户 ID 列表
  title: string;
  body: string;
  data?: Record<string, string>;  // 附加数据（order_id、type 等，用于点击跳转）
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

    const payload: PushPayload = await req.json();
    const { user_ids, title, body, data } = payload;

    if (!user_ids?.length || !title || !body) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 批量查询目标用户的 push token
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', user_ids)
      .not('expo_push_token', 'is', null);

    if (error) throw error;

    const tokens: string[] = (profiles ?? [])
      .map((p: { expo_push_token: string | null }) => p.expo_push_token)
      .filter((t): t is string => !!t && t.startsWith('ExponentPushToken['));

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: '无有效 push token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 构建 Expo Push API 请求（每次最多 100 条）
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data ?? {},
      priority: 'high',
      channelId: 'default',
    }));

    const CHUNK = 100;
    let totalSent = 0;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (res.ok) totalSent += chunk.length;
    }

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
