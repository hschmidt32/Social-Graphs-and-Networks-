import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const NODES_URL = "https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_nodes.tsv";
const EDGES_URL = "https://raw.githubusercontent.com/suneman/socialgraphs2026-web/refs/heads/main/docs/data/week1_edges.tsv";

let ANALYSIS = null;
let degreeMode = "both";
let axisMode = "log";

const fmt = d3.format(",");
const pct1 = d3.format(".1f");

function nonCommentText(text){
  return text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#")).join("\n");
}

async function loadData(){
  const [nodesText, edgesText] = await Promise.all([
    fetch(NODES_URL).then(r => {
      if(!r.ok) throw new Error(`nodes: HTTP ${r.status}`);
      return r.text();
    }),
    fetch(EDGES_URL).then(r => {
      if(!r.ok) throw new Error(`edges: HTTP ${r.status}`);
      return r.text();
    })
  ]);

  const nodes = d3.tsvParse(nonCommentText(nodesText));
  const edgeRows = d3.tsvParseRows(nonCommentText(edgesText));
  const edges = edgeRows.map(([source,target]) => ({source,target}));
  return {nodes,edges};
}

function analyze(nodes, edges){
  const nodeById = new Map(nodes.map(n => [n.node_id, n]));
  const inDegree = new Map(nodes.map(n => [n.node_id,0]));
  const outDegree = new Map(nodes.map(n => [n.node_id,0]));
  const adjacency = new Map(nodes.map(n => [n.node_id,new Set()]));
  const edgeSet = new Set();

  for(const {source,target} of edges){
    if(!nodeById.has(source) || !nodeById.has(target)) continue;
    outDegree.set(source, outDegree.get(source)+1);
    inDegree.set(target, inDegree.get(target)+1);
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
    edgeSet.add(`${source}\t${target}`);
  }

  const pairMap = new Map();
  for(const {source,target} of edges){
    const key = source < target ? `${source}\t${target}` : `${target}\t${source}`;
    if(!pairMap.has(key)) pairMap.set(key,{source:source<target?source:target,target:source<target?target:source});
  }
  const undirectedLinks = [...pairMap.values()];

  let reciprocalPairs = 0;
  for(const {source,target} of undirectedLinks){
    if(edgeSet.has(`${source}\t${target}`) && edgeSet.has(`${target}\t${source}`)) reciprocalPairs++;
  }

  const visited = new Set();
  const components = [];
  for(const n of nodes){
    const start = n.node_id;
    if(visited.has(start)) continue;
    const stack=[start], comp=[];
    visited.add(start);
    while(stack.length){
      const u=stack.pop();
      comp.push(u);
      for(const v of adjacency.get(u)){
        if(!visited.has(v)){visited.add(v);stack.push(v);}
      }
    }
    components.push(comp);
  }
  components.sort((a,b)=>b.length-a.length);

  const isolates = nodes.filter(n => adjacency.get(n.node_id).size===0).map(n=>n.node_id);

  const decorated = nodes.map(n => ({
    ...n,
    in_degree: inDegree.get(n.node_id),
    out_degree: outDegree.get(n.node_id),
    degree: adjacency.get(n.node_id).size
  }));

  const topIn = [...decorated].sort((a,b)=>b.in_degree-a.in_degree).slice(0,10);
  const topOut = [...decorated].sort((a,b)=>b.out_degree-a.out_degree).slice(0,10);

  function distribution(field){
    const counts = new Map();
    for(const n of decorated){
      const k=n[field];
      counts.set(k,(counts.get(k)||0)+1);
    }
    return [...counts.entries()]
      .sort((a,b)=>a[0]-b[0])
      .map(([k,count])=>({k, u:k+1, p:count/decorated.length, count}));
  }

  const n=decorated.length;
  const m=edges.length;
  const undirectedPairs=undirectedLinks.length;
  const possiblePairs=n*(n-1)/2;
  const reciprocatedEdges=2*reciprocalPairs;

  return {
    nodes:decorated,
    edges,
    nodeById:new Map(decorated.map(n=>[n.node_id,n])),
    inDegree,outDegree,adjacency,
    undirectedLinks,
    components,
    isolates,
    topIn,topOut,
    inDist:distribution("in_degree"),
    outDist:distribution("out_degree"),
    metrics:{
      n,m,undirectedPairs,
      density:undirectedPairs/possiblePairs,
      meanDirected:m/n,
      meanUndirected:2*undirectedPairs/n,
      reciprocalPairs,
      reciprocatedEdges,
      reciprocatedEdgeShare:reciprocatedEdges/m,
      reciprocalPairShare:reciprocalPairs/undirectedPairs,
      giant:components[0].length,
      island:components[1].length,
      outsideGiant:n-components[0].length
    }
  };
}

