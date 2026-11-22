import { GdprService } from './gdpr.service';
describe('company-safe personal deletion',()=>{
 function setup(ownerAvailable:boolean,role='owner') {
  const client={query:jest.fn(async(sql:string)=>{
   if(sql.includes('SELECT organization_id, deletion_scheduled_at'))return {rows:[{organization_id:'org-a',role,is_active:true,deletion_status:'none'}]};
   if(sql.includes("SET deletion_status = 'processing'"))return {rows:[{organization_id:'org-a',role}]};
   if(sql.includes("role::text = 'owner'"))return {rows:ownerAvailable?[{id:'next-owner'}]:[]};
   if(sql.includes('SELECT EXISTS'))return {rows:[{owned:true}]};
   return {rows:[],rowCount:0};
  })};
  const db={query:jest.fn(async(sql:string)=>({rows:sql.includes('FROM users')?[{id:'leaver'}]:[],rowCount:0})),transaction:jest.fn((fn:Function)=>fn(client))};
  return {client,service:new GdprService(db as never)};
 }
 it('blocks deletion of the sole owner before scheduling anything',async()=>{
  const {service,client}=setup(false);
  await expect(service.requestDeletion('leaver')).rejects.toMatchObject({status:409});
  expect(client.query.mock.calls.some(([sql])=>sql.includes('SET deletion_requested_at'))).toBe(false);
 });
 it('scopes the successor to the same company and excludes departing owners',async()=>{
  const {service,client}=setup(true);
  await expect(service.requestDeletion('leaver')).resolves.toMatchObject({status:'requested'});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("role::text = 'owner'"),['org-a','leaver']);
  expect(client.query.mock.calls.find(([sql])=>sql.includes("role::text = 'owner'"))?.[0]).toContain('deletion_status NOT IN');
 });
 it('anonymizes the user while preserving tenant references and handing off workflows',async()=>{
  const {service,client}=setup(true,'member');
  await expect(service.purgeScheduledDeletions()).resolves.toMatchObject({purged:1,failed:0});
  const calls=client.query.mock.calls.map(([sql])=>sql).join('\n');
  expect(calls).not.toMatch(/organization_id\s*=\s*NULL/);
  expect(calls).not.toMatch(/DELETE FROM (organizations|workflows|tasks|projects|documents)\b/);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE workflows'),['next-owner','org-a','leaver']);
  expect(client.query).toHaveBeenCalledWith('DELETE FROM oauth_accounts WHERE user_id = $1',['leaver']);
  expect(calls).toContain("is_active = FALSE");
 });
 it('rechecks the last-owner condition at purge time',async()=>{
  const {service,client}=setup(false);
  await expect(service.purgeScheduledDeletions()).resolves.toMatchObject({purged:0,failed:1});
  expect(client.query.mock.calls.some(([sql])=>sql.includes("name = 'Deleted User'"))).toBe(false);
 });
});
