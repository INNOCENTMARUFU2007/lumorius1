$ErrorActionPreference = 'Stop'

# Run from C:\Users\HomePC\lumorius. Change this value only if the actual
# Lumorius software-owner login email is different.
$platformOwnerEmail = 'marufuinnocent0@gmail.com'.Trim().ToLowerInvariant()
if ($platformOwnerEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw 'platformOwnerEmail is not a valid email address.'
}

$root = (Get-Location).Path
$required = @(
    '.\apps\api\src\admin\admin.controller.ts',
    '.\apps\api\src\admin\admin.module.ts',
    '.\apps\web\src\app\(dashboard)\admin\page.tsx',
    '.\apps\web\src\components\layout\sidebar.tsx',
    '.\apps\web\src\components\command-palette.tsx'
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required file not found: $path. No project files were changed."
    }
}

$controllerPath = '.\apps\api\src\admin\admin.controller.ts'
$modulePath = '.\apps\api\src\admin\admin.module.ts'
$pagePath = '.\apps\web\src\app\(dashboard)\admin\page.tsx'
$sidebarPath = '.\apps\web\src\components\layout\sidebar.tsx'
$palettePath = '.\apps\web\src\components\command-palette.tsx'
$guardPath = '.\apps\api\src\admin\platform-owner.guard.ts'

function Read-Normalized([string]$Path) {
    return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path).Replace("`r`n", "`n")
}
function Write-Utf8([string]$Path, [string]$Content) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $directory = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($full, $Content.Replace("`r`n", "`n").Replace("`n", "`r`n"), [System.Text.UTF8Encoding]::new($false))
}
function Backup-IfExists([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        $relative = $Path -replace '^[.][\\/]', ''
        $safeName = $relative -replace '[\\/:*?"<>|]', '_'
        Copy-Item -LiteralPath $Path -Destination (Join-Path $backupDir $safeName) -Force
    }
}
function Ensure-EnvValue([string]$Path, [string]$Name, [string]$Value) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if (Test-Path -LiteralPath $full) {
        $text = [System.IO.File]::ReadAllText($full).Replace("`r`n", "`n")
    } else {
        $text = ''
    }
    $pattern = '(?m)^' + [regex]::Escape($Name) + '=(.*)$'
    $match = [regex]::Match($text, $pattern)
    if ($match.Success) {
        $existing = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($existing -and $existing.ToLowerInvariant() -ne $Value.ToLowerInvariant()) {
            throw "$Name is already set to a different non-empty value in $Path. Update it to the intended Lumorius owner email, then rerun this script. No project source has been changed."
        }
        $text = ([regex]::new($pattern)).Replace($text, ($Name + '=' + $Value), 1)
    } else {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`n" }
        $text += "$Name=$Value`n"
    }
    Write-Utf8 $full $text
}

# Read all source files first, and validate every expected anchor before any writes.
$controller = Read-Normalized $controllerPath
$module = Read-Normalized $modulePath
$page = Read-Normalized $pagePath
$sidebar = Read-Normalized $sidebarPath
$palette = Read-Normalized $palettePath

