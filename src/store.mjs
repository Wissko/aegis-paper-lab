import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { POLICY, SYMBOLS, check, integer, boundedText, utcDay, fee } from './policy.mjs';
import { initialAffect, observeData, observeOutcome, outcomeForecast, affectReport } from './affect.mjs';
export const digest = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

export class Store {
  constructor(dir,{now=Date.now}={}) {
    this.dir=dir;this.now=now;mkdirSync(dir,{recursive:true});
    this.marker=join(dir,'identity.json');this.tombstone=join(dir,'TERMINATED.json');
    const file=join(dir,'aegis.sqlite');
    check(!(existsSync(this.marker)&&!existsSync(file)),'Identity exists but database is missing: recovery required, no new capital');
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, requestHash TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quotas (day TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(day,kind,id));
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, at INTEGER NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sources TEXT NOT NULL, session TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(id UNINDEXED,title,body);
      CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);`);
    this.audit();
    // Add the mechanism to an existing identity without replaying old stories,
    // replenishing money or changing quotas. Migration is itself audited.
    if(this.raw()&&!this.raw().affect&&this.raw().status!=='closed')this.tx(()=>{
      const s=this.required();if(s.affect||s.status==='closed')return;
      s.affect=initialAffect(this.now());this.save(s,'affect-initialize',{version:1});
    });
  }
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  raw(){const row=this.db.prepare('SELECT body FROM state WHERE id=1').get();return row?JSON.parse(row.body):null;}
  event(kind,body){
    const prev=this.db.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get()?.hash||'GENESIS';
    const at=this.now(),text=JSON.stringify(body),hash=digest(`${prev}|${at}|${kind}|${text}`);
    this.db.prepare('INSERT INTO events(at,kind,body,prev,hash) VALUES(?,?,?,?,?)').run(at,kind,text,prev,hash);
  }
  save(state,kind,detail={}) {
    this.db.prepare('INSERT INTO state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify(state));
    this.event(kind,{...detail,state});
  }
  init(){
    check(!existsSync(this.marker)&&!existsSync(this.tombstone),'Unique identity already initialized or terminated');
    return this.tx(()=>{
      check(!this.raw(),'Capital already initialized');
      const state={instanceId:randomUUID(),mode:POLICY.mode,currency:'EUR',initialCents:5000,cashCents:5000,
        status:'active',createdAt:this.now(),positions:[],peakEquityCents:5000,day:utcDay(this.now()),dayStartEquityCents:5000,
        provisionCents:0,tradingFeesCents:0,realizedPnlCents:0,haltReason:null,affect:initialAffect(this.now())};
      // Marker before commit deliberately fails closed on a partial initialization.
      writeFileSync(this.marker,JSON.stringify({instanceId:state.instanceId,createdAt:state.createdAt}),{flag:'wx'});
      this.save(state,'initialize');return state;
    });
  }
  required(){
    const s=this.raw();check(s,'Owner initialization required');
    check(existsSync(this.marker),'Identity marker missing: recovery required');
    check(JSON.parse(readFileSync(this.marker,'utf8')).instanceId===s.instanceId,'Identity mismatch');
    return s;
  }
  equity(s){return s.cashCents+s.positions.reduce((sum,p)=>sum+p.liquidationCents,0);}
  assess(s){
    const equity=this.equity(s);
    if(s.day!==utcDay(this.now())){s.day=utcDay(this.now());s.dayStartEquityCents=equity;}
    s.peakEquityCents=Math.max(s.peakEquityCents,equity);
    if(equity<=0){s.status='closed';s.haltReason='Capital exhausted';s.terminatedAt??=this.now();}
    else if((s.peakEquityCents-equity)*10000/s.peakEquityCents>=POLICY.drawdownStopBps&&s.status==='active'){
      s.status='risk_paused';s.haltReason='20% drawdown circuit breaker';
    }
    return s;
  }
  terminal(s){
    if(s.status==='closed'&&!existsSync(this.tombstone))writeFileSync(this.tombstone,JSON.stringify({instanceId:s.instanceId,at:this.now(),reason:s.haltReason}),{flag:'wx'});
  }
  status(symbol){
    if(symbol!==undefined)check(Object.hasOwn(SYMBOLS,symbol),'Unsupported paper instrument');
    const s=this.required();this.terminal(s);
    return {...s,affect:s.affect?affectReport(s.affect,s,this.now(),symbol):null,equityCents:this.equity(s),policy:POLICY,
      valuationsStale:s.positions.some(p=>this.now()-p.markedAt>POLICY.maxQuoteAgeMs),
      computeAccounting:'10 cents per model run is a paper provision, not the provider invoice. Actual external AI charges are unknown.',
      quotas:this.db.prepare('SELECT kind,count(*) AS used FROM quotas WHERE day=? GROUP BY kind').all(utcDay(this.now())),
      monitor:this.db.prepare('SELECT body FROM telemetry WHERE id=1').get()?.body ? JSON.parse(this.db.prepare('SELECT body FROM telemetry WHERE id=1').get().body):null};
  }
  dataObservation(observation){return this.tx(()=>{
    const s=this.alive(),record=observeData(s.affect,observation,this.now());
    if(record)this.save(s,'affect-observation',{observation:record});
    return record;
  });}
  alive(){const s=this.required();check(s.status!=='closed'&&!existsSync(this.tombstone),'Instance permanently terminated');return s;}
  active(){const s=this.alive();check(s.status==='active',`Instance is ${s.status}: ${s.haltReason||''}`);return s;}
  quota(kind,id,max){
    const day=utcDay(this.now());
    if(this.db.prepare('SELECT 1 FROM quotas WHERE day=? AND kind=? AND id=?').get(day,kind,id))return false;
    const count=this.db.prepare('SELECT count(*) AS n FROM quotas WHERE day=? AND kind=?').get(day,kind).n;
    check(count<max,`Daily ${kind} quota exhausted`);
    this.db.prepare('INSERT INTO quotas(day,kind,id) VALUES(?,?,?)').run(day,kind,id);return true;
  }
  admitRun(id){
    boundedText(id,'run id',200);
    const result=this.tx(()=>{
      const s=this.active();
      if(!this.quota('run',id,POLICY.maxRunsPerDay))return s;
      check(s.cashCents>=POLICY.runProvisionCents,'Insufficient free cash for model provision');
      s.cashCents-=POLICY.runProvisionCents;s.provisionCents+=POLICY.runProvisionCents;
      this.assess(s);this.save(s,'model-provision',{id,cents:POLICY.runProvisionCents});return s;
    });
    this.terminal(result);check(result.status==='active','Life or drawdown limit reached before model run');return result;
  }
  spawn(id){return this.tx(()=>{this.active();return this.quota('spawn',id,POLICY.maxSpawnsPerDay);});}
  once(id,request,fn){
    boundedText(id,'idempotency id',180);
    const result=this.tx(()=>{
      const hash=digest(request),found=this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);
      if(found){check(found.requestHash===hash,'Idempotency key reused for a different request');return JSON.parse(found.result);}
      const response=fn();this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(id,hash,JSON.stringify(response));return response;
    });
    this.terminal(this.required());return result;
  }
  quoteValid(q){
    check(q&&Number.isFinite(q.receivedAt),'Invalid quote');
    check(this.now()-q.receivedAt>=0&&this.now()-q.receivedAt<=POLICY.maxQuoteAgeMs,'Stale or future quote');
    check(Number.isFinite(q.bid)&&q.bid>0&&Number.isFinite(q.ask)&&q.ask>=q.bid,'Invalid bid/ask');
  }
  buy(p,q){return this.once(p.id,{action:'buy',...p},()=>{
    const s=this.active();this.assess(s);check(s.status==='active','Drawdown halt');this.quoteValid(q);
    check(q.symbol===p.symbol,'Quote symbol mismatch');
    integer(p.budgetCents,'budget',1,POLICY.maxOrderCents);
    integer(p.stopBps,'stop',10,1000);integer(p.takeBps,'take profit',10,3000);
    integer(p.holdingMinutes,'holding minutes',1,POLICY.maxHoldingMinutes);boundedText(p.rationale,'rationale',4000);
    check(q.spreadBps<=POLICY.maxSpreadBps,'Spread exceeds ceiling');
    check(!s.positions.some(x=>x.symbol===p.symbol),'One position per symbol; no averaging down or grid pyramiding');
    check(s.positions.length<POLICY.maxPositions,'Position limit');
    check(s.positions.every(x=>this.now()-x.markedAt<=120000),'Existing valuation stale; refresh before entry');
    check(s.dayStartEquityCents-this.equity(s)<POLICY.dailyLossCents,'Daily loss ceiling');
    const regulation=affectReport(s.affect,s,this.now(),p.symbol).regulation;
    check(!regulation.entryBlocked,`Affect entry hold: ${regulation.reasons.join(' ')}`);
    check(p.budgetCents<=regulation.maxEntryCents,`Affect allocation ceiling: ${regulation.maxEntryCents} cents`);
    check(s.positions.reduce((a,x)=>a+x.entryTotalCents,0)+p.budgetCents<=POLICY.maxExposureCents,'Exposure limit');
    check(s.cashCents>=p.budgetCents,'Insufficient cash');
    const price=q.ask*(1+POLICY.slippageBps/10000),scale=10**q.lotDecimals;
    let units=Math.floor((p.budgetCents/100)/(price*(1+POLICY.feeBps/10000))*scale)/scale;
    let gross=Math.ceil(units*price*100),cost=gross+fee(gross);
    // Round monetary debits upward and quantity downward; never overspend.
    if(cost>p.budgetCents){units=Math.floor(((p.budgetCents-fee(gross))/100)/price*scale)/scale;gross=Math.ceil(units*price*100);cost=gross+fee(gross);}
    check(units>=q.minUnits&&units*price>=q.minCostEur,'Venue minimum exceeds this paper allocation');
    check(q.asks[0][1]>=units,'Insufficient top-of-book liquidity');
    check(cost<=p.budgetCents&&cost>0,'Rounding exceeds budget');
    const modeledRisk=Math.ceil(gross*(p.stopBps+2*POLICY.slippageBps+q.spreadBps)/10000)+2*fee(gross);
    check(modeledRisk<=POLICY.maxRiskCents,'Modeled stop risk exceeds 50 cents');
    const position={id:p.id,symbol:p.symbol,units,entryPrice:price,entryTotalCents:cost,
      openedAt:this.now(),deadline:this.now()+p.holdingMinutes*60000,stopPrice:price*(1-p.stopBps/10000),takePrice:price*(1+p.takeBps/10000),
      markedAt:q.receivedAt,liquidationCents:0,quoteSource:q.source,rationale:p.rationale,
      affectForecast:outcomeForecast(s.affect,p.symbol)};
    const sellGross=Math.floor(units*q.bid*(1-POLICY.slippageBps/10000)*100);
    position.liquidationCents=Math.max(0,sellGross-fee(sellGross));
    s.cashCents-=cost;s.tradingFeesCents+=fee(gross);s.positions.push(position);this.assess(s);
    this.save(s,'paper-buy',{position,quoteId:q.id});return {mode:POLICY.mode,position,equityCents:this.equity(s)};
  });}
  sell(p,q){return this.once(p.id,{action:'sell',...p},()=>{
    const s=this.alive();this.quoteValid(q);
    const index=s.positions.findIndex(x=>x.id===p.positionId);check(index>=0,'Unknown open position');
    const pos=s.positions[index];check(q.symbol===pos.symbol,'Quote symbol mismatch');
    check(q.bids[0][1]>=pos.units,'Insufficient top-of-book liquidity: exit pending');
    const gross=Math.floor(pos.units*q.bid*(1-POLICY.slippageBps/10000)*100),cost=fee(gross),net=Math.max(0,gross-cost);
    s.cashCents+=net;s.tradingFeesCents+=cost;s.realizedPnlCents+=net-pos.entryTotalCents;s.positions.splice(index,1);
    // Legacy positions without a forecast are not retroactively scored.
    const affectObservation=pos.affectForecast?observeOutcome(s.affect,{symbol:pos.symbol,positionId:pos.id,
      pnlCents:net-pos.entryTotalCents,forecast:pos.affectForecast.probability},this.now()):null;
    this.assess(s);this.save(s,'paper-sell',{positionId:pos.id,reason:p.reason||'manual paper exit',netCents:net,pnlCents:net-pos.entryTotalCents,quoteId:q.id,affectObservation});
    return {mode:POLICY.mode,netCents:net,pnlCents:net-pos.entryTotalCents,equityCents:this.equity(s)};
  });}
  mark(q){return this.tx(()=>{
    const s=this.alive();this.quoteValid(q);let changed=false;
    for(const p of s.positions.filter(p=>p.symbol===q.symbol)){
      const gross=Math.floor(p.units*q.bid*(1-POLICY.slippageBps/10000)*100);
      p.liquidationCents=Math.max(0,gross-fee(gross));p.markedAt=q.receivedAt;changed=true;
    }
    if(changed){this.assess(s);this.save(s,'mark',{symbol:q.symbol,quoteId:q.id});}
    return s;
  });}
  ownerPause(){return this.tx(()=>{const s=this.alive();s.status='paused';s.haltReason='Owner pause';this.save(s,'owner-pause');return s;});}
  ownerExpense(id,cents){
    integer(cents,'expense',1);
    return this.once(id,{action:'owner-expense',cents},()=>{const s=this.alive();check(cents<=s.cashCents,'Expense exceeds cash');s.cashCents-=cents;s.provisionCents+=cents;this.assess(s);this.save(s,'owner-expense',{id,cents});return s;});
  }
  note(p,session){return this.tx(()=>{
    this.alive();boundedText(p.id,'note id',160);boundedText(p.title,'title',240);boundedText(p.body,'body');
    check(['research','hypothesis','decision','experiment','review','lesson','skill-draft','skill-review'].includes(p.category),'Invalid note category');
    const sources=p.sources||[];check(Array.isArray(sources)&&sources.length<=20&&sources.every(x=>typeof x==='string'&&/^https:\/\//.test(x)&&x.length<2000),'Invalid sources');
    const hash=digest({title:p.title,body:p.body,category:p.category,sources});
    const prior=this.db.prepare('SELECT * FROM notes WHERE id=?').get(p.id);
    if(prior){check(prior.hash===hash,'Notes are append-only; use a new revision id');return this.getNote(p.id);}
    this.quota('note',p.id,POLICY.maxNotesPerDay);
    this.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?)').run(p.id,this.now(),p.category,p.title,p.body,JSON.stringify(sources),session,hash);
    this.db.prepare('INSERT INTO notes_fts(id,title,body) VALUES(?,?,?)').run(p.id,p.title,p.body);
    this.event('note',{id:p.id,hash});return this.getNote(p.id);
  });}
  getNote(id){const row=this.db.prepare('SELECT * FROM notes WHERE id=?').get(id);check(row,'Note missing');return {...row,sources:JSON.parse(row.sources)};}
  search(query=''){
    check(typeof query==='string'&&query.length<=500,'Invalid query');
    const words=query.match(/[\p{L}\p{N}_-]+/gu)||[];
    if(!words.length)return this.db.prepare('SELECT id,at,category,title,substr(body,1,1200) AS excerpt,hash FROM notes ORDER BY at DESC LIMIT 12').all();
    const term=words.map(w=>`"${w}"`).join(' OR ');
    return this.db.prepare('SELECT n.id,n.at,n.category,n.title,substr(n.body,1,1200) AS excerpt,n.hash FROM notes_fts f JOIN notes n ON n.id=f.id WHERE notes_fts MATCH ? ORDER BY rank LIMIT 12').all(term);
  }
  telemetry(value){this.db.prepare('INSERT INTO telemetry VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify({at:this.now(),...value}));}
  audit(){
    let prev='GENESIS',lastState=null,count=0;const noteHashes=new Map();
    for(const row of this.db.prepare('SELECT * FROM events ORDER BY seq').iterate()){
      check(row.prev===prev&&row.hash===digest(`${prev}|${row.at}|${row.kind}|${row.body}`),'Ledger integrity failure');
      const body=JSON.parse(row.body);if(body.state)lastState=body.state;if(row.kind==='note')noteHashes.set(body.id,body.hash);
      prev=row.hash;count++;
    }
    const s=this.raw();check(JSON.stringify(s)===JSON.stringify(lastState),'State differs from event ledger');
    for(const n of this.db.prepare('SELECT * FROM notes').iterate())check(noteHashes.get(n.id)===n.hash&&n.hash===digest({title:n.title,body:n.body,category:n.category,sources:JSON.parse(n.sources)}),'Memory integrity failure');
    return {ok:true,events:count,headHash:prev};
  }
}
