"""
Optional reproducibility script for the Week-1 post.

Put week1_nodes.tsv and week1_edges.tsv beside this script or change DATA_DIR.
It prints the exact values used in the website and lists the nodes outside the
giant component so your group can investigate the 9-node island.
"""

from pathlib import Path
import pandas as pd
import networkx as nx

DATA_DIR = Path(__file__).resolve().parent

nodes = pd.read_csv(DATA_DIR / "week1_nodes.tsv", sep="\t", comment="#", quoting=3)
edges = pd.read_csv(
    DATA_DIR / "week1_edges.tsv",
    sep="\t",
    comment="#",
    names=["source", "target"],
)

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False, name=None))

U = G.to_undirected()
components = sorted(nx.connected_components(U), key=len, reverse=True)
isolates = list(nx.isolates(U))

print("nodes:", G.number_of_nodes())
print("directed edges:", G.number_of_edges())
print("undirected pairs:", U.number_of_edges())
print("component sizes:", [len(c) for c in components])
print("isolates:", len(isolates))

print("\n9-node island:")
for node in sorted(components[1]):
    print(" ", node)

print("\nTop 5 in-degree:")
for node, degree in sorted(G.in_degree(), key=lambda x: x[1], reverse=True)[:5]:
    print(node, degree)

print("\nTop 5 out-degree:")
for node, degree in sorted(G.out_degree(), key=lambda x: x[1], reverse=True)[:5]:
    print(node, degree)
