# Cricket Notebook

Two-player dice-cricket simulator (T20 + ODI). No build step — open `index.html`.

- `engine.js` — deterministic rules engine; `test.js` (`node test.js`) must stay green.
- `tactics.md` — bowling tactics + match-balance design doc; keep in sync with engine changes.
- The UI design (index.html/styles.css layout, palette, type) was generated with
  claude.ai/design project `f28e38c9-5ee1-4c9d-9d39-5751cc5f4bca`; the verbatim
  export lives in `claude-design-source/`. Iterate the design there or by editing
  the CSS directly — don't regenerate from scratch casually.
- Seeds are always random in the UI; `?seed=&format=&stadium=&auto=1&to=&tab=&rules=1`
  are hidden deep-links for replay/testing/screenshots.
