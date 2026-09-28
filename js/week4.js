import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import Graph from "https://esm.sh/graphology@0.26.0";
import louvain from "https://esm.sh/graphology-communities-louvain@2.0.2";

const NODES_URL="https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week4_philosophers_nodes.tsv";
const EDGES_URL="https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week4_philosophers_edges.tsv";
const COLORS=["#ffd43b","#ef476f","#06d6a0","#4cc9f0","#f77f00","#9b5de5","#00bbf9","#f15bb5","#90be6d","#ff6b6b","#43aa8b","#577590","#f9c74f","#b5179e","#4895ef","#e76f51","#2a9d8f","#8ac926"];
let S=null,seedCounter=0,pulseTimer=null;
const tooltip=d3.select("body").append("div").attr("class","viz-tooltip");

function clean(t){return t.split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith("#")).join("\n")}
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function pair(a,b){return a<b?`${a}\t${b}`:`${b}\t${a}`}
function pretty(id){const n=S?.byId.get(id);return n?.name||n?.label||id.replaceAll("_"," ")}
function error(msg){const e=document.querySelector("#data-error");e.style.display="block";e.textContent=msg}
function components(ids,adj){const seen=new Set(),out=[];for(const s of ids){if(seen.has(s))continue;const q=[s],c=[];seen.add(s);for(let i=0;i<q.length;i++){const u=q[i];c.push(u);for(const v of adj.get(u)||[])if(!seen.has(v)){seen.add(v);q.push(v)}}out.push(c)}return out.sort((a,b)=>b.length-a.length)}

async function load(){
  const [nt,et]=await Promise.all([fetch(NODES_URL).then(r=>r.text()),fetch(EDGES_URL).then(r=>r.text())]);
  const nodes=d3.tsvParse(clean(nt)), raw=d3.tsvParse(clean(et));
  const byId=new Map(nodes.map(n=>[n.node_id,n])), weights=new Map();
  for(const e of raw){const a=e.source,b=e.target,w=+(e.weight||1);if(!byId.has(a)||!byId.has(b)||a===b)continue;const k=pair(a,b);weights.set(k,(weights.get(k)||0)+w)}
  const edges=[...weights].map(([k,w])=>{const [a,b]=k.split("\t");return{a,b,w}});
  const adj=new Map(nodes.map(n=>[n.node_id,new Set()]));for(const e of edges){adj.get(e.a).add(e.b);adj.get(e.b).add(e.a)}
  const giant=components(nodes.map(n=>n.node_id),adj)[0], gs=new Set(giant), ge=edges.filter(e=>gs.has(e.a)&&gs.has(e.b));
  const wadj=new Map(giant.map(id=>[id,new Map()]));for(const e of ge){wadj.get(e.a).set(e.b,e.w);wadj.get(e.b).set(e.a,e.w)}
  const strength=new Map(giant.map(id=>[id,d3.sum(wadj.get(id).values())]));
  return{nodes,byId,edges,adj,giant,gs,ge,wadj,strength};
}
function makeGraph(){
  const g=new Graph({type:"undirected",multi:false});for(const id of S.giant)g.addNode(id);
  for(const e of S.ge)g.addEdge(e.a,e.b,{weight:e.w});return g;
}
function partition(gamma=1,seed=1){
  return louvain(S.graph,{resolution:gamma,getEdgeWeight:()=>1,rng:rng(9300+seed),fastLocalMoves:true});
}
function groupsOf(p){const m=new Map();for(const [id,c] of Object.entries(p)){if(!m.has(c))m.set(c,[]);m.get(c).push(id)}return m}
function modularity(p,gamma=1){
  const m=S.ge.length,deg=new Map(S.giant.map(id=>[id,S.wadj.get(id).size])), groups=groupsOf(p);let q=0;
  for(const ids of groups.values()){const set=new Set(ids);let lc=0,dc=0;for(const u of ids){dc+=deg.get(u);for(const v of S.wadj.get(u).keys())if(set.has(v))lc+=.5}q+=lc/m-gamma*Math.pow(dc/(2*m),2)}
  return q;
}
function commName(ids){
  const eras=d3.rollups(ids,id=>id.length,id=>S.byId.get(id)?.era||"Unknown").sort((a,b)=>b[1]-a[1]);
  const famous=[...ids].sort((a,b)=>S.strength.get(b)-S.strength.get(a)).slice(0,2).map(pretty);
  return `${eras[0]?.[0]||"Mixed"} · ${famous.join(" / ")}`;
}
function aggregate(p){
  const groups=groupsOf(p), nodes=[...groups].map(([id,ids])=>({id:String(id),ids,size:ids.length,name:commName(ids)}));
  const em=new Map();for(const e of S.ge){const a=String(p[e.a]),b=String(p[e.b]);if(a===b)continue;const k=pair(a,b);em.set(k,(em.get(k)||0)+1)}
  const edges=[...em].map(([k,w])=>{const[source,target]=k.split("\t");return{source,target,w}});return{nodes,edges,groups};
}
function color(c){return COLORS[(+c||0)%COLORS.length]}

