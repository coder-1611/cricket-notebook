const e=require("/Users/sohamsthitpragya/Projects/cricket-notebook-game/engine.js");
const {India,Australia,FORMATS}=require("/Users/sohamsthitpragya/Projects/cricket-notebook-game/teams.js");
const fs=require("fs");
const BUDGET_MS = 27000, MAX = 1000000;

function blankBat(){return{inns:0,no:0,runs:0,balls:0,f4:0,f6:0,hs:0,hsNo:false,fifties:0,hundreds:0,dism:0,ducks:0};}
function blankBowl(){return{balls:0,runs:0,wkts:0,inns:0,bestW:-1,bestR:0,fourW:0,fiveW:0};}

function run(format){
  const bat={}, bowl={};
  let topBat={runs:-1}, bestBowl={w:-1,r:0}, hiTot={total:-1};
  let seeds=0; const t0=Date.now();
  for(let sd=1;sd<=MAX;sd++){
    if((sd&1023)===0 && Date.now()-t0>BUDGET_MS) break;
    const m=e.simulateMatch(India,Australia,{seed:sd,format,stadium:"x"});
    seeds=sd;
    for(const inn of m.innings){
      if(inn.total>hiTot.total) hiTot={team:inn.team,total:inn.total,wkts:inn.wickets,overs:inn.oversDecimal,seed:sd};
      for(const c of inn.cards){
        if(!(c.balls>0||c.out)) continue;
        const b=bat[c.name]||(bat[c.name]=blankBat());
        b.inns++; b.runs+=c.runs; b.balls+=c.balls; b.f4+=c.fours; b.f6+=c.sixes;
        if(c.out) b.dism++; else b.no++;
        if(c.duck) b.ducks++;
        if(c.runs>=100) b.hundreds++; else if(c.runs>=50) b.fifties++;
        if(c.runs>b.hs || (c.runs===b.hs && !c.out && !b.hsNo)){ b.hs=c.runs; b.hsNo=!c.out; b.hsBalls=c.balls; }
        if(c.runs>topBat.runs){ topBat={name:c.name,team:inn.team,runs:c.runs,balls:c.balls,no:!c.out,f4:c.fours,f6:c.sixes,seed:sd}; }
      }
      for(const bs of inn.bowlerStats){
        if(bs.balls===0 && bs.wickets===0) continue;
        const w=bowl[bs.name]||(bowl[bs.name]=blankBowl());
        w.balls+=bs.balls; w.runs+=bs.runs; w.wkts+=bs.wickets; w.inns++;
        if(bs.wickets>=5) w.fiveW++; else if(bs.wickets>=4) w.fourW++;
        if(bs.wickets>bs.bestW || (bs.wickets===w.bestW && bs.runs<w.bestR)){}
        if(bs.wickets>w.bestW || (bs.wickets===w.bestW && bs.runs<w.bestR)){ w.bestW=bs.wickets; w.bestR=bs.runs; }
        if(bs.wickets>bestBowl.w || (bs.wickets===bestBowl.w && bs.runs<bestBowl.r)){ bestBowl={name:bs.name,team:inn.team,w:bs.wickets,r:bs.runs,overs:Math.floor(bs.balls/6)+"."+(bs.balls%6),seed:sd}; }
      }
    }
  }
  const elapsed=(Date.now()-t0)/1000;
  // leaderboards
  const orange=Object.entries(bat).map(([name,b])=>({name,inns:b.inns,no:b.no,runs:b.runs,balls:b.balls,
    hs:b.hs+(b.hsNo?"*":""),avg:b.dism?+(b.runs/b.dism).toFixed(1):null,sr:+(b.runs/b.balls*100).toFixed(1),
    h:b.hundreds,f:b.fifties,f4:b.f4,f6:b.f6,ducks:b.ducks})).sort((a,b)=>b.runs-a.runs);
  const purple=Object.entries(bowl).map(([name,w])=>({name,inns:w.inns,overs:Math.round(w.balls/6),
    runs:w.runs,wkts:w.wkts,best:w.bestW+"/"+w.bestR,avg:w.wkts?+(w.runs/w.wkts).toFixed(1):null,
    econ:+(w.runs/(w.balls/6)).toFixed(2),sr:w.wkts?+(w.balls/w.wkts).toFixed(1):null,fourW:w.fourW,fiveW:w.fiveW})).sort((a,b)=>b.wkts-a.wkts||a.avg-b.avg);
  return {format:format.key,seeds,elapsed,topBat,bestBowl,hiTot,orange,purple};
}

const out={T20:run(FORMATS.T20),ODI:run(FORMATS.ODI)};
fs.writeFileSync("/private/tmp/claude-501/-Users-sohamsthitpragya-Projects/27c9b7e2-0153-4a40-b9d3-6902c9870cf5/scratchpad/records.json",JSON.stringify(out));

for(const k of ["T20","ODI"]){
  const r=out[k];
  console.log("\n===== "+k+" — seeds 1.."+r.seeds.toLocaleString()+"  ("+r.elapsed.toFixed(1)+"s) =====");
  console.log("BEST BATTING : "+r.topBat.runs+(r.topBat.no?"*":"")+" ("+r.topBat.balls+"b, "+r.topBat.f4+"x4 "+r.topBat.f6+"x6) — "+r.topBat.name+" ["+r.topBat.team+"], seed "+r.topBat.seed);
  console.log("BEST BOWLING : "+r.bestBowl.w+"/"+r.bestBowl.r+" ("+r.bestBowl.overs+" ov) — "+r.bestBowl.name+" ["+r.bestBowl.team+"], seed "+r.bestBowl.seed);
  console.log("HIGHEST TOTAL: "+r.hiTot.total+"/"+r.hiTot.wkts+" ("+r.hiTot.overs+" ov) — "+r.hiTot.team+", seed "+r.hiTot.seed);
  console.log("\n🟠 ORANGE CAP (top run-scorers)");
  console.log("  Player            Inns  Runs   HS    Avg    SR    100 50  4s   6s");
  r.orange.slice(0,6).forEach(p=>console.log("  "+p.name.padEnd(17)+String(p.inns).padStart(5)+String(p.runs).padStart(7)+String(p.hs).padStart(6)+String(p.avg).padStart(7)+String(p.sr).padStart(7)+String(p.h).padStart(5)+String(p.f).padStart(3)+String(p.f4).padStart(5)+String(p.f6).padStart(5)));
  console.log("\n🟣 PURPLE CAP (top wicket-takers)");
  console.log("  Player            Inns  Ov     Wkts  Best   Avg   Econ  SR    5W");
  r.purple.slice(0,6).forEach(p=>console.log("  "+p.name.padEnd(17)+String(p.inns).padStart(5)+String(p.overs).padStart(7)+String(p.wkts).padStart(6)+String(p.best).padStart(7)+String(p.avg).padStart(7)+String(p.econ).padStart(7)+String(p.sr).padStart(6)+String(p.fiveW).padStart(4)));
}
