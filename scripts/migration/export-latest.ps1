param(
  [string]$OutputDir = "tasks/migration/latest"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-env.ps1"

if (-not $env:SOURCE_DATABASE_URL) {
  throw "Missing SOURCE_DATABASE_URL. Set it to the old Miaoda-hosted PostgreSQL connection string."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$fullDump = Join-Path $OutputDir "full_export_$timestamp.dump"
$schemaSql = Join-Path $OutputDir "schema_$timestamp.sql"
$dataSql = Join-Path $OutputDir "data_$timestamp.sql"

pg_dump $env:SOURCE_DATABASE_URL `
  --format=custom `
  --no-acl `
  --no-owner `
  --schema=public `
  --file=$fullDump

pg_dump $env:SOURCE_DATABASE_URL `
  --schema=public `
  --schema-only `
  --no-acl `
  --no-owner `
  --file=$schemaSql

pg_dump $env:SOURCE_DATABASE_URL `
  --schema=public `
  --data-only `
  --column-inserts `
  --no-acl `
  --no-owner `
  --file=$dataSql

Write-Host "Export complete:"
Write-Host "  Full dump: $fullDump"
Write-Host "  Schema:    $schemaSql"
Write-Host "  Data:      $dataSql"
