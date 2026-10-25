$ErrorActionPreference = 'Stop'

# Run from C:\Users\HomePC\lumorius. This script modifies the local project,
# creates timestamped backups, and adds the onboarding database migration.
$root = (Get-Location).Path
$files = @(
  'apps\api\src\auth\auth.service.ts',
  'apps\api\src\auth\auth.controller.ts',
  'apps\api\src\organizations\organizations.service.ts',
  'apps\api\src\organizations\organizations.controller.ts',
  'apps\web\src\lib\auth.ts',
  'apps\web\src\app\(auth)\login\page.tsx',
  'apps\web\src\app\(auth)\register\page.tsx',
  'apps\web\src\app\(auth)\verify-email\page.tsx',
  'apps\web\src\hooks\use-auth.ts',
  'apps\web\src\app\onboarding\page.tsx',
  'apps\web\src\app\(dashboard)\layout.tsx'
)
foreach ($relative in $files) {
  if (-not (Test-Path (Join-Path $root $relative))) {
    throw "Missing expected file: $relative. No changes were made. Run this from the Lumorius repository root."
  }
}

function Read-Text([string]$RelativePath) {
  $path = Join-Path $root $RelativePath
  $content = [System.IO.File]::ReadAllText($path)
  return $content.Replace("`r`n", "`n")
}
function Write-Text([string]$RelativePath, [string]$Content) {
  $path = Join-Path $root $RelativePath
  [System.IO.File]::WriteAllText($path, $Content.Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
}
function Patch-Block([string]$Content, [string]$Old, [string]$New, [string]$AlreadyPattern, [string]$Label) {
  $Old = $Old.TrimEnd([char[]]"`r`n")
  $New = $New.TrimEnd([char[]]"`r`n")
  if ($Content.Contains($Old)) {
    return $Content.Replace($Old, $New)
  }
  if ($Content -match $AlreadyPattern) {
    return $Content
  }
  throw "Could not safely patch $Label. No blind replacement was attempted. Check the timestamped backup if earlier sections were already changed."
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($relative in $files) {
  $path = Join-Path $root $relative
  Copy-Item $path "$path.$stamp.bak" -Force
}

# 1. AuthService: live user status, JWT claim, and login/register response.
$rel = 'apps\api\src\auth\auth.service.ts'
$s = Read-Text $rel
if ($s -notmatch 'async getCurrentUser\(userId: string\)') {
  $anchor = '  async refreshTokens(refreshToken: string) {'
  if (-not $s.Contains($anchor)) { throw 'AuthService refreshTokens anchor was not found.' }
  $method = @'
  async getCurrentUser(userId: string) {
    const user = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: userId },
    );

    if (!user || user.is_active === false) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url ?? null,
      role: user.role,
      organizationId: (user.organization_id as string | null) ?? null,
      emailVerified: Boolean(user.email_verified),
      mfaEnabled: Boolean(user.mfa_enabled),
      onboardingCompleted: Boolean(user.onboarding_completed),
    };
  }

'@
  $s = $s.Replace($anchor, $method + $anchor)
}
$oldPayload = @'
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
      emailVerified: user.email_verified,
    };
'@
$newPayload = @'
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      onboardingCompleted: Boolean(user.onboarding_completed),
    };
'@
$s = Patch-Block $s $oldPayload $newPayload '(?s)const payload = \{.*?onboardingCompleted: Boolean\(user\.onboarding_completed\).*?\};' 'AuthService JWT payload'
$oldUser = @'
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organization_id,
        emailVerified: user.email_verified,
        mfaEnabled: user.mfa_enabled,
      },
'@
$newUser = @'
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organization_id ?? null,
        emailVerified: Boolean(user.email_verified),
        mfaEnabled: Boolean(user.mfa_enabled),
        onboardingCompleted: Boolean(user.onboarding_completed),
      },
'@
$s = Patch-Block $s $oldUser $newUser '(?s)user: \{.*?onboardingCompleted: Boolean\(user\.onboarding_completed\).*?\},' 'AuthService user response'
Write-Text $rel $s

# 2. /auth/me returns current DB status rather than only JWT claims.
$rel = 'apps\api\src\auth\auth.controller.ts'
$s = Read-Text $rel
$old = @'
  async me(
    @CurrentUser() user: JwtPayload,
  ) {
    return user;
  }
'@
$new = @'
  async me(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.getCurrentUser(user.sub);
  }
