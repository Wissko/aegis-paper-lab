export class Monitor {
  constructor(store,market){this.store=store;this.market=market;this.running=false;}
  async tick(){
    if(this.running)return {skipped:'already running'};this.running=true;
    try {
      const s=this.store.status();if(s.status==='closed'){this.stop();return {stopped:'terminated'};}
      const results=[];
      // Exits remain monitored while the research agent is paused.
      for(const pos of s.positions){
        try {
          const q=await this.market.quote(pos.symbol);const state=this.store.mark(q);
          const reasons=[];
          if(this.store.now()>=pos.deadline)reasons.push('max-holding');
          if(q.bid<=pos.stopPrice)reasons.push('stop-loss');
          if(q.bid>=pos.takePrice)reasons.push('take-profit');
          if(state.status==='risk_paused')reasons.push('drawdown-halt');
          if(reasons.length)results.push(this.store.sell({id:`exit:${pos.id}`,positionId:pos.id,reason:reasons.join(',')},q));
          else results.push({positionId:pos.id,marked:true});
        }catch(e){results.push({positionId:pos.id,error:e.message,exitPending:true});}
      }
      this.store.telemetry({ok:results.every(x=>!x.error),results});return results;
    }finally{this.running=false;}
  }
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(e=>this.store.telemetry({ok:false,error:e.message})),60000);this.timer.unref();}
  stop(){clearInterval(this.timer);this.timer=null;}
}
