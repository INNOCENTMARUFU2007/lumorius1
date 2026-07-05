/**
 * Integration tests — Health + metrics endpoints (NX-000007)
 */
import axios from 'axios';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:5000';
const api  = axios.create({ baseURL: BASE, validateStatus: () => true });

describe('Health Integration', () => {
  it('GET /api/health returns 200', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('returns sensible CORS headers', async () => {
    const res = await api.options('/api/health', {
      headers: { Origin: 'https://lumorius.com', 'Access-Control-Request-Method': 'GET' },
    });
    expect([200, 204]).toContain(res.status);
    const allow = res.headers['access-control-allow-origin'];
    expect(allow).toBeDefined();
  });

  it('does not expose X-Powered-By header', async () => {
    const res = await api.get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns CSP header with nonce', async () => {
    const res = await api.get('/api/health');
    const csp = res.headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/]+=*/);
  });
});