if (($controller -notmatch "@Controller\(\{\s*path:\s*'admin'") -and ($controller -notmatch "@Controller\('admin'\)")) {
    throw 'AdminController route anchor not found. No project files were changed.'
}
if ($controller -notmatch "import \{ AdminService \} from './admin\.service';") {
    throw 'AdminService import anchor not found in admin.controller.ts. No project files were changed.'
}
if ($controller -notmatch '@UseGuards\(JwtAuthGuard\s*,\s*RolesGuard\)' -or $controller -notmatch "@Roles\('admin',\s*'super_admin'\)") {
    throw 'Admin role guard anchors did not match the expected source. No project files were changed.'
}
if ($module -notmatch "import \{ AdminService \} from './admin\.service';" -or $module -notmatch 'providers:\s*\[AdminService\]') {
    throw 'Admin module import/providers anchors do not match the expected version. No project files were changed.'
}
if ($page -notmatch "import \{ useState \} from 'react';" -or $page -notmatch 'export default function AdminPage\(\) \{' -or $page -notmatch "queryKey: \['admin', 'stats'\]," -or $page -notmatch "enabled: tab === 'users'," -or $page -notmatch "enabled: tab === 'orgs'," -or $page -notmatch "enabled: tab === 'audit',") {
    throw 'Admin page anchors did not match the expected source. No project files were changed.'
}
if ($sidebar -notmatch "const isAdmin = user\?\.role === 'admin' \|\| user\?\.role === 'super_admin';") {
    throw 'Sidebar admin-role visibility anchor not found. No project files were changed.'
}
if ($palette -notmatch "import \{ cn \} from '@/lib/utils';" -or $palette -notmatch 'const allCommands = \[\.\.\.NAV_COMMANDS, \.\.\.QUICK_ACTIONS\];') {
    throw 'Command palette anchors did not match the expected source. No project files were changed.'
}
if ($page -match 'isPlatformAdmin' -or $sidebar -match 'NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL' -or $palette -match 'NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL') {
    throw 'Some frontend platform-admin edits are already present. Inspect the files before rerunning to avoid duplicate changes.'
}

# Environment files are backed up alongside source files. .env.local is the
# Next.js app-local public email allowlist; the backend uses its own env value.
$envFiles = @(
    '.\apps\api\.env',
    '.\apps\web\.env.local',
    '.\.env.example',
    '.\apps\api\.env.example',
    '.\apps\web\.env.example'
)
foreach ($envPath in $envFiles) {
    if (Test-Path -LiteralPath $envPath) {
        $envContent = Read-Normalized $envPath
        $variable = if ($envPath -match 'apps\\web') { 'NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL' } else { 'LUMORIUS_ADMIN_EMAIL' }
        $check = [regex]::Match($envContent, '(?m)^' + [regex]::Escape($variable) + '=(.*)$')
        if ($check.Success) {
            $existing = $check.Groups[1].Value.Trim().Trim('"').Trim("'")
            if ($existing -and $existing -notmatch '^(your-owner-email@example\.com|owner@example\.com)$' -and $existing.ToLowerInvariant() -ne $platformOwnerEmail) {
                throw "$variable has a different value in $envPath. Resolve it before applying this patch. No source files were changed."
            }
        }
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $root ".platform-admin-backups\$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($path in (@($controllerPath, $modulePath, $pagePath, $sidebarPath, $palettePath, $guardPath) + $envFiles)) {
    Backup-IfExists $path
}

# 1) Add backend guard: the currently authenticated user's active database email
# must match LUMORIUS_ADMIN_EMAIL. An organisation role alone grants no access.
$guard = @'
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface AuthenticatedRequest {
  user?: { sub?: string };
}

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const expectedEmail = String(process.env.LUMORIUS_ADMIN_EMAIL ?? '').trim().toLowerCase();
    if (!expectedEmail) {
      throw new ForbiddenException('Platform owner access is not configured on the server.');
    }

    const result = await this.db.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [userId],
    );
    const actualEmail = String(result.rows[0]?.email ?? '').trim().toLowerCase();

    if (!actualEmail || actualEmail !== expectedEmail) {
      throw new ForbiddenException('This area is restricted to the Lumorius platform owner.');
    }

    return true;
  }
}
'@
$writeNewGuard = -not (Test-Path -LiteralPath $guardPath)
if (-not $writeNewGuard) {
    $existingGuard = Read-Normalized $guardPath
    if ($existingGuard -notmatch 'export class PlatformOwnerGuard' -or $existingGuard -notmatch 'LUMORIUS_ADMIN_EMAIL') {
        throw 'A different platform-owner guard already exists. Inspect it before proceeding.'
    }
}

