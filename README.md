# GRAPHVERSE — Week 1

This version is built around the actual course goal: a public group website with one short interactive data story per week.

## Files

```text
index.html              # homepage / week index
style.css               # comic-book presentation theme
site-config.js          # group name and members
posts/week1.html        # the Week 1 presentation
js/week1.js             # loads + analyzes the frozen Week 1 course data
```

## What Week 1 does

The Week 1 post automatically fetches the frozen course snapshot from the public course GitHub repository and computes:

- 303 nodes and 1,784 directed edges
- 1,434 undirected pairs
- density
- connected components and isolates
- top in-degree and out-degree characters
- Spider-Man's incoming ego-network
- raw in-degree and out-degree distributions
- reciprocal pairs

It validates the course benchmark values on load.

## Customize your group

Edit `site-config.js`.

## Preview locally

Because the Week 1 page uses JavaScript modules, serve the folder rather than double-clicking the HTML:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Deploy

Replace the matching files in your GitHub Pages repository, then:

```bash
git add .
git commit -m "rebuild week 1 presentation"
git push origin main
```

No build step is required.
