import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * App-level E2E tests — health check, global setup, basic security headers.
 *
 * Requires: DATABASE_URL, REDIS_URL, JWT_SECRET env vars.
 * The CI workflow applies schema before running these tests.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ─────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toMatch(/ok|degraded/);
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.checks).toBeDefined();
    });

    it('includes database check result', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.checks).toHaveProperty('database');
    });
  });

  // ── Security headers ───────────────────────────────────────

  describe('Security headers', () => {
    it('returns X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('returns X-Frame-Options or CSP frame-ancestors', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      const hasXFrame = res.headers['x-frame-options'] !== undefined;
      const hasCsp = res.headers['content-security-policy']?.includes('frame-ancestors');
      expect(hasXFrame || hasCsp).toBe(true);
    });

    it('returns Strict-Transport-Security header', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });
  });

  // ── 404 / error handling ───────────────────────────────────

  describe('Error handling', () => {
    it('returns 404 for unknown routes with structured error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/nonexistent-route')
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
      });
    });

    it('returns 405 or 404 for wrong HTTP method', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/health');

      expect([404, 405]).toContain(res.status);
    });
  });

  // ── API versioning ─────────────────────────────────────────

  describe('API versioning', () => {
    it('responds correctly on /api/v1/ prefix', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
    });
  });
});