# Protect every /admin endpoint server-side and remove tenant-role-only checks.
if ($controller -notmatch 'PlatformOwnerGuard') {
    $controller = $controller.Replace("import { AdminService } from './admin.service';", "import { AdminService } from './admin.service';`nimport { PlatformOwnerGuard } from './platform-owner.guard';")
    $controller = ([regex]::new('@UseGuards\(JwtAuthGuard\s*,\s*RolesGuard\)')).Replace($controller, '@UseGuards(JwtAuthGuard, PlatformOwnerGuard)', 1)
    if ($controller -notmatch '@UseGuards\(JwtAuthGuard, PlatformOwnerGuard\)') {
        throw 'Could not safely replace the admin controller guards; backups exist and no further files were changed.'
    }
    $controller = [regex]::Replace($controller, '(?m)^import \{ RolesGuard \} from ''\.\./common/guards/roles\.guard'';\n', '')
    $controller = [regex]::Replace($controller, '(?m)^import \{ Roles \} from ''\.\./common/decorators/roles\.decorator'';\n', '')
    $controller = [regex]::Replace($controller, "(?m)^@Roles\('admin',\s*'super_admin'\)\n", '')
}

if ($module -notmatch 'PlatformOwnerGuard') {
    $module = $module.Replace("import { AdminService } from './admin.service';", "import { AdminService } from './admin.service';`nimport { PlatformOwnerGuard } from './platform-owner.guard';")
    $module = $module.Replace('providers: [AdminService],', 'providers: [AdminService, PlatformOwnerGuard],')
}

# 2) Gate the admin page by the email allowlist and suppress all privileged queries
# until identity has been loaded and matches.
$page = $page.Replace("import { useState } from 'react';", "import { useState } from 'react';`nimport { useAuth } from '@/hooks/use-auth';")
$pageFunctionHeader = @'
export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const isPlatformAdmin = Boolean(
    platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail,
  );
