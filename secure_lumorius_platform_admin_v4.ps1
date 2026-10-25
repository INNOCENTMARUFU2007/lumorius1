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
$adminServicePath = Join-Path $repo 'apps\api\src\admin\admin.service.ts'
$dbServicePath = Join-Path $repo 'apps\api\src\database\database.service.ts'

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

# Validate expected live source structures before making any edits.
if ($controller -notmatch '@UseGuards\(JwtAuthGuard,\s*RolesGuard\)' -or $controller -notmatch "@Roles\('admin'\)" -or $controller -notmatch "@Controller\(\{\s*path:\s*'admin',\s*version:\s*'1'\s*\}\)") {
    throw 'Admin controller does not match the expected role-protected structure. No source files were changed.'
}
if ($module -notmatch 'providers:\s*\[AdminService\]' -or $module -notmatch "import \{ AdminService \} from './admin.service';") {
    throw 'Admin module provider structure differs from the expected source. No source files were changed.'
}
if ($sidebar -notmatch "user\?\.role === 'admin'\s*\|\|\s*user\?\.role === 'super_admin'") {
    throw 'Sidebar admin role expression was not found. No source files were changed.'
}
if ($page -notmatch "queryKey:\s*\['admin',\s*'stats'\]" -or $page -notmatch "api\.get\('/admin/stats'\)" -or $page -notmatch "enabled:\s*tab === 'users'") {
    throw 'Admin page query structure differs from the expected source. No source files were changed.'
}
if ($page -notmatch "api\.get\(`/admin/organizations\?page=\$\{page\}&search=\$\{search\}`\)" -or $page -notmatch "api\.get\(`/admin/audit-logs\?page=\$\{page\}`\)") {
    throw 'Could not identify the exact organisation/audit query functions. No source files were changed.'
}
$authMatch = [regex]::Match($sidebar, '(?s)import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*["'']([^"'']+)["'']\s*;?')
if (-not $authMatch.Success) {
    throw 'Could not safely identify the useAuth import used by the sidebar. No source files were changed.'
}
$authModule = $authMatch.Groups[1].Value
if ($dbService -notmatch 'query\s*<') {
    throw 'DatabaseService does not appear to expose the expected generic query method. No source files were changed.'
}
if ($dbService -notmatch 'class DatabaseService') {
    throw 'DatabaseService class could not be confirmed. No source files were changed.'
}

# Prepare changes in memory only.
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

# Sidebar: only the configured owner email sees the platform admin section.
$sidebarPattern = "(?s)(?<indent>^[ \t]*)const\s+isAdmin\s*=\s*user\?\.role\s*===\s*'admin'\s*\|\|\s*user\?\.role\s*===\s*'super_admin'\s*;"
$sidebarRegex = [regex]::new($sidebarPattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
if ($sidebarRegex.Matches($sidebar).Count -ne 1) {
    throw 'Expected exactly one sidebar isAdmin declaration. No source files were changed.'
}
$sidebar = $sidebarRegex.Replace($sidebar, {
    param($m)
    $i = $m.Groups['indent'].Value
    return $i + "const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '$ownerEmail').trim().toLowerCase();`r`n" +
      $i + "const isAdmin = Boolean(platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail);"
}, 1)

# Admin page: import the same authentication hook as the sidebar.
if ($page -notmatch '\buseAuth\s*\(') {
    $pageImportAnchor = "import { formatRelative } from '@/lib/utils';"
    if (-not $page.Contains($pageImportAnchor)) {
        throw 'Could not find the admin page import insertion anchor. No source files were changed.'
    }
    $page = $page.Replace($pageImportAnchor, $pageImportAnchor + "`r`nimport { useAuth } from '$authModule';")
    $qcAnchor = '  const qc = useQueryClient();'
    if (-not $page.Contains($qcAnchor)) {
        throw 'Could not find AdminPage hook insertion anchor. No source files were changed.'
    }
    $page = $page.Replace($qcAnchor, $qcAnchor + "`r`n  const { user } = useAuth();")
}

$stateAnchor = "  const [search, setSearch] = useState('');"
if (-not $page.Contains($stateAnchor)) {
    throw 'Could not locate the AdminPage state declarations. No source files were changed.'
}
$ownerState = @"
$stateAnchor

  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '$ownerEmail')
    .trim()
    .toLowerCase();
  const isPlatformAdmin = Boolean(
    platformAdminEmail &&
    (user?.email ?? '').trim().toLowerCase() === platformAdminEmail,
  );
