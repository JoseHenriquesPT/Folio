# Applies Folio migrations to the hosted database in one transaction.
#
# The connection string lives in supabase/.env.prod.local (gitignored) as
# SUPABASE_DB_URL. Nothing is printed except file names and the outcome, so the
# password never reaches the console, the shell history, or a log file.
#
#   pwsh scripts/apply-migrations.ps1              # every migration, in order
#   pwsh scripts/apply-migrations.ps1 -File 0011_import_timestamps.sql
#   pwsh scripts/apply-migrations.ps1 -Verify       # read-only post-checks

[CmdletBinding(DefaultParameterSetName = "All")]
param(
  [Parameter(ParameterSetName = "File")]
  [string[]] $File,

  [string] $EnvFile = "supabase/.env.prod.local",

  [switch] $Verify,

  [switch] $DryRun
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$migrationsDir = Join-Path $root "supabase/migrations"
$envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $root $EnvFile }

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing $EnvFile. Create it with a single line: SUPABASE_DB_URL=postgresql://..."
}

$connectionString = $null
foreach ($line in Get-Content -LiteralPath $envPath) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
  $index = $trimmed.IndexOf("=")
  if ($index -lt 1) { continue }
  if ($trimmed.Substring(0, $index).Trim() -eq "SUPABASE_DB_URL") {
    $connectionString = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
  }
}

if (-not $connectionString) {
  throw "SUPABASE_DB_URL is empty or missing in $EnvFile."
}

if ($connectionString -notmatch "^(postgres|postgresql)://") {
  throw "SUPABASE_DB_URL must start with postgresql://"
}

# Strip the query string so the parts can be split safely.
$withoutQuery = ($connectionString -split "\?", 2)[0]
$uri = [System.Uri]$withoutQuery
$user = $uri.UserInfo.Split(":")[0]
$password = $uri.UserInfo.Split(":", 2)[1]

if ($uri.Host -in @("localhost", "127.0.0.1", "[::1]")) {
  throw "Refusing to run against a local database. Use supabase db reset for that."
}

if ($connectionString -notmatch "sslmode=(require|verify-ca|verify-full)") {
  Write-Host "Note: no sslmode in the URL; TLS is enforced by this script (PGSSLMODE=require)."
}

$files = @()
if ($PSCmdlet.ParameterSetName -eq "File") {
  foreach ($name in $File) {
    $candidate = if ([System.IO.Path]::IsPathRooted($name)) { $name } else { Join-Path $migrationsDir $name }
    $full = [System.IO.Path]::GetFullPath($candidate)
    if (-not $full.StartsWith($migrationsDir, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing ${name}: not inside supabase/migrations."
    }
    if (-not (Test-Path -LiteralPath $full)) { throw "Missing migration $name." }
    $files += Get-Item -LiteralPath $full
  }
} else {
  $files = @(Get-ChildItem -LiteralPath $migrationsDir -Filter "*.sql" | Sort-Object Name)
}

if ($files.Count -eq 0) { throw "No migrations to apply." }

if ($DryRun) {
  Write-Host "Dry run: $($files.Count) migration(s) would be applied to $($uri.Host)."
  foreach ($item in $files) { Write-Host "  $($item.Name)" }
  exit 0
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) { throw "Docker is required to reach the hosted database; install Docker Desktop first." }

$env:PGHOST = $uri.Host
$env:PGPORT = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$env:PGUSER = [System.Uri]::UnescapeDataString($user)
$env:PGPASSWORD = [System.Uri]::UnescapeDataString($password)
$env:PGDATABASE = $uri.AbsolutePath.Trim("/")
$env:PGSSLMODE = "require"

if (-not $env:PGDATABASE) { $env:PGDATABASE = "postgres" }

try {
  $mount = "$($migrationsDir.Replace('\', '/'))`:/migrations:ro"
  $psqlArgs = @("-v", "ON_ERROR_STOP=1", "--single-transaction")
  foreach ($item in $files) {
    $psqlArgs += @("-f", "/migrations/$($item.Name)")
  }

  if ($Verify) {
    Write-Host "Verifying the hosted database (read-only)."
    $psqlArgs = @(
      "-v", "ON_ERROR_STOP=1",
      "-c", "select (select count(*) from information_schema.tables where table_schema = 'public') as tables, (select count(*) from pg_policies where schemaname = 'public') as policies, (select count(*) from storage.buckets where id = 'note-attachments') as private_bucket"
    )
  } else {
    Write-Host "Applying $($files.Count) migration(s) in one transaction:"
    foreach ($item in $files) { Write-Host "  $($item.Name)" }
  }

  & docker run --rm -i `
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE `
    -v $mount `
    postgres:17-alpine psql @psqlArgs

  if ($LASTEXITCODE -ne 0) { throw "psql exited with code $LASTEXITCODE. The transaction was rolled back." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGHOST -ErrorAction SilentlyContinue
  Remove-Item Env:PGPORT -ErrorAction SilentlyContinue
  Remove-Item Env:PGUSER -ErrorAction SilentlyContinue
  Remove-Item Env:PGDATABASE -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}

Write-Host "Done."
