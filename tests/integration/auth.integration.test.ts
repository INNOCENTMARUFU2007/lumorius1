/**
 * Integration tests — Auth module
 * Requires a running API (PORT 5000) and test database.
 * Run: pnpm --filter @workspace/api test:integration
 */
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:5000';

const api: AxiosInstance = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
});

const testEmail = `integration-test-${uuidv4().slice(0, 8)}@lumorius-test.invalid`;
const testPassword = 'Test@1234!Enterprise';

let accessToken  = '';
let refreshToken = '';

describe('Auth Integration', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user', async () => {
      const res = await api.post('/api/auth/register', {
        email   : testEmail,
        password: testPassword,
        name    : 'Integration Test User',
      });
      expect(res.status).toBe(201);
      expect(res.data.data).toMatchObject({ email: testEmail });
    });

    it('rejects duplicate email', async () => {
      const res = await api.post('/api/auth/register', {
        email   : testEmail,
        password: testPassword,
        name    : 'Dup',
      });
      expect(res.status).toBe(409);
    });

    it('rejects weak password', async () => {
      const res = await api.post('/api/auth/register', {
        email   : `weak-${uuidv4().slice(0,6)}@test.invalid`,
        password: '123',
        name    : 'Weak',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns JWT tokens on valid credentials', async () => {
      const res = await api.post('/api/auth/login', {
        email   : testEmail,
        password: testPassword,
      });
      expect(res.status).toBe(200);
      expect(res.data.data).toHaveProperty('accessToken');
      expect(res.data.data).toHaveProperty('refreshToken');
      accessToken  = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken;
    });

    it('rejects invalid credentials', async () => {
      const res = await api.post('/api/auth/login', {
        email   : testEmail,
        password: 'wrongpass',
      });
      expect(res.status).toBe(401);
    });

    it('rejects unknown email', async () => {
      const res = await api.post('/api/auth/login', {
        email   : 'nobody@nowhere.invalid',
        password: testPassword,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns authenticated user profile', async () => {
      const res = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.data.data).toMatchObject({ email: testEmail });
    });

    it('rejects missing token', async () => {
      const res = await api.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects tampered token', async () => {
      const res = await api.get('/api/auth/me', {
        headers: { Authorization: 'Bearer tampered.invalid.jwt' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues new access token from refresh token', async () => {
      const res = await api.post('/api/auth/refresh', { refreshToken });
      expect(res.status).toBe(200);
      expect(res.data.data).toHaveProperty('accessToken');
    });

    it('rejects invalid refresh token', async () => {
      const res = await api.post('/api/auth/refresh', {
        refreshToken: 'invalid-refresh-token',
      });
      expect(res.status).toBe(401);
    });
  });
});
