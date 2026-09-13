import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const NODES_URL = "https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_nodes.tsv";
const EDGES_URL = "https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_edges.tsv";
const ENSEMBLE_SIZE = 100;
const SWAPS_PER_EDGE = 10;

let STATE = null;
let runCounter = 0;

function nonCommentText(text){
  return text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#")).join("\n");
}
function showError(message){
  const box=document.getElementById("data-error");
  box.style.display="block";
  box.textContent=message;
}
function pairKey(a,b){ return a < b ? `${a}\t${b}` : `${b}\t${a}`; }
function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
async function loadData(){
  const [nodesText,edgesText]=await Promise.all([
    fetch(NODES_URL).then(r=>{if(!r.ok) throw new Error(`nodes: HTTP ${r.status}`); return r.text();}),
    fetch(EDGES_URL).then(r=>{if(!r.ok) throw new Error(`edges: HTTP ${r.status}`); return r.text();})
  ]);
  const nodes=d3.tsvParse(nonCommentText(nodesText));
  const rawEdges=d3.tsvParseRows(nonCommentText(edgesText)).map(([source,target])=>({source,target}));
  return {nodes,rawEdges};
}
function buildUndirected(nodes,rawEdges){
  const nodeIds=new Set(nodes.map(d=>d.node_id));
  const pairMap=new Map();
  for(const e of rawEdges){
    if(!nodeIds.has(e.source)||!nodeIds.has(e.target)||e.source===e.target) continue;
    const key=pairKey(e.source,e.target);
    if(!pairMap.has(key)) pairMap.set(key,{a:e.source,b:e.target});
  }
  const edges=[...pairMap.values()];
  const adj=new Map(nodes.map(n=>[n.node_id,new Set()]));
  for(const {a,b} of edges){adj.get(a).add(b);adj.get(b).add(a);}
  return {edges,adj};
}
function components(nodeIds,adj){
  const seen=new Set(), comps=[];
  for(const start of nodeIds){
    if(seen.has(start)) continue;
    const stack=[start], comp=[];seen.add(start);
    while(stack.length){
      const u=stack.pop();comp.push(u);
      for(const v of adj.get(u)||[]){if(!seen.has(v)){seen.add(v);stack.push(v);}}
    }
    comps.push(comp);
  }
  return comps.sort((a,b)=>b.length-a.length);
}
function inducedGraph(nodeIds,edges){
  const set=new Set(nodeIds);
  const kept=edges.filter(e=>set.has(e.a)&&set.has(e.b)).map(e=>({a:e.a,b:e.b}));
  const adj=new Map(nodeIds.map(id=>[id,new Set()]));
  for(const {a,b} of kept){adj.get(a).add(b);adj.get(b).add(a);}
  return {nodes:[...nodeIds],edges:kept,adj};
}
function localClustering(adj,node){
  const nbr=[...(adj.get(node)||[])];
  const k=nbr.length;
  if(k<2) return 0;
  let links=0;
  for(let i=0;i<k;i++) for(let j=i+1;j<k;j++) if(adj.get(nbr[i]).has(nbr[j])) links++;
  return links/(k*(k-1)/2);
}
function allLocalClustering(graph){
  const out=new Map();
  let sum=0;
  for(const node of graph.nodes){const c=localClustering(graph.adj,node);out.set(node,c);sum+=c;}
  return {values:out,mean:sum/graph.nodes.length};
}
function degreeMap(graph){return new Map(graph.nodes.map(n=>[n,graph.adj.get(n).size]));}
function cloneGraph(graph){
  const edges=graph.edges.map(e=>({a:e.a,b:e.b}));
  const adj=new Map(graph.nodes.map(n=>[n,new Set()]));
  for(const {a,b} of edges){adj.get(a).add(b);adj.get(b).add(a);}
  return {nodes:[...graph.nodes],edges,adj};
}
function degreePreservingShuffle(graph,successfulSwaps,seed){
  const g=cloneGraph(graph);
  const set=new Set(g.edges.map(e=>pairKey(e.a,e.b)));
  const rnd=mulberry32(seed);
  let success=0, tries=0;
  const maxTries=successfulSwaps*40;
  while(success<successfulSwaps && tries<maxTries){
    tries++;
    const i=Math.floor(rnd()*g.edges.length);
    let j=Math.floor(rnd()*g.edges.length);
    if(i===j) continue;
    const e1=g.edges[i],e2=g.edges[j];
    let a=e1.a,b=e1.b,c=e2.a,d=e2.b;
    if(new Set([a,b,c,d]).size<4) continue;
    if(rnd()<.5){const tmp=c;c=d;d=tmp;}
    const k1=pairKey(a,d),k2=pairKey(c,b);
    const old1=pairKey(e1.a,e1.b),old2=pairKey(e2.a,e2.b);
    if(k1===k2||set.has(k1)||set.has(k2)) continue;

    set.delete(old1);set.delete(old2);set.add(k1);set.add(k2);
    g.adj.get(e1.a).delete(e1.b);g.adj.get(e1.b).delete(e1.a);
    g.adj.get(e2.a).delete(e2.b);g.adj.get(e2.b).delete(e2.a);
    g.adj.get(a).add(d);g.adj.get(d).add(a);
    g.adj.get(c).add(b);g.adj.get(b).add(c);
    g.edges[i]={a,b:d};g.edges[j]={a:c,b};
    success++;
  }
  return {graph:g,success,tries};
}
function mean(arr){return d3.mean(arr);}
function sd(arr){return d3.deviation(arr)||0;}

