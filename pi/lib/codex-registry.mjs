// Private metadata, never credential import or a vendor-store reader.
import {openSync, closeSync, fstatSync, readFileSync, constants} from 'node:fs';
import {isAbsolute} from 'node:path';
const CLIENT='app_EMoamEEZ73f0CkXaXp7hrann';
export function loadBrokerRegistry(path) {
  let fd;
  try {
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=fstatSync(fd);
    if(!stat.isFile() || (stat.mode&0o077)!==0 || stat.uid!==process.getuid() || stat.nlink!==1 || stat.size>16384)throw new Error();
    const value=JSON.parse(readFileSync(fd,'utf8'));
    if(value.version!==1 || Object.keys(value).sort().join(',')!=='accounts,binary,config,version' || !isAbsolute(value.binary) || !isAbsolute(value.config) || !Array.isArray(value.accounts) || value.accounts.length===0 || value.accounts.length>16)throw new Error();
    const seen=new Set();const subjects=new Set();
    for(const b of value.accounts){
      if(Object.keys(b).sort().join(',')!=='account,actor,clientId,property' || typeof b.account!=='string' || !/^[^\s@]+@[^\s@]+$/.test(b.account) || Buffer.byteLength(b.account)>256 || !/^[A-Za-z0-9._-]{1,64}$/.test(b.property) || !/^[A-Za-z0-9._-]{1,64}$/.test(b.actor) || b.clientId!==CLIENT || seen.has(b.account))throw new Error();
      const subject=JSON.stringify([b.property,b.actor]);if(subjects.has(subject))throw new Error();subjects.add(subject);
      seen.add(b.account);
    }
    return value;
  } catch(error) {
    if(fd===undefined && error?.code==='ENOENT')return undefined;
    throw new Error('Invalid Codex broker registry');
  } finally {if(fd!==undefined)closeSync(fd);}
}
