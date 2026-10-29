$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
# Zotero 10 rejects extensions without these fields before bootstrap runs.
foreach ($field in @('id', 'update_url', 'strict_max_version')) {
    if ([string]::IsNullOrWhiteSpace($manifest.applications.zotero.$field)) {
        throw "Missing required manifest field: applications.zotero.$field"
    }
}
$updateUri = $null
if (-not [Uri]::TryCreate($manifest.applications.zotero.update_url, [UriKind]::Absolute, [ref]$updateUri) -or $updateUri.Scheme -ne 'https') {
    throw 'applications.zotero.update_url must be an absolute HTTPS URL'
}
$dist = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$output = Join-Path $dist "zotero-smart-hand-$($manifest.version).xpi"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($output, [System.IO.FileMode]::Create)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in @('manifest.json', 'bootstrap.js', 'content/smart-hand.js')) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, (Join-Path $projectRoot $relative), $relative,
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally { $zip.Dispose(); $stream.Dispose() }
Get-Item -LiteralPath $output | Select-Object FullName, Length
