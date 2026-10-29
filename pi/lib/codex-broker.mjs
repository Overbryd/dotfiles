// Narrow private-pipe consumer boundary. No provider HTTP, grants, files or logging.
import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
const CLIENT = 'app_EMoamEEZ73f0CkXaXp7hrann';
const MAX_BYTES = 32768;
const publicText = value => typeof value==='string' && value.length>0 && Buffer.byteLength(value)<=1024 && !/[\u0000-\u001f\u007f]/.test(value);
const identifier = value => typeof value==='string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);

export function requestToken({binary,config,binding,login=false,renew=false,purpose='MultiCodex account token',signal}) {
  const failed=()=>new Error('Codex broker request failed');
  if (!isAbsolute(binary??'') || !isAbsolute(config??'') || !publicText(binding?.account) || !binding.account.includes('@') || !identifier(binding.property) || !identifier(binding.actor) || binding.clientId!==CLIENT || !publicText(purpose) || (login&&renew)) return Promise.reject(failed());
  if(signal?.aborted)return Promise.reject(new Error('Codex broker request cancelled'));
  return new Promise((resolve,reject)=>{
    const args=['--config',config,'codex','token','--property',binding.property,'--actor',binding.actor,'--account',binding.account,'--client-id',CLIENT,'--purpose',purpose];
    if(login)args.push('--login');if(renew)args.push('--renew');
    // Only public executable selection crosses argv/env; credentials stay in CLI private IPC.
    const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'',HOME:process.env.HOME??''}});
    let output=Buffer.alloc(0);let errorBytes=0;let finished=false;let reason;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);output.fill(0);error?reject(error):resolve(value);};
    const stop=error=>{if(reason)return;reason=error;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);killTimer.unref?.();};
    const abort=()=>stop(new Error('Codex broker request cancelled'));
    let killTimer;const timer=setTimeout(()=>stop(failed()),login?910000:200000);timer.unref?.();
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',data=>{
      if(reason){data.fill(0);return;}
      if(output.length+data.length>MAX_BYTES){data.fill(0);stop(failed());return;}
      const next=Buffer.concat([output,data]);output.fill(0);data.fill(0);output=next;
    });
    child.stderr.on('data',data=>{errorBytes+=data.length;data.fill(0);if(errorBytes>MAX_BYTES)stop(failed());});
    child.on('error',()=>finish(failed()));
    child.on('close',code=>{
      if(reason){finish(reason);return;}if(code!==0){finish(failed());return;}
      try{
        const value=JSON.parse(output.toString('utf8'));const keys=Object.keys(value).sort();
        if(keys.join(',')!=='accessToken,account,accountId,clientId,expiresAt,subject' || value.account!==binding.account || value.clientId!==CLIENT || !publicText(value.accountId) || !publicText(value.subject) || typeof value.accessToken!=='string' || value.accessToken.length===0 || Buffer.byteLength(value.accessToken)>16384 || /[\u0000-\u0020\u007f]/.test(value.accessToken) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt<=Date.now() || value.expiresAt>Date.now()+86400000)throw failed();
        finish(null,value);
      }catch{finish(failed());}
    });
    if(signal?.aborted)abort();
  });
}
