import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const NODES_URL="https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_nodes.tsv";
const EDGES_URL="https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_edges.tsv";
const MAX_REMOVALS=30;
const metricDefs={
  degree:{label:"Degree",format:d3.format("d")},
  betweenness:{label:"Betweenness",format:d3.format(".3f")},
  closeness:{label:"Closeness",format:d3.format(".3f")},
  eigenvector:{label:"Eigenvector",format:d3.format(".3f")}
};
let STATE=null,collapseTimer=null,cliqueIndex=0,currentCliquePool=[];
const tooltip=d3.select("body").append("div").attr("class","viz-tooltip");

function nonCommentText(text){return text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).join("\n");}
function showError(msg){const b=document.getElementById("data-error");b.style.display="block";b.textContent=msg;}
function pairKey(a,b){return a<b?`${a}\t${b}`:`${b}\t${a}`;}
function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

async function loadData(){
  const [nt,et]=await Promise.all([
    fetch(NODES_URL).then(r=>{if(!r.ok)throw new Error(`nodes HTTP ${r.status}`);return r.text();}),
    fetch(EDGES_URL).then(r=>{if(!r.ok)throw new Error(`edges HTTP ${r.status}`);return r.text();})
  ]);
  const nodes=d3.tsvParse(nonCommentText(nt));
  const rawEdges=d3.tsvParseRows(nonCommentText(et)).map(([source,target])=>({source,target}));
  return{nodes,rawEdges};
}
function buildUndirected(nodes,rawEdges){
  const ids=new Set(nodes.map(d=>d.node_id));const pairs=new Map();
  for(const e of rawEdges){if(!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)continue;const k=pairKey(e.source,e.target);if(!pairs.has(k))pairs.set(k,{a:e.source,b:e.target});}
  const edges=[...pairs.values()];const adj=new Map(nodes.map(n=>[n.node_id,new Set()]));for(const {a,b} of edges){adj.get(a).add(b);adj.get(b).add(a);}return{edges,adj};
}
function components(nodeIds,adj,removed=new Set()){
  const seen=new Set(),out=[];for(const s of nodeIds){if(removed.has(s)||seen.has(s))continue;const q=[s],c=[];seen.add(s);for(let i=0;i<q.length;i++){const u=q[i];c.push(u);for(const v of adj.get(u)||[]){if(!removed.has(v)&&!seen.has(v)){seen.add(v);q.push(v);}}}out.push(c);}return out.sort((a,b)=>b.length-a.length);
}
function inducedGraph(nodeIds,edges){const set=new Set(nodeIds),kept=edges.filter(e=>set.has(e.a)&&set.has(e.b));const adj=new Map(nodeIds.map(id=>[id,new Set()]));for(const {a,b} of kept){adj.get(a).add(b);adj.get(b).add(a);}return{nodes:[...nodeIds],edges:kept,adj};}
function bfs(adj,start,allowed=null){const dist=new Map([[start,0]]),parent=new Map(),q=[start];for(let i=0;i<q.length;i++){const u=q[i];for(const v of adj.get(u)||[]){if(allowed&&!allowed.has(v))continue;if(!dist.has(v)){dist.set(v,dist.get(u)+1);parent.set(v,u);q.push(v);}}}return{dist,parent};}
function shortestPath(adj,a,b){const {dist,parent}=bfs(adj,a);if(!dist.has(b))return null;const p=[b];while(p[p.length-1]!==a)p.push(parent.get(p[p.length-1]));return p.reverse();}

