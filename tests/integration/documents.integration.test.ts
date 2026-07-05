/**
 * Integration tests — Documents (Company Brain) module (NX-000007)
 */
import axios, { AxiosInstance } from 'axios';
import * as FormData from 'form-data';

const BASE  = process.env.API_BASE_URL ?? 'http://localhost:5000';
const TOKEN = process.env.INTEGRATION_TEST_JWT ?? '';

const api: AxiosInstance = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
});

const skip = TOKEN ? it : it.skip;

describe('Documents Integration', () => {
  let uploadedDocId = '';

  describe('POST /api/documents/upload', () => {
    skip('uploads a text document', async () => {
      const form = new FormData();
      form.append('file', Buffer.from('Enterprise AI document content for testing.'), {
        filename    : 'test-doc.txt',
        contentType : 'text/plain',
      });
      const res = await api.post('/api/documents/upload', form, {
        headers: form.getHeaders(),
      });
      expect(res.status).toBe(201);
      expect(res.data.data).toHaveProperty('id');
      uploadedDocId = res.data.data.id;
    });

    skip('rejects oversized files', async () => {
      const form = new FormData();
      // Create a 51MB buffer
      form.append('file', Buffer.alloc(51 * 1024 * 1024, 'x'), {
        filename    : 'huge.txt',
        contentType : 'text/plain',
      });
      const res = await api.post('/api/documents/upload', form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      expect([400, 413]).toContain(res.status);
    });
  });

  describe('GET /api/documents', () => {
    skip('lists organisation documents', async () => {
      const res = await api.get('/api/documents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });
  });

  describe('POST /api/documents/search', () => {
    skip('returns semantic search results', async () => {
      const res = await api.post('/api/documents/search', {
        query: 'enterprise AI',
        limit: 5,
      });
      expect(res.status).toBe(200 || 201);
      expect(Array.isArray(res.data.data)).toBe(true);
    });
  });

  describe('DELETE /api/documents/:id', () => {
    skip('deletes uploaded document', async () => {
      if (!uploadedDocId) return;
      const res = await api.delete(`/api/documents/${uploadedDocId}`);
      expect([200, 204]).toContain(res.status);
    });
  });
});
