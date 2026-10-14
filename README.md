# Kite Flock

A dependency-free bird-flocking playground over a soft blue sky. Start with 12 sparrow-like birds, type a count or use the number arrows to change it immediately, or choose a 12 / 48 / 120 preset. Existing birds keep their positions when the population changes. The **Flight speed** slider adjusts the pace from **0.4× to 2.5×**, with gradual acceleration and deceleration. **Pause / Resume** eases the animation to a stop and back into flight; the circular arrow starts a fresh arrangement at the same count and selected pace.

![Bird flock over the sky](preview.jpg)

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

The source repository is [Anilkumar011/fun-games](https://github.com/Anilkumar011/fun-games), and it is public. GitHub Pages is configured with GitHub Actions, and the published app is **[https://anilkumar011.github.io/fun-games/](https://anilkumar011.github.io/fun-games/)**. Anyone can open this HTTPS link on a phone or computer; the laptop server does not need to be running.

To configure Pages again or set up a fork:

1. Open the repository's **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
2. Open **Actions → Deploy Kite Flock to GitHub Pages → Run workflow**, selecting `main`.
3. Wait for the `deploy` job to succeed. Its environment link is the published website address for that repository.

GitHub Pages supports public repositories on Free and private repositories on eligible paid plans; see [GitHub's Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). A fork kept private must have an eligible plan before enabling Pages.

The workflow also runs on pushes to `main`. It tests the simulation and hosting paths, builds `dist/`, and uploads only the four app files plus `.nojekyll`. If Pages is not enabled yet, tests/build still run and deployment is skipped with a setup notice. The source, tests, local server, README, and preview image are excluded from the deployed website artifact. For a separate repository, include this workflow and its supporting source/test/build files, or upload just the contents of `dist/` using that repository's static Pages setup.

### Preview exactly the static site locally

```sh
npm run preview
```

Open **http://127.0.0.1:4174/fun-games/**. This serves the generated files under a repository subpath and can run alongside the Wi-Fi server on port 4173. Use Ctrl+C to stop it. `npm run build` recreates the generated `dist/` directory, which is ignored by Git.

## Motion rules and limits

- Each bird follows its nearest neighbor's heading, with nearby headings providing gentle smoothing. Angular acceleration and turn-rate limits create gradual banking and turning; wings flap at varied phases.
- Separation, predictive avoidance, and a contact solver keep conservative circles around the complete wing silhouettes apart, including while catching up.
- The birds seek one shared flock. Detached smaller groups actively steer toward the main flock, and an elliptical shared boundary discourages stragglers from drifting away. Temporary fragments can appear during turns or count/viewport changes, but they actively rejoin rather than continuing as independent flocks.
- Group cruise speed is 42 CSS pixels per second at 1.0×, ranging from 16.8 to 105. Catch-up speed adds the greater of 24 pixels per second or 70% of the current cruise speed. This gives stragglers enough closing speed even at the slowest setting. They return to the shared pace after joining. Close-contact positional corrections can briefly affect actual displacement.
- At full size, birds fit within a 10.5-pixel radius. The solver targets 23 pixels between centers; preferred spacing is 38 pixels. The **same adaptive scale** applies to bird geometry, clearance, preferred spacing, and neighbor ranges. Preferred spacing is a soft target during dense turns.
- Broad edge steering keeps the flock visible, with a final bounded-position constraint as a safeguard.

The limits are **1–1,200 birds in desktop views** and **1–300 in phone-sized views**, without an additional area-based count cap. Phone-sized means a viewport narrower than 768 pixels, or narrower than 1,000 pixels and shorter than 500 pixels (including landscape phones). When resizing from desktop to a phone-sized view, the first 300 birds are retained and a message explains the change.

As density rises, birds and their clearance distances shrink together to fit the available sky. Lower-count birds retain their full-size wing/body cues; at maximum counts the birds intentionally become small silhouettes. The status bar shows the current scale. Returning to a smaller population eases sizes back up without resetting the surviving birds.

Valid count edits apply immediately. Empty, fractional, or out-of-range edits leave the existing flock flying; leaving the field restores the last active count if the edit is still invalid. Numeric spatial grids keep neighbor lookup and collision work local. Actual frame rates depend on the device; dense flocks can be slower on older phones. Long browser stalls drop excess elapsed time rather than teleporting birds through one another. Motion pauses while the page is hidden and starts paused when the operating system requests reduced motion.

## Verify

```sh
npm test
```

Nine deterministic tests cover desktop/mobile caps, incremental count changes and survivor identity, invalid editing states, smooth turning and speed changes, shared cruising speed, catch-up at slow and fast paces, deliberate group merging, head-on clearance, 1,200/300-bird stress runs through speed changes, viewport changes, and static HTTP hosting under both the domain root and a repository subpath. Hosting checks validate module MIME types, relative asset links, redirects, and exclusion of non-site files. Collision checks use conservative circles around the full wings; these are tested numerical safeguards, not a mathematical guarantee for every possible state.

Browser checks include immediate 100→101 input-arrow changes, empty/out-of-range editing, both speed-slider endpoints, desktop/mobile maxima, responsive layouts, and pause/resume. Maximum-count playback is checked on the development laptop in desktop and phone-sized viewports; this does not substitute for performance testing on every physical phone.

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
