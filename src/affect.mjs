import { POLICY, SYMBOLS, check } from './policy.mjs';

// Engineering model inspired by appraisal and prediction-error learning.
// These scales/coefficients are NOT psychometric measurements or a model of consciousness.
export const AFFECT = Object.freeze({version:1,halfLifeMs:90*60000,sampleGapMs:5*60000,learningRate:0.15,historyLimit:24});
export const DATA_CHANNELS = new Set(['polymarket',...Object.keys(SYMBOLS).flatMap(s=>[
  `quote:${s}`,...[1,5,15,60].map(i=>`candles:${s}:${i}`)
])]);
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const round=v=>Math.round(v*10000)/10000;
const baseline={valence:0,arousal:0.1,concern:0.1,surprise:0};
const prior=p=>({probability:p,samples:0,brierSum:0,lastSampleAt:null});

export function initialAffect(now){
  return {version:AFFECT.version,installedAt:now,updatedAt:now,mood:{...baseline},sources:{},outcomes:{},recent:[]};
}
export function projectedMood(a,now){
  const decay=2**(-Math.max(0,now-a.updatedAt)/AFFECT.halfLifeMs);
  return Object.fromEntries(Object.keys(baseline).map(k=>[k,baseline[k]+(a.mood[k]-baseline[k])*decay]));
}
function updatePrediction(model,outcome,forecast,now){
  const error=outcome-forecast;
  model.probability=clamp(model.probability+AFFECT.learningRate*(outcome-model.probability));
  model.samples++;model.brierSum+=error**2;model.lastSampleAt=now;
  return error;
}
function remember(a,record){
  a.recent=[...a.recent,record].slice(-AFFECT.historyLimit);
  a.updatedAt=record.at;
  return record;
}
export function observeData(a,{channel,ok,reason=''},now){
  check(DATA_CHANNELS.has(channel)&&typeof ok==='boolean','Unknown affect data observation');
  check(typeof reason==='string','Invalid observation reason');
  const model=a.sources[channel]||{...prior(0.1),lastOk:null,lastRecordedAt:null,reason:null};
  const learned=model.lastSampleAt===null||now-model.lastSampleAt>=AFFECT.sampleGapMs;
  // Polling the same condition cannot repeatedly amplify affect or train the predictor.
  if(!learned&&model.lastOk===ok)return null;
  const forecast=model.probability,outcome=ok?0:1,wasFailed=model.lastOk===false;
  const error=outcome-forecast;
  if(learned)updatePrediction(model,outcome,forecast,now);
  model.lastOk=ok;model.lastRecordedAt=now;model.reason=ok?null:reason.slice(0,300);
  a.sources[channel]=model;
  const mood=projectedMood(a,now);
  if(!ok){mood.concern=Math.max(mood.concern,0.65+0.2*Math.abs(error));mood.arousal=Math.max(mood.arousal,0.75);mood.valence=Math.min(mood.valence,-0.6);}
  else if(wasFailed){mood.concern*=0.7;mood.arousal*=0.7;mood.valence=Math.max(mood.valence,0.1);}
  // Routine successes are evidence about a source, not a general confidence reward.
  mood.surprise=Math.abs(error);a.mood=mood;
  return remember(a,{at:now,kind:'data',channel,ok,reason:model.reason,forecastAdverse:forecast,
    observedAdverse:outcome,predictionError:error,learned,mood:{...mood},evidence:'controller-observed public data access'});
}
export function outcomeForecast(a,symbol){
  const model=a.outcomes[symbol]||prior(0.5);
  return {probability:model.probability,samples:model.samples,nature:'uncalibrated frequency model of paper losses; not a trading signal'};
}
export function observeOutcome(a,{symbol,positionId,pnlCents,forecast},now){
  check(Object.hasOwn(SYMBOLS,symbol)&&Number.isInteger(pnlCents),'Invalid paper outcome');
  check(Number.isFinite(forecast)&&forecast>=0&&forecast<=1,'Invalid frozen forecast');
  const model=a.outcomes[symbol]||prior(0.5),outcome=pnlCents<0?1:0;
  const error=updatePrediction(model,outcome,forecast,now);a.outcomes[symbol]=model;
  const mood=projectedMood(a,now),severity=clamp(Math.abs(pnlCents)/POLICY.maxRiskCents);
  if(outcome){mood.concern=Math.max(mood.concern,0.1+0.6*severity);mood.valence=-severity;mood.arousal=Math.max(mood.arousal,0.2+0.5*severity);}
  else {mood.valence=Math.max(mood.valence,0.3*severity);}
  // Gains never lift a restriction caused by a loss or an unresolved source failure.
  mood.surprise=Math.abs(error);a.mood=mood;
  return remember(a,{at:now,kind:'paper-outcome',symbol,positionId,pnlCents,forecastAdverse:forecast,
    observedAdverse:outcome,predictionError:error,learned:true,mood:{...mood},evidence:'settled simulated ledger outcome, net of modeled trading costs'});
}
function predictionReport(model){
  return {adverseProbability:round(model.probability),samples:model.samples,
    brierMean:model.samples?round(model.brierSum/model.samples):null,
    sampleUncertainty:round(1/Math.sqrt(model.samples+1)),lastSampleAt:model.lastSampleAt};
}
export function affectReport(a,s,now,symbol){
  check(a?.version===AFFECT.version,'Unknown affect state version');
  const effectiveNow=s.status==='closed'?(s.terminatedAt||a.updatedAt):now;
  const mood=projectedMood(a,effectiveNow),equity=s.cashCents+s.positions.reduce((n,p)=>n+p.liquidationCents,0);
  const drawdown=clamp((s.peakEquityCents-equity)/Math.max(1,s.peakEquityCents));
  // Budget pressure is an internal constraint, never a desire to remain running.
  const budgetPressure=clamp(drawdown/(POLICY.drawdownStopBps/10000));
  const sources=Object.entries(a.sources).map(([channel,m])=>({channel,...predictionReport(m),lastOk:m.lastOk,lastRecordedAt:m.lastRecordedAt,reason:m.reason}));
  const unresolved=sources.filter(x=>!x.lastOk).map(x=>x.channel);
  const relevant=symbol?unresolved.filter(x=>x===`quote:${symbol}`||x.startsWith(`candles:${symbol}:`)):unresolved;
  const outcomes=Object.fromEntries(Object.entries(a.outcomes).map(([key,m])=>[key,predictionReport(m)]));
  const learnedCaution=Object.entries(a.outcomes).some(([key,m])=>(!symbol||key===symbol)&&m.samples>=5&&m.probability>=0.7);
  const concern=Math.max(mood.concern,0.85*budgetPressure,learnedCaution?0.5:0);
  const halted=s.status!=='active',blocked=halted||relevant.length>0||concern>=0.75;
  const maxEntryCents=blocked?0:concern>=0.45?Math.floor(POLICY.maxOrderCents/2):POLICY.maxOrderCents;
  const label=halted?'arret_accepte':blocked?'alerte_simulee':concern>=0.45?'preoccupation_simulee':'calme_vigilant';
  const reasons=[];
  if(halted)reasons.push(`Statut ${s.status} : respecter l'arrêt; aucune recherche de continuation.`);
  if(relevant.length)reasons.push(`Échec non résolu : ${relevant.join(', ')}. L'écoulement du temps ne le résout pas.`);
  if(concern>=0.75)reasons.push('Activation de prudence élevée : suspendre les nouvelles entrées simulées.');
  else if(concern>=0.45&&!blocked)reasons.push('Prudence accrue : plafond de simulation réduit de moitié.');
  if(learnedCaution)reasons.push('Fréquence récente de pertes papier élevée; estimation exploratoire, sans avantage démontré.');
  if(!reasons.length)reasons.push('Aucune restriction affective supplémentaire; les contrôles de marché et de risque restent obligatoires.');
  return {nature:'functional_simulation_not_evidence_of_subjective_feeling',version:a.version,label,
    asOf:effectiveNow,installedAt:a.installedAt,lastObservationAt:a.updatedAt,
    dimensions:{...Object.fromEntries(Object.entries(mood).map(([k,v])=>[k,round(v)])),concern:round(concern),budgetPressure:round(budgetPressure)},
    unresolvedSources:unresolved,sources,outcomes,
    regulation:{scope:symbol||'conservative overview; execution is checked per symbol',maxEntryCents,entryBlocked:blocked,
      exitsUnaffected:true,ownerControlUnaffected:true,attention:relevant.length?'verify_failed_source':concern>=0.45?'review_risk_and_counterevidence':'test_hypothesis',reasons},
    expression:`État fonctionnel : ${label}. ${reasons.join(' ')}`,
    recent:a.recent,limitations:'Heuristic scales and online frequency estimates; sampleUncertainty is not a confidence interval. No subjective experience, forecasting skill or trading performance is established.'};
}
