$envFile = Join-Path (Get-Location) ".env.local"

if (-not (Test-Path -LiteralPath $envFile)) {
  return
}

Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $parts = $line -split "=", 2
  if ($parts.Count -ne 2) {
    return
  }

  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")
  if ($name) {
    Set-Item -Path "Env:$name" -Value $value
  }
}
