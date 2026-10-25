$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\HomePC\lumorius'
if (-not (Test-Path -LiteralPath $repo -PathType Container)) {
    throw "Lumorius project folder not found: $repo"
}
Set-Location -LiteralPath $repo

$ownerEmail = 'marufuinnocent0@gmail.com'.Trim().ToLowerInvariant()
$controllerPath = Join-Path $repo 'apps\api\src\admin\admin.controller.ts'
$modulePath = Join-Path $repo 'apps\api\src\admin\admin.module.ts'
$sidebarPath = Join-Path $repo 'apps\web\src\components\layout\sidebar.tsx'
$pagePath = Join-Path $repo 'apps\web\src\app\(dashboard)\admin\page.tsx'
$dbServicePath = Join-Path $repo 'apps\api\src\database\database.service.ts'

function Replace-ExactlyOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Old,
        [Parameter(Mandatory = $true)][string]$New,
        [Parameter(Mandatory = $true)][string]$Description
    )
    $first = $Text.IndexOf($Old, [System.StringComparison]::Ordinal)
    if ($first -lt 0) { throw "Could not find $Description. No source files were changed." }
    $second = $Text.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
    if ($second -ge 0) { throw "Found more than one match for $Description. No source files were changed." }
    return $Text.Substring(0, $first) + $New + $Text.Substring($first + $Old.Length)
}

$required = @($controllerPath, $modulePath, $sidebarPath, $pagePath, $dbServicePath)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required project source file not found: $path. No source files were changed."
    }
}

$controller = [System.IO.File]::ReadAllText($controllerPath)
$module = [System.IO.File]::ReadAllText($modulePath)
$sidebar = [System.IO.File]::ReadAllText($sidebarPath)
$page = [System.IO.File]::ReadAllText($pagePath)
$dbService = [System.IO.File]::ReadAllText($dbServicePath)

# Validate only the actual structures shown in the user's current source output.
if ($controller -notmatch '@UseGuards\(JwtAuthGuard,\s*RolesGuard\)' -or
    $controller -notmatch "@Roles\('admin'\)" -or
    $controller -notmatch "@Controller\(\{\s*path:\s*'admin',\s*version:\s*'1'\s*\}\)") {
    throw 'Admin controller does not match the role-protected source shown. No source files were changed.'
}
if ($module -notmatch 'providers:\s*\[AdminService\]' -or
    $module -notmatch "import \{ AdminService \} from './admin.service';") {
    throw 'Admin module provider structure differs from the source shown. No source files were changed.'
}
if ($sidebar -notmatch "user\?\.role\s*===\s*'admin'\s*\|\|\s*user\?\.role\s*===\s*'super_admin'") {
    throw 'Could not identify the current sidebar admin-role expression. No source files were changed.'
}
if ($page -notmatch "queryKey:\s*\['admin',\s*'stats'\]" -or
    $page -notmatch "api\.get\('/admin/stats'\)" -or
    $page -notmatch "enabled:\s*tab === 'users'") {
    throw 'Admin page query structure differs from the source shown. No source files were changed.'
}
if (-not $page.Contains('/admin/organizations?page=') -or -not $page.Contains('/admin/audit-logs?page=')) {
    throw 'Could not locate the organisation and audit query URLs in the admin page. No source files were changed.'
}
$authMatch = [regex]::Match($sidebar, '(?s)import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*["'']([^"'']+)["'']\s*;?')
if (-not $authMatch.Success) {
    throw 'Could not identify the useAuth import used by the sidebar. No source files were changed.'
}
$authModule = $authMatch.Groups[1].Value
if ($dbService -notmatch 'query\s*<') {
    throw 'DatabaseService does not appear to expose a generic query method. No source files were changed.'
}
if ($dbService -notmatch 'class DatabaseService') {
    throw 'DatabaseService class could not be confirmed. No source files were changed.'
}

$guard = @'
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    sub?: string;
    userId?: string;
  };
};

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub ?? request.user?.id ?? request.user?.userId;
    const ownerEmail = (process.env.LUMORIUS_ADMIN_EMAIL ?? 'marufuinnocent0@gmail.com')
      .trim()
      .toLowerCase();

    if (!userId || !ownerEmail) {
      throw new ForbiddenException('Platform-owner access required.');
    }

    const result = await this.db.query<{ email: string; is_active: boolean }>(
      'SELECT email, is_active FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const account = result.rows?.[0];
    const accountEmail = (account?.email ?? '').trim().toLowerCase();

    if (!account || account.is_active === false || accountEmail !== ownerEmail) {
      throw new ForbiddenException('Platform-owner access required.');
    }

    return true;
  }
}
'@

