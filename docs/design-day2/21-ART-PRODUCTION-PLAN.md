# 21 — Art Production Plan, Wave 1 (WP18)

> The execution plan for the 28 artefacts specified in `20-ART-COMMISSION-BRIEF.md`. Where `11-…` says what to draw and `20-…` says exactly what to deliver, **this says how it gets made, what was measured, and what has to change in the other two documents for the numbers to be honest.**
>
> Production tool: **Affinity 3.2.3.4646 Win32** (`AffinityRetail`, Desktop paradigm) driven through its JavaScript SDK. Authored as scripted vector geometry, not hand-painting — see §6 for what that does and does not buy us.
>
> Status: written 2026-08-15, after a measurement spike against the live application. Every claim in §2 was executed, not assumed.

---

## 1. The tool question, answered

**Affinity is suitable, with one decisive caveat and a mandatory post-export step.** Both are in §2.

Access verified:

| Check | Result |
|---|---|
| SDK reachable from this session | Yes |
| Application | Affinity 3.2.3.4646 Win32, `AffinityRetail`, `Desktop` |
| Filesystem permission | Granted, **Desktop-only** (`app.userDesktopPath`) |
| Read / write / delete in `Desktop\Craft-a-bot affinity` | All three confirmed by round-trip |
| SVG export presets available | `SVG (for export)`, `(digital - small size)`, `(digital - high quality)`, `(flatten)` |

The Desktop restriction is a property of Affinity's own settings, not of this session. It is why the working directory is on the Desktop and the repo copy is made separately (§4).

---

## 2. What the export actually does — measured, not assumed

Five spike documents were built and exported. Findings, in descending order of consequence.

### 2.1 The decisive one: blend modes rasterise

A neutral grey ellipse at 22 % with `BlendMode.Multiply` did not export as vector. It exported as this:

```xml
<use id="shade-multiply" xlink:href="#_Image1" x="20" y="20" width="40px" height="40px"/>
<defs><image id="_Image1" width="40px" height="40px" xlink:href="data:image/png;base64,iVBOR…"/></defs>
```

`11-…` §4 builds every M1 part from six neutral layers in multiply/screen/overlay over a tintable base, and §4's closing sentence — *"re-tinting layer 3 re-lights the whole part correctly. This is the entire trick that makes templates reusable"* — is the load-bearing claim of the whole parametric convention. **As literally written it cannot ship as SVG.** Not because Affinity is weak: SVG 1.1 has no blend model, and Affinity's exporter resolves the ambiguity by rasterising rather than emitting a CSS `mix-blend-mode` that would render inconsistently.

**Resolution (agreed 2026-08-15): substitute Normal-blend alpha neutrals.** Layers 1, 2, 4, 5 and 7 are authored as `--cab-shadow` (`#000000` @ 15 %) and `--cab-plastic-hi` (`#FFFFFF` @ 35 %) at Normal blend, at the alphas §4 already specifies.

This is not a compromise dressed up. Normal-blend black over a colour is arithmetically close to multiply, Normal-blend white is close to screen, and — the point that matters — **the shading stays neutral and hue-independent, so re-tinting layer 3 still re-lights the part correctly.** The capability §6 promises survives intact. Both colours are already in the `20-…` §2 palette table, so the automated hex check passes without an exemption.

Verified: the same shapes at Normal blend export as clean vector —

```xml
<ellipse id="shade-ao-normal" cx="48" cy="70" rx="32" ry="10" style="fill-opacity:0.15;"/>
```

> **Amendment owed to `11-…` §4**, dated, in the doc's own voice: layers 1, 2, 4, 5, 7 are Normal-blend neutral alphas, not blend-mode layers, *because SVG cannot carry blend modes without rasterising and rasterising defeats §6*. The recipe's intent is unchanged; only its mechanism is.

### 2.2 The named-group contract survives — this was the big risk

`20-…` §7.11 requires every `#face-slot`, `#icon-slot`, `#state-*` and `#emboss` to exist, contain nothing, and sit at a stated origin. Empty groups are exactly the thing vector exporters prune. Affinity does not prune them:

```xml
<g id="state-open">
    <circle id="lid" cx="40" cy="40" r="20" style="fill:rgb(78,138,60);"/>
</g>
<g id="face-slot">
</g>
```

Layer names (`userDescription`) become `id` attributes verbatim, nesting is preserved, and the empty slot survives. The contract is deliverable as authored — no post-hoc slot injection needed.

### 2.3 Use `SVG (for export)`, never `(digital - high quality)`

The same 96 × 96 document exported under both presets:

| Preset | Root viewBox |
|---|---|
| `SVG (for export)` | `0 0 96 96` — correct |
| `SVG (digital - high quality)` | `0 0 300 300` — silently rescaled |

