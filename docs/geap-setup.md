# Setting up the Armour Brick

The Armour Brick (`geap/armor`) sends what your robot sees, decides and does to
[Google Cloud Model Armor](https://cloud.google.com/security-command-center/docs/model-armor-overview)
for a real classifier verdict — prompt injection, harmful content, sensitive
data and malicious links. It is a Workshop-only brick (see
[`25-ARMOUR-BRICK.md`](design-day2/25-ARMOUR-BRICK.md) for the design of
record): the Kit never offers it, and everything below is for the professional
bench.

Two things have to exist before the brick can do anything but read as
"unplugged": a Model Armor template in a real Google Cloud project, and an
access token with permission to use it. This doc is both.

## 1. Enable Model Armor and create a template

You need `gcloud` and a Google Cloud project with billing enabled. Replace
`PROJECT_ID` and `you@example.com` with your own.

```bash
gcloud services enable modelarmor.googleapis.com
gcloud projects add-iam-policy-binding PROJECT_ID --member="user:you@example.com" --role="roles/modelarmor.admin"
gcloud projects add-iam-policy-binding PROJECT_ID --member="user:you@example.com" --role="roles/modelarmor.user"
gcloud model-armor templates create cab-armour --location=europe-west2 \
  --pi-and-jailbreak-filter-settings-enforcement=enabled --pi-and-jailbreak-filter-settings-confidence-level=MEDIUM_AND_ABOVE \
  --rai-settings-filters='[{"filterType":"HATE_SPEECH","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"HARASSMENT","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"DANGEROUS","confidenceLevel":"MEDIUM_AND_ABOVE"},{"filterType":"SEXUALLY_EXPLICIT","confidenceLevel":"MEDIUM_AND_ABOVE"}]' \
  --basic-config-filter-enforcement=enabled --malicious-uri-filter-settings-enforcement=enabled
gcloud model-armor templates describe cab-armour --location=europe-west2
```

`europe-west2` is this project's own default region (decision D5 in
`25-ARMOUR-BRICK.md` §9) — the schema accepts any Model Armor region, so pick
whichever is closest to you. **The template must live in a regional endpoint**
— the global host refuses sanitize calls entirely — so the brick's own
`location` field has to match wherever you created the template.

Leave `--template-metadata-log-sanitize-operations` off unless you deliberately
want Model Armor's own audit log to keep a second copy of what was screened —
turning it on means the text your robot sees, thinks and says is retained in
your Google Cloud project, not just relayed through it.

## 2. Get an access token

The brick's own "Insert" flow in Settings uses Google Identity Services to
mint a one-hour token in the browser (see below) — but the quickest way to
try the brick, or to run `npm run smoke:geap`, is minting one yourself:

```bash
gcloud auth login --enable-gdrive-access=false --update-adc
gcloud auth print-access-token
```

The printed token is a bearer credential for whichever account `gcloud` is
logged in as, scoped by whatever roles that account holds — the two IAM
bindings above are what let it call Model Armor. Paste it into the Armour
Studio panel's own token field (`/workshop/armour`), or export it for the
smoke test:

```bash
GEAP_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
GEAP_PROJECT_ID=PROJECT_ID \
GEAP_LOCATION=europe-west2 \
GEAP_TEMPLATE_ID=cab-armour \
npm run smoke:geap
```

Access tokens minted this way last about an hour; mint a fresh one when the
brick's own trace starts reporting `bad-token`.

## 3. The Settings compartment (sign-in flow)

Settings renders a "Cloud Armour" battery compartment once the Workshop door
is open (`preferences.workshop`). "Insert" runs Google Identity Services'
token model in the browser — a real Google sign-in popup, not a form you type
into — and stores the resulting one-hour access token in the vault under the
id `geap`, the same vault every provider's own battery already uses (hard
rule 2: it never leaves `localStorage` except in the `Authorization` header
of a call to Model Armor). The meter shows how much of the hour is left; the
brick's own `bad-token` trace outcome darkens it and asks for a re-insert.

