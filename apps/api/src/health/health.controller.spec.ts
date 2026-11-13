import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const db = { query: jest.fn() };
  const queue = { client: { ping: jest.fn() } };
  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthController(db as never, queue as never);
  });

  it('keeps liveness independent of dependency availability', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(db.query).not.toHaveBeenCalled();
    expect(queue.client.ping).not.toHaveBeenCalled();
  });

  it('reports readiness only when the database and queue are available', async () => {
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    queue.client.ping.mockResolvedValue('PONG');

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('returns an HTTP-unavailable error when a required dependency is down', async () => {
    db.query.mockRejectedValue(new Error('database unavailable'));
    queue.client.ping.mockResolvedValue('PONG');

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
