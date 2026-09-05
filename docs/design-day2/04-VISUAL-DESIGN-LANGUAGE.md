> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward unchanged. `15-UIUX-DUAL-MODE.md` §6 extends this language with the professional-mode “bench instrument” skin, built from the same tokens.
> This file is a verbatim copy of `docs/design/04-VISUAL-DESIGN-LANGUAGE.md` carried into the standalone Day 2 set; only this banner has been added.

# 04 — Visual Design Language

> The Craft A Bot look: 1970s/80s construction-toy branding distilled from the four existing box-art pieces into tokens, rules, and a production brief for the visual-asset workstream.
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`. Applied in `03-UI-UX-DESIGN.md`.

---

## 1. Art direction summary

The existing box art (in `assets/` — the four ChatGPT-generated boxes: My Very First Agent, Agent Builder, AI Architect, LLM Multi-Pack) establishes the direction precisely. Its ingredients:

- **Vintage toy-box print:** warm cream card stock, saturated primary inks, subtle halftone grain, slightly worn edges and corner scuffs, colour registration that's a hair off — everything looks *printed in 1981*, not rendered in 2026.
- **Chunky moulded plastic:** bricks read as thick injection-moulded parts — soft-radius corners, visible studs, gentle specular highlight top-left, moulded (embossed) lettering.
- **Rounded jolly typography** for the logo; **warm serif** for sub-brand names; **compact grotesque caps** for functional labels and badges.
- **Framed panel composition:** cream panels with thick rounded borders (blue or red), yellow accent flashes, circular badges ("AGES 2–5", "150+ PARTS"), and a tagline strip along the bottom in yellow-on-blue.
- **Warm illustrated scenes:** children + robot in cosy domestic settings, storybook painting style.

The app should feel like **playing inside that box art**.

## 2. Colour tokens

Derived from the box art. Canonical hex values for CSS custom properties (`--cab-*`). The "printed" feel comes from these being slightly muted, never neon.

### 2.1 Brand core

| Token | Hex | Use |
|---|---|---|
| `--cab-cream` | `#F3E9D2` | Panel/card backgrounds, box cream |
| `--cab-paper` | `#EFE3C8` | Deeper aged-paper background |
| `--cab-ink` | `#2B2620` | Primary text ("printed ink" near-black) |
| `--cab-blue` | `#2456A6` | Logo blue, primary frames, LLM brick |
| `--cab-red` | `#C93A2E` | Logo red, Actions brick, alerts/STOP |
| `--cab-green` | `#4E8A3C` | Logo green, Memory brick, success |
| `--cab-yellow` | `#E9B62F` | Accent flashes, badges, wheels/connectors |
| `--cab-purple` | `#6C4F9E` | Tools brick |
| `--cab-sky` | `#5B8FCB` | Sense brick (lighter blue, distinct silhouette required — see §7) |
| `--cab-safety` | `#E9B62F` + `#2B2620` stripes | Safety brick (hazard stripe) |
| `--cab-teal` | `#3E8F8A` | Reserved (Multi-Pack "Creator" cartridge; spare series colour) |
| `--cab-orange` | `#D77A3C` | Reserved (Multi-Pack "Storyteller"; warnings-lite) |

### 2.2 Functional mapping (fixed — the colour *is* the concept)

LLM = blue · Memory = green · Tools = purple · Sense = sky · Actions = red · Safety = yellow/black · Connectors & wheels = yellow · Goal Cards = cream with green header rule. Trace rows, panel accents, meters, and documentation diagrams must all follow this mapping. **Never reassign these colours.**

> **Amended 2026-08-20 (WP30 stage A):** **Planner = rose** (`--cab-rose`, `#a8467a`) joins the mapping — the first addition since it was fixed, not a reassignment of any of the above. Deliberately not `--cab-teal`/`--cab-orange`: both already exist in the brand palette but carry no fixed concept of their own (box-art tint variety, the Goal Card difficulty chip), so reusing one for a brick concept would have given one colour two meanings. A genuinely new hue keeps "the colour is the concept" true for every concept, old or new.
>
> **Amended 2026-08-20 (If/Then sizing, stage B):** **If/Then (reflexes) = indigo** (`--cab-indigo`, `#3f51b5`) joins as the mapping's second addition, for the same reason — every warm hue already carries a concept (red, yellow, orange, rose) and the cooler ones already in use (blue, sky, teal) sit close enough to risk being read as one of them.

