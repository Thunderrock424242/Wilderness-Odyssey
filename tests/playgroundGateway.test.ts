import { describe, expect, it } from 'vitest';
import { selectRoute } from '../workers/bot-gateway/routes';
import { playgroundQuery } from '../server/playground-gateway';
describe('playground gateway bounds', () => {
  it('allows only the exact routes, with a bounded sandbox timeout', () => {
    expect(selectRoute('POST', '/v1/admin/aether-playground/sandbox')?.timeoutMs).toBe(65000);
    expect(selectRoute('GET', '/v1/admin/aether-playground/jobs')?.timeoutMs).toBe(15000);
    for (const path of ['/jobs', '/jobs/job-1/cancel', '/admission']) expect(selectRoute('POST', '/v1/admin/aether-playground' + path)?.timeoutMs).toBe(45000);
    expect(selectRoute('POST', '/v1/admin/aether-playground/shell')).toBeUndefined();
    expect(selectRoute('GET', '/v1/admin/aether-playground/examples')?.bodyLimit).toBe(0);
  });
  it('accepts a bounded numeric cursor only for example pages', () => {
    expect(playgroundQuery('/aether-playground/examples', new URLSearchParams('cursor=100')).success).toBe(true);
    for (const query of ['cursor=-1', 'cursor=10000001', 'cursor=1&cursor=2', 'url=https://private']) expect(playgroundQuery('/aether-playground/examples', new URLSearchParams(query)).success).toBe(false);
    expect(playgroundQuery('/aether-playground/jobs', new URLSearchParams('cursor=1')).success).toBe(false);
  });
});

import { beforeAll } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleGateway } from '../server/gateway';
import { createCsrf } from '../server/csrf';
import type { GatewayEnv } from '../server/env';
const env: GatewayEnv = { ENVIRONMENT:'production',STAFF_AUTH_MODE:'access',ALLOWED_HOSTS:'site.example.com',ACCESS_TEAM_DOMAIN:'https://team.cloudflareaccess.com',ACCESS_AUDIENCE:'staff',KINETIC_ADMIN_ORIGIN:'https://backend.example.com',KINETIC_ACCESS_CLIENT_ID:'machine',KINETIC_ACCESS_CLIENT_SECRET:'private-machine-secret',CSRF_SECRET:'test-signing-key-of-at-least-32-bytes' };
let jwt: string, jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => { const keys = await generateKeyPair('RS256'); jwks = createLocalJWKSet({keys:[{...await exportJWK(keys.publicKey),kid:'test',alg:'RS256'}]}); jwt = await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience('staff').setSubject('owner').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey); });
const setup = {schemaVersion:'1.0',configured:false,connectionId:null,serverId:'aether',identityVerified:false,reachable:false,inferenceReady:null,paused:null,admissionRevision:null,state:'setup-required',message:'Configure the approved Aether peer.',capabilities:null};
function session(role = 'administrator', capabilities = ['playground:read','playground:write','playground:train']) { return {schemaVersion:'1.0',user:{id:'owner',displayName:'Owner',role},capabilities}; }
async function req(path = '', method = 'GET', body?: unknown, csrf = true) { const headers = new Headers({'Cf-Access-Jwt-Assertion':jwt}); if (body !== undefined) { headers.set('Origin','https://site.example.com'); headers.set('Content-Type','application/json'); headers.set('Idempotency-Key','fixture-request-1234567890'); if (csrf) headers.set('X-CSRF-Token',await createCsrf('owner','https://site.example.com',env.CSRF_SECRET!)); } return new Request('https://site.example.com/api/admin/v1/aether-playground'+path,{method,headers,...(body === undefined ? {} : {body:JSON.stringify(body)})}); }
function backend(value: unknown, role = 'administrator'): typeof fetch { return async url => Response.json(String(url).endsWith('/session') ? session(role) : value); }
describe('private playground boundary', () => {
 it('returns setup readiness privately without inventing success', async () => { const response = await handleGateway(await req(),env,{jwks,fetch:backend({...setup,token:'secret'})}); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(await response.json()).toEqual(setup); });
 it('denies moderator access even when capabilities are spoofed',async()=> { expect((await handleGateway(await req(),env,{jwks,fetch:backend(setup,'moderator')})).status).toBe(403); });
 it('rechecks current authority before releasing private data',async()=> { let reads=0; const fetcher:typeof fetch = async url => Response.json(String(url).endsWith('/session') ? session(++reads === 1 ? 'administrator':'moderator') : setup); const response=await handleGateway(await req(),env,{jwks,fetch:fetcher}); expect(response.status).toBe(403); expect(await response.text()).not.toContain('Configure the approved Aether peer'); });
 it('requires CSRF, origin, acknowledgement and strict schema before forwarding expensive calls',async()=> { let forwarded=0; const fetcher:typeof fetch=async url=> { if (!String(url).endsWith('/session')) forwarded++; return Response.json(session()); }; const input={baseModelId:'approved-model',presetId:'approved-preset',examples:[{id:'e1',revision:'r1'}],reason:'Reviewed safe examples',acknowledgeTraining:true}; expect((await handleGateway(await req('/jobs','POST',input,false),env,{jwks,fetch:fetcher})).status).toBe(403); expect((await handleGateway(await req('/jobs','POST',{...input,acknowledgeTraining:false}),env,{jwks,fetch:fetcher})).status).toBe(400); expect((await handleGateway(await req('/jobs','POST',{...input,url:'https://internal'}),env,{jwks,fetch:fetcher})).status).toBe(400); const foreign=await req('/jobs','POST',input); foreign.headers.set('Origin','https://evil.example'); expect((await handleGateway(foreign,env,{jwks,fetch:fetcher})).status).toBe(403); expect(forwarded).toBe(0); });
 it('forwards bounded sandbox with an explicit signal and rejects malformed peer data',async()=> { let signal:AbortSignal|null|undefined; const input={modelId:'approved',messages:[{role:'user',content:'Hello'}],maxOutputTokens:64,temperature:0.7}; const response=await handleGateway(await req('/sandbox','POST',input),env,{jwks,fetch:async (url,init)=> { if (String(url).endsWith('/session')) return Response.json(session()); signal=init?.signal; return Response.json({rawSecret:'never release'}); }}); expect(signal).toBeInstanceOf(AbortSignal); expect(response.status).toBe(502); expect(await response.text()).not.toContain('rawSecret'); });
});