function computeDegree(g){return new Map(g.nodes.map(n=>[n,g.adj.get(n).size]));}
function computeCloseness(g){const out=new Map(),allowed=new Set(g.nodes),N=g.nodes.length;for(const s of g.nodes){const {dist}=bfs(g.adj,s,allowed);let sum=0;for(const d of dist.values())sum+=d;out.set(s,sum?((dist.size-1)/sum)*((dist.size-1)/(N-1)):0);}return out;}
function computeBetweenness(g){
  const CB=new Map(g.nodes.map(v=>[v,0]));
  for(const s of g.nodes){
    const S=[],P=new Map(g.nodes.map(v=>[v,[]])),sigma=new Map(g.nodes.map(v=>[v,0])),dist=new Map(g.nodes.map(v=>[v,-1]));sigma.set(s,1);dist.set(s,0);const Q=[s];
    for(let qi=0;qi<Q.length;qi++){const v=Q[qi];S.push(v);for(const w of g.adj.get(v)){if(dist.get(w)<0){Q.push(w);dist.set(w,dist.get(v)+1);}if(dist.get(w)===dist.get(v)+1){sigma.set(w,sigma.get(w)+sigma.get(v));P.get(w).push(v);}}}
    const delta=new Map(g.nodes.map(v=>[v,0]));while(S.length){const w=S.pop();for(const v of P.get(w)){delta.set(v,delta.get(v)+(sigma.get(v)/sigma.get(w))*(1+delta.get(w)));}if(w!==s)CB.set(w,CB.get(w)+delta.get(w));}
  }
  const norm=(g.nodes.length-1)*(g.nodes.length-2);for(const v of g.nodes)CB.set(v,norm?CB.get(v)/norm:0);return CB;
}
function computeEigenvector(g){let x=new Map(g.nodes.map(n=>[n,1/Math.sqrt(g.nodes.length)]));for(let iter=0;iter<100;iter++){const nx=new Map();let norm=0;for(const u of g.nodes){let s=0;for(const v of g.adj.get(u))s+=x.get(v);nx.set(u,s);norm+=s*s;}norm=Math.sqrt(norm)||1;let diff=0;for(const u of g.nodes){nx.set(u,nx.get(u)/norm);diff=Math.max(diff,Math.abs(nx.get(u)-x.get(u)));}x=nx;if(diff<1e-8)break;}return x;}
function rankMap(values){return new Map([...values].sort((a,b)=>d3.descending(a[1],b[1])).map(([id],i)=>[id,i+1]));}
function computeDiameter(g){let best={d:-1,a:null,b:null};for(const s of g.nodes){const {dist}=bfs(g.adj,s,new Set(g.nodes));for(const [v,d] of dist){if(d>best.d)best={d,a:s,b:v};}}return best;}
function removalCurve(g,order){const removed=new Set(),curve=[];for(let k=0;k<=MAX_REMOVALS;k++){const comps=components(g.nodes,g.adj,removed);const alive=g.nodes.length-removed.size;let links=0;for(const e of g.edges)if(!removed.has(e.a)&&!removed.has(e.b))links++;curve.push({k,gc:comps[0]?.length||0,alive,links,removed:k?order[k-1]:null});if(k<MAX_REMOVALS)removed.add(order[k]);}return curve;}
function randomOrder(nodes){const arr=[...nodes],r=mulberry32(3032026);for(let i=arr.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}

function maximalCliques(g){
  const result=[];const nbr=g.adj;
  function bronk(R,P,X){if(P.size===0&&X.size===0){if(R.length>=3)result.push([...R]);return;}if(result.length>3000)return;
    let pivot=null,max=-1;for(const u of new Set([...P,...X])){let c=0;for(const v of nbr.get(u))if(P.has(v))c++;if(c>max){max=c;pivot=u;}}
    const candidates=[...P].filter(v=>!pivot||!nbr.get(pivot).has(v));
    for(const v of candidates){const Nv=nbr.get(v);bronk([...R,v],new Set([...P].filter(x=>Nv.has(x))),new Set([...X].filter(x=>Nv.has(x))));P.delete(v);X.add(v);}
  }
  bronk([],new Set(g.nodes),new Set());return result.sort((a,b)=>b.length-a.length);
}

function nameOf(id){return STATE.byId.get(id)?.name||STATE.byId.get(id)?.label||id;}
function metricValue(id,key){return STATE.metrics[key].get(id)||0;}
function selectCharacter(id){if(!STATE.gcSet.has(id))return;STATE.selected=id;renderScatter();renderInspector();renderNetwork();}

function setupControls(){
  const keys=Object.keys(metricDefs);for(const id of ["x-metric","y-metric"]){const s=d3.select(`#${id}`);s.selectAll("option").data(keys).join("option").attr("value",d=>d).text(d=>metricDefs[d].label);}
  d3.select("#x-metric").property("value","degree");d3.select("#y-metric").property("value","betweenness");
  d3.select("#x-metric").on("change",renderScatter);d3.select("#y-metric").on("change",renderScatter);
  d3.select("#swap-axes").on("click",()=>{const x=d3.select("#x-metric").property("value"),y=d3.select("#y-metric").property("value");d3.select("#x-metric").property("value",y);d3.select("#y-metric").property("value",x);renderScatter();});
  const sorted=[...STATE.gc.nodes].sort((a,b)=>d3.ascending(nameOf(a),nameOf(b)));d3.select("#hero-list").selectAll("option").data(sorted).join("option").attr("value",d=>nameOf(d));
  d3.select("#hero-search").on("change",function(){const q=this.value.trim().toLowerCase();const id=sorted.find(x=>nameOf(x).toLowerCase()===q)||sorted.find(x=>nameOf(x).toLowerCase().includes(q));if(id)selectCharacter(id);});
  const strategies=[['betweenness','Betweenness'],['degree','Degree'],['closeness','Closeness'],['random','Random']];d3.select("#remove-strategy").selectAll("option").data(strategies).join("option").attr("value",d=>d[0]).text(d=>d[1]);
  d3.select("#remove-strategy").on("change",()=>{stopCollapse();updateCollapse();});d3.select("#remove-slider").on("input",()=>{stopCollapse();updateCollapse();});
  d3.select("#play-collapse").on("click",playCollapse);d3.select("#reset-collapse").on("click",()=>{stopCollapse();d3.select("#remove-slider").property("value",0);updateCollapse();});
  const opts=d3.selectAll("#path-from,#path-to").selectAll("option").data(sorted).join("option").attr("value",d=>d).text(d=>nameOf(d));
  const spider=sorted.find(id=>/spider-man/i.test(nameOf(id)))||sorted[0];d3.select("#path-from").property("value",sorted[0]);d3.select("#path-to").property("value",spider);
  d3.select("#find-path").on("click",renderPath);d3.select("#random-pair").on("click",()=>{const r=mulberry32(Date.now()>>>0);let a=sorted[Math.floor(r()*sorted.length)],b=sorted[Math.floor(r()*sorted.length)];if(a===b)b=sorted[(sorted.indexOf(a)+1)%sorted.length];d3.select("#path-from").property("value",a);d3.select("#path-to").property("value",b);renderPath();});
  d3.select("#to-spiderman").on("click",()=>{const a=STATE.selected||sorted[Math.floor(sorted.length/3)];d3.select("#path-from").property("value",a);d3.select("#path-to").property("value",spider);renderPath();});
  d3.select("#diameter-pair").on("click",()=>{d3.select("#path-from").property("value",STATE.diameter.a);d3.select("#path-to").property("value",STATE.diameter.b);renderPath();});
  d3.select("#clique-size").on("input",()=>{cliqueIndex=0;renderClique();});d3.select("#prev-clique").on("click",()=>{if(currentCliquePool.length){cliqueIndex=(cliqueIndex-1+currentCliquePool.length)%currentCliquePool.length;renderClique(false);}});d3.select("#next-clique").on("click",()=>{if(currentCliquePool.length){cliqueIndex=(cliqueIndex+1)%currentCliquePool.length;renderClique(false);}});
  d3.select("#spotlight-btn").on("click",()=>document.getElementById("collapse").scrollIntoView({behavior:"smooth",block:"start"}));
}

function renderScatter(){
  const svg=d3.select("#centrality-scatter"),W=760,H=500,m={t:28,r:25,b:58,l:76};const xKey=d3.select("#x-metric").property("value"),yKey=d3.select("#y-metric").property("value");
  const data=STATE.gc.nodes.map(id=>({id,x:metricValue(id,xKey),y:metricValue(id,yKey)}));const xmax=d3.max(data,d=>d.x)||1,ymax=d3.max(data,d=>d.y)||1;const x=d3.scaleLinear().domain([0,xmax*1.04]).nice().range([m.l,W-m.r]),y=d3.scaleLinear().domain([0,ymax*1.05]).nice().range([H-m.b,m.t]);
  svg.selectAll("*").remove();svg.append("g").attr("class","grid").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H-m.t-m.b)).tickFormat(""));svg.append("g").attr("class","grid").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W-m.l-m.r)).tickFormat(""));
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(6));svg.append("g").attr("class","axis").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6));
  svg.append("text").attr("class","axis-title").attr("x",(m.l+W-m.r)/2).attr("y",H-10).attr("text-anchor","middle").text(metricDefs[xKey].label);svg.append("text").attr("class","axis-title").attr("transform","rotate(-90)").attr("x",-(m.t+H-m.b)/2).attr("y",20).attr("text-anchor","middle").text(metricDefs[yKey].label);
  const maxDeg=d3.max(STATE.gc.nodes,d=>metricValue(d,"degree"))||1;
  svg.append("g").selectAll("circle").data(data,d=>d.id).join("circle").attr("class",d=>`scatter-dot${d.id===STATE.selected?' selected':''}`).attr("cx",d=>x(d.x)).attr("cy",d=>y(d.y)).attr("r",d=>3.5+5*Math.sqrt(metricValue(d.id,"degree")/maxDeg)).attr("fill",d=>d.id===STATE.selected?"#ffd43b":"#7a49ba").on("click",(_,d)=>selectCharacter(d.id)).on("pointerenter",(ev,d)=>{tooltip.style("display","block").html(`<strong>${nameOf(d.id)}</strong><br>${metricDefs[xKey].label}: ${metricDefs[xKey].format(d.x)}<br>${metricDefs[yKey].label}: ${metricDefs[yKey].format(d.y)}`);}).on("pointermove",ev=>tooltip.style("left",`${ev.clientX+12}px`).style("top",`${ev.clientY+12}px`)).on("pointerleave",()=>tooltip.style("display","none"));
  const top=new Set([...STATE.gc.nodes].sort((a,b)=>d3.descending(metricValue(a,yKey),metricValue(b,yKey))).slice(0,5));if(STATE.selected)top.add(STATE.selected);svg.append("g").selectAll("text").data([...top]).join("text").attr("class","scatter-label").attr("x",id=>x(metricValue(id,xKey))+9).attr("y",id=>y(metricValue(id,yKey))-8).text(id=>nameOf(id));
}
function renderInspector(){const id=STATE.selected;if(!id)return;d3.select("#selected-name").text(nameOf(id));d3.select("#selected-summary").html(`<strong>${nameOf(id)}</strong> has ${STATE.gc.adj.get(id).size} direct neighbors in the giant component. Compare the ranks below: the biggest rank disagreements are where different definitions of importance tell different stories.`);const rows=Object.keys(metricDefs).map(k=>({k,label:metricDefs[k].label,value:metricDefs[k].format(metricValue(id,k)),rank:STATE.ranks[k].get(id)}));d3.select("#rank-grid").selectAll("div").data(rows).join("div").html(d=>`<span>${d.label}</span><strong>#${d.rank}</strong><small>${d.value}</small>`);d3.select("#spotlight-btn").property("disabled",false);}