function renderSetup(state){
  const {giant,realLocal,fullAdj,nodesById}=state;
  document.getElementById("m-gc").textContent=giant.nodes.length.toLocaleString();
  document.getElementById("m-edges").textContent=giant.edges.length.toLocaleString();
  document.getElementById("m-real-c").textContent=realLocal.mean.toFixed(3);
  const degrees=[...degreeMap(giant).values()].sort((a,b)=>a-b);
  const maxDegree=degrees[degrees.length-1];
  const isolates=[...fullAdj.values()].filter(s=>s.size===0).length;
  document.getElementById("degree-lock").innerHTML=`<strong>LOCK CHECK:</strong> every alternate universe keeps the same ${giant.edges.length.toLocaleString()} giant-component links, the same degree for every one of the ${giant.nodes.length} heroes, and therefore the same hub sizes. On the full 303-node graph, the ${isolates} isolates are degree-zero and would remain isolates too. Maximum giant-component degree: ${maxDegree}.`;
}

function renderHistogram(values,real){
  const host=d3.select("#null-histogram");host.selectAll("*").remove();
  const width=980,height=430,margin={top:28,right:28,bottom:60,left:70};
  const svg=host.append("svg").attr("viewBox",`0 0 ${width} ${height}`);
  const min=Math.min(d3.min(values),real),max=Math.max(d3.max(values),real);
  const pad=(max-min)*.08||.01;
  const x=d3.scaleLinear().domain([min-pad,max+pad]).nice().range([margin.left,width-margin.right]);
  const bins=d3.bin().domain(x.domain()).thresholds(18)(values);
  const y=d3.scaleLinear().domain([0,d3.max(bins,d=>d.length)||1]).nice().range([height-margin.bottom,margin.top]);
  svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format(".2f")))
    .call(g=>g.selectAll("text").attr("font-size",13).attr("font-weight",700));
  svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6))
    .call(g=>g.selectAll("text").attr("font-size",13).attr("font-weight",700));
  svg.append("g").selectAll("rect").data(bins).join("rect")
    .attr("x",d=>x(d.x0)+1).attr("y",d=>y(d.length))
    .attr("width",d=>Math.max(0,x(d.x1)-x(d.x0)-2)).attr("height",d=>y(0)-y(d.length))
    .attr("fill","#7957d5").attr("stroke","#111").attr("stroke-width",1.5);
  svg.append("line").attr("x1",x(real)).attr("x2",x(real)).attr("y1",margin.top).attr("y2",height-margin.bottom)
    .attr("stroke","#ed1d24").attr("stroke-width",5);
  svg.append("text").attr("x",Math.min(width-180,x(real)+10)).attr("y",margin.top+22)
    .attr("font-family",'Impact, "Arial Black", sans-serif').attr("font-size",18).attr("fill","#ed1d24").text(`REAL C = ${real.toFixed(3)}`);
  svg.append("text").attr("x",width/2).attr("y",height-14).attr("text-anchor","middle").attr("font-weight",900).text("AVERAGE CLUSTERING C");
  svg.append("text").attr("transform","rotate(-90)").attr("x",-height/2).attr("y",18).attr("text-anchor","middle").attr("font-weight",900).text("SHUFFLED UNIVERSES");
}
function renderBaselines(realC,nullMean,state){
  const p=2*state.giant.edges.length/(state.giant.nodes.length*(state.giant.nodes.length-1));
  const rows=[{label:"Pure chance",value:p},{label:"Hubs only",value:nullMean},{label:"Real Marvel",value:realC}];
  const max=Math.max(...rows.map(d=>d.value))*1.08;
  const host=d3.select("#baseline-bars");host.selectAll("*").remove();
  const row=host.selectAll(".baseline-row").data(rows).join("div").attr("class","baseline-row");
  row.append("div").attr("class","baseline-label").text(d=>d.label);
  const track=row.append("div").attr("class","baseline-track");
  track.append("div").attr("class","baseline-fill").style("width",d=>`${100*d.value/max}%`);
  row.append("div").attr("class","baseline-value").text(d=>d.value.toFixed(3));
}
function renderHeroLeaderboard(state,nullLocalMean){
  const degrees=degreeMap(state.giant);
  const data=state.giant.nodes.map(id=>{
    const real=state.realLocal.values.get(id);
    const expected=nullLocalMean.get(id)||0;
    return {id,name:state.nodesById.get(id)?.name||id,degree:degrees.get(id),real,expected,excess:real-expected};
  }).filter(d=>d.degree>=5).sort((a,b)=>b.excess-a.excess).slice(0,10);
  const host=d3.select("#excess-leaderboard");host.selectAll("*").remove();
  const max=d3.max(data,d=>d.excess)||1;
  const rows=host.selectAll(".excess-row").data(data).join("div").attr("class","excess-row");
  rows.append("div").attr("class","excess-name").text(d=>d.name);
  const track=rows.append("div").attr("class","excess-track");
  track.append("div").attr("class","excess-bar").style("width",d=>`${100*Math.max(0,d.excess)/max}%`);
  rows.append("div").attr("class","excess-value").text(d=>`+${d.excess.toFixed(2)}`);
  rows.on("click",function(event,d){
    rows.classed("active",x=>x.id===d.id);
    renderHeroDetail(d);
  });
  if(data.length){rows.filter((d,i)=>i===0).classed("active",true);renderHeroDetail(data[0]);}
}
function renderHeroDetail(d){
  document.getElementById("hero-detail-title").textContent=d.name;
  const ratio=d.expected>0?d.real/d.expected:null;
  document.getElementById("hero-detail").innerHTML=`
    <div class="hero-number">+${d.excess.toFixed(2)}</div>
    <p><strong>excess local clustering</strong> above this character's degree-preserving expectation.</p>
    <div class="hero-detail-grid">
      <div><span>degree</span><strong>${d.degree}</strong></div>
      <div><span>real local C</span><strong>${d.real.toFixed(3)}</strong></div>
      <div><span>shuffled mean</span><strong>${d.expected.toFixed(3)}</strong></div>
    </div>
    <p>${ratio===null?"The shuffled expectation is essentially zero.":`This neighborhood is about <strong>${ratio.toFixed(1)}×</strong> as clustered as its shuffled expectation.`} The null controls for how many neighbors the character has; the gap comes from <em>which</em> neighbors are connected to one another.</p>`;
}