'@
$s = Patch-Block $s $old $new 'return this\.authService\.getCurrentUser\(user\.sub\)' '/auth/me controller'
Write-Text $rel $s

# 3. Add organization onboarding persistence service.
$rel = 'apps\api\src\organizations\organizations.service.ts'
$s = Read-Text $rel
$oldImports = @'
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
'@
$newImports = @'
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
'@
$s = Patch-Block $s $oldImports $newImports 'BadRequestException,\s*ForbiddenException' 'organizations service imports'
if ($s -notmatch 'async completeOnboarding\(') {
  $method = @'

  async completeOnboarding(
    userId: string,
    dto: {
      orgName?: string;
      orgSize?: string;
      industry?: string;
      invites?: string;
      brainDesc?: string;
      goalTitle?: string;
    },
  ) {
    const user = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: userId },
    );

    if (!user || user.is_active === false) {
      throw new NotFoundException('User not found');
    }
    if (!user.email_verified) {
      throw new ForbiddenException(
        'Please verify your email before completing onboarding.',
      );
    }

    const requestedOrgName = dto.orgName?.trim() ?? '';
    let organizationId = user.organization_id as string | null;

    if (!organizationId && !requestedOrgName) {
      throw new BadRequestException('Organization name is required.');
    }

    const onboardingData = {
      completed: true,
      completedAt: new Date().toISOString(),
      orgSize: dto.orgSize ?? null,
      industry: dto.industry?.trim() ?? null,
      brainDesc: dto.brainDesc?.trim() ?? null,
      goalTitle: dto.goalTitle?.trim() ?? null,
      invites: dto.invites?.trim() ?? '',
    };

    await this.db.transaction(async (client) => {
      if (!organizationId) {
        organizationId = uuidv4();
        const slugBase = requestedOrgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 60) || 'workspace';
        const slug = `${slugBase}-${uuidv4().slice(0, 8)}`;

        await client.query(
          `INSERT INTO organizations (id, name, slug, plan_id, settings)
           VALUES ($1, $2, $3, 'starter', $4::jsonb)`,
          [organizationId, requestedOrgName, slug, JSON.stringify({ onboarding: onboardingData })],
        );
        await client.query(
          `UPDATE users
           SET organization_id = $1, role = 'owner', onboarding_completed = TRUE, updated_at = NOW()
           WHERE id = $2`,
          [organizationId, userId],
        );
      } else {
        await client.query(
          `UPDATE organizations
           SET name = CASE
                 WHEN $1::text IS NULL OR BTRIM($1::text) = '' THEN name
                 ELSE $1
               END,
               settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $3`,
          [requestedOrgName || null, JSON.stringify({ onboarding: onboardingData }), organizationId],
        );
        await client.query(
          `UPDATE users
           SET onboarding_completed = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [userId],
        );
      }
    });

    return { completed: true, onboardingCompleted: true };
  }
'@
  $idx = $s.LastIndexOf("`n}")
  if ($idx -lt 0) { throw 'Could not locate final class brace in organizations.service.ts.' }
  $s = $s.Substring(0, $idx) + $method + $s.Substring($idx)
}
Write-Text $rel $s

# 4. Add protected POST /organizations/onboarding endpoint.
$rel = 'apps\api\src\organizations\organizations.controller.ts'
$s = Read-Text $rel
if ($s -notmatch "@Post\('onboarding'\)") {
  $method = @'

  @Post('onboarding')
  @ApiOperation({ summary: 'Complete user onboarding' })
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      orgName?: string;
      orgSize?: string;
      industry?: string;
      invites?: string;
      brainDesc?: string;
      goalTitle?: string;
    },
  ) {
    return this.orgsService.completeOnboarding(user.sub, body);
  }
'@
  $idx = $s.LastIndexOf("`n}")
  if ($idx -lt 0) { throw 'Could not locate final class brace in organizations.controller.ts.' }
  $s = $s.Substring(0, $idx) + $method + $s.Substring($idx)
}
Write-Text $rel $s