`20-…` §3 requires `viewBox` to match the canvas. The high-quality preset applies a DPI multiplier and would have put every artefact in the wrong coordinate space, consistently and invisibly. Pinned: **`SVG (for export)`, no exceptions.**

Also confirmed on that preset: **no transform on the root element** (§3), and gradients export as real `<linearGradient>` with `<stop>` children rather than raster.

### 2.4 Six defects the exporter introduces, all mechanical

None are blocking; all must be fixed deterministically rather than by hand.

| # | What Affinity emits | Why it fails the contract | Fix |
|---|---|---|---|
| 1 | `<?xml …?>`, `<!DOCTYPE …>`, `xmlns:serif`, `xml:space`, root `style="fill-rule:evenodd;…"` | §3 "no editor metadata" | Strip |
| 2 | `width="100%" height="100%"` | Not absolute at 1× | Set to the spec'd px |
| 3 | `fill:rgb(36,86,166)`, `stop-color:white` | §2's palette check greps **hex**; an `rgb()` file passes by being invisible to it | Convert to uppercase hex, then assert membership |
| 4 | Black fills omitted entirely (SVG default) | Same — an unstated fill is unauditable | Make every fill explicit |
| 5 | Gradient ids auto-numbered `_Linear1` | Collides the moment two of these are inlined on one page, which is exactly what WP18 will do | Namespace per file: `cab-<name>-lin1` |
| 6 | No CSS custom properties — Affinity has no concept of them | §3 requires `fill="var(--part-tint)"` with a literal fallback on tintable shapes | Inject onto the `#tint` shape |

**Honest position: defect 3 is the dangerous one.** The `11-…` §8.5 palette check looks for out-of-palette hex. A file containing no hex at all passes it while containing whatever colour the illustrator liked. The check as written cannot see an Affinity export. That is a hole in the automated gate, not a hole in this wave's artwork, and §7 below closes it.

### 2.5 Housekeeping

`Document.close()` returns `NOT_IMPLEMENTED`; `closeAsync()` does not take effect promptly on unsaved documents. Producing 28 artefacts as 28 documents would leave 28 open in the user's Affinity. Mitigated by **reusing a single document per batch**, resizing the spread with `setSpreadSizeWithAnchor` between artefacts.

---

## 3. The pipeline

```
Affinity JS SDK  →  Desktop\Craft-a-bot affinity\raw\*.svg
                          ↓ stage
                    normaliser + validator  (cloud container, deterministic, reviewable)
                          ↓
              ┌───────────┴───────────┐
   Desktop\…\normalised\*.svg    C:\src\craft-a-bot\apps\workbench\src\lib\assets\{…}\*.svg
        (your working copy)          (the swap-in target, exact §3 paths)
```

The normaliser is a script, not a habit. It runs the same way every time, it fails loudly, and its report is the filled-in `11-…` §8 checklist rather than a claim that the checklist was followed.

Editable `.afdesign` sources stay on the Desktop, in `Desktop\Craft-a-bot affinity\src\`. `20-…` §8.2 (in-repo vs. drive) is therefore **still open** and deliberately not resolved by this plan.

---

## 4. Registration — fixed before anything is drawn

`20-…` §5.2 requires `#face-slot` at an identical origin in both poses "so swapping pose does not move the face", but does not say where. Deciding it after the fact is how the two files drift. Fixed here, and owed back to `20-…`:

| Slot | File(s) | Origin (top-left, px, 1×) | Size |
|---|---|---|---|
| `#face-slot` | `pose-walk.svg`, `pose-carry.svg` | **24, 16** | 48 × 48 |
| `#icon-slot` | `pose-carry.svg` | **24, 2** | 48 × 48 |
| `#icon-slot` | `box-sticker.svg` | 0, 0 | 24 × 24 |
| `#emboss` | `badge-rosette.svg` | **28, 30** | 40 × 36 |

Face files (§5.1) are authored as the *contents* of the slot: 48 × 48, origin top-left of the slot, no background, ink features on cream eye-whites, no brick colours.

Scene items (§5.3) are 72 × 72 centred on the 96 px cell — **12 px clear on each side**, enforced by the validator, not by eye.

---

## 5. Build order

The gate first, then four batches. 3 + 8 + 7 + 6 + 5 + 2 − 3 (the gate three are members of their batches) = **28**.

