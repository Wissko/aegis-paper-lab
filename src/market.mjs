import { randomUUID } from 'node:crypto';
import { POLICY, SYMBOLS, check, positive, integer } from './policy.mjs';

// Only public GET endpoints. No credentials, arbitrary URLs, private API or order API.
export class Market {
  constructor({fetcher=fetch, now=Date.now}={}) { this.fetcher=fetcher; this.now=now; this.cache=new Map(); }
  async get(url, ttl=0) {
    const cached=this.cache.get(url);
    if(cached && this.now()-cached.at<ttl) return cached.value;
    const response=await this.fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Accept':'application/json','User-Agent':'Aegis-Paper-Research/1.0'}});
    check(response.ok,`Public data HTTP ${response.status}`);
    const data=await response.json();
    check(!data.error?.length, `Public data error: ${JSON.stringify(data.error)}`);
    if(ttl) this.cache.set(url,{at:this.now(),value:data});
    return data;
  }
  pair(symbol) { check(Object.hasOwn(SYMBOLS,symbol),'Unsupported paper instrument'); return SYMBOLS[symbol]; }
  async quote(symbol) {
    const pair=this.pair(symbol);
    const started=this.now();
    const source=`https://api.kraken.com/0/public/Depth?pair=${pair}&count=10`;
    const [book, meta]=await Promise.all([
      this.get(source), this.get(`https://api.kraken.com/0/public/AssetPairs?pair=${pair}`,86400000)
    ]);
    check(this.now()-started<POLICY.maxQuoteAgeMs,'Data request too slow');
    const b=Object.values(book.result)[0], m=Object.values(meta.result)[0];
    check(Array.isArray(b?.asks) && Array.isArray(b?.bids),'Invalid order book');
    const asks=b.asks.map(x=>[positive(Number(x[0]),'ask'),positive(Number(x[1]),'ask size')]);
    const bids=b.bids.map(x=>[positive(Number(x[0]),'bid'),positive(Number(x[1]),'bid size')]);
    check(asks.length && bids.length && asks[0][0]>=bids[0][0],'Crossed or empty book');
    const lotDecimals=integer(m.lot_decimals,'lot decimals',0,10);
    return {id:randomUUID(),symbol,source,receivedAt:this.now(),timestampKind:'local HTTP receipt; not an exchange event timestamp',
      bid:bids[0][0],ask:asks[0][0],bids,asks,lotDecimals,
      minUnits:positive(Number(m.ordermin),'minimum units'),minCostEur:positive(Number(m.costmin ?? 0.5),'minimum cost'),
      spreadBps:(asks[0][0]/bids[0][0]-1)*10000};
  }
  async candles(symbol, interval=5) {
    check([1,5,15,60].includes(interval),'Unsupported interval');
    const source=`https://api.kraken.com/0/public/OHLC?pair=${this.pair(symbol)}&interval=${interval}`;
    const data=await this.get(source,30000);
    const rows=Object.entries(data.result).find(([k])=>k!=='last')?.[1];
    check(Array.isArray(rows) && rows.length>2,'OHLC unavailable');
    // Kraken includes the still-open final candle: always discard it.
    const bars=rows.slice(0,-1).map(r=>({time:integer(Number(r[0])*1000,'bar timestamp',1),open:positive(Number(r[1]),'open'),high:positive(Number(r[2]),'high'),low:positive(Number(r[3]),'low'),close:positive(Number(r[4]),'close'),volume:Number(r[6])}));
    check(bars.every((b,i)=>Number.isFinite(b.volume)&&b.volume>=0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.high>=b.low&&(!i||b.time>bars[i-1].time)),'Malformed candles');
    return {symbol,interval,source,receivedAt:this.now(),bars};
  }
  async polymarket() {
    const source='https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=30&order=volume24hr&ascending=false';
    const data=await this.get(source,60000);
    check(Array.isArray(data),'Invalid Gamma response');
    const decode=x=>{try{return typeof x==='string'?JSON.parse(x):x;}catch{return null;}};
    return {mode:'RESEARCH_ONLY',source,receivedAt:this.now(),currency:'USD-denominated; never mixed with EUR ledger',
      restrictedCountryNotice:'France is restricted. No circumvention or real execution is implemented.',
      markets:data.map(m=>({id:m.id,question:m.question,slug:m.slug,endDate:m.endDate,restricted:m.restricted,
        outcomes:decode(m.outcomes),indicativePrices:decode(m.outcomePrices),volume24hr:m.volume24hr,liquidity:m.liquidityNum,
        description:String(m.description||'').slice(0,1600)}))};
  }
}
