import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractVersionNum(v: string): number {
  const m = v.match(/v(\d+)/i);
  return m ? Number(m[1]) : 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // GET：查询版本列表，按版本号数字降序
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('app_versions')
      .select('version, description, release_date, status');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sorted = (data ?? []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      extractVersionNum(b.version as string) - extractVersionNum(a.version as string)
    );

    return new Response(JSON.stringify({ versions: sorted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // POST：自动递增版本号并写入新版本记录
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { description } = body;
    if (!description || typeof description !== 'string') {
      return new Response(JSON.stringify({ error: '缺少 description' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 查当前最大版本号
    const { data: rows } = await supabase
      .from('app_versions')
      .select('version');
    const maxNum = (rows ?? []).reduce((max: number, r: Record<string, unknown>) => {
      return Math.max(max, extractVersionNum(r.version as string));
    }, 0);
    const nextVersion = `v${maxNum + 1}`;

    // 使用服务器当前日期
    const today = new Date().toISOString().slice(0, 10);

    const { error: insertErr } = await supabase
      .from('app_versions')
      .insert({ version: nextVersion, description: description.trim(), release_date: today, status: 'released' });

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, version: nextVersion, release_date: today }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
