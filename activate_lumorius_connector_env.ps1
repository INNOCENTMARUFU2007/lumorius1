$ErrorActionPreference = 'Stop'

# Run from the Lumorius monorepo root. This script only prepares API environment
# variables; it never overwrites existing OAuth credentials.
if (-not (Test-Path -LiteralPath '.\apps\api\src\integrations\integrations.service.ts')) {
  throw 'Run this script from C:\Users\HomePC\lumorius (the repository root).'
}

$apiEnvPath = '.\apps\api\.env'
$rootEnvPath = '.\.env'
$examplePath = '.\.env.example'
$utf8 = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $apiEnvPath)) {
  New-Item -ItemType File -Path $apiEnvPath -Force | Out-Null
  Write-Host 'Created apps/api/.env for server-only credentials.' -ForegroundColor Yellow
}

$envLines = @'
# Lumorius integrations - server-side credentials only
INTEGRATIONS_API_BASE_URL=http://localhost:3001/api/v1
INTEGRATION_ENCRYPTION_KEY=
LUMORIUS_PLATFORM_ORGANIZATION_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ATLASSIAN_CLIENT_ID=
ATLASSIAN_CLIENT_SECRET=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
DROPBOX_CLIENT_ID=
DROPBOX_CLIENT_SECRET=
INTERCOM_CLIENT_ID=
INTERCOM_CLIENT_SECRET=
PAGERDUTY_CLIENT_ID=
PAGERDUTY_CLIENT_SECRET=
DATADOG_SITE=datadoghq.com
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_API_VERSION=v61.0
'@ -split "`r?`n"

function Read-Text([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path).Replace("`r`n", "`n")
  }
  return ''
}
function Write-Text([string]$Path, [string]$Text) {
  $full = [System.IO.Path]::GetFullPath($Path)
  [System.IO.File]::WriteAllText($full, $Text.Replace("`r`n", "`n").Replace("`n", "`r`n"), $utf8)
}
function Ensure-Keys([string]$Path, [string[]]$Lines) {
  $text = Read-Text $Path
  $added = [System.Collections.Generic.List[string]]::new()
  foreach ($line in $Lines) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=') {
      $name = $Matches[1]
      if ($text -notmatch "(?m)^$([regex]::Escape($name))=") {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`n" }
        $text += "$line`n"
        $added.Add($name)
      }
    }
  }
  if ($added.Count -gt 0) { Write-Text $Path $text }
  return ,$added.ToArray()
}

# Ensure env placeholders are present; existing values are not replaced.
$addedApi = Ensure-Keys $apiEnvPath $envLines
if (Test-Path -LiteralPath $examplePath) {
  $exampleLines = @($envLines | Where-Object { $_ -notmatch '^INTEGRATION_ENCRYPTION_KEY=' })
  $null = Ensure-Keys $examplePath $exampleLines
}

# Preserve any valid existing encryption key. If only root .env has one, reuse it
# rather than rotating a key that may already protect saved connector tokens.
$keys = @()
foreach ($candidate in @($apiEnvPath, $rootEnvPath)) {
  if (Test-Path -LiteralPath $candidate) {
    $text = Read-Text $candidate
    $match = [regex]::Match($text, '(?m)^INTEGRATION_ENCRYPTION_KEY=(.*)$')
    if ($match.Success) {
      $value = $match.Groups[1].Value.Trim()
      if ($value -ne '') {
        if ($value -notmatch '^[a-fA-F0-9]{64}$') {
          throw "INTEGRATION_ENCRYPTION_KEY in $candidate is not 64 hex characters. Resolve it manually; the script did not rotate it."
        }
        $keys += $value.ToLowerInvariant()
      }
    }
  }
}
$uniqueKeys = @($keys | Select-Object -Unique)
if ($uniqueKeys.Count -gt 1) {
  throw 'Different valid integration encryption keys exist in .env and apps/api/.env. Stop and reconcile them before connecting accounts.'
}
if ($uniqueKeys.Count -eq 1) {
  $key = $uniqueKeys[0]
} else {
  $key = (& node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))").Trim()
  if ($LASTEXITCODE -ne 0 -or $key -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Could not generate an integration encryption key.'
  }
  Write-Host 'Generated a new integration encryption key. Keep it stable; do not regenerate it after connecting accounts.' -ForegroundColor Yellow
}
$apiText = Read-Text $apiEnvPath
if ($apiText -match '(?m)^INTEGRATION_ENCRYPTION_KEY=.*$') {
  $apiText = [regex]::Replace($apiText, '(?m)^INTEGRATION_ENCRYPTION_KEY=.*$', "INTEGRATION_ENCRYPTION_KEY=$key", 1)
} else {
  if ($apiText.Length -gt 0 -and -not $apiText.EndsWith("`n")) { $apiText += "`n" }
  $apiText += "INTEGRATION_ENCRYPTION_KEY=$key`n"
}
Write-Text $apiEnvPath $apiText

# Check that code contains OAuth/API/webhook connector definitions expected by this env template.
$service = Read-Text '.\apps\api\src\integrations\integrations.service.ts'
$expected = @('google-drive','gmail','google-meet','onedrive','outlook-mail','slack','notion','github','jira','zoom','hubspot','salesforce','linear','dropbox','intercom','pagerduty','datadog','zapier','make')
$missing = @($expected | Where-Object { $service -notmatch "id:\s*'$( [regex]::Escape($_) )'" })
if ($missing.Count -gt 0) {
  Write-Host "WARNING: these connector definitions were not found in the current service: $($missing -join ', ')" -ForegroundColor Red
  Write-Host 'Do not assume these are enabled until the integration service is restored/updated.' -ForegroundColor Red
} else {
  Write-Host 'Connector source check passed: all listed connectors are defined.' -ForegroundColor Green
}

Write-Host "`nAPI env file: $([System.IO.Path]::GetFullPath($apiEnvPath))" -ForegroundColor Cyan
if ($addedApi.Count -gt 0) {
  Write-Host "Added missing variable names: $($addedApi -join ', ')" -ForegroundColor Green
} else {
  Write-Host 'All required variable names already existed; existing values were preserved.' -ForegroundColor Green
}
Write-Host 'Secret values were not displayed.' -ForegroundColor DarkGray
Write-Host "`nProviders that use OAuth client ID/secret:" -ForegroundColor Cyan
Write-Host 'Google Drive, Gmail, Google Meet/Calendar: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET'
Write-Host 'OneDrive, Outlook/Microsoft 365: MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET'
Write-Host 'Slack: SLACK_CLIENT_ID / SLACK_CLIENT_SECRET'
Write-Host 'Notion: NOTION_CLIENT_ID / NOTION_CLIENT_SECRET'
Write-Host 'GitHub: GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET'
Write-Host 'Jira Cloud: ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET'
Write-Host 'Zoom: ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET'
Write-Host 'HubSpot: HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET'
Write-Host 'Salesforce: SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET'
Write-Host 'Linear: LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET'
Write-Host 'Dropbox: DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET'
Write-Host 'Intercom: INTERCOM_CLIENT_ID / INTERCOM_CLIENT_SECRET'
Write-Host 'PagerDuty: PAGERDUTY_CLIENT_ID / PAGERDUTY_CLIENT_SECRET'
Write-Host "`nDatadog credentials and Zapier/Make webhooks are entered through Configure integration in the UI, not these OAuth variables."
Write-Host 'Restart the API process after adding/changing credentials.' -ForegroundColor Yellow
