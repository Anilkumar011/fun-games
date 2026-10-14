# Kite Flock

A small, dependency-free local web playground. Start with 12 moving kite-shaped marks, enter a count and choose **Update flock**, or use the 12 / 48 / 120 presets. **Pause / Resume** freezes and resumes the motion; the circular arrow creates a fresh arrangement at the same count.

## Run

Requires Node.js 18 or newer (developed with the installed Node.js 21.6.2). No package installation is necessary.

```sh
cd "/Users/danilkum/Documents/ChatGPT/Fun games"
npm start
```

Open **http://127.0.0.1:4173**. The server binds only to the local computer. Stop it with Ctrl+C in its terminal. For a different port, run `PORT=4174 npm start` and open http://127.0.0.1:4174.

## Motion rules

- Each kite steers toward its nearest neighbor's heading. Nearby flock headings also provide gentle smoothing.
- Nearby neighbors exert separation forces. Predictive avoidance and a contact solver keep the enclosing discs of the rendered kites apart, including during catch-up.
- Local cohesion keeps neighbors close. A kite separated by more than 64 pixels accelerates toward its nearest neighbor and its group, with a small lead to intercept a moving group. It settles back to cruise when it is within 34 pixels.
- Kites cruise at 42 CSS pixels per second. Returning kites can reach 76, with smooth acceleration and deceleration. Brief positional corrections during close encounters can affect instantaneous displacement.
- The target neighbor spacing is 24 pixels between centers, approximately one kite-width of clear space. This is a soft target: turns and dense flocks compress the spacing. Each kite fits inside a 7-pixel-radius disc; the contact solver targets 16 pixels between centers.
- Random initial headings and small continuous steering variations make the motion lively. Groups emerge, split, and reconnect; the group counter uses connected neighbors within 64 pixels. A lone kite counts as one group.
- Broad edge steering keeps the flock on the canvas, with a final bounded-position constraint as a safeguard.

The count range is **1–600**, capped further by the current canvas area. The exact limit is displayed beneath the field. A smaller window can reduce the count; the app explains when that happens. Dense populations cost more CPU and can run more slowly on older devices. Long browser stalls drop excess elapsed time instead of letting kites leap through one another. Motion pauses while the page is hidden, and starts paused when the operating system requests reduced motion.

## Verify

```sh
npm test
```

Six deterministic tests cover heading convergence, cohesion, shared cruising speed, faster catch-up and return to cruise, head-on encounters, bounded movement, a 600-kite dense run, and resizing/count limits. The collision assertions check conservative circular clearances around the visible kite shapes. These are tested numerical safeguards, not a mathematical guarantee for every possible state.

The app was also checked in a browser at desktop and phone widths, including count presets, count validation, pause/resume, reset, and the adaptive count limit.

## Files

- `index.html`, `styles.css`: responsive interface.
- `app.mjs`: canvas rendering and controls.
- `flock.mjs`: simulation engine, independent of the browser.
- `server.mjs`: local static server using Node's standard library.
- `test/flock.test.mjs`: movement and clearance checks using Node's built-in test runner.

No remote assets, frameworks, build tools, or third-party packages are used.