function renderCommunities(){
  const gamma=+d3.select("#gamma").property("value"),p=partition(gamma,seedCounter),q=modularity(p,gamma),agg=aggregate(p);
  S.current={gamma,p,q,agg};d3.select("#gamma-label").text(gamma.toFixed(2));d3.select("#community-count").text(agg.nodes.length);d3.select("#q-now").text(q.toFixed(3));
  if(gamma===1&&seedCounter===0){d3.select("#m-communities").text(agg.nodes.length);d3.select("#m-q").text(q.toFixed(3));S.base=p}
  const svg=d3.select("#community-map"),W=800,H=560;svg.selectAll("*").remove();
  const max=d3.max(agg.nodes,d=>d.size),r=d3.scaleSqrt().domain([1,max]).range([18,78]);
  const links=svg.append("g").selectAll("line").data(agg.edges).join("line").attr("class","community-link").attr("stroke-width",d=>Math.max(1,Math.sqrt(d.w)));
  const ns=svg.append("g").selectAll("g").data(agg.nodes).join("g").style("cursor","pointer").on("click",(_,d)=>selectCommunity(d));
  ns.append("circle").attr("class","community-node").attr("r",d=>r(d.size)).attr("fill",d=>color(d.id));
  ns.append("text").attr("class","community-label").attr("font-size",d=>d.size>100?15:12).each(function(d){const t=d3.select(this),words=d.name.split(" · ");t.append("tspan").attr("x",0).attr("dy","-.15em").text(words[0]);t.append("tspan").attr("x",0).attr("dy","1.1em").text(`${d.size} people`)});
  const sim=d3.forceSimulation(agg.nodes).force("link",d3.forceLink(agg.edges).id(d=>d.id).distance(110).strength(.12)).force("charge",d3.forceManyBody().strength(-500)).force("center",d3.forceCenter(W/2,H/2)).force("collision",d3.forceCollide().radius(d=>r(d.size)+10)).stop();
  for(let i=0;i<260;i++)sim.tick();
  agg.nodes.forEach(d=>{d.x=Math.max(r(d.size)+8,Math.min(W-r(d.size)-8,d.x));d.y=Math.max(r(d.size)+8,Math.min(H-r(d.size)-8,d.y))});
  links.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);ns.attr("transform",d=>`translate(${d.x},${d.y})`);
}
function selectCommunity(d){
  d3.selectAll(".community-node").classed("selected",x=>x.id===d.id);d3.select("#community-title").text(d.name);
  const top=[...d.ids].sort((a,b)=>S.strength.get(b)-S.strength.get(a)).slice(0,18);
  d3.select("#community-copy").html(`<strong>${d.size} philosophers.</strong> The chips below are the strongest members by weighted strength. Turn γ and this group may split, merge, or trade members.`);
  d3.select("#community-members").selectAll("span").data(top).join("span").attr("class","member-chip").text(pretty);
}

