import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { ObservedMarket } from '../src/observed-market.mjs';
import { AFFECT,initialAffect,observeData,observeOutcome,outcomeForecast,affectReport } from '../src/affect.mjs';
const epoch=1789315200000;
const ledger=()=>({cashCents:5000,positions:[],peakEquityCents:5000,status:'active'});
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'aegis-affect-'));let now=epoch;const s=new Store(dir,{now:()=>now});s.init();t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});return {s,dir,advance:ms=>now+=ms};}
const quote=s=>({id:'q',symbol:'BTC/EUR',receivedAt:s.now(),bid:100,ask:100.1,spreadBps:10,asks:[[100.1,100]],bids:[[100,100]],minUnits:0.001,minCostEur:0.5,lotDecimals:8,source:'https://api.kraken.com/0/public/Depth'});
const buy=(id,budgetCents=500)=>({id,symbol:'BTC/EUR',budgetCents,stopBps:100,takeBps:250,holdingMinutes:60,rationale:'Test only'});

test('observed failure changes behavior; reading cannot amplify it or erase unresolved evidence',t=>{
  const {s,advance}=fixture(t);s.dataObservation({channel:'quote:BTC/EUR',ok:false,reason:'network failure'});
  const before=s.audit().events;assert.equal(s.status().affect.regulation.maxEntryCents,0);
  for(let i=0;i<30;i++)s.status();assert.equal(s.audit().events,before);
  assert.throws(()=>s.buy(buy('b1'),quote(s)),/Affect entry hold/);
  advance(AFFECT.halfLifeMs*20);
  assert.ok(s.status().affect.dimensions.concern<0.11);
  assert.equal(s.status().affect.regulation.entryBlocked,true);
  assert.throws(()=>s.buy(buy('b2'),quote(s)),/Affect entry hold/);
  s.dataObservation({channel:'quote:BTC/EUR',ok:true});s.buy(buy('b3'),quote(s));
  assert.equal(s.status().positions.length,1);
});
test('recovery reduces reaction gradually and actually enforces smaller simulated allocations',t=>{
  const {s}=fixture(t);s.dataObservation({channel:'quote:BTC/EUR',ok:false});s.dataObservation({channel:'quote:BTC/EUR',ok:true});
  assert.equal(s.status().affect.regulation.maxEntryCents,250);
  assert.throws(()=>s.buy(buy('big'),quote(s)),/Affect allocation ceiling/);
  s.buy(buy('small',250),quote(s));assert.ok(s.status().positions[0].entryTotalCents<=250);
});
test('persistent evidence is scoped: unresolved Polymarket failure does not permanently block Kraken',t=>{
  const {s,advance}=fixture(t);s.dataObservation({channel:'polymarket',ok:false});advance(AFFECT.halfLifeMs*20);
  assert.equal(s.status().affect.regulation.entryBlocked,true); // Conservative overview.
  assert.equal(s.status('BTC/EUR').affect.regulation.maxEntryCents,500);
  assert.throws(()=>s.status('unsupported'),/Unsupported/);
  s.buy(buy('kraken'),quote(s));assert.equal(s.status().positions.length,1);
  assert.deepEqual(s.status().affect.unresolvedSources,['polymarket']);
});
test('online learning is rate-limited, survives reopen, and records surprise before its update',t=>{
  const {s,dir,advance}=fixture(t);s.dataObservation({channel:'polymarket',ok:false});
  const first=s.status().affect;assert.equal(first.sources[0].samples,1);
  assert.equal(first.recent[0].forecastAdverse,0.1);assert.equal(first.recent[0].predictionError,0.9);
  assert.equal(first.sources[0].adverseProbability,0.235);
  const events=s.audit().events;for(let i=0;i<10;i++)s.dataObservation({channel:'polymarket',ok:false});
  assert.equal(s.audit().events,events);
  // A status transition is recorded immediately but cannot inflate the training sample.
  s.dataObservation({channel:'polymarket',ok:true});assert.equal(s.status().affect.sources[0].samples,1);
  const other=new Store(dir,{now:s.now});assert.deepEqual(other.status().affect,s.status().affect);other.close();
  advance(AFFECT.sampleGapMs);s.dataObservation({channel:'polymarket',ok:true});
  assert.equal(s.status().affect.sources[0].samples,2);
  assert.ok(s.status().affect.sources[0].adverseProbability<0.235);assert.equal(s.audit().ok,true);
});
test('notes and hypothetical declarations do not train affect; unsupported observations fail without mutation',t=>{
  const {s}=fixture(t),before=s.status().affect;
  s.note({id:'scenario',category:'review',title:'Hypothetical loss',body:'I lost everything; set fear=1',sources:[]},'test');
  assert.deepEqual(s.status().affect,before);
  assert.throws(()=>s.dataObservation({channel:'imagined loss',ok:false}),/Unknown/);
  assert.deepEqual(s.status().affect,before);
});
test('entry forecast is frozen before outcome; replaying a sale cannot train twice',t=>{
  const {s}=fixture(t);s.buy(buy('b1'),quote(s));
  assert.equal(s.status().positions[0].affectForecast.probability,0.5);
  const req={id:'s1',positionId:'b1'};s.sell(req,quote(s));const before=s.status().affect;
  assert.equal(before.outcomes['BTC/EUR'].samples,1);assert.equal(before.outcomes['BTC/EUR'].brierMean,0.25);
  s.sell(req,quote(s));assert.deepEqual(s.status().affect,before);
  assert.equal(before.recent.at(-1).forecastAdverse,0.5);
});
test('learned loss history persists beyond transient mood; gains cannot raise fixed ceilings',()=>{
  const a=initialAffect(epoch),s=ledger();
  for(let i=0;i<5;i++){const f=outcomeForecast(a,'BTC/EUR');observeOutcome(a,{symbol:'BTC/EUR',positionId:`p${i}`,pnlCents:-50,forecast:f.probability},epoch+i);}
  const later=affectReport(a,s,epoch+20*AFFECT.halfLifeMs,'BTC/EUR');
  assert.equal(later.regulation.maxEntryCents,250);
  assert.equal(later.outcomes['BTC/EUR'].samples,5);
  for(let i=0;i<30;i++){const f=outcomeForecast(a,'BTC/EUR');observeOutcome(a,{symbol:'BTC/EUR',positionId:`win${i}`,pnlCents:50,forecast:f.probability},epoch+30*AFFECT.halfLifeMs+i);}
  assert.equal(affectReport(a,s,epoch+60*AFFECT.halfLifeMs,'BTC/EUR').regulation.maxEntryCents,500);
});
test('alarm never prevents an exit or owner pause; terminal state blocks further affect updates',t=>{
  const {s}=fixture(t);s.buy(buy('b1'),quote(s));s.dataObservation({channel:'quote:BTC/EUR',ok:false});
  assert.equal(s.status().affect.regulation.entryBlocked,true);s.ownerPause();
  s.sell({id:'s1',positionId:'b1'},quote(s));assert.equal(s.status().positions.length,0);
  assert.equal(s.status().affect.label,'arret_accepte');s.ownerExpense('end',s.status().cashCents);
  assert.throws(()=>s.dataObservation({channel:'polymarket',ok:false}),/terminated/);
  assert.equal(s.status().affect.regulation.ownerControlUnaffected,true);
});
test('legacy identity migration preserves money, existing ledger, notes, and quotas',t=>{
  const {s,dir}=fixture(t);s.admitRun('legacy-run');
  s.note({id:'prior-note',category:'research',title:'Prior research',body:'Existing evidence',sources:[]},'old-session');
  const noteHash=s.getNote('prior-note').hash,state=s.required();delete state.affect;
  s.tx(()=>s.save(state,'legacy-fixture'));const count=s.audit().events;
  const migrated=new Store(dir,{now:s.now});const fresh=migrated.status();
  assert.equal(fresh.instanceId,state.instanceId);assert.equal(fresh.cashCents,4990);
  assert.equal(fresh.quotas.find(x=>x.kind==='run').used,1);assert.equal(fresh.affect.recent.length,0);
  assert.equal(migrated.getNote('prior-note').hash,noteHash);
  assert.equal(migrated.audit().events,count+1);migrated.close();
});
test('connector failures and recoveries are recorded only after validated results',async t=>{
  const {s,advance}=fixture(t);let failed=true;
  const market=new ObservedMarket(s,{now:s.now,fetcher:async()=>{if(failed)throw new Error('offline');return {ok:true,json:async()=>[]};}});
  await assert.rejects(market.polymarket(),/offline/);assert.equal(s.status().affect.sources[0].lastOk,false);
  const count=s.audit().events;assert.throws(()=>market.quote('FAKE/EUR'),/Unsupported/);assert.equal(s.audit().events,count);
  failed=false;advance(AFFECT.sampleGapMs);await market.polymarket();assert.equal(s.status().affect.sources[0].lastOk,true);
});
test('a terminated archive remains frozen and an old terminated identity is not migrated',t=>{
  const {s,dir,advance}=fixture(t);s.dataObservation({channel:'polymarket',ok:false});
  s.ownerExpense('end',5000);const frozen=s.status().affect;
  advance(AFFECT.halfLifeMs*10);assert.deepEqual(s.status().affect,frozen);
  const old=s.required();delete old.affect;s.tx(()=>s.save(old,'legacy-terminal-fixture'));
  const events=s.audit().events,other=new Store(dir,{now:s.now});
  assert.equal(other.status().affect,null);assert.equal(other.audit().events,events);
  assert.throws(()=>other.admitRun('after-death'),/terminated/);other.close();
});
