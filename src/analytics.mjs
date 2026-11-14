import { POLICY, check } from './policy.mjs';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sd=a=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
export function features(bars) {
  check(bars.length>=60,'At least 60 closed bars required');
  const c=bars.map(b=>b.close), returns=c.slice(1).map((v,i)=>Math.log(v/c[i]));
  const last=c.at(-1), fast=mean(c.slice(-10)),slow=mean(c.slice(-30));
  const band=mean(c.slice(-20)),vol=sd(c.slice(-20));
  const moves=c.slice(-15).slice(1).map((v,i)=>v-c.slice(-15)[i]);
  const up=mean(moves.map(x=>Math.max(x,0))),down=mean(moves.map(x=>Math.max(-x,0)));
  const atr=mean(bars.slice(-14).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[bars.length-15+i].close),Math.abs(b.low-bars[bars.length-15+i].close))));
  return {last,fastMean:fast,slowMean:slow,rsi14:down===0?(up===0?50:100):100-100/(1+up/down),atr14:atr,
    zscore20:vol?(last-band)/vol:0,realizedVolatilityBps:sd(returns.slice(-60))*10000,
    regime:Math.abs(fast/slow-1)<0.002?'range':fast>slow?'uptrend':'downtrend'};
}
const rules={
  momentum:f=>f.regime==='uptrend'&&f.rsi14<75,
  reversion:f=>f.zscore20<-1.5&&f.rsi14<40&&f.regime!=='downtrend'
};
// Experimental baselines only. Train on earlier bars, evaluate on untouched later bars.
function simulate(bars, rule, from, to, horizon) {
  const outcomes=[]; let index=from;
  while(index+horizon<to) {
    const f=features(bars.slice(index-60,index)); // Information strictly before entry open.
    if(!rule(f)){index++;continue;}
    const entry=bars[index].open,exit=bars[index+horizon].open;
    outcomes.push((exit/entry-1)*10000-2*(POLICY.feeBps+POLICY.slippageBps)-POLICY.maxSpreadBps);
    index+=horizon+1;
  }
  let equity=1,peak=1,maxDrawdown=0;
  for(const bps of outcomes){equity*=1+bps/10000;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,1-equity/peak);}
  return {trades:outcomes.length,meanNetBps:outcomes.length?mean(outcomes):null,winRate:outcomes.length?outcomes.filter(x=>x>0).length/outcomes.length:null,compoundedReturn:equity-1,maxDrawdown};
}
export function walkForward(dataset, horizon=6) {
  check(dataset.bars.length>=240,'At least 240 closed bars required for split');
  const split=Math.floor(dataset.bars.length*0.65),bars=dataset.bars;
  check(Number.isInteger(horizon)&&horizon>=1&&horizon*dataset.interval<=360,'Invalid holding horizon');
  const train=Object.entries(rules).map(([name,rule])=>({name,...simulate(bars,rule,60,split,horizon)}));
  train.sort((a,b)=>(b.meanNetBps??-Infinity)-(a.meanNetBps??-Infinity));
  const selected=train[0].name,test=simulate(bars,rules[selected],split,bars.length,horizon);
  return {symbol:dataset.symbol,source:dataset.source,interval:dataset.interval,horizonBars:horizon,
    training:train,selected,holdout:test,splitTime:bars[split].time,
    evidence:test.trades<20?'INSUFFICIENT_SAMPLE':test.meanNetBps>0?'EXPLORATORY_POSITIVE':'NO_EDGE',
    features:features(bars),limitations:['Historical study, not a forecast or validated investment strategy','Limited recent candle window from public endpoint','Fees/spread/slippage assumptions, no intrabar stop or queue simulation','Training selects between two baselines; forward validation still required']};
}
