WEEK 4 DROP-IN REPLACEMENT

Copy these files into the repository root, preserving folders:

  index.html
  week4.css
  posts/week4.html
  js/week4.js

Then:

  git add .
  git commit -m "add week 4 community story"
  git push origin main

No build step is required.

The page fetches the frozen Week 4 philosopher TSVs directly from the public course repository at runtime.
It uses D3 plus Graphology's Louvain implementation from public ESM CDNs.

Story:
  1. Adjustable Louvain resolution gamma
  2. Five-seed community stability / border crossers
  3. Weighted disparity-filter backbone

If GitHub Pages is already configured for main/root, the live site should update after the push.
