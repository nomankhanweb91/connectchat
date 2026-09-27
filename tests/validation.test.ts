import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, listingSchema, profileSchema, registerSchema } from '../src/schemas/auth.schema';
const valid={name:'A User',username:'user_123',password:'strong-pass-1',confirmPassword:'strong-pass-1',country:'India',city:'Delhi',gender:'Other'};
describe('request validation',()=>{
 it('accepts registration and rejects mismatched passwords',()=>{assert.equal(registerSchema.safeParse(valid).success,true);assert.equal(registerSchema.safeParse({...valid,confirmPassword:'different'}).success,false);});
 it('rejects malformed usernames and short passwords',()=>{assert.equal(registerSchema.safeParse({...valid,username:'abc'}).success,false);assert.equal(loginSchema.safeParse({username:'user_123',password:'short'}).success,false);});
 it('parses pagination and caps page size',()=>{assert.deepEqual(listingSchema.safeParse({page:'2',limit:'20'}).data,{page:2,limit:20});assert.equal(listingSchema.safeParse({limit:'1000'}).success,false);});
 it('only permits profile fields and requires an update',()=>{assert.equal(profileSchema.safeParse({city:'Pune'}).success,true);assert.equal(profileSchema.safeParse({username:'changed'}).success,false);assert.equal(profileSchema.safeParse({}).success,false);});
});
