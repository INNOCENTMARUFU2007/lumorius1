/**
 * Integration tests — AI module (NX-000007)
 * Requires: running API + OPENAI_API_KEY or ANTHROPIC_API_KEY in env.
 * Test-skips gracefully if AI keys are absent.
 */
import axios, { AxiosInstance } from 'axios';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:5000';
const TOKEN = process.env.INTEGRATION_TEST_JWT ?? '';
const HAS_AI = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

const api: AxiosInstance = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
});

describe('AI Integration', () => {
  const skipIfNoToken = TOKEN ? it : it.skip;
  const skipIfNoAI   = HAS_AI && TOKEN ? it : it.skip;

  describe('POST /api/ai/chat', () => {
    skipIfNoToken('returns 401 without auth', async () => {
      const res = await axios.post(`${BASE}/api/ai/chat`, { message: 'hello' }, {
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });

    skipIfNoAI('processes a chat message', async () => {
      const res = await api.post('/api/ai/chat', {
        message: 'What is Lumorius in one sentence?',
        history: [],
      });
      expect(res.status).toBe(201);
      expect(res.data.data).toHaveProperty('content');
      expect(typeof res.data.data.content).toBe('string');
    }, 30_000);

    skipIfNoAI('enforces quota — returns 429 or 402 under burst', async () => {
      const promises = Array.from({ length: 25 }, () =>
        api.post('/api/ai/chat', { message: 'ping', history: [] }),
      );
      const results = await Promise.all(promises);
      const limited = results.some((r) => r.status === 429 || r.status === 402);
      expect(limited).toBe(true);
    }, 60_000);
  });

  describe('POST /api/ai/complete', () => {
    skipIfNoAI('generates a text completion', async () => {
      const res = await api.post('/api/ai/complete', {
        prompt    : 'List 3 benefits of AI in business:',
        maxTokens : 100,
      });
      expect(res.status).toBe(201);
      expect(res.data.data).toHaveProperty('text');
    }, 30_000);
  });

  describe('POST /api/ai/summarize', () => {
    skipIfNoAI('summarises text', async () => {
      const res = await api.post('/api/ai/summarize', {
        text: 'Lumorius is an enterprise AI operating system designed for founders ' +
              'and teams to manage business operations using artificial intelligence.',
      });
      expect(res.status).toBe(201);
      expect(res.data.data).toHaveProperty('summary');
    }, 30_000);
  });
});
