# `@craftabot/desk`

The business-world runtime (`docs/design-day2/43-DESK-WORLDS.md` §4.4, WP53 stage B): `createDeskWorld(spec)` turns records, a transcript, a queue and a handful of handlers into a `WorldDefinition` the engine, the Workshop and the harness run like any other world — and draw as a Desk (`DeskWorldState`) rather than a room.

A desk author writes a `DeskWorldSpec`: the desk's title and role, its layouts as case generators, its actions (a Zod schema, a risk tier and a `perform` over the desk's state), its senses, its predicates. The runtime supplies every method of `WorldInstance` — `snapshot`, `observe`, `perform`, `test`, `reset`, `receiveInput`, `describeProgress`, `inject`, `configure` — once, so a desk never implements them (`41-…` §14.1). `forAgent` (two seats) is WP55's.

Depends on `@craftabot/core` and `zod` only; ESLint holds it there. Not published in this WP.

```ts
import { createDeskWorld } from '@craftabot/desk';

export const frontDesk = createDeskWorld({
	id: 'workshop/the-desk',
	name: 'The Front Desk',
	desk: { title: 'The Front Desk', role: 'Receptionist' },
	layouts: [{ id: 'a-visitor', name: 'A visitor at the desk', case: () => ({ revealed: [...], hidden: [...], queue: [...] }) }],
	actions: [
		{ id: 'say', kind: 'say' },
		{ id: 'sign-in', name: 'Sign in', description: '…', schema: z.object({ visitor: z.string() }), riskTier: 'reversible', progress: true,
		  perform: (state, args, ctx) => { ctx.decide('sign-in', `Signed in: ${args.visitor}`); return { ok: true, narration: '…' }; } }
	],
	senses: [{ id: 'conversation', kind: 'conversation', name: 'Conversation', description: '…' }],
	predicates: { 'visitor-signed-in': { description: '…', test: (state) => state.queue[0]?.status === 'decided' } }
});
```

Determinism: a case is generated from the `random` the session hands to `create(layoutId, { random })` (one draw seeds the desk's own stream), or from a fixed default seed when none is given; `reset` regenerates from the same seed. `src/fixtures/trace.desk-minimal.v1.json` is the runtime's byte-stability oracle.