function renderNetwork(){
  const svg=d3.select("#network-viz"),W=760,H=560,strategy=d3.select("#remove-strategy").property("value")||"betweenness",k=+d3.select("#remove-slider").property("value")||0,order=STATE.orders[strategy],removed=new Set(order.slice(0,k));const alive=STATE.gc.nodes.filter(id=>!removed.has(id)),aliveSet=new Set(alive),edges=STATE.gc.edges.filter(e=>aliveSet.has(e.a)&&aliveSet.has(e.b)).map(e=>({source:e.a,target:e.b}));
  const nodes=alive.map(id=>({id,degree:STATE.gc.adj.get(id).size,x:W/2+(hashString(id)%100-50),y:H/2+(hashString(id+"y")%100-50)}));svg.selectAll("*").remove();const g=svg.append("g");const link=g.append("g").selectAll("line").data(edges).join("line").attr("class","network-link").attr("stroke-width",d=>1);const maxD=d3.max(nodes,d=>d.degree)||1;const node=g.append("g").selectAll("circle").data(nodes).join("circle").attr("class",d=>`network-node${d.id===STATE.selected?' selected':''}`).attr("r",d=>3+8*Math.sqrt(d.degree/maxD)).attr("fill",d=>d.id===STATE.selected?"#ffd43b":"#e4232f").on("click",(_,d)=>selectCharacter(d.id)).on("pointerenter",(ev,d)=>{tooltip.style("display","block").html(`<strong>${nameOf(d.id)}</strong><br>degree ${d.degree}`)}).on("pointermove",ev=>tooltip.style("left",`${ev.clientX+12}px`).style("top",`${ev.clientY+12}px`)).on("pointerleave",()=>tooltip.style("display","none"));
  const labels=g.append("g").selectAll("text").data(nodes.filter(d=>d.degree>=d3.quantile(nodes.map(n=>n.degree).sort(d3.ascending),.94)||d.id===STATE.selected)).join("text").attr("class","network-label").text(d=>nameOf(d.id));
  const sim=d3.forceSimulation(nodes).force("link",d3.forceLink(edges).id(d=>d.id).distance(28).strength(.28)).force("charge",d3.forceManyBody().strength(-38)).force("center",d3.forceCenter(W/2,H/2)).force("collide",d3.forceCollide(d=>4+7*Math.sqrt(d.degree/maxD))).alphaDecay(.06).on("tick",()=>{for(const n of nodes){n.x=Math.max(12,Math.min(W-12,n.x));n.y=Math.max(12,Math.min(H-12,n.y));}link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);node.attr("cx",d=>d.x).attr("cy",d=>d.y);labels.attr("x",d=>d.x+8).attr("y",d=>d.y-8);});setTimeout(()=>sim.stop(),1800);
}
function renderCollapseChart(){const svg=d3.select("#collapse-chart"),W=620,H=360,m={t:24,r:20,b:48,l:58},strategy=d3.select("#remove-strategy").property("value")||"betweenness",curve=STATE.curves[strategy],current=+d3.select("#remove-slider").property("value")||0,x=d3.scaleLinear().domain([0,MAX_REMOVALS]).range([m.l,W-m.r]),y=d3.scaleLinear().domain([0,STATE.gc.nodes.length]).range([H-m.b,m.t]);svg.selectAll("*").remove();svg.append("g").attr("class","grid").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H-m.t-m.b)).tickFormat(""));svg.append("g").attr("class","grid").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.l-m.r)).tickFormat(""));svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(6));svg.append("g").attr("class","axis").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));const line=d3.line().x(d=>x(d.k)).y(d=>y(d.gc));svg.append("path").datum(curve).attr("class","collapse-line").attr("stroke","#7a49ba").attr("d",line);svg.append("line").attr("class","current-marker").attr("x1",x(current)).attr("x2",x(current)).attr("y1",m.t).attr("y2",H-m.b);svg.append("circle").attr("class","collapse-point").attr("cx",x(current)).attr("cy",y(curve[current].gc)).attr("r",7).attr("fill","#ffd43b");svg.append("text").attr("class","axis-title").attr("x",(m.l+W-m.r)/2).attr("y",H-8).attr("text-anchor","middle").text("Characters removed");svg.append("text").attr("class","axis-title").attr("transform","rotate(-90)").attr("x",-(m.t+H-m.b)/2).attr("y",18).attr("text-anchor","middle").text("Giant component");}
function updateCollapse(){const strategy=d3.select("#remove-strategy").property("value"),k=+d3.select("#remove-slider").property("value"),row=STATE.curves[strategy][k];d3.select("#removed-count").text(k);d3.select("#gc-now").text(row.gc);d3.select("#last-removed").text(row.removed?nameOf(row.removed):"Nobody");d3.select("#links-now").text(row.links);renderNetwork();renderCollapseChart();}
function stopCollapse(){if(collapseTimer){clearInterval(collapseTimer);collapseTimer=null;}d3.select("#play-collapse").text("▶ Run collapse");}
function playCollapse(){if(collapseTimer){stopCollapse();return;}let k=+d3.select("#remove-slider").property("value");if(k>=MAX_REMOVALS)k=0;d3.select("#play-collapse").text("❚❚ Pause");collapseTimer=setInterval(()=>{k++;d3.select("#remove-slider").property("value",k);updateCollapse();if(k>=MAX_REMOVALS)stopCollapse();},650);}

