# Setting up the shared evidence store

The evidence store (`evidence/supabase`) is where a team puts what its bots
produced so another machine can pull it: trace bundles, campaign reports,
assurance packs and authored content. It is a **sync target for artefacts
only** — never a key, never the source of truth, never required (see
[`58-EVIDENCE-STORE.md`](design-day2/58-EVIDENCE-STORE.md) for the design of
record, decision D1 in `41-TARGET-DESIGN-V4.md` §6.11). Everything works
without it; with it, `craftabot evidence push` on one machine and a pull on
another — or the Workshop's Evidence screen — move artefacts between them,
each verified by its digest on the way in.

Three things have to exist: a Supabase project with four tables and their
row-level-security policies, the project's anon key, and a **workspace
token** for each team that shares the project. This doc is all three.

## 1. Provision the tables

Create a project at [supabase.com](https://supabase.com) (the free tier is
enough), or run one locally with the Supabase CLI:

```bash
supabase init
supabase start
```

Then run this SQL once — in the dashboard's SQL editor, or as a migration
under `supabase/migrations/` — exactly as written:

```sql
-- One table per artefact kind (58-EVIDENCE-STORE.md §4.3). The payload is
-- the artefact as pushed; the digest is SHA-256 over its canonical JSON.
create table if not exists public.evidence_bundles (
  workspace text not null,
  id text not null,
  digest text not null,
  pushed_at timestamptz not null,
  pushed_by text,
  payload jsonb not null,
  primary key (workspace, id)
);
create table if not exists public.evidence_campaign_reports (like public.evidence_bundles including all);
create table if not exists public.evidence_assurance_packs (like public.evidence_bundles including all);
create table if not exists public.evidence_content (like public.evidence_bundles including all);

-- Row-level security: a token sees and writes the rows of its own workspace
-- and nothing else. The workspace is a claim in the token (§2).
do $$
declare t text;
begin
  foreach t in array array['evidence_bundles','evidence_campaign_reports','evidence_assurance_packs','evidence_content'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists workspace_rows on public.%I', t);
    execute format($p$
      create policy workspace_rows on public.%I
        for all to authenticated
        using (workspace = (auth.jwt() ->> 'workspace'))
        with check (workspace = (auth.jwt() ->> 'workspace'))
    $p$, t);
    execute format('create index if not exists %I on public.%I (workspace, pushed_at, id)', t || '_pushed_at', t);
  end loop;
end $$;
```

The anon role gets nothing: with row-level security on and no policy for
`anon`, the anon key alone can neither read nor write a row. Only a token
that carries `role: authenticated` and a `workspace` claim gets through, and
only to its own rows.

## 2. Mint a workspace token

A workspace token is a JSON Web Token signed with the project's **JWT
secret** (Settings → API → JWT Settings in the dashboard; `supabase status`
locally). It is the team's own act — the app never mints one, and the
secret never leaves the machine that mints it. This snippet needs only Node:

```bash
node -e '
const { createHmac } = require("node:crypto");
const [secret, workspace, days] = process.argv.slice(1);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + Number(days || 30) * 86400;
const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "authenticated", workspace, exp })}`;
console.log(`${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`);
' "$SUPABASE_JWT_SECRET" team-a 30
```

> **From the live checkpoint (2026-09-06).** A project that has moved to asymmetric _JWT Signing Keys_ still verifies an HS256 token signed with the **Legacy JWT Secret** (the second tab on that page) for as long as the legacy key is listed among the previous keys — do not revoke it while a workspace token is in use. Leave the header without a `kid`; naming the legacy key was refused. On Windows, paste the secret into a plain prompt and clear the screen after (a masked PowerShell prompt drops a paste in some terminals), and pass `--store-config` to `node packages/harness/dist/main.js` directly with the inner quotes escaped — `npm run … --` in Windows PowerShell swallows the flags.

The token names one workspace (`team-a` above) and expires (30 days above).
Mint one per team; rotate by minting again. **Treat it as a key:** it goes in
the Workshop's vault (Settings → the _Workspace token_ compartment, kept in
`localStorage` only) or in `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` for the
harness, and nowhere else — not in a campaign file, a config file, a trace or
a URL. The key-leak sweep plants one and checks every file the harness writes.

The **anon key** (Settings → API → _anon public_, or the newer
`sb_publishable_…` key) is configuration, not a credential: Supabase designs
it to ship in clients, and the policies above are what guard the rows. It
goes in the store's config beside the URL and the workspace.

## 3. Push and pull from the harness

```bash
export CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE='<workspace token>'
STORE='{"url":"https://<ref>.supabase.co","anonKey":"<anon key>","workspace":"team-a"}'

# a run as its bundle; the receipt is printed as JSON
npm run craftabot -- evidence push --store evidence/supabase --store-config "$STORE" --run <runId> --out ./runs
# a group episode, a campaign report, the assurance pack, a content record
npm run craftabot -- evidence push --store evidence/supabase --store-config "$STORE" --group <groupRunId>
npm run craftabot -- evidence push --store evidence/supabase --store-config "$STORE" --campaign-report <id>
npm run craftabot -- evidence push --store evidence/supabase --store-config "$STORE" --assurance --agent <agentId>
npm run craftabot -- evidence push --store evidence/supabase --store-config "$STORE" --content-file ./content/policy/my-card.json

# everything since a moment, verified, written under ./evidence/<kind>/…
npm run craftabot -- evidence pull --store evidence/supabase --store-config "$STORE" --since 2026-09-01T00:00:00Z --dir ./evidence
```

A pulled bundle lands as `<id>.craftabot-bundle.json`, which the Workshop's
Run Browser imports as it imports any bundle — verifying the bundle's own
digest a second time. An item whose digest does not match what was pushed is
listed `REFUSED`, written nowhere, and the command exits 1. Under
`--egress none` (CI's setting) the store's host is refused before any call.

## 4. The Workshop

_Workshop → Evidence_ configures the store (URL, anon key, workspace) and
shows the compartment's state; the Audit Centre's _Push to evidence store_
and Campaigns' push on a saved report send one artefact; the Evidence
screen's pull lists what the workspace holds, each with its digest verified,
and imports a bundle into the Run Browser. None of it appears until a store
is configured.

## 5. What leaves the machine

Exactly the artefact pushed — a bundle (already redacted against every
credential the process holds, as an exported trace is), a campaign report, an
assurance pack, a content record — with its digest, the time and the
principal's id. The token rides in the `Authorization` header and the anon
key in `apikey`; neither is ever in a URL. The store's host is declared as
egress (`evidence sync`), so the egress guard and the Boundary map both show
it.

## 6. Testing without any of this

`evidence/memory` is a store with no project behind it — rows live in the
process — and passes the same conformance suite; `--store evidence/memory`
works everywhere the Supabase store does. The adapter's own tests run against
a fake PostgREST in memory. To run the suite against a real project (a local
`supabase start` after §1, or the live one), set `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` and run
`npm test -w @craftabot/evidence`; without them the suite is skipped, which is
what CI does.
