import assert from "node:assert/strict";
import test from "node:test";
import {AccountManager,createStreamWrapper} from "../extensions/multicodex.ts";
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';

const emails=["andreas@example.test","lukas+fixture@example.test"];
const bindings=emails.map((account,index)=>({account,property:`codex-${index}`,actor:`actor-${index}`,clientId:"app_EMoamEEZ73f0CkXaXp7hrann"}));
const data=()=>({version:1,accounts:emails.map(email=>({email,accessToken:`legacy-${email}`,refreshToken:`legacy-refresh-${email}`,expiresAt:Number.MAX_SAFE_INTEGER})),activeEmail:emails[1]});
const token=(binding:any)=>({account:binding.account,clientId:binding.clientId,subject:`subject-${binding.actor}`,accountId:`account-${binding.actor}`,accessToken:`broker-${binding.account}`,expiresAt:Date.now()+300000});

test("broker accounts shadow legacy credentials, preserve selected identities and never write tokens",async()=>{
 let writes=0;const calls:any[]=[];const manager=new AccountManager({data:data(),save:()=>writes++,broker:{binary:"/synthetic/cli",config:"/synthetic/client.json",accounts:bindings},requestToken:async(options:any)=>{calls.push(options);return token(options.binding);}});
 assert.equal(manager.getAccounts().length,2);assert.equal(manager.getActiveAccount()?.email,emails[1]);
 const a=manager.getAccount(emails[0])!;assert.equal(await manager.ensureValidToken(a),`broker-${emails[0]}`);assert.equal(a.refreshToken,"");
 assert.equal(await manager.ensureValidToken(a),`broker-${emails[0]}`);assert.equal(calls.length,2,"every request checks daemon policy");
 assert.equal(manager.setManualAccount(emails[1]),true);assert.equal(manager.getManualAccount()?.email,emails[1]);manager.clearManualAccount();assert.equal(manager.hasManualAccount(),false);
 assert.equal(writes,0);assert.ok(manager.getManagedAccounts().every((a:any)=>a.accessToken.startsWith("legacy-")));
});
test("broker failure and cancellation never fall back or permanently flag reauth",async()=>{
 const manager=new AccountManager({data:data(),save:()=>assert.fail("no writes"),broker:{binary:"/synthetic/cli",config:"/synthetic/client.json",accounts:bindings},requestToken:async()=>{throw new Error("private-provider-canary");}});
 const account=manager.getAccount(emails[0])!;await assert.rejects(manager.ensureValidToken(account),/Codex broker request failed/);assert.equal(account.needsReauth,undefined);let warning="";manager.setWarningHandler((text:string)=>warning=text);manager.notifyAuthFailure(account,new Error("private-provider-canary"));assert.equal(account.needsReauth,undefined);assert.ok(!warning.includes("private-provider-canary"));
});
test("quota rotation, manual selection and touch-grass credit rules remain consumer owned",async()=>{
 let writes=0;const manager=new AccountManager({data:data(),save:()=>writes++,broker:{binary:"/synthetic/cli",config:"/synthetic/client.json",accounts:bindings},requestToken:async(options:any)=>token(options.binding)});
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({rate_limit:{primary_window:{used_percent:30},secondary_window:{used_percent:30}},credits:{has_credits:false}}));
 try {
  await manager.refreshUsageForAllAccounts();assert.equal(manager.setManualAccount(emails[1]),true);assert.equal(manager.getAvailableManualAccount()?.email,emails[1]);
  const next=await manager.activateBestAccount({excludeEmails:new Set([emails[1]]),allowCredits:false});assert.equal(next?.email,emails[0]);assert.equal(manager.getManualAccount()?.email,emails[1]);
  manager.clearManualAccount();assert.equal(manager.getActiveAccount()?.email,emails[0]);
  const account=manager.getAccount(emails[0])!;await manager.handleQuotaExceeded(account);assert.ok(account.quotaExhaustedUntil);assert.equal(manager.clearAllQuotaExhaustion(),1);assert.equal(writes,0);
 }finally{globalThis.fetch=previous;}
});
test("separate callers cancel independently; shutdown cancels only owned broker calls",async()=>{
 const pending:any[]=[];const manager=new AccountManager({data:data(),broker:{binary:"/synthetic/cli",config:"/synthetic/client.json",accounts:bindings},requestToken:options=>new Promise((resolve,reject)=>{pending.push({options,resolve});options.signal.addEventListener('abort',()=>reject(new Error('private-canary')),{once:true});})});
 const controller=new AbortController();const one=manager.ensureValidToken(manager.getAccount(emails[0])!,controller.signal);const two=manager.ensureValidToken(manager.getAccount(emails[0])!);controller.abort(); await assert.rejects(Promise.race([one,new Promise((_,reject)=>setTimeout(()=>reject(new Error('cancellation deadline')),100))]),/cancelled/);pending[1].resolve(token(bindings[0]));assert.equal(await two,`broker-${emails[0]}`);
 const last=manager.ensureValidToken(manager.getAccount(emails[1])!);manager.shutdownBrokerRequests();await assert.rejects(Promise.race([last,new Promise((_,reject)=>setTimeout(()=>reject(new Error('shutdown deadline')),100))]),/cancelled/);
});

