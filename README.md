# Kite Flock

A small, dependency-free local web playground. Start with 12 moving kite-shaped marks, enter a count and choose **Update flock**, or use the 12 / 48 / 120 presets. **Pause / Resume** freezes and resumes the motion; the circular arrow creates a fresh arrangement at the same count.

## Run

Requires Node.js 18 or newer (developed with the installed Node.js 21.6.2). No package installation is necessary.

```sh
cd "/Users/danilkum/Documents/ChatGPT/Fun games"
npm start
```

Open **http://127.0.0.1:4173** on the laptop. Stop the server with Ctrl+C in its terminal. Set `PORT` to choose another port.

### Open on a phone on the same Wi-Fi

The server now binds to `0.0.0.0`, accepting connections from the local network. At startup it prints **Same Wi-Fi / LAN** addresses. Open the address matching the laptop's Wi-Fi adapter on the phone, for example `http://192.168.x.x:4173/`. Use `http://`, and use the laptop's IP rather than `localhost` on the phone. Keep the laptop awake and the server running.

If localhost works but the phone cannot connect, check that both devices are on the same non-guest Wi-Fi, Node is allowed to receive incoming connections in the laptop's firewall, and the network or VPN permits connections between local devices. The server serves only the four public app assets; it does not expose the repository directory. No router port forwarding is needed for same-Wi-Fi use. To restrict the app to the laptop again, run `HOST=127.0.0.1 npm start`.

## GitHub Pages

The simulation is a static site: all movement runs in the visitor's browser. GitHub Pages does not run `server.mjs`. Styles, scripts, module imports, and the home link use relative paths so the app works at both `/` and `/fun-games/`.

### Current repository setup

The source repository is [Anilkumar011/fun-games](https://github.com/Anilkumar011/fun-games), currently private. On 14 October 2026, GitHub rejected Pages activation with: **Your current plan does not support GitHub Pages for this repository.** No public site was activated. GitHub Pages supports public repositories on Free and private repositories on eligible paid plans; see [GitHub's Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

To publish, first choose a public repository for the app, make this repository public, or use an eligible GitHub plan while keeping it private. Repository visibility is a separate choice from the public website; the app has not changed it automatically.

Once the destination supports Pages:

1. Open the repository's **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
2. Open **Actions → Deploy Kite Flock to GitHub Pages → Run workflow**, selecting `main`.
3. Wait for the `deploy` job to succeed. Its environment link is the actual published website address. A site in the current repository would normally use `https://anilkumar011.github.io/fun-games/`; this is an expected address, not a claim that it is live.

The workflow also runs on pushes to `main`. It tests the simulation and hosting paths, builds `dist/`, and uploads only the four app files plus `.nojekyll`. If Pages is not enabled yet, tests/build still run and deployment is skipped with a setup notice. The source, tests, local server, README, and preview image are excluded from the deployed website artifact. For a separate repository, include this workflow and its supporting source/test/build files, or upload just the contents of `dist/` using that repository's static Pages setup.

### Preview exactly the static site locally

```sh
npm run preview
```

Open **http://127.0.0.1:4174/fun-games/**. This serves the generated files under a repository subpath and can run alongside the Wi-Fi server on port 4173. Use Ctrl+C to stop it. `npm run build` recreates the generated `dist/` directory, which is ignored by Git.

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

Seven deterministic tests cover heading convergence, cohesion, shared cruising speed, faster catch-up and return to cruise, head-on encounters, bounded movement, a 600-kite dense run, resizing/count limits, and static HTTP hosting at both the domain root and a repository subpath. Hosting checks validate module MIME types, relative asset links, redirects, and exclusion of non-site files. The collision assertions check conservative circular clearances around the visible kite shapes. These are tested numerical safeguards, not a mathematical guarantee for every possible state.

The app was also checked in a browser at desktop and phone widths, including count presets, count validation, pause/resume, reset, and the adaptive count limit.

## Files

- `index.html`, `styles.css`: responsive interface.
- `app.mjs`: canvas rendering and controls.
- `flock.mjs`: simulation engine, independent of the browser.
- `server.mjs`: local static server using Node's standard library.
- `test/flock.test.mjs`: movement and clearance checks using Node's built-in test runner.
- `test/hosting.test.mjs`: generated-site and HTTP checks.
- `scripts/build.mjs`, `scripts/preview.mjs`: static packaging and repository-subpath preview.
- `.github/workflows/pages.yml`: validation and GitHub Pages deployment.

No remote assets, frameworks, build tools, or third-party packages are used.
