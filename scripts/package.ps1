# Build the Chrome Web Store upload zip (whitelist only).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/package.ps1
# Output: dist/commentbot-<version>.zip  (version read from manifest.json)
#
# NOTE: this does NOT use Compress-Archive. On Windows PowerShell, Compress-Archive
# writes zip entries with backslash separators (e.g. "icons\icon16.png"), which is
# non-spec and can break path resolution once Chrome unpacks the item (the manifest
# references "icons/icon16.png"). We build entries by hand with forward slashes.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Only these files/dirs belong in the uploaded package. Everything else
# (README, LICENSE, assets/, dist/, docs, .git, .claude, scripts, PRIVACY.md) is excluded.
$include = @(
  'manifest.json',
  'background.js',
  'content.js',
  'providers.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'inject_twitter.js',
  'icons'
)

# Expand to a flat list of { Path (absolute) ; Entry (forward-slash relative) }.
$files = @()
foreach ($item in $include) {
  if (-not (Test-Path $item)) { throw "Missing required file/dir: $item" }
  if (Test-Path $item -PathType Container) {
    Get-ChildItem -Path $item -Recurse -File | ForEach-Object {
      $rel = ($_.FullName.Substring((Get-Location).Path.Length + 1)) -replace '\\', '/'
      $files += [pscustomobject]@{ Path = $_.FullName; Entry = $rel }
    }
  } else {
    $files += [pscustomobject]@{ Path = (Resolve-Path $item).Path; Entry = $item }
  }
}

$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$version = $manifest.version
if ([string]::IsNullOrWhiteSpace($version)) { throw 'Could not read version from manifest.json' }

New-Item -ItemType Directory -Force -Path dist | Out-Null
$out = Join-Path 'dist' "commentbot-$version.zip"
if (Test-Path $out) { Remove-Item $out -Force }
$outFull = Join-Path (Get-Location).Path $out

Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

$zip = [System.IO.Compression.ZipFile]::Open($outFull, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.Path, $f.Entry,
      [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

Write-Host "Built $out"
Write-Host 'Contents:'
$zip = [System.IO.Compression.ZipFile]::OpenRead($outFull)
$zip.Entries | ForEach-Object { Write-Host "  $($_.FullName)" }
$zip.Dispose()
