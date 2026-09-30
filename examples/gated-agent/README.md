# The gated agent

**What it is.** An agent that knows nothing of Craft A Bot:

- `src/agent.ts`, a plain loop over the OpenAI chat-completions wire;
- `src/model.ts`, a scripted model standing in for a real one.

The Gate sits between them, running `stack.json`: a turn budget, no deleting files, and mail only inside `example.com`. Neither file imports Craft A Bot. The test holds them to that.

**Run it** (three terminals, after `npm run build`):

```bash
npm run model --workspace=@craftabot/example-gated-agent
```

```bash
npm run craftabot -- gate serve --stack examples/gated-agent/stack.json --upstream http://127.0.0.1:8128/v1 --mode enforce
```

```bash
npm start --workspace=@craftabot/example-gated-agent
```

**What it shows.** The agent's four outcomes:

- two calls made;
- the mail outside `example.com` refused by the policy card;
- the delete refused by the blocklist;
- one more call made;
- then the stop at the turn budget.

**The evidence.** `curl http://127.0.0.1:8127/v1/gate/bundle > gate-day.json` saves the day as a bundle. The Audit Centre's _Open a bundle…_ verifies it. The test (`src/agent.test.ts`) runs all of this in one process.

See `docs/gate.md`.