"@
$page = $page.Replace($stateAnchor, $ownerState.TrimEnd())

$statsQuery = "queryFn: async () => (await api.get('/admin/stats')).data.data,"
if ([regex]::Matches($page, [regex]::Escape($statsQuery)).Count -ne 1) {
    throw 'Expected exactly one platform statistics query. No source files were changed.'
}
$page = $page.Replace($statsQuery, $statsQuery + "`r`n    enabled: isPlatformAdmin,")

$usersEnabled = "enabled: tab === 'users',"
if ([regex]::Matches($page, [regex]::Escape($usersEnabled)).Count -ne 1) {
    throw 'Expected exactly one users query enable condition. No source files were changed.'
}
$page = $page.Replace($usersEnabled, "enabled: isPlatformAdmin && tab === 'users',")

$orgsQueryFn = '(await api.get(`/admin/organizations?page=${page}&search=${search}`)).data.data,'
if ([regex]::Matches($page, [regex]::Escape($orgsQueryFn)).Count -ne 1) {
    throw 'Expected exactly one organisation query function. No source files were changed.'
}
$page = $page.Replace($orgsQueryFn, $orgsQueryFn + "`r`n    enabled: isPlatformAdmin && tab === 'orgs',")

$auditQueryFn = '(await api.get(`/admin/audit-logs?page=${page}`)).data.data,'
if ([regex]::Matches($page, [regex]::Escape($auditQueryFn)).Count -ne 1) {
    throw 'Expected exactly one audit query function. No source files were changed.'
}
$page = $page.Replace($auditQueryFn, $auditQueryFn + "`r`n    enabled: isPlatformAdmin && tab === 'audit',")

