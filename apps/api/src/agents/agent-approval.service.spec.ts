import { AgentApprovalService } from './agent-approval.service';

describe('agent approval execution safeguards', () => {
  const user = { organizationId:'org', sub:'starter', role:'manager', email:'starter@example.invalid' };
  function setup() {
    const run = {id:'id', organization_id:'org', artifact_version:1, status:'awaiting_approval',
      decision_id:'decision', artifact:{goals:[{title:'Example',tasks:['Track outcome'],dueDate:'2027-01-01'}]}};
    const client = {query:jest.fn()};
    const runs = { actor:jest.fn().mockResolvedValue(user), load:jest.fn().mockResolvedValue(run), assertEvidence:jest.fn(),verifyExecution:jest.fn() };
    const founder = {createObjective:jest.fn()};
    const svc = new AgentApprovalService({transaction:(fn: (c: unknown)=>unknown)=>fn(client)} as never,runs as never,{} as never,founder as never,{} as never,{} as never);
    return {svc,client,runs,founder,run};
  }
  it('refuses a stale version before attempting any business write', async () => {
    const {svc,client,founder}=setup();
    await expect(svc.apply(user,'id',2)).rejects.toThrow('version');
    expect(client.query).not.toHaveBeenCalled();
    expect(founder.createObjective).not.toHaveBeenCalled();
  });
  it('requires a Decision Intelligence approval', async () => {
    const {svc,client,founder}=setup();
    client.query.mockResolvedValue({rows:[{status:'proposed'}]});
    await expect(svc.apply(user,'id',1)).rejects.toThrow('has not approved');
    expect(founder.createObjective).not.toHaveBeenCalled();
  });
  it('returns the stored receipt after replaying an applied run', async () => {
    const {svc,runs,run,founder}=setup();
    const receipt=[{objectiveId:'objective',taskIds:['task']}];
    runs.load.mockResolvedValue({...run,status:'applied',receipt});
    await expect(svc.apply(user,'id',1)).resolves.toEqual(receipt);
    expect(founder.createObjective).not.toHaveBeenCalled();
  });
});
