import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';
describe('Google profile photo', () => {
 it('supports the older provider identity schema without storing Google tokens', async()=>{
  const db={findOne:jest.fn().mockResolvedValue({id:'user-a',is_active:true}),query:jest.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('information_schema')?[{column_name:'provider_user_id'}]:[]}))};
  const strategy=new GoogleStrategy({get:(_key:string,fallback:string)=>fallback} as ConfigService,db as never);
  const done=jest.fn();
  await strategy.validate('private-access','private-refresh',{id:'google-id',emails:[{value:'person@example.com'}]},done);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (provider, provider_user_id)'),['user-a','google-id']);
  expect(JSON.stringify(db.query.mock.calls)).not.toContain('private-access');
  expect(JSON.stringify(db.query.mock.calls)).not.toContain('private-refresh');
 });
 it('does not refresh or reconnect a disabled account',async()=>{
  const db={findOne:jest.fn().mockResolvedValue({id:'user-a',is_active:false}),query:jest.fn()};
  const strategy=new GoogleStrategy({get:(_key:string,fallback:string)=>fallback} as ConfigService,db as never);
  const done=jest.fn();
  await strategy.validate('access','refresh',{id:'google-id',emails:[{value:'person@example.com'}],photos:[{value:'https://lh3.googleusercontent.com/photo'}]},done);
  expect(db.query).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledWith(expect.objectContaining({status:401}),false);
 });
 it('refreshes a returning authorized user photo without changing their company or role', async () => {
  const existing={id:'user-a',email:'person@example.com',organization_id:'org-a',role:'member',is_active:true,avatar_url:null};
  const db={findOne:jest.fn().mockResolvedValue(existing),query:jest.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('information_schema')?[{column_name:'provider_id'}]:[]}))};
  const strategy=new GoogleStrategy({get:(_key:string,fallback:string)=>fallback} as ConfigService,db as never);
  const done=jest.fn();
  await strategy.validate('access','refresh',{id:'google-id',emails:[{value:existing.email}],photos:[{value:'https://lh3.googleusercontent.com/photo'}]},done);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'),['https://lh3.googleusercontent.com/photo','user-a']);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (provider, provider_id)'),['user-a','google-id']);
  expect(done).toHaveBeenCalledWith(null,expect.objectContaining({avatar_url:'https://lh3.googleusercontent.com/photo',organization_id:'org-a',role:'member'}));
 });
 it('preserves the saved photo when Google supplies no usable photo',async()=>{
  const existing={id:'user-a',is_active:true,avatar_url:'https://example.com/saved.png'};
  const db={findOne:jest.fn().mockResolvedValue(existing),query:jest.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('information_schema')?[{column_name:'provider_id'}]:[]}))};
  const strategy=new GoogleStrategy({get:(_key:string,fallback:string)=>fallback} as ConfigService,db as never);
  const done=jest.fn();
  await strategy.validate('access','refresh',{id:'google-id',emails:[{value:'person@example.com'}],photos:[{value:'javascript:invalid'}]},done);
  expect(db.query.mock.calls.some(call=>String(call[0]).includes('UPDATE users'))).toBe(false);
  expect(done).toHaveBeenCalledWith(null,existing);
 });
});