# Sidebar: match the existing multi-line declaration from the captured output.
$sidebarPattern = "(?m)^(?<indent>[ \t]*)const isAdmin =\r?\n\k<indent>  user\?\.role === 'admin' \|\| user\?\.role === 'super_admin';"
$sidebarRegex = [regex]::new($sidebarPattern)
$sidebarMatches = $sidebarRegex.Matches($sidebar)
if ($sidebarMatches.Count -ne 1) {
    throw 'Expected exactly one multi-line sidebar isAdmin declaration. No source files were changed.'
}
$sidebar = $sidebarRegex.Replace($sidebar, {
    param($m)
    $i = $m.Groups['indent'].Value
    return $i + "const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '$ownerEmail').trim().toLowerCase();`r`n" +
      $i + "const isAdmin = Boolean(platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail);"
}, 1)

# Admin page authentication hook and owner-email state.
if ($page -notmatch '\buseAuth\s*\(') {
    $page = Replace-ExactlyOnce $page "import { formatRelative } from '@/lib/utils';" "import { formatRelative } from '@/lib/utils';`r`nimport { useAuth } from '$authModule';" 'admin-page utility import'
    $page = Replace-ExactlyOnce $page '  const qc = useQueryClient();' "  const qc = useQueryClient();`r`n  const { user } = useAuth();" 'AdminPage query-client hook'
}
$searchState = "  const [search, setSearch] = useState('');"
if ($page.Contains('const isPlatformAdmin =')) {
    throw 'Admin page already contains an isPlatformAdmin gate; refusing to duplicate it. No source files were changed.'
}
$ownerState = @"
$searchState

  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '$ownerEmail')
    .trim()
    .toLowerCase();
  const isPlatformAdmin = Boolean(
    platformAdminEmail &&
    (user?.email ?? '').trim().toLowerCase() === platformAdminEmail,
  );
"@
$ownerState = $ownerState.TrimEnd()
$page = Replace-ExactlyOnce $page $searchState $ownerState 'AdminPage search state'

$page = Replace-ExactlyOnce $page "queryFn: async () => (await api.get('/admin/stats')).data.data," "queryFn: async () => (await api.get('/admin/stats')).data.data,`r`n    enabled: isPlatformAdmin," 'platform statistics query'
$page = Replace-ExactlyOnce $page "enabled: tab === 'users'," "enabled: isPlatformAdmin && tab === 'users'," 'users query enable condition'
$newOrgQuery = '(await api.get(`/admin/organizations?page=${page}&search=${search}`)).data.data,' + "`r`n" + "    enabled: isPlatformAdmin && tab === 'orgs',"
$page = Replace-ExactlyOnce $page '(await api.get(`/admin/organizations?page=${page}&search=${search}`)).data.data,' $newOrgQuery 'organisation query'
$newAuditQuery = '(await api.get(`/admin/audit-logs?page=${page}`)).data.data,' + "`r`n" + "    enabled: isPlatformAdmin && tab === 'audit',"
$page = Replace-ExactlyOnce $page '(await api.get(`/admin/audit-logs?page=${page}`)).data.data,' $newAuditQuery 'audit query'

# Put the access-denied UI immediately before the actual return JSX in the supplied page.
$renderPattern = '(?m)^  return \(\r?\n    <div className="max-w-7xl mx-auto space-y-6">'
$renderRegex = [regex]::new($renderPattern)
if ($renderRegex.Matches($page).Count -ne 1) {
    throw 'Could not find the exact AdminPage render boundary shown in the supplied source. No source files were changed.'
}
$denyBlock = @'
  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Lumorius platform administration panel is available only to the software owner.
        </p>
      </div>
    );
  }

'@
$page = $renderRegex.Replace($page, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $denyBlock + $m.Value }, 1)