# 5. Frontend account type and one shared destination function.
$rel = 'apps\web\src\lib\auth.ts'
$s = Read-Text $rel
if ($s -notmatch 'onboardingCompleted: boolean;') {
  $old = '  emailVerified: boolean;' + "`n" + '  mfaEnabled: boolean;'
  $new = '  emailVerified: boolean;' + "`n" + '  onboardingCompleted: boolean;' + "`n" + '  mfaEnabled: boolean;'
  if (-not $s.Contains($old)) { throw 'Could not find AuthUser fields in apps/web/src/lib/auth.ts.' }
  $s = $s.Replace($old, $new)
}
if ($s -notmatch 'export function getAuthDestination\(') {
  $anchor = "`n}`n`nexport interface AuthResult {"
  $helper = @'

}

export function getAuthDestination(
  user: Pick<AuthUser, 'emailVerified' | 'onboardingCompleted'>,
): string {
  if (!user.emailVerified) return '/verify-email';
  if (!user.onboardingCompleted) return '/onboarding';
  return '/dashboard';
}

export interface AuthResult {
'@
  # Replace the end of AuthUser interface plus the next interface marker.
  if ($s.Contains($anchor)) {
    $s = $s.Replace($anchor, $helper)
  } else {
    throw 'Could not insert getAuthDestination helper into apps/web/src/lib/auth.ts.'
  }
}
Write-Text $rel $s

# 6. Login, registration, and shared auth hook use consistent routing.
$rel = 'apps\web\src\app\(auth)\login\page.tsx'
$s = Read-Text $rel
if ($s -notmatch 'getAuthDestination') {
  $s = Patch-Block $s "import { setTokens } from '@/lib/auth';" "import { setTokens, getAuthDestination } from '@/lib/auth';" 'getAuthDestination' 'login auth import'
}
$s = Patch-Block $s "      router.push('/dashboard');" '      router.replace(getAuthDestination(data.user));' 'router\.replace\(getAuthDestination\(data\.user\)\)' 'login redirect'
Write-Text $rel $s

$rel = 'apps\web\src\app\(auth)\register\page.tsx'
$s = Read-Text $rel
if ($s -notmatch 'getAuthDestination') {
  $s = Patch-Block $s "import { setTokens } from '@/lib/auth';" "import { setTokens, getAuthDestination } from '@/lib/auth';" 'getAuthDestination' 'registration auth import'
}
if ($s.Contains("router.push('/dashboard')")) {
  $s = $s.Replace("router.push('/dashboard')", 'router.replace(getAuthDestination(data.user))')
} elseif ($s -notmatch 'router\.replace\(getAuthDestination\(data\.user\)\)') {
  throw 'Could not find the dashboard redirect in registration page.'
}
Write-Text $rel $s

$rel = 'apps\web\src\hooks\use-auth.ts'
$s = Read-Text $rel
if ($s -notmatch 'getAuthDestination') {
  $old = "import { getCurrentUser, login, logout, register, getAccessToken, getRefreshToken } from '@/lib/auth';"
  $new = "import { getCurrentUser, login, logout, register, getAccessToken, getRefreshToken, getAuthDestination } from '@/lib/auth';"
  if (-not $s.Contains($old)) { throw 'Could not find the auth helper import in use-auth.ts.' }
  $s = $s.Replace($old, $new)
}
$s = $s.Replace("router.push('/dashboard');", 'router.replace(getAuthDestination(data.user));')
Write-Text $rel $s

# 7. Onboarding marks the account cache stale before navigation.
$rel = 'apps\web\src\app\onboarding\page.tsx'
$s = Read-Text $rel
if ($s -notmatch 'useQueryClient') {
  $s = Patch-Block $s "import { useMutation } from '@tanstack/react-query';" "import { useMutation, useQueryClient } from '@tanstack/react-query';" 'useQueryClient' 'onboarding query import'
}
if ($s -notmatch 'const queryClient = useQueryClient\(\);') {
  $s = Patch-Block $s "  const router = useRouter();" "  const router = useRouter();`n  const queryClient = useQueryClient();" 'const queryClient = useQueryClient\(\);' 'onboarding query client'
}
$oldMut = @'
  const completeMut = useMutation({
    mutationFn: async () => {
      await api.post('/organizations/onboarding', form);
    },
    onSuccess: () => router.push('/dashboard'),
  });