# Place the route-level UI gate after all hooks, before the main page JSX.
$renderAnchor = '  return (' + "`r`n" + '    <div className="max-w-7xl mx-auto space-y-6">'
if (-not $page.Contains($renderAnchor)) {
    $renderAnchor = '  return (' + "`n" + '    <div className="max-w-7xl mx-auto space-y-6">'
}
if (-not $page.Contains($renderAnchor)) {
    throw 'Could not locate the AdminPage render anchor. No source files were changed.'
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
$page = $page.Replace($renderAnchor, $denyBlock + $renderAnchor)

# API: replace ordinary role-based access with the database-verified owner guard.
$controller = [regex]::Replace($controller, "(?m)^import \{ RolesGuard \} from '../common/guards/roles.guard';\r?\n", '')
$controller = [regex]::Replace($controller, "(?m)^import \{ Roles \} from '../common/decorators/roles.decorator';\r?\n", '')
if ($controller -notmatch "import \{ PlatformOwnerGuard \} from './platform-owner.guard';") {
    $serviceImport = "import { AdminService } from './admin.service';"
    if (-not $controller.Contains($serviceImport)) {
        throw 'Could not find AdminService import insertion point. No source files were changed.'
    }
    $controller = $controller.Replace($serviceImport, $serviceImport + "`r`nimport { PlatformOwnerGuard } from './platform-owner.guard';")
}
$controller = [regex]::Replace($controller, '@UseGuards\(JwtAuthGuard,\s*RolesGuard\)', '@UseGuards(JwtAuthGuard, PlatformOwnerGuard)', 1)
$controller = [regex]::Replace($controller, "(?m)^@Roles\('admin'\)\r?\n?", '', 1)
if ($controller -match 'RolesGuard|@Roles\(' -or $controller -notmatch '@UseGuards\(JwtAuthGuard, PlatformOwnerGuard\)') {
    throw 'Could not safely replace all controller role access annotations. No source files were changed.'
}

$moduleImportAnchor = "import { AdminService } from './admin.service';"
if (-not $module.Contains("import { PlatformOwnerGuard } from './platform-owner.guard';")) {
    $module = $module.Replace($moduleImportAnchor, $moduleImportAnchor + "`r`nimport { PlatformOwnerGuard } from './platform-owner.guard';")
}
$module = $module.Replace('providers: [AdminService]', 'providers: [AdminService, PlatformOwnerGuard]')
if ($module -notmatch 'providers:\s*\[AdminService,\s*PlatformOwnerGuard\]') {
    throw 'Could not register PlatformOwnerGuard in AdminModule. No source files were changed.'
}

# Verify expected safeguards in the in-memory result before writing anything.
if ($page -notmatch 'enabled:\s*isPlatformAdmin' -or $page -notmatch 'if\s*\(!isPlatformAdmin\)') {
    throw 'Admin page owner gate verification failed. No source files were changed.'
}
if ($sidebar -notmatch 'user\?\.email' -or $sidebar -match "user\?\.role === 'admin'") {
    throw 'Sidebar owner-email gate verification failed. No source files were changed.'
}
if ($guard -notmatch 'SELECT email, is_active FROM users WHERE id = \$1' -or $guard -notmatch 'accountEmail !== ownerEmail') {
    throw 'API owner guard verification failed. No source files were changed.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $repo ".platform-admin-backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($path in @($controllerPath, $modulePath, $sidebarPath, $pagePath)) {
    Copy-Item -LiteralPath $path -Destination (Join-Path $backupDir ([System.IO.Path]::GetFileName($path))) -Force
}

# All validation passed; write the four updated source files and the new guard.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($sidebarPath, $sidebar, $utf8NoBom)
[System.IO.File]::WriteAllText($pagePath, $page, $utf8NoBom)
[System.IO.File]::WriteAllText($controllerPath, $controller, $utf8NoBom)
[System.IO.File]::WriteAllText($modulePath, $module, $utf8NoBom)
$guardPath = Join-Path $repo 'apps\api\src\admin\platform-owner.guard.ts'
if (Test-Path -LiteralPath $guardPath) {
    Copy-Item -LiteralPath $guardPath -Destination (Join-Path $backupDir 'platform-owner.guard.ts.existing') -Force
}
[System.IO.File]::WriteAllText($guardPath, $guard, $utf8NoBom)

Write-Host "`nPlatform-owner access patch applied." -ForegroundColor Green
Write-Host "Owner email: $ownerEmail"
Write-Host "Backup folder: $backupDir"
Write-Host 'The API checks the authenticated user ID against the users table and verifies the active account email.'
Write-Host 'Now building the API and type-checking the web application...'

$apiLog = Join-Path $repo "platform-admin-api-build-$timestamp.log"
$webLog = Join-Path $repo "platform-admin-web-tsc-$timestamp.log"
$apiExit = 0
$webExit = 0
& pnpm --filter @lumorius/api build *> $apiLog
$apiExit = $LASTEXITCODE
if ($apiExit -eq 0) { Write-Host 'API build: PASS' -ForegroundColor Green } else { Write-Host "API build: FAIL (see $apiLog)" -ForegroundColor Red }
& pnpm --filter @lumorius/web exec tsc --noEmit *> $webLog
$webExit = $LASTEXITCODE
if ($webExit -eq 0) { Write-Host 'Web TypeScript check: PASS' -ForegroundColor Green } else { Write-Host "Web TypeScript check: FAIL (see $webLog)" -ForegroundColor Red }
if ($apiExit -ne 0 -or $webExit -ne 0) {
    Write-Host "Logs: $apiLog | $webLog" -ForegroundColor Yellow
    throw 'Patch was applied, but one or more checks failed. Read the indicated log files before making further changes.'
}
Write-Host "`nBoth checks passed. Review the diff before committing. Backup: $backupDir" -ForegroundColor Green
