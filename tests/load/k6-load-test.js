/**
 * Lumorius AI — k6 Load Test Suite
 *
 * Targets: API health, auth, tasks endpoints
 * Run: k6 run tests/load/k6-load-test.js --env BASE_URL=https://staging.lumorius.com
 *
 * Stages:
 *   Ramp up   → 0–50 VUs over 2 min
 *   Sustained → 50 VUs for 5 min
 *   Spike     → 200 VUs for 1 min
 *   Ramp down → 50→0 VUs over 1 min
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────

const errorRate       = new Rate('error_rate');
const authDuration    = new Trend('auth_duration', true);
const tasksDuration   = new Trend('tasks_duration', true);
const healthDuration  = new Trend('health_duration', true);
const totalRequests   = new Counter('total_requests');

// ── Configuration ─────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '2m', target: 50  },  // ramp up
    { duration: '5m', target: 50  },  // sustained load
    { duration: '1m', target: 200 },  // spike
    { duration: '1m', target: 0   },  // ramp down
  ],
  thresholds: {
    // P95 response time under 500ms for all requests
    http_req_duration: ['p(95)<500'],
    // P99 response time under 2s
    'http_req_duration{type:auth}': ['p(99)<2000'],
    'http_req_duration{type:tasks}': ['p(99)<2000'],
    // Error rate below 1%
    error_rate: ['rate<0.01'],
    // Health check always fast
    'http_req_duration{endpoint:health}': ['p(95)<100'],
  },
};

// ── Helpers ───────────────────────────────────────────────────

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function getRandomEmail() {
  return `load-test-${Math.random().toString(36).substring(7)}@lumorius-load.com`;
}

// ── Main test function ─────────────────────────────────────────

export default function () {
  const email    = getRandomEmail();
  const password = 'LoadTest123!';
  let accessToken = null;

  // ── Health check ───────────────────────────────────────────
  group('Health Check', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/health`, {
      tags: { endpoint: 'health', type: 'health' },
    });
    healthDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: body has status': (r) => JSON.parse(r.body).status !== undefined,
      'health: response < 200ms': (r) => r.timings.duration < 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  // ── Auth flow ──────────────────────────────────────────────
  group('Auth: Register + Login', () => {
    // Register
    const start = Date.now();
    const regRes = http.post(
      `${BASE_URL}/api/v1/auth/register`,
      JSON.stringify({ email, password, name: 'Load Test User', organizationName: 'Load Corp' }),
      { headers: headers(), tags: { type: 'auth' } },
    );
    authDuration.add(Date.now() - start);
    totalRequests.add(1);

    const regOk = check(regRes, {
      'register: status 201': (r) => r.status === 201,
      'register: has accessToken': (r) => {
        try { return !!JSON.parse(r.body).data.accessToken; } catch { return false; }
      },
    });
    errorRate.add(!regOk);

    if (regRes.status === 201) {
      accessToken = JSON.parse(regRes.body).data.accessToken;
    }

    // Login
    if (!accessToken) {
      const loginRes = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email, password }),
        { headers: headers(), tags: { type: 'auth' } },
      );
      totalRequests.add(1);
      if (loginRes.status === 200) {
        accessToken = JSON.parse(loginRes.body).data.accessToken;
      }
    }

    // Get profile
    if (accessToken) {
      const meRes = http.get(
        `${BASE_URL}/api/v1/auth/me`,
        { headers: headers(accessToken), tags: { type: 'auth' } },
      );
      totalRequests.add(1);
      check(meRes, {
        'me: status 200': (r) => r.status === 200,
        'me: has email': (r) => {
          try { return JSON.parse(r.body).data.email === email; } catch { return false; }
        },
      });
    }
  });

  sleep(0.5);

  // ── Tasks CRUD ─────────────────────────────────────────────
  if (accessToken) {
    group('Tasks: CRUD', () => {
      // Create task
      const start = Date.now();
      const createRes = http.post(
        `${BASE_URL}/api/v1/tasks`,
        JSON.stringify({ title: `Load test task ${Date.now()}`, priority: 'medium' }),
        { headers: headers(accessToken), tags: { type: 'tasks' } },
      );
      tasksDuration.add(Date.now() - start);
      totalRequests.add(1);

      const createOk = check(createRes, {
        'task create: status 201': (r) => r.status === 201,
      });
      errorRate.add(!createOk);

      let taskId = null;
      if (createRes.status === 201) {
        taskId = JSON.parse(createRes.body).data.id;
      }

      // List tasks
      const listRes = http.get(
        `${BASE_URL}/api/v1/tasks?page=1&pageSize=20`,
        { headers: headers(accessToken), tags: { type: 'tasks' } },
      );
      totalRequests.add(1);
      check(listRes, {
        'tasks list: status 200': (r) => r.status === 200,
        'tasks list: response < 500ms': (r) => r.timings.duration < 500,
      });

      // Update task
      if (taskId) {
        const updateRes = http.patch(
          `${BASE_URL}/api/v1/tasks/${taskId}`,
          JSON.stringify({ status: 'in_progress' }),
          { headers: headers(accessToken), tags: { type: 'tasks' } },
        );
        totalRequests.add(1);
        check(updateRes, { 'task update: status 200': (r) => r.status === 200 });

        // Delete task
        const deleteRes = http.del(
          `${BASE_URL}/api/v1/tasks/${taskId}`,
          null,
          { headers: headers(accessToken), tags: { type: 'tasks' } },
        );
        totalRequests.add(1);
        check(deleteRes, { 'task delete: status 200': (r) => r.status === 200 });
      }
    });
  }

  sleep(1);
}

// ── Setup: verify server is reachable before load ─────────────

export function setup() {
  const res = http.get(`${BASE_URL}/api/v1/health`);
  if (res.status !== 200) {
    throw new Error(`Server not reachable at ${BASE_URL} (status ${res.status})`);
  }
  console.log(`✅ Server reachable at ${BASE_URL}`);
}
