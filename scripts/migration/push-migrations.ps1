$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-env.ps1"

if (-not $env:TARGET_DATABASE_URL) {
  throw "Missing TARGET_DATABASE_URL. Put it in .env.local or set it in the current shell."
}

Write-Host "Pushing Supabase migrations to target database..."
npx supabase db push --db-url $env:TARGET_DATABASE_URL
Write-Host "Migrations pushed."
