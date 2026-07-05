import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Tasks E2E tests — CRUD operations via real HTTP + DB.
 */
describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let createdTaskId: string;
  let createdProjectId: string;

  const testUser = {
    email: `tasks-e2e-${Date.now()}@lumorius-test.com`,
    password: 'TestPassword123!',
    name: 'Tasks E2E User',
    organizationName: 'Tasks E2E Corp',
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

    // Register and login to get a token
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser);
    accessToken = regRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  // ── Projects ───────────────────────────────────────────────

  describe('Projects', () => {
    describe('POST /api/v1/tasks/projects', () => {
      it('creates a project', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/tasks/projects')
          .set(authHeader())
          .send({ name: 'E2E Test Project', description: 'Created during E2E tests' })
          .expect(201);

        expect(res.body.data.name).toBe('E2E Test Project');
        expect(res.body.data.id).toBeDefined();
        createdProjectId = res.body.data.id;
      });

      it('returns 401 without auth token', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/tasks/projects')
          .send({ name: 'Unauthorized Project' })
          .expect(401);
      });
    });

    describe('GET /api/v1/tasks/projects', () => {
      it('lists all projects for the org', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/tasks/projects')
          .set(authHeader())
          .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
        const names = res.body.data.map((p: { name: string }) => p.name);
        expect(names).toContain('E2E Test Project');
      });
    });

    describe('GET /api/v1/tasks/projects/:id', () => {
      it('returns a specific project by id', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/tasks/projects/${createdProjectId}`)
          .set(authHeader())
          .expect(200);

        expect(res.body.data.id).toBe(createdProjectId);
        expect(res.body.data.name).toBe('E2E Test Project');
      });

      it('returns 404 for a non-existent project', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/tasks/projects/00000000-0000-0000-0000-000000000000')
          .set(authHeader())
          .expect(404);
      });
    });
  });

  // ── Tasks ──────────────────────────────────────────────────

  describe('Tasks', () => {
    describe('POST /api/v1/tasks', () => {
      it('creates a task with required fields', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .set(authHeader())
          .send({
            title: 'E2E: Write integration test',
            priority: 'high',
            projectId: createdProjectId,
          })
          .expect(201);

        expect(res.body.data.title).toBe('E2E: Write integration test');
        expect(res.body.data.status).toBe('todo');
        expect(res.body.data.priority).toBe('high');
        createdTaskId = res.body.data.id;
      });

      it('defaults priority to medium when not specified', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .set(authHeader())
          .send({ title: 'No priority task' })
          .expect(201);

        expect(res.body.data.priority).toBe('medium');
      });

      it('rejects task creation without title', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .set(authHeader())
          .send({ priority: 'high' })
          .expect(400);
      });

      it('returns 401 without auth', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/tasks')
          .send({ title: 'Unauthorized task' })
          .expect(401);
      });
    });

    describe('GET /api/v1/tasks', () => {
      it('returns paginated task list', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/tasks')
          .set(authHeader())
          .expect(200);

        expect(res.body.data.data).toBeDefined();
        expect(typeof res.body.data.total).toBe('number');
        expect(typeof res.body.data.page).toBe('number');
        expect(typeof res.body.data.totalPages).toBe('number');
      });

      it('filters by status', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/tasks?status=todo')
          .set(authHeader())
          .expect(200);

        res.body.data.data.forEach((t: { status: string }) => {
          expect(t.status).toBe('todo');
        });
      });

      it('respects page and pageSize params', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/tasks?page=1&pageSize=5')
          .set(authHeader())
          .expect(200);

        expect(res.body.data.data.length).toBeLessThanOrEqual(5);
        expect(res.body.data.page).toBe(1);
        expect(res.body.data.pageSize).toBe(5);
      });
    });

    describe('GET /api/v1/tasks/:id', () => {
      it('returns the created task by id', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .expect(200);

        expect(res.body.data.id).toBe(createdTaskId);
        expect(res.body.data.title).toBe('E2E: Write integration test');
      });

      it('returns 404 for unknown task id', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
          .set(authHeader())
          .expect(404);
      });
    });

    describe('PATCH /api/v1/tasks/:id', () => {
      it('updates task status to in_progress', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .send({ status: 'in_progress' })
          .expect(200);

        expect(res.body.data.status).toBe('in_progress');
      });

      it('sets completed_at when status is set to done', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .send({ status: 'done' })
          .expect(200);

        expect(res.body.data.status).toBe('done');
        expect(res.body.data.completed_at).not.toBeNull();
      });

      it('updates task title', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .send({ title: 'E2E: Updated title' })
          .expect(200);

        expect(res.body.data.title).toBe('E2E: Updated title');
      });
    });

    describe('DELETE /api/v1/tasks/:id', () => {
      it('deletes the task', async () => {
        await request(app.getHttpServer())
          .delete(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .expect(200);
      });

      it('returns 404 after deletion', async () => {
        await request(app.getHttpServer())
          .get(`/api/v1/tasks/${createdTaskId}`)
          .set(authHeader())
          .expect(404);
      });
    });
  });
});