'@
$page = $page.Replace("export default function AdminPage() {", $pageFunctionHeader.TrimEnd())
$page = $page.Replace("queryKey: ['admin', 'stats'],", "queryKey: ['admin', 'stats'],`n    enabled: isPlatformAdmin -and`n      !authLoading,")
$page = $page.Replace("enabled: tab === 'users',", "enabled: isPlatformAdmin && !authLoading && tab === 'users',")
$page = $page.Replace("enabled: tab === 'orgs',", "enabled: isPlatformAdmin && !authLoading && tab === 'orgs',")
$page = $page.Replace("enabled: tab === 'audit',", "enabled: isPlatformAdmin && !authLoading && tab === 'audit',")
# Correct the inserted TypeScript boolean operator in the stats query.
$page = $page.Replace("enabled: isPlatformAdmin -and`n      !authLoading,", "enabled: isPlatformAdmin && !authLoading,")
$oldMrrReturn = @'
  const mrr = stats ? `$${((stats.totals.mrrCents ?? 0) / 100).toLocaleString()}` : '—';
  return (
    <div className="max-w-7xl mx-auto space-y-6">
'@
$newMrrReturn = @'
  const mrr = stats ? `$${((stats.totals.mrrCents ?? 0) / 100).toLocaleString()}` : '—';

  if (authLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Verifying platform owner access…</div>;
  }
  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-12 rounded-xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">Platform administration restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This panel is available only to the configured Lumorius software-owner account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
'@
if (-not $page.Contains($oldMrrReturn)) {
    throw 'Could not insert the platform-admin page gate at the expected location.'
}
$page = $page.Replace($oldMrrReturn, $newMrrReturn)

# 3) Sidebar admin link: no longer rely on organisation role names.
$sidebar = $sidebar.Replace(
    "const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';",
    "const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '').trim().toLowerCase();`n  const isAdmin = Boolean(platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail);"
)

# 4) Command palette: remove the /admin command for non-owner emails too.
$palette = $palette.Replace("import { cn } from '@/lib/utils';", "import { cn } from '@/lib/utils';`nimport { useAuth } from '@/hooks/use-auth';")
$paletteRouterBlock = @'
  const router  = useRouter();
  const { user } = useAuth();
  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const isPlatformAdmin = Boolean(platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail);
'@
$palette = $palette.Replace('  const router  = useRouter();', $paletteRouterBlock.TrimEnd())
$palette = $palette.Replace('  const allCommands = [...NAV_COMMANDS, ...QUICK_ACTIONS];', "  const allCommands = [...NAV_COMMANDS.filter((cmd) => cmd.href !== '/admin' || isPlatformAdmin), ...QUICK_ACTIONS];")

# Validate planned replacements before writing any source files.
if ($controller -notmatch 'PlatformOwnerGuard' -or $controller -match '@Roles\(') { throw 'Backend controller did not pass guard validation.' }
if ($module -notmatch 'providers:\s*\[AdminService,\s*PlatformOwnerGuard\]') { throw 'PlatformOwnerGuard is not registered in AdminModule.' }
if ($page -notmatch 'export default function AdminPage' -or $page -notmatch 'isPlatformAdmin' -or $page -notmatch 'enabled: isPlatformAdmin && !authLoading') { throw 'Admin page did not pass owner-gate validation.' }
if ($sidebar -notmatch 'NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL') { throw 'Sidebar did not pass owner-gate validation.' }
if ($palette -notmatch 'NAV_COMMANDS\.filter\(\(cmd\) => cmd\.href !== ''/admin'' \|\| isPlatformAdmin\)') { throw 'Command palette did not pass owner-gate validation.' }

if ($writeNewGuard) { Write-Utf8 $guardPath $guard }
Write-Utf8 $controllerPath $controller
Write-Utf8 $modulePath $module
Write-Utf8 $pagePath $page
Write-Utf8 $sidebarPath $sidebar
Write-Utf8 $palettePath $palette

# Keep runtime and browser allowlists aligned. The browser variable is only an
# email visibility hint; the API database-backed guard remains authoritative.
Ensure-EnvValue '.\apps\api\.env' 'LUMORIUS_ADMIN_EMAIL' $platformOwnerEmail
Ensure-EnvValue '.\apps\web\.env.local' 'NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL' $platformOwnerEmail
if (Test-Path '.\.env.example') {
    $example = Read-Normalized '.\.env.example'
    if ($example -notmatch '(?m)^LUMORIUS_ADMIN_EMAIL=') { Write-Utf8 '.\.env.example' ($example + "`nLUMORIUS_ADMIN_EMAIL=your-owner-email@example.com`n") }
}
if (Test-Path '.\apps\api\.env.example') {
    $example = Read-Normalized '.\apps\api\.env.example'
    if ($example -notmatch '(?m)^LUMORIUS_ADMIN_EMAIL=') { Write-Utf8 '.\apps\api\.env.example' ($example + "`nLUMORIUS_ADMIN_EMAIL=your-owner-email@example.com`n") }
}
if (Test-Path '.\apps\web\.env.example') {
    $example = Read-Normalized '.\apps\web\.env.example'
    if ($example -notmatch '(?m)^NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL=') { Write-Utf8 '.\apps\web\.env.example' ($example + "`nNEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL=your-owner-email@example.com`n") }
}

Write-Host "`nPlatform-owner restriction applied." -ForegroundColor Green
Write-Host "Owner email configured: $platformOwnerEmail"
Write-Host "Backups: $backupDir"
Write-Host 'API protection: active database email must match LUMORIUS_ADMIN_EMAIL.'
Write-Host 'Frontend visibility: sidebar, command palette, and Admin page use NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL.'

Write-Host "`n===== API BUILD =====" -ForegroundColor Cyan
$apiOutput = & pnpm --filter @lumorius/api build 2>&1
$apiCode = $LASTEXITCODE
$apiOutput | ForEach-Object { Write-Host $_ }
Write-Host "API build exit code: $apiCode"

Write-Host "`n===== WEB TYPE CHECK (NO NEXT PRODUCTION BUILD) =====" -ForegroundColor Cyan
$webOutput = & pnpm --filter @lumorius/web exec tsc --noEmit 2>&1
$webCode = $LASTEXITCODE
$webOutput | ForEach-Object { Write-Host $_ }
Write-Host "Web type-check exit code: $webCode"

if ($apiCode -ne 0 -or $webCode -ne 0) {
    Write-Host "`nOne or more checks failed. Keep the backups; copy the first compiler error for a targeted fix." -ForegroundColor Red
} else {
    Write-Host "`nBoth API build and web type-check passed." -ForegroundColor Green
}
Read-Host 'Press Enter to return to PowerShell'