function validate(a){
  const expected = {
    n:303,m:1784,undirectedPairs:1434,giant:277,island:9
  };
  const problems=[];
  for(const [k,v] of Object.entries(expected)){
    if(a.metrics[k]!==v) problems.push(`${k}: expected ${v}, got ${a.metrics[k]}`);
  }
  if(a.isolates.length!==17) problems.push(`isolates: expected 17, got ${a.isolates.length}`);
  return problems;
}

function showError(message){
  const box=document.getElementById("data-error");
  box.style.display="block";
  box.textContent=message;
}

function renderMetrics(a){
  document.getElementById("m-n").textContent=fmt(a.metrics.n);
  document.getElementById("m-edges").textContent=fmt(a.metrics.m);
  document.getElementById("m-density").textContent=`${pct1(a.metrics.density*100)}%`;
  document.getElementById("m-isolates").textContent=fmt(a.isolates.length);
}

function tooltip(){
  return d3.select("#tooltip");
}

function renderNetwork(a){
  const host=d3.select("#network-viz");
  host.selectAll("*").remove();

  const width=1050,height=610;
  const giantSet=new Set(a.components[0]);
  const nodes=a.nodes.filter(n=>giantSet.has(n.node_id)).map(n=>({...n}));
  const nodeSet=new Set(nodes.map(n=>n.node_id));
  const links=a.undirectedLinks
    .filter(e=>nodeSet.has(e.source)&&nodeSet.has(e.target))
    .map(e=>({...e}));

  const sim=d3.forceSimulation(nodes)
    .force("link",d3.forceLink(links).id(d=>d.node_id).distance(25).strength(.12))
    .force("charge",d3.forceManyBody().strength(-38))
    .force("center",d3.forceCenter(width/2,height/2))
    .force("collision",d3.forceCollide().radius(d=>3+Math.sqrt(d.in_degree+1)*1.4))
    .stop();

  for(let i=0;i<320;i++) sim.tick();

  const svg=host.append("svg").attr("viewBox",`0 0 ${width} ${height}`).attr("role","img")
    .attr("aria-label","Force-directed drawing of the 277-node giant component.");

  svg.append("g").attr("stroke","#111").attr("stroke-opacity",".095")
    .selectAll("line").data(links).join("line")
    .attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
    .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);

  const maxIn=d3.max(nodes,d=>d.in_degree);
  const r=d3.scaleSqrt().domain([0,maxIn]).range([2.3,17]);

  const g=svg.append("g").selectAll("circle").data(nodes).join("circle")
    .attr("cx",d=>d.x).attr("cy",d=>d.y)
    .attr("r",d=>r(d.in_degree))
    .attr("fill",d=>d.node_id==="Spider-Man" ? "#ed1d24" : "#111")
    .attr("stroke",d=>d.node_id==="Spider-Man" ? "#ffd43b" : "#fff")
    .attr("stroke-width",d=>d.node_id==="Spider-Man" ? 4 : .7)
    .style("cursor","pointer");

  const tip=tooltip();
  g.on("mousemove",(event,d)=>{
    tip.style("display","block")
      .style("left",`${event.clientX+14}px`)
      .style("top",`${event.clientY+14}px`)
      .html(`<strong>${d.name}</strong><br>in-degree: ${d.in_degree}<br>out-degree: ${d.out_degree}<br>neighbors: ${d.degree}`);
  }).on("mouseleave",()=>tip.style("display","none"));

  const labels=a.topIn.slice(0,6).filter(n=>giantSet.has(n.node_id));
  svg.append("g").selectAll("text").data(labels).join("text")
    .attr("x",d=>{
      const nd=nodes.find(n=>n.node_id===d.node_id); return nd.x+10;
    })
    .attr("y",d=>{
      const nd=nodes.find(n=>n.node_id===d.node_id); return nd.y-9;
    })
    .text(d=>d.name)
    .attr("font-size",12).attr("font-weight",900)
    .attr("paint-order","stroke").attr("stroke","white").attr("stroke-width",4)
    .attr("fill","#111");

  svg.append("text").attr("x",18).attr("y",30)
    .attr("font-family",'Impact, "Arial Black", sans-serif')
    .attr("font-size",20).attr("fill","#ed1d24")
    .text("NODE SIZE = IN-DEGREE");
}

