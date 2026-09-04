"""
Build data for the Week-1 GitHub Pages post.

Place week1_nodes.tsv and week1_edges.tsv either in this analysis/ folder or pass
their paths explicitly. The script writes ../assets/week1-metrics.json, which the
website loads automatically.

Usage:
    source ~/socialgraphs-env/bin/activate
    python -m pip install pandas networkx
    python analysis/build_week1_site_data.py

Optional:
    python analysis/build_week1_site_data.py ../week1_nodes.tsv ../week1_edges.tsv
"""

from pathlib import Path
import json
import sys
import pandas as pd
import networkx as nx

HERE = Path(__file__).resolve().parent
DEFAULT_NODES = HERE / "week1_nodes.tsv"
DEFAULT_EDGES = HERE / "week1_edges.tsv"

if len(sys.argv) == 3:
    nodes_path = Path(sys.argv[1])
    edges_path = Path(sys.argv[2])
else:
    nodes_path = DEFAULT_NODES
    edges_path = DEFAULT_EDGES

if not nodes_path.exists() or not edges_path.exists():
    raise FileNotFoundError(
        "Could not find week1_nodes.tsv and week1_edges.tsv. "
        "Put them in the analysis/ folder or pass both paths explicitly."
    )

nodes = pd.read_csv(nodes_path, sep="\t", comment="#", quoting=3)
edges = pd.read_csv(edges_path, sep="\t", comment="#", names=["source", "target"])

name_for = dict(zip(nodes.node_id, nodes.name))

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False, name=None))

U = nx.Graph()
U.add_nodes_from(G.nodes)
U.add_edges_from(G.edges)

n = G.number_of_nodes()
m_dir = G.number_of_edges()
m_undir = U.number_of_edges()

components = sorted(nx.connected_components(U), key=len, reverse=True)
giant = components[0]
island = components[1] if len(components) > 1 else set()
isolates = list(nx.isolates(U))

reciprocal_pairs = sum(
    1 for u, v in G.edges()
    if u < v and G.has_edge(v, u)
)
reciprocated_edges = 2 * reciprocal_pairs
one_way_edges = m_dir - reciprocated_edges

in_deg = dict(G.in_degree())
out_deg = dict(G.out_degree())

top_in = sorted(in_deg.items(), key=lambda x: x[1], reverse=True)[:5]
top_out = sorted(out_deg.items(), key=lambda x: x[1], reverse=True)[:5]

def pack_leaderboard(rows):
    return [
        {"node_id": node, "name": name_for.get(node, node), "degree": int(deg)}
        for node, deg in rows
    ]

summary = {
    "n": int(n),
    "directed_edges": int(m_dir),
    "undirected_pairs": int(m_undir),
    "mean_directed_degree": round(m_dir / n, 2),
    "mean_undirected_degree": round(2 * m_undir / n, 2),
    "isolates": int(len(isolates)),
    "giant_component": int(len(giant)),
    "island_component": int(len(island)),
    "outside_giant": int(n - len(giant)),
    "giant_share": round(len(giant) / n * 100, 1),
    "reciprocal_pairs": int(reciprocal_pairs),
    "reciprocated_edges": int(reciprocated_edges),
    "reciprocated_share": round(reciprocated_edges / m_dir * 100, 1),
    "one_way_edges": int(one_way_edges),
    "one_way_share": round(one_way_edges / m_dir * 100, 1),
    "max_in": {
        "node_id": top_in[0][0],
        "name": name_for.get(top_in[0][0], top_in[0][0]),
        "degree": int(top_in[0][1])
    },
    "max_out": {
        "node_id": top_out[0][0],
        "name": name_for.get(top_out[0][0], top_out[0][0]),
        "degree": int(top_out[0][1])
    },
    "spider_incoming_share_percent": round(in_deg.get("Spider-Man", 0) / m_dir * 100, 1),
    "spider_node_share_percent": round(in_deg.get("Spider-Man", 0) / n * 100, 1),
    "spider_multiple_of_avg_in": round(in_deg.get("Spider-Man", 0) / (m_dir / n), 1),
    "betsy_multiple_of_avg_out": round(out_deg.get("Betsy_Braddock", 0) / (m_dir / n), 1),
}

data = {
    "summary": summary,
    "top_in": pack_leaderboard(top_in),
    "top_out": pack_leaderboard(top_out),
    "island_nodes": [name_for.get(node, node) for node in sorted(island)],
    "isolates": [name_for.get(node, node) for node in sorted(isolates)],
}

out_path = HERE.parent / "assets" / "week1-metrics.json"
out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

print("Wrote:", out_path)
print("Top in-degree:", data["top_in"])
print("Top out-degree:", data["top_out"])
print("Island nodes:", data["island_nodes"])
print("Isolates:", len(data["isolates"]))
