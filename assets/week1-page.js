async function loadWeek1Metrics(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error("Could not load metrics JSON");
    return await r.json();
  } catch (err) {
    console.warn(err);
    return null;
  }
}

function addInsight(container, mini, number, text) {
  const div = document.createElement("div");
  div.className = "insight";
  div.innerHTML = `
    <div class="mini">${mini}</div>
    <div class="number">${number}</div>
    <p>${text}</p>
  `;
  container.appendChild(div);
}

function renderInsights(metrics) {
  const summary = metrics.summary;
  const el = document.getElementById("insights");
  el.innerHTML = "";
  addInsight(
    el,
    "Giant component",
    `${summary.giant_component} / ${summary.n}`,
    `${summary.giant_share.toFixed(1)}% of the network sits in one connected continent.`
  );
  addInsight(
    el,
    "Outside the giant",
    `${summary.outside_giant}`,
    `There are ${summary.island_component} nodes in a separate island and ${summary.isolates} complete isolates.`
  );
  addInsight(
    el,
    "Reciprocity",
    `${summary.reciprocated_share.toFixed(1)}%`,
    `${summary.reciprocated_edges} directed edges are part of reciprocal pairs.`
  );
  addInsight(
    el,
    "Directional asymmetry",
    `${summary.max_in.degree} vs ${summary.max_out.degree}`,
    `${summary.max_in.name} dominates in-degree, while ${summary.max_out.name} leads out-degree.`
  );
}

function renderComponentStrip(metrics) {
  const summary = metrics.summary;
  const container = document.getElementById("component-strip");
  container.innerHTML = "";

  const text = document.createElement("p");
  text.className = "small-note";
  text.innerHTML = `${summary.giant_component} giant-component nodes · ${summary.island_component} in the second component · ${summary.isolates} isolates`;
  container.appendChild(text);

  const strip = document.createElement("div");
  strip.className = "dot-strip";
  for (let i=0;i<summary.giant_component;i++) {
    const d = document.createElement("div");
    d.className = "dot giant";
    strip.appendChild(d);
  }
  for (let i=0;i<summary.island_component;i++) {
    const d = document.createElement("div");
    d.className = "dot island";
    strip.appendChild(d);
  }
  for (let i=0;i<summary.isolates;i++) {
    const d = document.createElement("div");
    d.className = "dot isolate";
    strip.appendChild(d);
  }
  container.appendChild(strip);

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `
    <span><span class="sw" style="background:#67d5ff"></span>Giant component</span>
    <span><span class="sw" style="background:#ffc83d"></span>9-node island</span>
    <span><span class="sw" style="background:#ab8cff"></span>Isolates</span>
  `;
  container.appendChild(legend);

  if (metrics.island_nodes && metrics.island_nodes.length) {
    const note = document.createElement("p");
    note.className = "small-note";
    note.innerHTML = `<strong>Small-component characters:</strong> ${metrics.island_nodes.join(", ")}.`;
    container.appendChild(note);
  }
}

function renderReciprocity(metrics) {
  const s = metrics.summary;
  const container = document.getElementById("reciprocity-viz");
  container.innerHTML = "";

  const stack = document.createElement("div");
  stack.className = "stack";
  const a = document.createElement("div");
  a.className = "part-one";
  a.style.width = `${s.one_way_share}%`;
  const b = document.createElement("div");
  b.className = "part-two";
  b.style.width = `${s.reciprocated_share}%`;
  stack.appendChild(a);
  stack.appendChild(b);
  container.appendChild(stack);

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `
    <span><span class="sw" style="background:#ff6a5f"></span>One-way directed edges: ${s.one_way_edges} (${s.one_way_share.toFixed(1)}%)</span>
    <span><span class="sw" style="background:#67d5ff"></span>Edges in reciprocal pairs: ${s.reciprocated_edges} (${s.reciprocated_share.toFixed(1)}%)</span>
  `;
  container.appendChild(legend);

  const note = document.createElement("p");
  note.className = "small-note";
  note.textContent = `Because mutual links count twice in the directed graph but once in the undirected graph, the conversion from 1,784 to 1,434 reveals 350 reciprocal pairs.`;
  container.appendChild(note);
}

function renderLeaderboardTable(title, items, degreeLabel) {
  const card = document.createElement("div");
  card.className = "table-card";
  let rows = "";

  if (items && items.length) {
    rows = items.slice(0,5).map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.name}</td>
        <td>${item.degree}</td>
      </tr>
    `).join("");
  } else {
    rows = `
      <tr><td>1</td><td>Run analysis script</td><td>—</td></tr>
      <tr><td>2</td><td>to populate this</td><td>—</td></tr>
    `;
  }

  card.innerHTML = `
    <h3>${title}</h3>
    <table>
      <thead>
        <tr><th>#</th><th>Character</th><th>${degreeLabel}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return card;
}

function renderLeaderboards(metrics) {
  const container = document.getElementById("leaderboards");
  const note = document.getElementById("leaderboard-note");
  container.innerHTML = "";
  container.appendChild(renderLeaderboardTable("Top in-degree", metrics.top_in, "in-degree"));
  container.appendChild(renderLeaderboardTable("Top out-degree", metrics.top_out, "out-degree"));
  if (metrics.top_in && metrics.top_in.length && metrics.top_out && metrics.top_out.length) {
    note.textContent = "These leaderboards were generated directly from the frozen Week‑1 snapshot.";
  }
}

async function initWeek1Page(jsonPath) {
  const metrics = await loadWeek1Metrics(jsonPath);
  if (!metrics) return;
  renderInsights(metrics);
  renderComponentStrip(metrics);
  renderReciprocity(metrics);
  renderLeaderboards(metrics);
}
