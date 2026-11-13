import { ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService tenant isolation', () => {
  it('does not remove a member through a different organization context', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new OrganizationsService(
      db as unknown as DatabaseService,
      {} as EmailService,
    );

    await expect(
      service.removeMember('organization-a', 'user-b', 'user-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE id = $1 AND organization_id = $2'),
      ['user-a', 'organization-a'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id = $1 AND organization_id = $2'),
      ['user-b', 'organization-a'],
    );
  });
});