# API: replace the organisation-admin role restriction with a database-backed owner guard.
$controller = [regex]::Replace($controller, "(?m)^import \{ RolesGuard \} from '../common/guards/roles.guard';\r?\n", '')
$controller = [regex]::Replace($controller, "(?m)^import \{ Roles \} from '../common/decorators/roles.decorator';\r?\n", '')
if ($controller -notmatch "import \{ PlatformOwnerGuard \} from './platform-owner.guard';") {
    $controller = Replace-ExactlyOnce $controller "import { AdminService } from './admin.service';" "import { AdminService } from './admin.service';`r`nimport { PlatformOwnerGuard } from './platform-owner.guard';" 'AdminController service import'
}
$controller = Replace-ExactlyOnce $controller '@UseGuards(JwtAuthGuard, RolesGuard)' '@UseGuards(JwtAuthGuard, PlatformOwnerGuard)' 'AdminController class guards'
$controller = [regex]::Replace($controller, "(?m)^@Roles\('admin'\)\r?\n", '', 1)
if ($controller -match 'RolesGuard|@Roles\(' -or $controller -notmatch '@UseGuards\(JwtAuthGuard, PlatformOwnerGuard\)') {
    throw 'Could not verify owner-only guards on the admin API. No source files were changed.'
}

if ($module -notmatch "import \{ PlatformOwnerGuard \} from './platform-owner.guard';") {
    $module = Replace-ExactlyOnce $module "import { AdminService } from './admin.service';" "import { AdminService } from './admin.service';`r`nimport { PlatformOwnerGuard } from './platform-owner.guard';" 'AdminModule service import'
}
$module = Replace-ExactlyOnce $module 'providers: [AdminService]' 'providers: [AdminService, PlatformOwnerGuard]' 'AdminModule provider list'

# Confirm the full in-memory patch is safe before touching any source file.
if ($page -notmatch 'enabled:\s*isPlatformAdmin' -or $page -notmatch 'if\s*\(!isPlatformAdmin\)' -or
    $page -notmatch 'enabled:\s*isPlatformAdmin\s*&&\s*tab === ''orgs''' -or
    $page -notmatch 'enabled:\s*isPlatformAdmin\s*&&\s*tab === ''audit''') {
    throw 'Admin-page owner gate verification failed. No source files were changed.'
}
if ($sidebar -notmatch 'user\?\.email' -or $sidebar -match "user\?\.role === 'admin'") {
    throw 'Sidebar owner-email gate verification failed. No source files were changed.'
}
if ($module -notmatch 'providers:\s*\[AdminService,\s*PlatformOwnerGuard\]') {
    throw 'API guard registration verification failed. No source files were changed.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $repo ".platform-admin-backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($path in @($controllerPath, $modulePath, $sidebarPath, $pagePath)) {
    Copy-Item -LiteralPath $path -Destination (Join-Path $backupDir ([System.IO.Path]::GetFileName($path))) -Force
}
$guardPath = Join-Path $repo 'apps\api\src\admin\platform-owner.guard.ts'
if (Test-Path -LiteralPath $guardPath) {
    Copy-Item -LiteralPath $guardPath -Destination (Join-Path $backupDir 'platform-owner.guard.ts.existing') -Force
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($sidebarPath, $sidebar, $utf8NoBom)
[System.IO.File]::WriteAllText($pagePath, $page, $utf8NoBom)
[System.IO.File]::WriteAllText($controllerPath, $controller, $utf8NoBom)
[System.IO.File]::WriteAllText($modulePath, $module, $utf8NoBom)
[System.IO.File]::WriteAllText($guardPath, $guard, $utf8NoBom)

Write-Host "`nPlatform-owner access patch applied." -ForegroundColor Green
Write-Host "Owner email: $ownerEmail"
Write-Host "Backup folder: $backupDir"
Write-Host 'API routes now verify the authenticated user record and owner email; frontend visibility is also owner-only.'
Write-Host 'Running API build and web TypeScript check...'

$apiLog = Join-Path $repo "platform-admin-api-build-$timestamp.log"
$webLog = Join-Path $repo "platform-admin-web-tsc-$timestamp.log"
& pnpm --filter @lumorius/api build *> $apiLog
$apiExit = $LASTEXITCODE
if ($apiExit -eq 0) { Write-Host 'API build: PASS' -ForegroundColor Green } else { Write-Host "API build: FAIL (see $apiLog)" -ForegroundColor Red }
& pnpm --filter @lumorius/web exec tsc --noEmit *> $webLog
$webExit = $LASTEXITCODE
if ($webExit -eq 0) { Write-Host 'Web TypeScript check: PASS' -ForegroundColor Green } else { Write-Host "Web TypeScript check: FAIL (see $webLog)" -ForegroundColor Red }
if ($apiExit -ne 0 -or $webExit -ne 0) {
    Write-Host "Logs: $apiLog | $webLog" -ForegroundColor Yellow
    throw 'Patch was applied, but one or more checks failed. Read the indicated logs and keep the backup folder.'
}
Write-Host "`nBoth checks passed. Review the diff before committing. Backup: $backupDir" -ForegroundColor Green