function jaccard(a,b){let inter=0;for(const x of a)if(b.has(x))inter++;return inter/(a.size+b.size-inter||1)}
function computeStability(){
  const runs=[0,1,2,3,4].map(i=>partition(1,100+i)),sets=runs.map(p=>{const g=groupsOf(p),m=new Map();for(const [c,ids] of g){const s=new Set(ids);for(const id of ids)m.set(id,s)}return m});
  const loyalty=S.giant.map(id=>({id,score:d3.mean([1,2,3,4],i=>jaccard(sets[0].get(id),sets[i].get(id))),sizes:runs.map((p,i)=>sets[i].get(id).size)})).sort((a,b)=>a.score-b.score);
  S.stability={runs,sets,loyalty};renderLoyalty();
}
function renderLoyalty(){
  const data=S.stability.loyalty.slice(0,28),svg=d3.select("#loyalty-chart"),W=800,H=500,m={t:20,r:25,b:50,l:190};svg.selectAll("*").remove();
  const x=d3.scaleLinear().domain([0,1]).range([m.l,W-m.r]),y=d3.scaleBand().domain(data.map(d=>d.id)).range([m.t,H-m.b]).padding(.18);
  svg.append("g").attr("class","grid").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H-m.t-m.b)).tickFormat(""));
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
  svg.selectAll(".loyalty-bar").data(data).join("rect").attr("class","loyalty-bar").attr("x",m.l).attr("y",d=>y(d.id)).attr("height",y.bandwidth()).attr("width",d=>x(d.score)-m.l).attr("fill",d=>d3.interpolateRgb("#ef476f","#06d6a0")(d.score)).on("click",(_,d)=>selectPhilosopher(d.id));
  svg.selectAll(".loyalty-label").data(data).join("text").attr("class","loyalty-label").attr("x",m.l-8).attr("y",d=>y(d.id)+y.bandwidth()/2+4).attr("text-anchor","end").text(d=>pretty(d.id).slice(0,24));
  svg.append("text").attr("x",(m.l+W-m.r)/2).attr("y",H-10).attr("text-anchor","middle").attr("font-weight",900).text("Community loyalty across seeds →");
}
function selectPhilosopher(id){
  const d=S.stability.loyalty.find(x=>x.id===id);if(!d)return;const score=d.score;
  d3.select("#philosopher-title").text(pretty(id));
  const rows=d.sizes.map((s,i)=>`<div class="passport-row"><span>Seed ${i+1}</span><small>community size ${s}</small></div>`).join("");
  d3.select("#passport").html(`<div class="passport-score">${d3.format(".0%")(score)}</div><p class="selected-summary"><strong>community loyalty.</strong> 100% means this philosopher keeps essentially the same companions across seeds; lower values mean the border around them is unstable.</p>${rows}`);
}
function setupSearch(){
  const ids=[...S.giant].sort((a,b)=>d3.ascending(pretty(a),pretty(b)));d3.select("#philosopher-list").selectAll("option").data(ids).join("option").attr("value",pretty);
  d3.select("#philosopher-search").on("change",function(){const q=this.value.toLowerCase().trim();const id=ids.find(x=>pretty(x).toLowerCase()===q)||ids.find(x=>pretty(x).toLowerCase().includes(q));if(id)selectPhilosopher(id)});
  d3.select("#show-unstable").on("click",()=>selectPhilosopher(S.stability.loyalty[0].id));
  d3.select("#surprise-me").on("click",()=>selectPhilosopher(S.stability.loyalty[Math.floor(Math.random()*Math.min(120,S.stability.loyalty.length))].id));
}

