# Publishing the site

Craft A Bot is one codebase built as three sections of a site (WP69,
[`59-EDITIONS.md`](design-day2/59-EDITIONS.md); `41-TARGET-DESIGN-V4.md` §6.14,
decision D3):

| Section       | Edition      | Folder                             | What is in the box                                                                                       |
| ------------- | ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/simulator`  | `simulator`  | `apps/workbench/build/simulator/`  | The Kit: the starter bricks, the four model brands and personas, the Safety Patrol, the Explorer's World |
| `/workshop`   | `workshop`   | `apps/workbench/build/workshop/`   | The Kit plus the Workshop: guard services, evaluators, campaigns, the evidence store, the assurance pack |
| `/playground` | `playground` | `apps/workbench/build/playground/` | The Workshop plus the synthetic bank and the three desks                                                 |

Each edition is decided **at build time** and never at run time: a folder
carries only its own packs, and a route outside its box renders a "not in
this box" page that links to the section that has it. `npm run build` still
builds `full` — the whole app under no base, what `npm run preview` serves
and what every test runs against — into `apps/workbench/build/`.

## 1. Build the three folders

```bash
npm run build:editions
```

This builds `simulator`, `workshop` and `playground` in turn, each under its
own `base` (`/simulator`, `/workshop`, `/playground`) and each measured against
its own bundle budget (`edition.ts`); the command fails when a folder is over.
CI's `editions` job does the same and uploads the three folders as one artefact.
To build one: `npm run build:editions -- playground`.

## 2. Put the folders on a static host

Upload each folder to the path with its name — `build/simulator/` at
`/simulator/`, and so on. Nothing runs on the server; the sections are static
files, and a visitor's bots, runs and keys live in their own browser.

**One rewrite rule per folder.** The app is a single page: a deep link such as
`/workshop/workshop/runs` must serve `/workshop/index.html`. Every static host
has a way to say so:

- **Netlify** (`_redirects` at the site root):
  ```
  /simulator/*   /simulator/index.html   200
  /workshop/*    /workshop/index.html    200
  /playground/*  /playground/index.html  200
  ```
- **Vercel** (`vercel.json`): `{ "rewrites": [{ "source": "/simulator/(.*)", "destination": "/simulator/index.html" }, …] }`
- **Cloudflare Pages**: the same `_redirects` file.
- **nginx**: `location /simulator/ { try_files $uri /simulator/index.html; }` per section.
- **GitHub Pages** has no rewrites: copy each folder's `index.html` to `404.html` inside it, which serves the app for any path under the folder.

**One cache per section.** Each section registers its own service worker under
its own base, and since WP91 (`81-THE-TAIL-DAY5.md` §1) names its cache
`craftabot-shell-<edition>-<version>` and clears only its own older caches, so a
visitor moving from `/workshop/` to `/playground/` on one origin never opens on a
blank page holding the other build's shell. Nothing to configure: keep the
sections under distinct paths, as above, and never serve two different builds at
the same path on one origin without a new build version.

Without the rule the section still opens at its root and every link inside the
app works; only a pasted deep link fails. To see the site as a host serves it,
`npm run serve:site` after `npm run build:editions` serves the whole `build/`
tree with one fallback per folder (`scripts/serve-site.mjs`) — what the
editions' smoke specs run against. (`vite preview` cannot: its one fallback
answers `/playground/` with the `full` build's document.)

## 3. A login in front of the Playground

Whether `/playground` sits behind a login is a **hosting rule in front of its
folder** — basic auth, an identity-aware proxy, a Cloudflare Access policy —
and the app never knows (decision D3). Nothing in the folder reads a session,
and there is no account in the app: a visitor who reaches the folder has it.

## 4. Keys, and what the sections share

An API key lives in the visitor's browser (`localStorage`, `cab.keys.v1`) and is
sent only to its provider at call time. Sections on one host share an origin
and therefore a vault: a key fitted in `/simulator` is present in `/workshop`
on the same host. A host that wants the sections isolated puts them on
subdomains (`simulator.example.org`, `workshop.example.org`), which the
folders support unchanged — set the rewrite rule per site instead of per
folder. Nothing else is shared between sections but the visitor's own exported
files: a kit file exported from the Playground imports into the Simulator only
where its packs exist, and says which section has them where they do not.

## 5. Checking a deployment

Each section's smoke spec runs against its folder in CI (`npm run e2e:editions`):
the Kit's first run with the key-leak gate under `/simulator`, the Workshop's Run
Lab under `/workshop`, the Playground's Advice Desk under `/playground`, and a
route outside each box rendering the not-in-this-box page. After a deployment,
open each section's root and a deep link into it.

## 6. On axiom-verity.com

The three sections are published beside the thought experiment
(`design-day2/64-TARGET-DESIGN-V5.md` §6.9; `82-SERVED-AND-GATED.md`), and the
site's deployment takes a **versioned folder set**, never a working tree:

1. **The artefact.** A tag `v*` (or the _release_ workflow's button) runs
   `.github/workflows/release.yml`: `build:editions` against the four budgets,
   then `craftabot-site-<version>.zip` — `simulator/`, `workshop/`, `playground/`,
   this note as `PUBLISHING.md`, a `VERSION` file naming the tag and the commit —
   with its SHA-256 beside it, attached to the GitHub release. CI's `editions` job
   uploads the same three folders on every push (`site-editions`) for a preview.
2. **Serving.** The site's Node service mounts the three folders as static assets
   at `/simulator`, `/workshop` and `/playground`, one SPA fallback per folder
   (§2's rule). Nothing in a folder is server-rendered and nothing in it reads a
   session.
3. **The gate.** `hooks.server.ts` redirects an unauthenticated request for any
   of the three paths to `/login` with the return path, the pattern `/account`
   uses; a visitor who reaches a folder has it (§3). The gate is in front of the
   folder; the app never knows.
4. **The cache.** One service worker per section, its cache named per edition
   (§2, WP91): three sections on one origin never serve each other's shell.
5. **The posture line.** Each section's landing carries _your keys never leave
   your browser; nothing you run is seen by anyone_ — the site classifies the
   simulator as client-only, and that line is why. Keys stay in `localStorage`
   (§4); the key-leak sweep runs over the served folders.
6. **The workspace (opt-in).** A signed-in member's account is an evidence-store
   workspace: the site mints a scoped token, and the simulator's Evidence screen
   offers _Use my Axiom Verity workspace_ when it notices it is served from the
   site (`lib/workshop/site.ts`), with the same URL and token fields as
   everywhere else. Nothing requires the store; every screen works with the
   offer declined.

After a deployment: open each section's root and a deep link into it (§5), sign
out and confirm the redirect and the return, and run the two-section
service-worker spec against the served origin
(`npx playwright test --config playwright.editions.config.ts --project=site`
with `baseURL` pointed at the site).
