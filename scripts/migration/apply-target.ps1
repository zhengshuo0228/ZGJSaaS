param(
  [string]$DataSql,
  [string]$SchemaSql = "supabase/schema.sql",
  [string]$SaasMigration = "supabase/migrations/00046_saas_tenants_and_chain_stores.sql"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-env.ps1"

if (-not $env:TARGET_DATABASE_URL) {
  throw "Missing TARGET_DATABASE_URL. Set it to the new Supabase PostgreSQL connection string."
}

if (-not (Test-Path -LiteralPath $SchemaSql)) {
  throw "Schema file not found: $SchemaSql"
}

if ($DataSql -and -not (Test-Path -LiteralPath $DataSql)) {
  throw "Data SQL file not found: $DataSql"
}

if (-not (Test-Path -LiteralPath $SaasMigration)) {
  throw "SaaS migration file not found: $SaasMigration"
}

Write-Host "Applying base schema..."
psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -f $SchemaSql

if ($DataSql) {
  Write-Host "Importing latest data..."
  psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -f $DataSql
} else {
  Write-Host "No DataSql provided. Skipping legacy data import and initializing an empty SaaS database."
}

Write-Host "Applying SaaS tenant migration..."
psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -f $SaasMigration

Write-Host "Analyzing target database..."
psql $env:TARGET_DATABASE_URL -v ON_ERROR_STOP=1 -c "ANALYZE;"

Write-Host "Target import complete."
