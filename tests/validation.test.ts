import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, listingSchema, profileSchema, registerSchema } from '../src/schemas/auth.schema';
import { validateImageFilename } from '../src/schemas/uploads.schema';
import { LocalFilesystemStorageProvider } from '../src/storage/local-filesystem-storage';
import { reportMessageSchema,reportUserSchema } from '../src/schemas/moderation.schema';
const valid={name:'A User',username:'user_123',password:'strong-pass-1',confirmPassword:'strong-pass-1',country:'India',city:'Delhi',gender:'Other'};
describe('request validation',()=>{
 it('accepts registration and rejects mismatched passwords',()=>{assert.equal(registerSchema.safeParse(valid).success,true);assert.equal(registerSchema.safeParse({...valid,confirmPassword:'different'}).success,false);});
 it('rejects malformed usernames and short passwords',()=>{assert.equal(registerSchema.safeParse({...valid,username:'abc'}).success,false);assert.equal(loginSchema.safeParse({username:'user_123',password:'short'}).success,false);});
 it('parses pagination and online filter while enforcing bounds',()=>{assert.deepEqual(listingSchema.safeParse({page:'2',limit:'20',online:'true'}).data,{online:true,page:2,limit:20});assert.equal(listingSchema.safeParse({limit:'1000'}).success,false);assert.equal(listingSchema.safeParse({page:'10001'}).success,false);assert.equal(listingSchema.safeParse({online:'maybe'}).success,false);assert.equal(listingSchema.safeParse({search:'  '}).success,false);});
 it('only permits profile fields and requires an update',()=>{assert.equal(profileSchema.safeParse({city:'Pune'}).success,true);assert.equal(profileSchema.safeParse({username:'changed'}).success,false);assert.equal(profileSchema.safeParse({}).success,false);});
 it('accepts only safe supported image filename extensions',()=>{assert.equal(validateImageFilename('photo.JPG'),'jpg');assert.equal(validateImageFilename('photo.webp'),'webp');assert.throws(()=>validateImageFilename('../../shell.js'));assert.throws(()=>validateImageFilename('vector.svg'));assert.throws(()=>validateImageFilename('safe\\..\\payload.png'));});
 it('blocks traversal and arbitrary paths at the storage boundary',()=>{const storage=new LocalFilesystemStorageProvider('var/test-uploads');assert.throws(()=>storage.openReadStream('../secret.jpg'));assert.throws(()=>storage.openReadStream('..\\secret.jpg'));assert.throws(()=>storage.openReadStream('secret.txt'));});
 it('accepts only controlled report reasons and bounded descriptions',()=>{assert.equal(reportUserSchema.safeParse({userId:'00000000-0000-4000-8000-000000000000',reason:'SPAM',description:'Spam'}).success,true);assert.equal(reportMessageSchema.safeParse({messageId:'00000000-0000-4000-8000-000000000000',reason:'FREEFORM'}).success,false);assert.equal(reportUserSchema.safeParse({userId:'00000000-0000-4000-8000-000000000000',reason:'OTHER',description:'x'.repeat(2001)}).success,false);});
});