function disparity(e,at){
  const nbr=S.wadj.get(at),k=nbr.size,s=S.strength.get(at),p=e.w/s;if(k<=1)return 0;return Math.pow(1-p,k-1)
}
function backboneEdges(alpha){return S.ge.filter(e=>disparity(e,e.a)<alpha||disparity(e,e.b)<alpha)}
function initBackboneLayout(){
  const top=[...S.giant].sort((a,b)=>S.strength.get(b)-S.strength.get(a)).slice(0,220),set=new Set(top),all=S.ge.filter(e=>set.has(e.a)&&set.has(e.b));
  const nodes=top.map(id=>({id})),links=all.map(e=>({source:e.a,target:e.b,w:e.w}));
  const sim=d3.forceSimulation(nodes).force("link",d3.forceLink(links).id(d=>d.id).distance(52).strength(.08)).force("charge",d3.forceManyBody().strength(-55)).force("center",d3.forceCenter(490,325)).force("collision",d3.forceCollide(5)).stop();
  for(let i=0;i<300;i++)sim.tick();S.backboneLayout={nodes,links,pos:new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}]))};renderBackbone()
}
function renderBackbone(){
  const alpha=+d3.select("#alpha").property("value"),kept=backboneEdges(alpha),ks=new Set(kept.flatMap(e=>[e.a,e.b])),vis=S.backboneLayout.nodes.filter(n=>ks.has(n.id)),vset=new Set(vis.map(n=>n.id)),ve=kept.filter(e=>vset.has(e.a)&&vset.has(e.b));
  d3.select("#alpha-label").text(alpha.toFixed(2));d3.select("#backbone-links").text(kept.length.toLocaleString());d3.select("#backbone-nodes").text(vis.length);
  const svg=d3.select("#backbone-map"),maxS=d3.max(S.strength.values()),r=d3.scaleSqrt().domain([1,maxS]).range([3,17]);
  svg.selectAll("*").remove();svg.append("g").selectAll("line").data(ve).join("line").attr("class","backbone-link").attr("x1",d=>S.backboneLayout.pos.get(d.a).x).attr("y1",d=>S.backboneLayout.pos.get(d.a).y).attr("x2",d=>S.backboneLayout.pos.get(d.b).x).attr("y2",d=>S.backboneLayout.pos.get(d.b).y).attr("stroke-width",d=>Math.min(5,1+Math.log2(d.w)));
  svg.append("g").selectAll("circle").data(vis).join("circle").attr("class","backbone-node").attr("cx",d=>S.backboneLayout.pos.get(d.id).x).attr("cy",d=>S.backboneLayout.pos.get(d.id).y).attr("r",d=>r(S.strength.get(d.id))).attr("fill",d=>color(S.base[d.id])).on("pointerenter",(ev,d)=>tooltip.style("display","block").html(`<strong>${pretty(d.id)}</strong><br>Strength: ${S.strength.get(d.id)}<br>Degree: ${S.wadj.get(d.id).size}`)).on("pointermove",ev=>tooltip.style("left",`${ev.clientX+12}px`).style("top",`${ev.clientY+12}px`)).on("pointerleave",()=>tooltip.style("display","none"));
  const labels=vis.sort((a,b)=>S.strength.get(b.id)-S.strength.get(a.id)).slice(0,12);svg.append("g").selectAll("text").data(labels).join("text").attr("class","backbone-label").attr("x",d=>S.backboneLayout.pos.get(d.id).x+10).attr("y",d=>S.backboneLayout.pos.get(d.id).y-8).text(d=>pretty(d.id));
}
function pulse(){
  if(pulseTimer){clearInterval(pulseTimer);pulseTimer=null;d3.select("#pulse-backbone").text("▶ Pulse filter");return}
  const vals=[.05,.1,.15,.2,.25,.3,.35,.4,.45,.5],slider=d3.select("#alpha");let i=0;d3.select("#pulse-backbone").text("■ Stop");
  pulseTimer=setInterval(()=>{slider.property("value",vals[i]);renderBackbone();i=(i+1)%vals.length},650)
}
async function main(){
  try{
    S=await load();S.graph=makeGraph();d3.select("#m-nodes").text(S.giant.length.toLocaleString());d3.select("#m-edges").text(S.ge.length.toLocaleString());
    S.base=partition(1,0);renderCommunities();computeStability();setupSearch();initBackboneLayout();
    d3.select("#gamma").on("input",renderCommunities);d3.select("#reroll").on("click",()=>{seedCounter++;renderCommunities()});
    d3.select("#alpha").on("input",renderBackbone);d3.select("#pulse-backbone").on("click",pulse);
    selectPhilosopher(S.stability.loyalty[0].id);
  }catch(e){console.error(e);error(`Could not load Week 4 data: ${e.message}`)}
}
main();