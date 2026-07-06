$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-env.ps1"

if (-not $env:TARGET_DATABASE_URL) {
  throw "Missing TARGET_DATABASE_URL. Set it to the new Supabase PostgreSQL connection string."
}

$sql = @"
SELECT 'tenants' AS tbl, COUNT(*) AS cnt FROM tenants
UNION ALL SELECT 'stores', COUNT(*) FROM stores
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'ingredients', COUNT(*) FROM ingredients
UNION ALL SELECT 'ingredient_categories', COUNT(*) FROM ingredient_categories
UNION ALL SELECT 'ingredient_subcategories', COUNT(*) FROM ingredient_subcategories
UNION ALL SELECT 'ingredient_suppliers', COUNT(*) FROM ingredient_suppliers
UNION ALL SELECT 'ingredient_units', COUNT(*) FROM ingredient_units
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'operation_logs', COUNT(*) FROM operation_logs
UNION ALL SELECT 'perf_templates', COUNT(*) FROM perf_templates
UNION ALL SELECT 'watermark_posts', COUNT(*) FROM watermark_posts
UNION ALL SELECT 'watermark_post_media', COUNT(*) FROM watermark_post_media
ORDER BY tbl;
"@

psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -c $sql
