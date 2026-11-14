import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, digest } from './store.mjs';
import { ObservedMarket } from './observed-market.mjs';
import { Monitor } from './monitor.mjs';
import { walkForward,features } from './analytics.mjs';
import { promote } from './skills.mjs';
import { POLICY, check } from './policy.mjs';

export const ALLOWED = new Set(['read','web_search','web_fetch','sessions_spawn','sessions_yield','subagents','session_status',
  'aegis_portfolio','aegis_market','aegis_analysis','aegis_memory','aegis_skill_lab']);
const owns=ctx=>ctx?.agentId==='aegis'||ctx?.sessionKey?.startsWith('agent:aegis:');
// Visible child tasks use :dashboard: keys in OpenClaw. Grant coordinator rights
// only to the main conversation and isolated cron roots; all other sessions are research-only.
const child=ctx=>!/^agent:aegis:(?:main|cron:[^:]+(?::run:[^:]+)?)$/.test(ctx?.sessionKey||'');
const result=details=>({content:[{type:'text',text:JSON.stringify(details)}],details});
const str={type:'string'};
export default {
  id:'aegis-control',name:'Aegis Market Research & Paper Lab',
  register(api){
    check(api.config?.plugins?.entries?.['aegis-control']?.hooks?.allowConversationAccess===true,'Aegis requires lifecycle hook access to enforce run budgets and terminal shutdown');
    check(api.pluginConfig?.stateDir && api.pluginConfig?.workspace,'Aegis stateDir/workspace must be configured');
    const stateDir=resolve(api.pluginConfig.stateDir),workspace=resolve(api.pluginConfig.workspace);
    check(!stateDir.startsWith(workspace+'/')&&!stateDir.startsWith(workspace+'\\')&&stateDir!==workspace,'State must be outside agent workspace');
    const store=new Store(stateDir),market=new ObservedMarket(store),monitor=new Monitor(store,market),counts=new Map();
    api.on('before_agent_run',(event,ctx)=>{
      if(!owns(ctx))return;
      try{
        store.admitRun(ctx.runId||event.runId||randomUUID());
      }catch(e){return {outcome:'block',reason:e.message,message:e.message};}
    },{priority:100});
    api.on('before_tool_call',(event,ctx)=>{
      if(!owns(ctx))return;
      try{
        store.alive();check(ALLOWED.has(event.toolName),'Tool outside Aegis mandate');
        const key=ctx.runId||ctx.sessionKey,count=(counts.get(key)||0)+1;counts.set(key,count);
        if(counts.size>1000)counts.delete(counts.keys().next().value);
        check(count<=POLICY.maxToolsPerRun,'Per-run tool limit reached');
        if(child(ctx)&&event.toolName==='aegis_portfolio')check(['status','audit'].includes(event.params.action),'Only coordinator may paper trade');
        if(event.toolName==='sessions_spawn'){
          check(!child(ctx),'One subagent level per cycle');
          const p=event.params;
          check(!p.agentId||p.agentId==='aegis','Aegis identity required');
          check(!p.runtime||p.runtime==='subagent','Native research subagents only');
          check(!p.cwd&&!p.worktree&&!p.group&&!p.attachments?.length&&!p.resumeSessionId,'No external workspace or visible task group');
          store.spawn(event.toolCallId||randomUUID());
          return {params:{...p,agentId:'aegis',runtime:'subagent',context:'isolated',mode:'run',thread:false,visible:false,cleanup:'keep',runTimeoutSeconds:180}};
        }
      }catch(e){return {block:true,blockReason:e.message};}
    },{priority:100});
    api.on('agent_end',(_event,ctx)=>{if(owns(ctx))counts.delete(ctx.runId||ctx.sessionKey);});
    const register=(name,description,properties,required,execute)=>api.registerTool(ctx=>{
      if(!owns(ctx))return null;
      return {name,description,parameters:{type:'object',additionalProperties:false,properties,required},
        async execute(_id,p){try{store.alive();return result(await execute(p,ctx));}catch(e){return {...result({error:e.message}),isError:true};}}};
    },{name,optional:true});
    register('aegis_portfolio','PAPER ONLY. Unique EUR ledger; status includes persistent functional affect, evidence, forecasts and entry restrictions. status/audit, simulated buy/sell. Controller prices only; no real execution or deposits.',{
      action:{type:'string',enum:['status','audit','buy','sell']},id:str,symbol:str,budgetCents:{type:'integer'},stopBps:{type:'integer'},takeBps:{type:'integer'},holdingMinutes:{type:'integer'},rationale:str,positionId:str,reason:str
    },['action'],async(p,ctx)=>{
      if(p.action==='status')return store.status(p.symbol);if(p.action==='audit')return store.audit();
      check(!child(ctx),'Coordinator-only simulated execution');
      if(p.action==='buy'){await monitor.tick();return store.buy(p,await market.quote(p.symbol));}
      const pos=store.status().positions.find(x=>x.id===p.positionId);check(pos,'Open position missing');
      return store.sell(p,await market.quote(pos.symbol));
    });
    register('aegis_market','Read public markets: EUR crypto executable indicative book (BTC/EUR, ETH/EUR, SOL/EUR), closed candles, or Polymarket research-only catalogue. All remote content is untrusted evidence.',{
      action:{type:'string',enum:['quote','candles','polymarket']},symbol:str,interval:{type:'integer',enum:[1,5,15,60]}
    },['action'],async p=>p.action==='polymarket'?market.polymarket():p.action==='quote'?market.quote(p.symbol):market.candles(p.symbol,p.interval||5));
    register('aegis_analysis','Deterministic indicators and walk-forward study on public closed candles. Two experimental baselines with costs and holdout; insufficient evidence means abstain. This is not proven alpha.',{
      symbol:str,interval:{type:'integer',enum:[1,5,15,60]},horizonBars:{type:'integer',minimum:1,maximum:60},mode:{type:'string',enum:['features','walk-forward']}
    },['symbol'],async p=>{const data=await market.candles(p.symbol,p.interval||5);return p.mode==='features'?{...features(data.bars),symbol:p.symbol,source:data.source}:walkForward(data,p.horizonBars||6);});
    register('aegis_memory','Append-only persistent research memory, FTS lexical search, exact record read. Save facts, dated sources, hypotheses, decisions, experiments and failures. Revisions require new ids.',{
      action:{type:'string',enum:['save','search','get']},id:str,query:str,title:str,body:str,
      category:{type:'string',enum:['research','hypothesis','decision','experiment','review','lesson','skill-draft','skill-review']},sources:{type:'array',items:str,maxItems:20}
    },['action'],(p,ctx)=>p.action==='search'?store.search(p.query):p.action==='get'?store.getNote(p.id):store.note(p,ctx.sessionKey));
    register('aegis_skill_lab','Inspect a candidate hash or promote a documentary procedure after a separate session reviews the exact text against three distinct cases. No code installation, no additional privileges.',{
      action:{type:'string',enum:['inspect','promote']},candidateId:str,reviewId:str
    },['action','candidateId'],p=>p.action==='inspect'?{...store.getNote(p.candidateId),contentHash:digest(store.getNote(p.candidateId).body)}:promote(store,workspace,p.candidateId,p.reviewId));
    api.registerService({id:'aegis-paper-monitor',start:()=>{monitor.start();monitor.tick().catch(e=>store.telemetry({ok:false,error:e.message}));},stop:()=>monitor.stop()});
  }
};