test("broker stream never rotates or replays after forwarded output and redacts failures",async()=>{
 let starts=0;const manager={waitUntilReady:async()=>{},getAvailableManualAccount:()=>({email:emails[0]}),hasManualAccount:()=>true,ensureValidToken:async()=>"private-token",isBrokerAccount:()=>true};
 const wrap=createStreamWrapper(manager as never,(()=>{starts++;const stream=createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:'start',partial:{}} as never);stream.push({type:'error',reason:'error',error:{errorMessage:'quota private-provider-canary',stopReason:'error',content:[]}} as never);stream.end();});return stream;}) as never,()=>undefined);
 const stream=wrap({provider:'openai-codex',api:'openai-codex-responses',id:'fixture'} as never,{messages:[]} as never);const events=[];for await(const e of stream)events.push(e);assert.equal(starts,1);assert.equal(events.length,2);assert.equal((events[1] as any).error.errorMessage,'Codex provider request failed');
});
test("broker-only policy calls do not resurrect legacy reauth state or accept legacy updates",async()=>{
 const initial=data();(initial.accounts[0] as any).needsReauth=true;const manager=new AccountManager({data:initial,broker:{binary:'/synthetic/cli',config:'/synthetic/client.json',accounts:bindings},requestToken:async(options:any)=>token(options.binding)});
 assert.equal(await manager.ensureValidToken(manager.getAccount(emails[0])!),`broker-${emails[0]}`);
 assert.throws(()=>manager.addOrUpdateAccount(emails[0],{access:'legacy',refresh:'legacy-refresh',expires:0}),/read-only/);
 assert.equal(manager.removeAccount(emails[0]),false);
});

test("malformed and partial registries fail closed instead of exposing legacy credentials",async()=>{
 const root=mkdtempSync(join(tmpdir(),'tx-codex-registry-manager-'));const prior=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 try{writeFileSync(join(root,'codex-broker.json'),'malformed',{mode:0o600});const bad=new AccountManager({data:data()});assert.deepEqual(bad.getAccounts(),[]);assert.equal(bad.getAccount(emails[0]),undefined);await assert.rejects(bad.ensureValidToken(data().accounts[0]),/Invalid Codex broker registry/);
 const partial=new AccountManager({data:data(),broker:{binary:'/synthetic/cli',config:'/synthetic/client.json',accounts:[bindings[0]]}});assert.deepEqual(partial.getAccounts(),[]);assert.match(partial.availabilityError(),/no legacy fallback/);
 }finally{process.env.PI_CODING_AGENT_DIR=prior;rmSync(root,{recursive:true,force:true});}
});
test("broker usage waiters have separate cancellation and no writes",async()=>{
 let pending:any[]=[];const manager=new AccountManager({data:data(),save:()=>assert.fail('no writes'),broker:{binary:'/synthetic/cli',config:'/synthetic/client.json',accounts:bindings},requestToken:options=>new Promise((resolve,reject)=>{pending.push({options,resolve});options.signal.addEventListener('abort',()=>reject(new Error('secret-canary')),{once:true});})});
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({rate_limit:{primary_window:{used_percent:20},secondary_window:{used_percent:20}}}));
 try{const controller=new AbortController();const first=manager.refreshUsageForAccount(manager.getAccount(emails[0])!,{signal:controller.signal});const other=manager.refreshUsageForAccount(manager.getAccount(emails[0])!);assert.equal(pending.length,2);controller.abort();await Promise.race([first,new Promise((_,reject)=>setTimeout(()=>reject(new Error('usage cancellation deadline')),100))]);pending[1].resolve(token(bindings[0]));assert.ok(await other);assert.equal(manager.getAccount(emails[0])?.needsReauth,undefined);}finally{globalThis.fetch=prior;}
});

test("wrong client cannot update an account",async()=>{
 const manager=new AccountManager({data:data(),broker:{binary:'/synthetic/cli',config:'/synthetic/client.json',accounts:bindings},requestToken:async(options:any)=>({...token(options.binding),clientId:'wrong'})});await assert.rejects(manager.ensureValidToken(manager.getAccount(emails[0])!),/Codex broker request failed/);assert.equal(manager.getAccount(emails[0])?.accessToken,'');
});
test("wrong account cannot update broker state and login uses the exact selected binding",async()=>{
 let calls:any[]=[];const manager=new AccountManager({data:data(),save:()=>assert.fail("no writes"),broker:{binary:"/synthetic/cli",config:"/synthetic/client.json",accounts:bindings},requestToken:async(options:any)=>{calls.push(options);return {...token(options.binding),account:emails[1]};}});
 await assert.rejects(manager.ensureValidToken(manager.getAccount(emails[0])!),/Codex broker request failed/);assert.equal(manager.getAccount(emails[0])?.accessToken,"");
 const selected=await manager.loginBrokerAccount(emails[1]);assert.equal(selected.email,emails[1]);assert.equal(calls[1].login,true);assert.equal(calls[1].binding.account,emails[1]);assert.equal(selected.refreshToken,"");
});
