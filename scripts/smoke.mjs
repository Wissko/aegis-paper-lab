import { Market } from '../src/market.mjs';
import { walkForward } from '../src/analytics.mjs';
const m=new Market();
for(const symbol of ['BTC/EUR','ETH/EUR','SOL/EUR']){
  const q=await m.quote(symbol),data=await m.candles(symbol),analysis=walkForward(data);
  console.log(JSON.stringify({symbol,bid:q.bid,ask:q.ask,minimumEur:q.minCostEur,minimumUnits:q.minUnits,bars:data.bars.length,study:analysis.evidence,testTrades:analysis.holdout.trades,source:q.source}));
}
try{const p=await m.polymarket();console.log(JSON.stringify({polymarket:p.markets.length,mode:p.mode}));}
catch(e){console.log(JSON.stringify({polymarket:'unavailable',error:e.message}));}
