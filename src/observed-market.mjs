import { Market } from './market.mjs';
import { check } from './policy.mjs';

// Only controller-validated connector results train affect. Free-form prose and
// invented situations cannot modify its state. Instrument failures stay scoped.
export class ObservedMarket extends Market {
  constructor(store,options={}){super(options);this.store=store;}
  async observed(channel,read){
    let value;
    try{value=await read();}
    catch(e){this.store.dataObservation({channel,ok:false,reason:e.message});throw e;}
    this.store.dataObservation({channel,ok:true});return value;
  }
  quote(symbol){this.pair(symbol);return this.observed(`quote:${symbol}`,()=>super.quote(symbol));}
  candles(symbol,interval=5){
    this.pair(symbol);check([1,5,15,60].includes(interval),'Unsupported interval');
    return this.observed(`candles:${symbol}:${interval}`,()=>super.candles(symbol,interval));
  }
  polymarket(){return this.observed('polymarket',()=>super.polymarket());}
}
