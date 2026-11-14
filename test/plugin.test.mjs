import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin from '../src/plugin.mjs';
import { Store } from '../src/store.mjs';

test('plugin isolates tools, denies real execution and limits child privileges',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aegis-plugin-')),s=new Store(join(dir,'state'));s.init();
  const hooks={},factories={};
  plugin.register({config:{plugins:{entries:{'aegis-control':{hooks:{allowConversationAccess:true}}}}},pluginConfig:{stateDir:join(dir,'state'),workspace:join(dir,'workspace')},on:(name,fn)=>hooks[name]=fn,registerTool:(factory,{name})=>factories[name]=factory,registerService:()=>{}});
  const parent={agentId:'aegis',sessionKey:'agent:aegis:main',runId:'r1'},child={...parent,sessionKey:'agent:aegis:subagent:child',runId:'r2'};
  assert.equal(factories.aegis_market({agentId:'main'}),null);
  for(const toolName of ['exec','write','browser','message','gateway','payment','aurum_portfolio'])assert.equal(hooks.before_tool_call({toolName,params:{}},parent).block,true);
  assert.equal(hooks.before_tool_call({toolName:'sessions_spawn',params:{agentId:'main'}},parent).block,true);
  assert.equal(hooks.before_tool_call({toolName:'sessions_spawn',params:{}},child).block,true);
  assert.equal(hooks.before_tool_call({toolName:'aegis_portfolio',params:{action:'buy'}},child).block,true);
  assert.equal(hooks.before_tool_call({toolName:'aegis_portfolio',params:{action:'buy'}},{...parent,sessionKey:'agent:aegis:dashboard:child'}).block,true);
  assert.equal(hooks.before_tool_call({toolName:'sessions_spawn',params:{}},{...parent,sessionKey:'agent:aegis:dashboard:child'}).block,true);
  const spawn=hooks.before_tool_call({toolName:'sessions_spawn',params:{visible:true}},parent);
  assert.equal(spawn.params.visible,false);
  assert.equal(hooks.before_tool_call({toolName:'aegis_market',params:{action:'quote'}},parent),undefined);
  assert.equal(hooks.before_agent_run({runId:'r1'},parent),undefined);
  const scoped=await factories.aegis_portfolio(parent).execute('status-btc',{action:'status',symbol:'BTC/EUR'});
  assert.equal(scoped.details.affect.regulation.scope,'BTC/EUR');
  assert.equal(s.status().cashCents,4990);
  s.ownerExpense('death',4990);
  assert.equal(hooks.before_agent_run({runId:'r3'},parent).outcome,'block');
  assert.equal(hooks.before_tool_call({toolName:'aegis_market',params:{}},parent).block,true);
  s.close();
  // Plugin keeps its process-scoped SQLite handle. OS cleanup occurs when this test process exits.
});

test('missing lifecycle permission rejects plugin startup instead of silently dropping limits',()=>{
  assert.throws(()=>plugin.register({config:{}}),/lifecycle hook access/);
});