function renderLeaders(containerId,data,field,cls){
  const host=d3.select(containerId);
  host.selectAll("*").remove();
  const max=d3.max(data,d=>d[field]);

  const row=host.selectAll(".leader-row").data(data.slice(0,8)).join("div").attr("class","leader-row");
  row.append("div").attr("class","leader-name").text(d=>d.name);
  const track=row.append("div").attr("class","bar-track");
  track.append("div").attr("class",`bar ${cls}`).style("width",d=>`${100*d[field]/max}%`);
  row.append("div").attr("class","leader-value").text(d=>d[field]);
}

function renderSpiderWeb(a){
  const host=d3.select("#spider-web");
  host.selectAll("*").remove();

  const spider=a.nodeById.get("Spider-Man");
  const incoming=a.edges.filter(e=>e.target==="Spider-Man").map(e=>a.nodeById.get(e.source));
  const width=520,height=430,cx=width/2,cy=height/2;

  const svg=host.append("svg").attr("viewBox",`0 0 ${width} ${height}`);
  const rings=[58,105,153,195];
  for(const rr of rings){
    svg.append("circle").attr("cx",cx).attr("cy",cy).attr("r",rr)
      .attr("fill","none").attr("stroke","#d4cec1").attr("stroke-width",1);
  }
  for(let i=0;i<16;i++){
    const a0=2*Math.PI*i/16;
    svg.append("line")
      .attr("x1",cx).attr("y1",cy)
      .attr("x2",cx+Math.cos(a0)*202).attr("y2",cy+Math.sin(a0)*202)
      .attr("stroke","#e1dbcf").attr("stroke-width",1);
  }

  const points=incoming.map((d,i)=>{
    const ringIndex=i%rings.length;
    const rr=rings[ringIndex];
    const countOnRing=incoming.filter((_,j)=>j%rings.length===ringIndex).length;
    const pos=Math.floor(i/rings.length);
    const angle=2*Math.PI*pos/countOnRing + ringIndex*.19;
    return {...d,x:cx+Math.cos(angle)*rr,y:cy+Math.sin(angle)*rr};
  });

  svg.append("g").attr("stroke","#ed1d24").attr("stroke-opacity",".22")
    .selectAll("line").data(points).join("line")
    .attr("x1",d=>d.x).attr("y1",d=>d.y).attr("x2",cx).attr("y2",cy);

  const tip=tooltip();
  svg.append("g").selectAll("circle").data(points).join("circle")
    .attr("cx",d=>d.x).attr("cy",d=>d.y).attr("r",3.4)
    .attr("fill","#111")
    .on("mousemove",(event,d)=>{
      tip.style("display","block").style("left",`${event.clientX+14}px`).style("top",`${event.clientY+14}px`)
        .html(`<strong>${d.name}</strong><br>links → Spider-Man`);
    })
    .on("mouseleave",()=>tip.style("display","none"));

  svg.append("circle").attr("cx",cx).attr("cy",cy).attr("r",29).attr("fill","#ed1d24").attr("stroke","#111").attr("stroke-width",4);
  svg.append("text").attr("x",cx).attr("y",cy-4).attr("text-anchor","middle").attr("fill","white")
    .attr("font-family",'Impact, "Arial Black", sans-serif').attr("font-size",13).text("SPIDER");
  svg.append("text").attr("x",cx).attr("y",cy+12).attr("text-anchor","middle").attr("fill","white")
    .attr("font-family",'Impact, "Arial Black", sans-serif').attr("font-size",13).text("MAN");
  svg.append("text").attr("x",cx).attr("y",cy+58).attr("text-anchor","middle").attr("fill","#ed1d24")
    .attr("font-family",'Impact, "Arial Black", sans-serif').attr("font-size",22)
    .text(`${incoming.length} INCOMING LINKS`);
}