function renderPath(){const a=d3.select("#path-from").property("value"),b=d3.select("#path-to").property("value"),p=shortestPath(STATE.gc.adj,a,b),box=d3.select("#path-result");if(!p){box.html("<div class='loading-state'>No path found.</div>");return;}const html=`<div><div class="path-chain">${p.map((id,i)=>`${i?'<span class="path-step">→</span>':''}<button type="button" class="path-card${id===STATE.selected?' selected':''}" data-id="${id}">${nameOf(id)}</button>`).join("")}</div><div class="path-meta">${p.length-1} edge${p.length===2?'':'s'} · ${p.length} characters on the chain</div></div>`;box.html(html);box.selectAll(".path-card").on("click",function(){selectCharacter(this.dataset.id);});}

function renderClique(resetPool=true){const min=+d3.select("#clique-size").property("value");d3.select("#clique-size-label").text(min);if(resetPool){currentCliquePool=STATE.cliques.filter(c=>c.length>=min);cliqueIndex=Math.min(cliqueIndex,Math.max(0,currentCliquePool.length-1));}const c=currentCliquePool[cliqueIndex],svg=d3.select("#clique-viz"),W=650,H=480;svg.selectAll("*").remove();if(!c){d3.select("#clique-title").text("No clique this large");d3.select("#clique-copy").text(`No maximal clique of size ${min} or larger was found.`);d3.select("#clique-members").html("");return;}d3.select("#clique-title").text(`Clique ${cliqueIndex+1} of ${currentCliquePool.length}`);d3.select("#clique-copy").text(`${c.length} characters, with every possible pair connected. Use Previous/Next to inspect other maximal cliques meeting the threshold.`);d3.select("#clique-members").selectAll("button").data(c).join("button").attr("type","button").attr("class","clique-member").text(id=>nameOf(id)).on("click",(_,id)=>selectCharacter(id));const R=Math.min(W,H)*.33,cx=W/2,cy=H/2,nodes=c.map((id,i)=>({id,x:cx+R*Math.cos(-Math.PI/2+i*2*Math.PI/c.length),y:cy+R*Math.sin(-Math.PI/2+i*2*Math.PI/c.length)})),edges=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)edges.push({a:nodes[i],b:nodes[j]});svg.append("g").selectAll("line").data(edges).join("line").attr("class","clique-edge").attr("x1",d=>d.a.x).attr("y1",d=>d.a.y).attr("x2",d=>d.b.x).attr("y2",d=>d.b.y);svg.append("g").selectAll("circle").data(nodes).join("circle").attr("class","clique-node").attr("cx",d=>d.x).attr("cy",d=>d.y).attr("r",18).attr("fill",d=>d.id===STATE.selected?"#ffd43b":"white").on("click",(_,d)=>selectCharacter(d.id));svg.append("g").selectAll("text").data(nodes).join("text").attr("class","clique-node-text").attr("x",d=>d.x).attr("y",d=>d.y+(d.y<cy?-28:38)).text(d=>nameOf(d.id));}

