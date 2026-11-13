import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const payload = {
    sub: 'user-id',
    email: 'stale@example.com',
    organizationId: 'old-organization',
    role: 'owner',
    sid: 'session-id',
  };
  let strategy: JwtStrategy;
  let db: { findOne: jest.Mock };

  beforeEach(() => {
    db = { findOne: jest.fn() };
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(config, db as unknown as DatabaseService);
  });

  it('uses the user role and organization currently stored in the database', async () => {
    db.findOne
      .mockResolvedValueOnce({
        id: payload.sub,
        email: 'current@example.com',
        organization_id: 'current-organization',
        role: 'viewer',
        is_active: true,
      })
      .mockResolvedValueOnce({
        id: payload.sid,
        user_id: payload.sub,
        is_valid: true,
        expires_at: new Date(Date.now() + 60_000),
      });

    await expect(strategy.validate(payload)).resolves.toEqual({
      ...payload,
      email: 'current@example.com',
      organizationId: 'current-organization',
      role: 'viewer',
    });
  });

  it('rejects a token whose device session has been revoked', async () => {
    db.findOne
      .mockResolvedValueOnce({
        id: payload.sub,
        email: 'current@example.com',
        organization_id: 'current-organization',
        role: 'member',
        is_active: true,
      })
      .mockResolvedValueOnce(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