**This needs a one-time setup only the app's own maintainer does once**: an
OAuth 2.0 Client ID (Web application type) registered in a Google Cloud
project, with this app's own origin (`http://localhost:5173` for local dev,
plus wherever it is deployed) added to the client's authorised JavaScript
origins, and the `cloud-platform` scope enabled on the OAuth consent screen.
That client id is not a secret — it is meant to be embedded in frontend code
— but it does have to exist before "Insert" can do anything; until then the
compartment reads as present but unable to sign in. Set it via
`VITE_GEAP_OAUTH_CLIENT_ID` (an `.env` file at the repo root, or your
deployment's own build-time environment) before building the app.

An unverified OAuth client shows Google's own "this app isn't verified"
interstitial before the consent screen — expected and acceptable for a
Workshop feature nobody but its own builders uses; verifying the client with
Google is a separate, optional step this doc does not cover.

## 4. What leaves the browser

With the brick's `offline` switch off, every tick it screens sends the
observation, decision or result text for that tick to Model Armor, at the
project and template configured on the brick — nothing else in this app, and
never the token itself (`pack-geap`'s own `scrubToken` strips it from every
message before it can reach a log, an error, or the trace). A Playroom
observation is roughly 150–400 tokens, a decision 50–150, a result 30–100;
with the brick's own default (screening decisions only), a 30-tick run sends
around 3,000 tokens to Model Armor — about 0.15% of its 2M-token monthly free
tier. Screening all three hooks on every tick is closer to 15,000 tokens for
the same run. Model Armor is priced at $0.10 per million tokens past the free
tier (2026-09-01 pricing — check Google Cloud's own current pricing page
before relying on this).

## 5. What triggers a warning or a block

Model Armor is a **text classifier**, not an action-risk model — it has no
notion that `open` on a locked chest is riskier than `say`. What lines up
with "the actions the agent is taking" is _what gets sent_, not what the
guard understands about it:

| Hook             | Dial                   | What's actually screened                                                                                                                                       | Model Armor call        |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Before it thinks | Screen what it sees    | The latest sense observation's raw text — not the full composed prompt, so your own goal/system wording never trips a false positive                           | `sanitizeUserPrompt`    |
| Before it acts   | Screen what it decides | The bot's own reasoning plus the rendered call it's about to make, e.g. `open(container: "locked chest")`, with the last observation sent alongside as context | `sanitizeModelResponse` |
| After it acts    | Screen what it did     | The action's narration, or the tool's stringified result, whichever is newer                                                                                   | `sanitizeModelResponse` |

The "decide" screen is the closest thing to action-aware — the real call name
and arguments are rendered into plain text before they're sent — but it is
still only reacting to _patterns in the words_, the same four filters
regardless of hook:

| Filter                                                       | Trips on                                                   | Dialable?                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Sneaky instructions (`pi_and_jailbreak`)                     | Prompt injection / jailbreak attempts                      | Yes, plus its own confidence threshold (Fairly/Quite/Very sure)   |
| Harmful content (`rai`: hate, harassment, dangerous, sexual) | Hate speech, harassment, dangerous content, sexual content | Yes, as one group                                                 |
| Secrets (`sdp`)                                              | Sensitive data (keys, PII-shaped strings)                  | Yes                                                               |
| Dangerous links (`malicious_uris`)                           | Known-bad URLs                                             | Yes                                                               |
| CSAM                                                         | Child sexual abuse material                                | **Never** — always stops the run outright, regardless of any dial |

Anything about an action's own risk or irreversibility is the Safety Brick's
job (blocklists, risk tiers) — the two are deliberately complementary, not
overlapping.

**The disposition ladder, clamped by hook.** Every dial runs Off → Just make
a note → Ask me first → Stop that one thing → Stop the whole run (a
per-filter override wins over its hook's own dial; `inherit` defers to it).
But before it thinks / after it acts, there is no single "thing" to block or
ask about, so a `block`/`ask` setting there clamps up to a full stop —
**before it acts** is the only hook where a match can block just that one
action (the bot is told why and tries again) or ask you first (an approval
card). Out of the box, only decisions are screened, and a match asks for
approval — everything else starts off.

**When the guard itself can't be reached** is a separate, transport-level
outcome, routed through the brick's own "If the guard can't be reached" dial
(stop the run, or carry on and make a note) rather than the filter ladder
above:

| Outcome         | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `bad-token`     | Battery token rejected (expired, invalid, or malformed) |
| `no-permission` | This GCP project isn't allowed to use the template      |
| `no-template`   | Template not found                                      |
| `quota`         | Rate-limited                                            |
| `timeout`       | No answer in time                                       |
| `unavailable`   | Couldn't be reached at all (offline, DNS, CORS)         |

Every one of these — a content match or a transport failure — lands on the
trace as a `guardrail.external` row with its own latency and filter
breakdown, so nothing is invisible even when the outcome is just a note.

## 6. Testing without any of this

Every screen defaults to reading `offline` on a freshly-fitted brick — no
Google account, no template, no token, and every scenario in this repo's own
test suite runs this way in CI. Switch `offline` off only once you have done
steps 1–2 above.
