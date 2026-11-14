import { resolve } from 'node:path';
import { Store } from '../src/store.mjs';
const args=process.argv.slice(2),command=args[0]||'status';
const option=args.indexOf('--state');
const path=option>=0?args[option+1]:process.env.AEGIS_STATE_DIR;
if(!path)throw new Error('Specify --state <private runtime state directory> or AEGIS_STATE_DIR');
const s=new Store(resolve(path));
try{
  const output=command==='init'?s.init():command==='status'?s.status():command==='affect'?s.status().affect:command==='audit'?s.audit():command==='pause'?s.ownerPause():null;
  if(!output)throw new Error('Supported: init, status, affect, audit, pause. No reset or deposit command exists.');
  console.log(JSON.stringify(output,null,2));
}finally{s.close();}
