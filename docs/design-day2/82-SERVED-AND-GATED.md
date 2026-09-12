# 82 — Served and gated: the craft-a-bot half of Phase W (WP92, WP93)

> **Status:** design of record for the parts of WP92 and WP93 (`65-DAY5-ROADMAP.md` Phase W) that live in this repository, opened 2026-09-11 on the `day5` branch after WP91. The other half of both — the Node service serving the three folders, the login gate, the workspace token's `SECURITY DEFINER` function, the framing page — lives in `axiomverity` and is not touched here; this note names the seams it will meet.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.9.1 tier 0 and tier 1, §6.9.2, §6.9.3 (retires G57's craft-a-bot side; tenet 26): a versioned release artefact of the three sections, `docs/publishing.md` rewritten for the site, the simulator noticing it is served from the site and offering the member's workspace, the decision-rights ceilings citing the site's page, the *About* strip linking back.

---

## 1. Principles

- **Client-only, said out loud.** Nothing here adds a request to any server: the offer is a link, the ceilings are content, the artefact is a folder set. *Your keys never leave your browser* stays true and is printed where a visitor lands.
- **An affordance, not a dependency** (`64-…` §12). `servedFromSite` decides whether to *offer*; every screen works unchanged when it says no or the visitor declines.
- **The seam is named, not assumed.** Every page on the site this half links to is a constant in one module (`lib/workshop/site.ts`), so the site's half has one place to match.

## 2. WP92 — the release artefact and the publishing note

`.github/workflows/release.yml`: on a tag `v*` (or the button), `build:editions` against the four budgets, then `craftabot-site-<version>.zip` — the three folders, `PUBLISHING.md`, a `VERSION` file naming the tag and the commit — with its SHA-256, uploaded as a workflow artefact and attached to the GitHub release. `docs/publishing.md` §6 says how the site serves it: the Node service mounts the three folders as static assets under their bases, one SPA fallback each; `hooks.server.ts` gates the three paths at the member tier and returns the visitor to the path they asked for; the cache per edition (WP91) is what lets three sections share the origin; the posture line the landing of each section carries.

## 3. WP93 — the offer, the ceilings, the strip

- **The offer.** `lib/workshop/site.ts`: `servedFromSite(hostname, base)` is true only under an edition's base on the site's own hosts. The Evidence screen shows *Use my Axiom Verity workspace* only then — a link to the site's account page where a signed-in member mints a scoped workspace token (the site's `SECURITY DEFINER` function, WP93's other half) and the same URL and token fields as everyone else, so the token pasted there is the one the store's contract already accepts. Nothing is read from a session; the site's anon key is not in the app.
- **The ceilings.** `packages/packs/fs-lending/src/decision-rights.ts` already renders the decision-rights table as content with its source cited; the source now names the framing page (`page`), so the pack and the register cite where the ceilings come from.
- **The strip.** Settings' *About* carries the posture line and a link back to the framing page — the simulator's end of the two-direction investigation `64-…` §6.9.3 describes.

## 4. What the site's half must meet

| In `axiomverity` | Meets |
|---|---|
| The three folders from `craftabot-site-<version>.zip` mounted at `/simulator`, `/workshop`, `/playground` with one SPA fallback each | `docs/publishing.md` §6 |
| `hooks.server.ts` redirecting an unauthenticated request for any of the three to `/login?returnTo=…` (`isSafeRedirectPath`) | the same |
| `/account`'s *simulator workspace* card minting the scoped token | `SITE_WORKSPACE_PAGE` |
| `/thought-experiment/simulator`, the framing page, generated from `docs/evidence/` | `SITE_FRAMING_PAGE`; `docs/evidence/<id>/<id>.experiment-result.json` |
| `labs.ts`'s `craft-a-bot` entry | the three section roots |

## 5. Tests

`site.test.ts` (true only on the site's hosts under a base; the two pages on the site); the Evidence screen's offer absent under `full` on localhost (`evidence.spec.ts` keeps its assertions; the offer's test id `evidence-site-offer` is absent); the release workflow validates as YAML in CI's lint of workflows (none today — it is exercised by the first tag); the two-section e2e (WP91) is the served-origin check the site's half repeats on a preview deploy.

## 6. Divergences

- The offer links to the site's account page rather than minting in place: minting needs the site's session, which the simulator does not read (`64-…` §6.9.2, the standing rule). The site's half may later hand the token across with a `postMessage` from the same origin; the field is there to receive it.
- The release is a tag-driven workflow rather than an artefact on every push: CI's `editions` job already uploads the three folders per push (`site-editions`); the release names a version.
