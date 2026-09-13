WEEK 2 SITE PATCH — THE MULTIVERSE TEST

Copy these files into your existing repository:

  index.html              -> replace existing index.html
  week2.css               -> new file in repository root
  posts/week2.html        -> new file
  js/week2.js             -> new file

Do NOT replace style.css, site-config.js, Week 1 files, or any assets.

Preview locally from the repository root:

  python3 -m http.server 8000

Then open:

  http://localhost:8000/posts/week2.html

The page fetches the same frozen course TSV files that Week 1 already uses.
It automatically creates 100 degree-preserving shuffled universes in the
browser. The progress bar should fill and then the histogram, z-score,
empirical p-value, baseline comparison, and hero-level leaderboard appear.

Git commands after checking it locally:

  git add index.html week2.css posts/week2.html js/week2.js
  git commit -m "add week 2 multiverse null-model story"
  git push origin main