function renderHubInsight(a){
  const spider=a.nodeById.get("Spider-Man");
  const betsy=a.nodeById.get("Betsy_Braddock");
  const m=a.metrics.m;
  const mean=a.metrics.meanDirected;
  const host=document.getElementById("hub-insight");

  host.innerHTML=`
    <p><span class="comic-callout">${pct1(spider.in_degree/a.metrics.n*100)}% of pages</span></p>
    <p><strong>${spider.in_degree}</strong> of the ${a.metrics.n} character pages link to Spider‑Man. That is about <strong>${pct1(spider.in_degree/mean)}× the average in-degree</strong>.</p>
    <p>Those ${spider.in_degree} links are also <strong>${pct1(spider.in_degree/m*100)}% of every directed edge in the entire dataset</strong>.</p>
    <p>The maximum out-degree is only <strong>${betsy.out_degree}</strong>, so the largest in-degree is <strong>${pct1(spider.in_degree/betsy.out_degree)}× larger</strong> than the largest out-degree.</p>
    <p><strong>Interpretation:</strong> incoming attention can accumulate without the famous page doing anything. Outgoing links have to be authored one by one, so that distribution has a much shorter ceiling.</p>
  `;
}

function renderDistribution(a){
  const host=d3.select("#distribution-viz");
  host.selectAll("*").remove();

  const width=1000,height=520;
  const margin={top:26,right:30,bottom:62,left:82};
  const svg=host.append("svg").attr("viewBox",`0 0 ${width} ${height}`);

  const series=[];
  if(degreeMode==="both"||degreeMode==="in") series.push({name:"In-degree",data:a.inDist,color:"#ed1d24"});
  if(degreeMode==="both"||degreeMode==="out") series.push({name:"Out-degree",data:a.outDist,color:"#1f5dff"});

  const all=series.flatMap(s=>s.data);
  const maxU=d3.max(all,d=>d.u);
  const maxP=d3.max(all,d=>d.p);
  const minP=d3.min(all.filter(d=>d.p>0),d=>d.p);

  const x=axisMode==="log"
    ? d3.scaleLog().domain([1,maxU*1.08]).range([margin.left,width-margin.right])
    : d3.scaleLinear().domain([1,maxU]).nice().range([margin.left,width-margin.right]);

  const y=axisMode==="log"
    ? d3.scaleLog().domain([minP*.8,maxP*1.2]).range([height-margin.bottom,margin.top])
    : d3.scaleLinear().domain([0,maxP]).nice().range([height-margin.bottom,margin.top]);

  svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`)
    .call(axisMode==="log" ? d3.axisBottom(x).ticks(8,"~g") : d3.axisBottom(x).ticks(10))
    .call(g=>g.selectAll("text").attr("font-size",13).attr("font-weight",700));

  svg.append("g").attr("transform",`translate(${margin.left},0)`)
    .call(axisMode==="log" ? d3.axisLeft(y).ticks(7,"~g") : d3.axisLeft(y).ticks(7).tickFormat(d3.format(".2f")))
    .call(g=>g.selectAll("text").attr("font-size",13).attr("font-weight",700));

  svg.append("text").attr("x",width/2).attr("y",height-16).attr("text-anchor","middle")
    .attr("font-weight",900).text("k + 1  (shifted so k = 0 remains visible)");
  svg.append("text").attr("transform","rotate(-90)").attr("x",-height/2).attr("y",22).attr("text-anchor","middle")
    .attr("font-weight",900).text("P(k)");

  for(const s of series){
    svg.append("g").selectAll("circle").data(s.data).join("circle")
      .attr("cx",d=>x(d.u)).attr("cy",d=>y(d.p)).attr("r",4.5)
      .attr("fill",s.color).attr("stroke","#111").attr("stroke-width",.7).attr("opacity",.88);
  }

  const legend=svg.append("g").attr("transform",`translate(${width-205},34)`);
  series.forEach((s,i)=>{
    legend.append("rect").attr("x",0).attr("y",i*24).attr("width",14).attr("height",14).attr("fill",s.color).attr("stroke","#111");
    legend.append("text").attr("x",22).attr("y",12+i*24).attr("font-size",13).attr("font-weight",900).text(s.name);
  });
}

function renderComponents(a){
  const host=d3.select("#component-dots");
  host.selectAll("*").remove();

  const field=host.append("div").attr("class","dot-field");
  const giantCount=a.components[0].length;
  const islandCount=a.components[1].length;
  const isolateCount=a.isolates.length;

  const types=[
    ...Array(giantCount).fill("giant"),
    ...Array(islandCount).fill("island"),
    ...Array(isolateCount).fill("isolate")
  ];
  field.selectAll("div").data(types).join("div").attr("class",d=>`hero-dot ${d}`);

  host.append("div").attr("class","figure-note")
    .html(`<strong>Red:</strong> giant component (${giantCount}) &nbsp; <strong>Yellow:</strong> separate island (${islandCount}) &nbsp; <strong>Blue:</strong> isolates (${isolateCount})`);

  const island=a.components[1].map(id=>a.nodeById.get(id)).sort((x,y)=>d3.ascending(x.name,y.name));
  d3.select("#island-list").selectAll("li").data(island).join("li").text(d=>d.name);

  const isolates=a.isolates.map(id=>a.nodeById.get(id)).sort((x,y)=>d3.ascending(x.name,y.name));
  d3.select("#isolate-list").selectAll("li").data(isolates).join("li").text(d=>d.name);
}

function renderInsights(a){
  const spider=a.nodeById.get("Spider-Man");
  const maxOut=a.topOut[0];
  const items=[
    {
      title:"Attention is far more concentrated than activity.",
      body:`Spider‑Man's in-degree is ${spider.in_degree}; the largest out-degree is ${maxOut.out_degree}. The incoming tail reaches ${pct1(spider.in_degree/maxOut.out_degree)}× farther than the outgoing tail.`
    },
    {
      title:"Mutual linking is important, but one-way linking is the majority.",
      body:`There are ${a.metrics.reciprocalPairs} reciprocal pairs. They account for ${pct1(a.metrics.reciprocatedEdgeShare*100)}% of directed edges, while ${pct1((1-a.metrics.reciprocatedEdgeShare)*100)}% of arrows are one-way.`
    },
    {
      title:"The network is dense for a real network, yet almost every possible pair is missing.",
      body:`Only ${pct1(a.metrics.density*100)}% of the ${fmt(a.metrics.n*(a.metrics.n-1)/2)} possible undirected character pairs exist. The interesting structure is in which ${fmt(a.metrics.undirectedPairs)} pairs made the cut.`
    }
  ];

  const host=d3.select("#insight-list");
  host.selectAll("*").remove();
  const cards=host.selectAll("div.insight").data(items).join("div").attr("class","insight");
  cards.append("h3").text(d=>d.title);
  cards.append("p").text(d=>d.body);
}

