import { ForbiddenException } from '@nestjs/common';
import { MeetingReviewService } from './meeting-review.service';

describe('MeetingReviewService access controls', () => {
  const db = { query: jest.fn(), transaction: jest.fn() };
  const meetings = { findById: jest.fn() };
  const tasks = { create: jest.fn(), findById: jest.fn() };
  const decisions = { createDecision: jest.fn(), addLink: jest.fn(), transitionDecision: jest.fn(), getDecision: jest.fn() };
  const service = new MeetingReviewService(db as never, meetings as never, tasks as never, decisions as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not permit viewers to edit meeting summaries', async () => {
    await expect(
      service.updateSummary('11111111-1111-4111-8111-111111111111', 'Updated summary', {
        organizationId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        role: 'viewer',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(meetings.findById).not.toHaveBeenCalled();
  });

  it('does not permit viewers to approve an action candidate', async () => {
    await expect(
      service.approveAction('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', {}, {
        organizationId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        role: 'viewer',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(meetings.findById).not.toHaveBeenCalled();
  });
});
