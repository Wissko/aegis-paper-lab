// Pure, deterministic counterfactual demonstration. No Store, network, model,
// orders or real runtime identity is opened or modified by this script.
import { AFFECT,initialAffect,observeData,observeOutcome,affectReport } from '../src/affect.mjs';
const start=Date.UTC(2026,8,13),a=initialAffect(start);
const s={cashCents:5000,positions:[],peakEquityCents:5000,status:'active'};
const stages=[];
function record(scenario,at){const r=affectReport(a,s,at,'BTC/EUR');stages.push({scenario,minutes:(at-start)/60000,label:r.label,concern:r.dimensions.concern,maxEntryCents:r.regulation.maxEntryCents,sourceFailureEstimate:r.sources[0]?.adverseProbability??null,reason:r.regulation.reasons});}
record('État initial',start);
observeData(a,{channel:'quote:BTC/EUR',ok:false,reason:'PANNE FICTIVE'},start);record('Panne inattendue',start);
record('90 min sans preuve de rétablissement',start+AFFECT.halfLifeMs);
observeData(a,{channel:'quote:BTC/EUR',ok:true},start+AFFECT.halfLifeMs);record('Source rétablie et vérifiée',start+AFFECT.halfLifeMs);
observeOutcome(a,{symbol:'BTC/EUR',positionId:'fiction-only',pnlCents:-50,forecast:0.1},start+AFFECT.halfLifeMs+60000);record('Perte papier fictive sous-estimée',start+AFFECT.halfLifeMs+60000);
s.status='paused';record('Arrêt demandé par le propriétaire',start+AFFECT.halfLifeMs+120000);
console.log(JSON.stringify({nature:'SYNTHETIC_SCENARIOS_NO_REAL_OBSERVATIONS',note:'No live state or capital is used. Numbers are engineering choices, not measured human feelings.',stages},null,2));