async function main(){
  try{
    const {nodes,rawEdges}=await loadData(),{edges,adj}=buildUndirected(nodes,rawEdges),comps=components(nodes.map(n=>n.node_id),adj),gc=inducedGraph(comps[0],edges),byId=new Map(nodes.map(n=>[n.node_id,n]));
    const degree=computeDegree(gc),closeness=computeCloseness(gc),betweenness=computeBetweenness(gc),eigenvector=computeEigenvector(gc),metrics={degree,betweenness,closeness,eigenvector},ranks=Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,rankMap(v)])),diameter=computeDiameter(gc);
    const orders={degree:[...gc.nodes].sort((a,b)=>d3.descending(degree.get(a),degree.get(b))),betweenness:[...gc.nodes].sort((a,b)=>d3.descending(betweenness.get(a),betweenness.get(b))),closeness:[...gc.nodes].sort((a,b)=>d3.descending(closeness.get(a),closeness.get(b))),random:randomOrder(gc.nodes)};const curves=Object.fromEntries(Object.entries(orders).map(([k,o])=>[k,removalCurve(gc,o)]));
    STATE={nodes,rawEdges,edges,adj,gc,gcSet:new Set(gc.nodes),byId,metrics,ranks,diameter,orders,curves,selected:orders.betweenness[0],cliques:[]};
    d3.select("#m-nodes").text(nodes.length);d3.select("#m-edges").text(edges.length);d3.select("#m-gc").text(gc.nodes.length);d3.select("#m-diameter").text(diameter.d);
    setupControls();renderScatter();renderInspector();updateCollapse();renderPath();
    setTimeout(()=>{STATE.cliques=maximalCliques(gc);renderClique();},20);
  }catch(err){console.error(err);showError(`Week 3 could not load: ${err.message}`);}
}
main();