async function runEnsemble(state){
  const btn=document.getElementById("rerun-btn");btn.disabled=true;
  const prog=document.getElementById("shuffle-progress");prog.style.width="0%";
  document.getElementById("z-callout").textContent="Building 100 universes…";
  const baseSeed=20260912 + runCounter*100003;runCounter++;
  const values=[];
  const localSums=new Map(state.giant.nodes.map(n=>[n,0]));
  const targetSwaps=SWAPS_PER_EDGE*state.giant.edges.length;
  for(let r=0;r<ENSEMBLE_SIZE;r++){
    const shuffled=degreePreservingShuffle(state.giant,targetSwaps,baseSeed+r*7919).graph;
    const lc=allLocalClustering(shuffled);
    values.push(lc.mean);
    for(const [id,c] of lc.values)localSums.set(id,localSums.get(id)+c);
    prog.style.width=`${100*(r+1)/ENSEMBLE_SIZE}%`;
    if(r%5===4) await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  const mu=mean(values),sigma=sd(values),real=state.realLocal.mean;
  const z=sigma? (real-mu)/sigma : Infinity;
  const extreme=values.filter(v=>v>=real).length;
  const pRaw=extreme/values.length;
  const nullLocalMean=new Map([...localSums].map(([id,s])=>[id,s/ENSEMBLE_SIZE]));

  document.getElementById("m-null-c").textContent=mu.toFixed(3);
  document.getElementById("stat-real").textContent=real.toFixed(3);
  document.getElementById("stat-null").textContent=mu.toFixed(3);
  document.getElementById("stat-sd").textContent=sigma.toFixed(3);
  document.getElementById("stat-z").textContent=Number.isFinite(z)?z.toFixed(1):"∞";
  document.getElementById("stat-p").textContent=`${extreme}/${ENSEMBLE_SIZE}`;
  document.getElementById("z-callout").textContent=`${Number.isFinite(z)?z.toFixed(1):"∞"} standard deviations away`;
  document.getElementById("collapse-copy").innerHTML=`Clustering falls from <strong>${real.toFixed(3)}</strong> to <strong>${mu.toFixed(3)}</strong> on average even though every degree is unchanged. Popularity explains part of the triangles, not the full surplus.`;
  document.getElementById("verdict-copy").innerHTML=`The heavy-tailed degree sequence lifts the clustering baseline from roughly pure-chance levels to <strong>${mu.toFixed(3)}</strong>, but the real network still sits at <strong>${real.toFixed(3)}</strong>. The identity of who connects to whom contains structure that degree alone cannot reproduce.`;
  renderHistogram(values,real);
  renderBaselines(real,mu,state);
  renderHeroLeaderboard(state,nullLocalMean);
  btn.disabled=false;
  return {values,mu,sigma,z,pRaw,nullLocalMean};
}

async function main(){
  try{
    const {nodes,rawEdges}=await loadData();
    const nodesById=new Map(nodes.map(n=>[n.node_id,n]));
    const {edges,adj:fullAdj}=buildUndirected(nodes,rawEdges);
    const comps=components(nodes.map(n=>n.node_id),fullAdj);
    const giant=inducedGraph(comps[0],edges);
    if(nodes.length!==303||edges.length!==1434||giant.nodes.length!==277){
      throw new Error(`Course benchmark mismatch: n=${nodes.length}, undirected m=${edges.length}, giant=${giant.nodes.length}`);
    }
    const realLocal=allLocalClustering(giant);
    STATE={nodes,nodesById,rawEdges,edges,fullAdj,giant,realLocal};
    renderSetup(STATE);
    document.getElementById("rerun-btn").addEventListener("click",()=>runEnsemble(STATE));
    await runEnsemble(STATE);
  }catch(err){
    console.error(err);showError(`Could not build Week 2 analysis: ${err.message}`);
  }
}
main();