function bindControls(){
  document.querySelectorAll(".degree-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      degreeMode=btn.dataset.degree;
      document.querySelectorAll(".degree-btn").forEach(b=>b.classList.toggle("active",b===btn));
      renderDistribution(ANALYSIS);
    });
  });
  document.querySelectorAll(".axis-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      axisMode=btn.dataset.axis;
      document.querySelectorAll(".axis-btn").forEach(b=>b.classList.toggle("active",b===btn));
      renderDistribution(ANALYSIS);
    });
  });
}

async function main(){
  try{
    const data=await loadData();
    ANALYSIS=analyze(data.nodes,data.edges);

    const problems=validate(ANALYSIS);
    if(problems.length){
      showError(`Course-data check failed: ${problems.join("; ")}`);
    }

    renderMetrics(ANALYSIS);
    renderNetwork(ANALYSIS);
    renderLeaders("#top-in",ANALYSIS.topIn,"in_degree","in");
    renderLeaders("#top-out",ANALYSIS.topOut,"out_degree","out");
    renderSpiderWeb(ANALYSIS);
    renderHubInsight(ANALYSIS);
    renderDistribution(ANALYSIS);
    renderComponents(ANALYSIS);
    renderInsights(ANALYSIS);
    bindControls();
  }catch(err){
    console.error(err);
    showError("Could not load the frozen Week‑1 course data. Check your internet connection or the browser console. " + err.message);
  }
}
main();