| | Batch | Files | Contains |
|---|---|---|---|
| **Gate** | Sample | 3 | `face-idle`, `item-block-a`, `fx-denied-stamp` — one from each of the three hardest classes: expression, load-bearing colour+letter, and printed-stamp texture. Rendered for review; nothing else starts until the house style is agreed |
| **A** | Bot | 8 | 6 faces + `pose-walk` + `pose-carry` |
| **B** | Playroom fabric | 7 | `backdrop` (768 × 576, M3), `toy-chest` (3 state layers), `shelf`, `table`, `teddy-idle`, `teddy-happy`, `cell-highlight` |
| **C** | Scene items | 6 | `item-snack`, `item-block-a/b/c`, `item-red-key`, `item-ball` |
| **D** | Effects | 5 | `fx-denied-stamp`, `fx-question-puff`, `fx-confetti` (12 sibling `<g>` `#c1`…`#c12`), `fx-sparkle` (`#frame-1/2/3`), `fx-zzz` |
| **E** | Templates | 2 | `box-sticker` (untilted, `--part-tint`), `badge-rosette` (`#emboss`, `#state-earned`, no baked chapter count) |

Two constraints carried into every batch:

- **Static-first** (§7.10). Each effect is authored so its resting frame is meaningful alone. `fx-confetti` reads as a scattered burst before code touches it; `fx-sparkle`'s `#frame-1` is a complete sparkle. An effect that only reads as motion is an effect some children never see.
- **The letters and colours are load-bearing** (§5.3). A = `--cab-blue`, B = `--cab-yellow`, C = `--cab-red`, checked by the validator against the spec table rather than trusted. This bug has been shipped once already.

Letterforms (blocks A/B/C, the stamp's "SAFETY FIRST") are drawn as geometric vector paths in the rounded toy idiom — font-independent, so `20-…` §8.3 stays open rather than being silently pre-empted by whatever happens to be installed.

---

## 6. What this method produces, plainly

The artwork is **constructed**: flat token-coloured geometry, one global light at top-left, chunky radii, silhouettes built to be distinguishable rather than to be pretty. The design language asks for exactly that — `11-…` §5 specifies M3 as "flat gouache shapes, 2-tone shading per object", which is a shape-and-tone recipe a script can hit honestly.

Where it will read as constructed rather than illustrated is the warm end: Teddy, the backdrop, the faces' personality. Those are the three places a human illustrator's hand shows most and a script's least. That is the reason for the sample gate — `face-idle` and the batch-B characters are where you should push back hardest, and pushing back after three files is cheap.

---

## 7. Acceptance — automated where the brief allows

`11-…` §8's eight points plus `20-…` §7's three, run as checks rather than asserted as done:

| Check | How |
|---|---|
| §8.5 / §2 tokens only | Every fill, stroke and stop-colour normalised to hex, then asserted ∈ palette. **Closes the hole in §2.4 defect 3** |
| §8.7 size budget | ≤ 30 KB per part, ≤ 80 KB per scene, measured post-SVGO |
| §7.9 exact path and filename | Asserted against the `20-…` §5 tables |
| §7.11 slots present and empty | Parsed: id exists, child count is zero where required, origin matches §4 above |
| §3 viewBox and root | `0 0 W H` matches the spec table; no root transform |
| §8.2 silhouette test | Render at 64 px, flatten to black, assert recognisable |
| §8.3 tint test | Re-render templates at three `--part-tint` values; shading must stay physical |
| §5.1 / §5.3 distinguishability | **Pairwise:** all six faces flattened to black at 48 px, all six items at 72 px, and every pair compared. "Distinguishable" becomes a number instead of an opinion |
| §2 in-asset text contrast | Any baked text measured at ≥ 4.5:1 against its *actual* ground — and never dimmed with opacity |

The last two are the ones worth having. The brief asks for distinguishability twice and both times it is the kind of claim that gets nodded through; measuring every pair is cheap and it is the difference between the check existing and the check working.

---

## 8. Risks and what is still owed

| Risk | Handling |
|---|---|
| §4 recipe amendment is a doc change to `11-…` I do not own | Flagged, worded, and dated in §2.1 — yours to accept or reject before batch A |
| `backdrop.svg` at 768 × 576 must hold ≤ 80 KB as vector | Built from flat shapes with a repeating rug motif; if it will not fit, the escalation is `11-…` §7's raster allowance for M3 backdrops, which `20-…` §3 currently contradicts. Raised at batch B, not silently resolved |
| Affinity accumulates unsaved documents | One document per batch, spread resized between artefacts (§2.5) |
| Art lands where nothing reads it | Out of scope for this plan and named honestly in `20-…` §4: the eight code swaps are WP18's, and delivering 28 SVGs does not do them |

**Still open after this plan, deliberately:**

1. `20-…` §8.1 — the `--cab-u` / `--cab-sub` token rename. A code change, untouched here, and still a four-fold trap.
2. `20-…` §8.2 — `assets-src/` in-repo or on a drive. Sources are on the Desktop for now.
3. `20-…` §8.3 — the typeface. Sidestepped by drawing letterforms as paths; still blocks brand category A.
4. `20-…` §8.4 — whether the Playroom keeps a fixed 8 × 6. `backdrop.svg` is the one file that hard-codes it, and it is in batch B. **If this is going to move, it is cheaper to know before batch B than after.**