> **Amended 2026-09-05 (WP57 stage A, `44-CONTROL-ROOM.md` §4.1):** two more additions to the mapping, by the same reasoning as the two above — **Counterpart = leather brown** (`--cab-counterpart`, `#6e4a2f`): the person across the desk, a hue that is neither a brick nor the room (`--cab-board`'s wood is lighter and yellower); **Truth = deep plum** (`--cab-truth`, `#5a2d5c`): the case file seen after the fact, distinct from Tools purple (bluer, lighter) and Planner rose (pinker). Alongside them, three **finishes** for the Control Room — `--cab-metal` `#c9c4b6` (the brushed panel), `--cab-engrave` `#4d463c` (label ink on metal, darkened until it clears 4.5:1 there), `--cab-graph` `#efe8d6` (graph-paper cream; its 4-px rule is a CSS pattern, not a token) — and three **status** tokens that replace the habit of borrowing the `-text` hues for verdicts: `--cab-pass` `#2f5a24`, `--cab-fail` `#a72e24`, `--cab-inconclusive` `#6b5000`. `pass` and `inconclusive` are darker than the text hues they descend from because the Workshop's paper (`#d8d4cc`) is darker than the Kit's, and a verdict has to read on both. All eight live in `:root`, the Workshop layer leaves them alone, and `contrast.test.ts` holds each on every ground it sits on. Nothing above is reassigned; `--cab-board` and `--cab-rug` are untouched.

### 2.3 Support neutrals

`--cab-shadow: #00000026` (soft drop shadows) · `--cab-plastic-hi: #FFFFFF59` (specular) · `--cab-board: #7A5C3E` (wooden shelf/bench wood) · `--cab-rug: #C9705E` (playroom rug terracotta).

**Secondary text:** `--cab-ink-muted: #5C5348` (quiet text on cream or paper) · `--cab-cream-muted: #CFC4AB` (quiet text on ink).

> **Amended 2026-08-14 (WP17 §2.7):** the two muted tokens are new, and they replace a habit rather than filling a gap. Quieter text was made by putting `opacity` on it — in **57 places** — which is a well-known accessibility trap: dimming composites the text toward whatever is behind it, so the *rendering* fails even though every token involved passes. `contrast.test.ts` could not see it, because the tokens were never the problem.
>
> The first automated audit (axe, WCAG 2.1 AA) failed **five of six routes** on `color-contrast`. The worst of it was the Instruction Leaflet at roughly **2:1** — the one screen in the toy whose entire job is to be read, and the one a child needs most.
>
> **The rule this sets: do not dim text with `opacity`.** Use a muted colour that has been checked against the ground it sits on. `opacity` remains right for what it actually means — disabled controls (which WCAG exempts), scrims, and things genuinely fading in and out.
>
> Two corollaries worth keeping. A muted colour is only muted *against a known ground*: `--cab-cream-muted` was briefly applied to the Flight Recorder's rows, which turn out to sit on a light background rather than the dark header, giving 1.36:1. And some grounds admit no text at all — nothing passes AA against `--cab-rug` (even full-strength ink reaches about 4.3), so the Playroom's captions were given their own backing instead of another colour.

## 3. Typography

Free, bundleable faces that hit the period feel (final confirmation in the visual workstream):

| Role | Face (recommendation) | Treatment |
|---|---|---|
| Logo / big headings | **Baloo 2** (or Fredoka) Bold | Rounded jolly caps, tight tracking, cream keyline + offset shadow like the box logo |
| Sub-brand / warm headings | **Alfa Slab One** sparingly, or **Recoleta-like** serif (e.g. Young Serif) | "My very first Agent" script-serif warmth |
| UI labels / badges | **Archivo** SemiBold caps | Compact grotesque, letterspaced +2% |
| Body / leaflet copy | **Archivo** Regular | 16px base, generous leading |
| Real-terminology flip sides & code | **IBM Plex Mono** | The "engineer's view" voice, also period-plausible |

Rules: headings in Title Case or ALL CAPS with keylines, never lowercase minimalist; body text is modern-readable (nostalgia lives in headings, panels, and texture, not in making paragraphs hard to read).

## 4. Texture & finish

- **Paper grain** overlay on all cream surfaces (tileable noise, ~4% opacity) + faint halftone dot pattern on large colour fills (visible only at >200px scales).
- **Edge wear:** panels and the leaflet get 1–2px irregular border erosion + corner scuff decals (sparingly — two per screen maximum; wear is seasoning, not soup).
- **Plastic finish** on bricks: top-left specular gradient, bottom-right ambient occlusion, stud highlights. One global light direction (top-left) everywhere.
- **Print misregistration:** ±1px colour-plate offset on decorative headings only. Never on body text or UI controls (accessibility).
- **Shadows:** soft, warm-tinted, short throw — objects sit on a table, they don't float in space.

## 5. Component styling rules

| Component | Treatment |
|---|---|
| **Bricks** | 2×1 stud proportions base; type-specific silhouette (see §7); embossed name on the face; category icon moulded white; sockets show matching negative shape |
| **Model cartridges** | The Multi-Pack cartridge shape: rounded rectangle with grip ridges, gold edge-connector pins at the bottom, friendly face + skill icon label — exactly as the Multi-Pack art |
| **Buttons** | Chunky plastic push-buttons: 3px darker rim, pressed state translates 2px down and dims highlight. GO lever is a special large red/yellow lever with a pull animation |
| **Panels/cards** | Cream fill, 3–4px rounded border in section colour, 12px radius, title in a colour tab poking out of the top edge (box-art style) |
| **Badges** | Circular rosettes with starburst edge for achievements; oval "AGES"-style for metadata (e.g. "6 TOOLS INSIDE") |
| **Dials/toggles** | Skeuomorphic-lite: rotary dial with tick marks (temperature), vintage rocker switches (toggles), slide potentiometer (memory span). All still obviously interactive form controls with visible value labels |
| **Meters** | "Battery" segmented bars (token/step budgets) with the classic red-tip end zone |
| **Trace rows** | The one deliberately modern surface: clean rows, monospace payloads — but colour-coded to §2.2 and titled "Flight Recorder" on a cream tab |

## 6. Motion

- Physical, springy, quick: snap = 150ms settle with 1 overshoot; pop-off = 120ms spring; box-open = 400ms lid + parts settle. Nothing longer than 500ms, ever.
- The bot in the Playroom moves in discrete cell hops (~200ms) with a little squash-and-stretch; thinking = gentle antenna pulse.
- `prefers-reduced-motion`: all of the above become opacity/instant state changes (`03-UI-UX-DESIGN.md` §8).
- Sound (off by default): tiny clunk (snap), click (buttons), paper rustle (leaflet), muted fanfare (success). All optional, all skippable.

## 7. Accessibility inside the aesthetic

- Text on cream: use `--cab-ink` (passes AA comfortably). Coloured text only for headings ≥24px and always the darkened text variants: `--cab-blue-text: #1C4485`, `--cab-red-text: #A72E24`, `--cab-green-text: #3A6E2C`, `--cab-purple-text: #55407E`. White text is permitted on blue/red/purple/green fills at ≥16px semibold (all pass AA); **never** white on yellow or sky (fails) — use ink on those.
- Colour never carries meaning alone: every brick type has a **unique silhouette** (LLM: head block with antenna · Memory: satchel/backpack with flap · Tools: belt block with hanging tool loops · Sense: visor strip with lens bumps · Actions: wheeled base block · Safety: chevron-striped shield block) plus an embossed name.
- Focus states: 3px `--cab-blue` outer ring with 2px cream gap — chunky and period-appropriate, highly visible on every background.
- Halftone/grain textures stay below 5% opacity behind text blocks.

> **Amended 2026-08-12 (WP10):** measured, the claim above that white on blue/red/purple/green "all pass AA" does not hold at the sizes the app uses. WCAG's 3:1 relief begins at 18.66px bold or 24px regular; the build-checks chips set their text at `--cab-text-xs`, which is **11px**, so they need 4.5:1. Against cream, the shipped pairs measured `cream on green` **3.46**, `cream on red` **4.21**, `ink on green` **3.59**, and `white on green` **4.18** — four failures in live UI. `--cab-sky` separately measured **2.79** against cream, below the 3:1 that a status indicator needs.
>
> Rather than restate the palette, the fix keeps the brand hues for tints, borders and brick colours and adds darkened **fill** variants for surfaces that carry small text — the background counterpart of the `--cab-*-text` foregrounds that already existed for exactly this reason:
>
> | Token | Value | Carries |
> |---|---|---|
> | `--cab-green-fill` | `#407131` | cream text at 4.80:1 — the "ready" chip, the STEP button |
> | `--cab-red-fill` | `#BB362B` | cream text at 4.73:1 — the "blocking" chip, the GO lever |
> | `--cab-sky` (changed) | `#5484BB` | 3.22:1 against cream as a state indicator |
>
> No single shade can carry both cream and ink at 4.5:1, so the buttons that previously set ink on green now use cream on `--cab-green-fill` instead of getting a paler green. The audit is now a test (`apps/workbench/src/lib/styles/contrast.test.ts`) that parses `tokens.css` itself, so a future nudge to a hex fails the suite rather than quietly failing users.

## 8. Voice & copy style

- Warm, encouraging, lightly witty; UK English; never sarcastic about the user's bot, always curious ("Hmm — Snackbot forgot where the snack was. What might help it remember?").
- Kit-speak for flavour ("parts", "batteries not included", "some assembly required"), real terminology always within one click (flip sides use plain, adult technical language).
- Error copy: what happened → why → the one next thing to try. No blame, no jargon walls, raw details behind a disclosure.

## 9. Asset production brief (input to the visual workstream)

> **Amended 2026-08-12:** this section's sketch is superseded by `11-VISUAL-ASSET-MANIFEST.md`, which carries the full per-asset inventory, material/dimension recipes, parametric layer conventions, and production checklist. The folder structure and priority order below remain valid as a summary.

Deliverables, formats, and naming for the art tasks. All flat assets as **SVG** where feasible (crisp scaling, tintable), textures as tileable PNG/WebP, in `assets/` with the structure below. Master sprite grid: bricks drawn on a 96px stud unit.

```
assets/
├── brand/        logo lockups (horizontal, stacked, monochrome), favicon set
├── bricks/       6 brick types × (tray sprite, fitted-on-bot sprite, enlarged panel art, socket negative)
├── cartridges/   OpenAI V1 cartridges ×3 (see 06-LLM-PROVIDERS.md §4) + blank template
├── bot/          assembled-bot layers per fitted brick + 6 faces/expressions (idle, thinking, happy, confused, celebrating, stopped)
├── playroom/     floor/rug tile, walls, toy chest (closed/open/locked), shelf, table, Teddy (idle/happy), snack, blocks ×3, red key, ball, speech-bubble 9-patch
├── cards/        goal-card template (front/back) + 6 starter-card scene thumbnails
├── ui/           parts tray, baseplate, GO lever (3 states), buttons, dials, rockers, sliders, meters, badges/rosettes ×8, mode switch, drawer handles
├── leaflet/      paper texture, fold/crease overlays, arrow stickers, step-number roundels, merit-badge stickers ×6
├── textures/     paper grain, halftone dot, edge-wear decals ×4, plastic specular gradients
└── boxart/       the 4 existing pieces (source), + web-optimised crops for Shelf thumbnails
```

Priority order for V1: bricks → bot → playroom → ui → cards → leaflet → brand polish → textures. Each asset must be delivered in normal + 2× raster fallback, with transparent background, using only §2 tokens (the visual workstream should treat this doc as its style bible and flag any needed palette additions rather than inventing colours).

## 10. Reference index

- `assets/boxart/my-very-first-agent.png` — V1 tone, brick colours, Goal Card styling, "BUILD · CONNECT · GIVE IT A GOAL · WATCH IT ACT".
- `assets/boxart/agent-builder.png` — future-kit part taxonomy (planner, if/then, MCP, guardrails, tests) — informs socket/part visual grammar.
- `assets/boxart/ai-architect.png` — governance-era components (pipelines, gauges, approval, monitoring) — informs `08-GOVERNANCE-GUARDRAILS.md` iconography.
- `assets/boxart/llm-multipack.png` — cartridge design, model-comparison chart style, "CHOOSE · CONNECT · PROMPT · COMPARE".

*(Rename the four source PNGs to these canonical names when copying into the repo.)*