'@
$newMut = @'
  const completeMut = useMutation({
    mutationFn: async () => {
      await api.post('/organizations/onboarding', form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace('/dashboard');
    },
  });
'@
$s = Patch-Block $s $oldMut $newMut 'queryKey: \[.auth., .me.\]' 'onboarding completion mutation'
Write-Text $rel $s

# 8. Verification success routes according to the refreshed DB profile.
$rel = 'apps\web\src\app\(auth)\verify-email\page.tsx'
$s = Read-Text $rel
if ($s -notmatch "from '@/lib/auth'") {
  $s = $s.Replace("import api from '@/lib/api';", "import api from '@/lib/api';`nimport { getAccessToken, getAuthDestination } from '@/lib/auth';")
}
$oldVerify = @'
      .then(() => {
        if (cancelled) return;

        setState('success');

        redirectTimer = setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      })
'@
$newVerify = @'
      .then(async () => {
        if (cancelled) return;
        setState('success');

        let destination = '/login?verified=1';
        if (getAccessToken()) {
          try {
            const profile = await api.get('/auth/me');
            destination = getAuthDestination(profile.data.data);
          } catch {
            destination = '/login?verified=1';
          }
        }
        if (cancelled) return;

        redirectTimer = setTimeout(() => {
          router.replace(destination);
        }, 1800);
      })
'@
$s = Patch-Block $s $oldVerify $newVerify 'router\.replace\(destination\)' 'email verification redirect'
Write-Text $rel $s

# 9. Dashboard layout: hydration-safe loading and status-based route guard.
$rel = 'apps\web\src\app\(dashboard)\layout.tsx'
$layout = @'
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ErrorBoundary } from '@/components/error-boundary';
import { getAccessToken } from '@/lib/auth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!getAccessToken()) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }
    if (isLoading) return;
    if (!user) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }
    if (!user.emailVerified) {
      setAuthorized(false);
      router.replace('/verify-email');
      return;
    }
    if (!user.onboardingCompleted) {
      setAuthorized(false);
      router.replace('/onboarding');
      return;
    }

    setAuthorized(true);
  }, [mounted, isLoading, user, router]);

  if (!mounted || isLoading || !authorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Lumorius...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
'@
Write-Text $rel $layout

# 10. Create idempotent database migration and update fresh-install schema files.
$schemaDir = Join-Path $root 'database\schema'
if (-not (Test-Path $schemaDir)) { throw 'database/schema directory was not found.' }
$migrationPath = Join-Path $schemaDir '005_onboarding.sql'
if (-not (Test-Path $migrationPath)) {
  $migration = @'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Preserve seeded demo accounts so they can continue directly to the dashboard.
UPDATE users
SET onboarding_completed = TRUE
WHERE email LIKE '%@demo.lumorius.com';
'@
  [System.IO.File]::WriteAllText($migrationPath, $migration + "`n", [System.Text.UTF8Encoding]::new($false))
}
foreach ($schemaName in @('001_create_all_tables.sql', '001_initial.sql')) {
  $schemaPath = Join-Path $schemaDir $schemaName
  if (Test-Path $schemaPath) {
    $schemaText = Read-Text (Join-Path 'database\schema' $schemaName)
    if ($schemaText -notmatch '\bonboarding_completed\b') {
      $pattern = '(?m)^([ \t]*)email_verified[ \t]+BOOLEAN[ \t]+NOT NULL DEFAULT FALSE,[ \t]*$'
      if ($schemaText -match $pattern) {
        $schemaText = [regex]::Replace($schemaText, $pattern, {
          param($m)
          $m.Groups[0].Value + "`n" + $m.Groups[1].Value + 'onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,'
        }, 1)
        Copy-Item $schemaPath "$schemaPath.$stamp.bak" -Force
        Write-Text (Join-Path 'database\schema' $schemaName) $schemaText
      } else {
        Write-Warning "No matching email_verified field found in $schemaName; review this schema manually."
      }
    }
  }
}

Write-Host ''
Write-Host 'Lumorius onboarding flow code changes have been applied.' -ForegroundColor Green
Write-Host "Timestamped backups were created with suffix .$stamp.bak" -ForegroundColor Yellow
Write-Host "Migration: $migrationPath"
Write-Host ''
Write-Host 'Next apply the migration to the current local Docker database:' -ForegroundColor Cyan
Write-Host "Get-Content '.\database\schema\005_onboarding.sql' -Raw | docker exec -i lumorius_postgres psql -U lumorius -d lumorius_db"
Write-Host ''
Write-Host 'Then run both type checks:' -ForegroundColor Cyan
Write-Host 'pnpm --filter @lumorius/api exec tsc --noEmit'
Write-Host 'pnpm --filter @lumorius/web exec tsc --noEmit'
