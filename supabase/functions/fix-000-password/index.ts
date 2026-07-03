import { createClient } from 'npm:@supabase/supabase-js@2';

const TARGET_USER_ID = '129225c5-5dbf-4277-b37b-d849d723ff27';

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(TARGET_USER_ID, {
    password: '123456',
    email_confirm: true,
  });

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, user_id: TARGET_USER_ID, email: '000@miaoda.app' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
