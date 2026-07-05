import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Auth E2E tests — exercises real HTTP stack against real DB.
 * Run after schema is applied and DB is reachable.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  const testUser = {
    email: `e2e-test-${Date.now()}@lumorius-test.com`,
    password: 'TestPassword123!',
    name: 'E2E Test User',
    organizationName: 'E2E Test Corp',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Register ───────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user.name).toBe(testUser.name);

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('validates required fields — missing email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ password: 'Pass123!', name: 'No Email' })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('validates password minimum length (8 chars)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'short@test.com', password: '123', name: 'Short' })
        .expect(400);
    });

    it('rejects invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Pass123!', name: 'Bad Email' })
        .expect(400);
    });
  });

  // ── Login ──────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Update tokens for downstream tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword!' })
        .expect(401);
    });

    it('rejects unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@lumorius-test.com', password: 'Pass123!' })
        .expect(401);
    });

    it('rejects missing credentials with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });
  });

  // ── Protected routes ───────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns current user with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.email).toBe(testUser.email);
      expect(res.body.data.name).toBe(testUser.name);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('returns 401 with malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  // ── Token refresh ──────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('returns new tokens with valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Update for downstream tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects invalid refresh token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });

  // ── Password reset (anti-enumeration) ──────────────────────

  describe('POST /api/v1/auth/password-reset/request', () => {
    it('returns 200 for existing email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.data.sent).toBe(true);
    });

    it('returns 200 for non-existent email (no enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      // Must NOT reveal whether the email exists
      expect(res.body.data.sent).toBe(true);
    });
  });

  // ── Magic link ─────────────────────────────────────────────

  describe('POST /api/v1/auth/magic-link', () => {
    it('accepts valid email and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/magic-link')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.data.sent).toBe(true);
    });

    it('rejects invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/magic-link')
        .send({ email: 'not-valid' })
        .expect(400);
    });
  });

  // ── Logout ─────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('logs out successfully with valid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(200);
    });

    it('refresh token is invalidated after logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });
});
