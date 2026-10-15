import { POST } from '@/app/api/revalidate/route';
import { revalidateTag, revalidatePath } from 'next/cache';
jest.mock('next/cache',()=>({revalidateTag:jest.fn(),revalidatePath:jest.fn(),unstable_cache:(f)=>f}));
jest.mock('react',()=>({...jest.requireActual('react'),cache:(f)=>f}));
jest.mock('next/server',()=>({NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}));
beforeEach(()=>{ jest.clearAllMocks(); global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({users:[{localId:'isolated',customAttributes:'{"admin":true}'}]})}); });
afterEach(()=>{delete global.fetch;});
const request=(scope,token='test')=>({url:`http://localhost/api/revalidate?scope=${scope}`,headers:{get:()=>token?`Bearer ${token}`:''}});
test.each([['catalogue',['catalogue']],['content',['site-content']],['settings',['site-settings']],['blog',['blog']],['explore',['explore']]])('%s invalidates only its declared data tag',async(scope,tags)=>{
 expect((await POST(request(scope))).status).toBe(200);
 expect(revalidateTag.mock.calls.map(([tag])=>tag)).toEqual(tags);
 expect(revalidatePath).not.toHaveBeenCalledWith('/','layout');
});
test('legacy site callers refresh the new tags too',async()=>{
 await POST(request('site'));
 expect(revalidateTag.mock.calls.map(([tag])=>tag)).toEqual(['site-data','catalogue','site-content','site-settings']);
});
test('anonymous and unknown scope requests never purge',async()=>{
 expect((await POST(request('content',''))).status).toBe(401);
 expect((await POST(request('unknown'))).status).toBe(400);
 expect(revalidateTag).not.toHaveBeenCalled();
});
