# Marvel Graph Lab

A lightweight static GitHub Pages site for the weekly **Go nuts with your LLM** posts in 02805 Social Graphs and Interactions.

## Customize first

Edit `site-config.js`:

```js
window.SITE = {
  groupName: "YOUR GROUP NAME",
  members: ["Member 1", "Member 2", "Member 3"],
  course: "02805 Social Graphs and Interactions",
  repoUrl: ""
};
```

## Preview locally

From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a **public** GitHub repository.
2. Push all files in this folder to the `main` branch.
3. On GitHub: **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Choose `main` and `/(root)`, then save.

For a project repository, the site URL normally looks like:

`https://YOUR-USERNAME.github.io/REPOSITORY/`

## Week 1 reproducibility

The post is based on the frozen Week-1 snapshot. `analysis/week1_analysis.py`
recomputes the checks and prints the 9-node island. Copy the two TSV files into
`analysis/` before running it:

```bash
source ~/socialgraphs-env/bin/activate
python -m pip install pandas networkx
python analysis/week1_analysis.py
```

The website deliberately labels the component visualization as a **schematic**:
its dot positions are decorative; the node counts are the data.
# Social-Graphs-and-Networks-
