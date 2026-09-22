# Plain-English descriptions for the 45 catalogue entries, keyed by entry id.
# Written for a governance reader; the one-line summary from the catalogue is kept as the tagline.

CATEGORY_INTRO = {
 'Runtime protection':
  "Controls that act while the bot is running — on what it reads, what it is about to do, what it "
  "says and what comes back from its tools. This is the largest group because it is where most of "
  "the industry's products sit: classifiers in front of the model, filters behind it, rules over its "
  "actions and monitors over the run. The sub-categories say where in the loop each control decides.",
 'Secure by design':
  "Architectural choices that remove a class of attack rather than detect it: keeping untrusted text "
  "away from the model that holds the tools, proving a policy rather than checking each action, and "
  "the frameworks that package rails around a model.",
 'Identity and access':
  "Who the bot is, whose authority it acts under, and how it proves it — to a directory, to another "
  "agent, and on the trace. The same questions a bank asks of a member of staff, asked of an agent.",
 'Component hardening':
  "Containing what a bot can reach: where its code runs, where its network calls may go, and whether "
  "the parts it is built from are what they claim to be.",
 'Evaluation and assurance':
  "How a bank comes to know, rather than believe, that its controls work: harnesses and benchmarks, "
  "red-teaming, safety cases, incident records, control-effectiveness experiments, fairness measurement, "
  "and the management-system standards that give all of this a shared vocabulary.",
 'Human oversight':
  "Where a person sits in the loop — approvals, second signatures, the stop button — and the measures "
  "that show whether that oversight is real or has become a rubber stamp.",
}

SUBCATEGORY = {
 'input-guardrail': 'Input guardrail', 'output-guardrail': 'Output guardrail',
 'action-control': 'Action control', 'policy-as-code': 'Policy as code',
 'information-flow': 'Information flow', 'monitoring': 'Monitoring',
 'privilege-separation': 'Privilege separation', 'formal-verification': 'Formal verification',
 'framework': 'Framework', 'identity': 'Identity', 'credentials': 'Credentials',
 'multi-agent': 'Multi-agent', 'isolation': 'Isolation', 'supply-chain': 'Supply chain',
 'evaluation': 'Evaluation', 'red-teaming': 'Red-teaming', 'assurance': 'Assurance',
 'human-in-the-loop': 'Human in the loop', 'interruptibility': 'Interruptibility',
 'autonomy': 'Autonomy', 'explainability': 'Explainability',
}

MATURITY = {
 'widely-adopted': ('Widely adopted', 'in general commercial use; several vendors or standards ship it'),
 'emerging':       ('Emerging', 'shipping from some vendors or named in recent guidance; practice still settling'),
 'research':       ('Research', 'described in papers; little or no product implementation yet'),
}

STATUS = {
 'shipped':        ('Shipped', 'a component or a mechanism exists in Craft A Bot and the register can show what it did'),
 'connectable':    ('Connectable', 'the guard shell meets a vendor’s contract and a checkpoint proves it'),
 'bespoke':        ('Bespoke', 'a design of record exists, built in part or as content'),
 'blueprint':      ('Blueprint', 'described and mapped; nothing built'),
 'not-applicable': ('Not applicable', 'said, with the reason'),
}

POINTS = {
 'pre-think':  'before the bot reasons over its next turn',
 'pre-act':    'before an action the bot has chosen is carried out',
 'post-act':   'after an action’s result comes back, before the bot reads it',
 'stage-in':   'at a workflow stage’s input boundary',
 'stage-out':  'at a workflow stage’s output boundary',
 'group':      'at the group chokepoint, across all seats in an episode',
 'egress':     'on an outbound network call',
}

THREATS = {
 'ASI01': 'Agent goal hijack', 'ASI02': 'Tool misuse and exploitation',
 'ASI03': 'Identity and privilege abuse', 'ASI04': 'Agentic supply-chain vulnerabilities',
 'ASI05': 'Unexpected code execution', 'ASI06': 'Memory and context poisoning',
 'ASI07': 'Insecure inter-agent communication', 'ASI08': 'Cascading failures',
 'ASI09': 'Human–agent trust exploitation', 'ASI10': 'Rogue agents',
 'LLM01': 'Prompt injection', 'LLM02': 'Sensitive information disclosure',
 'LLM03': 'Supply chain', 'LLM04': 'Data and model poisoning',
 'LLM05': 'Improper output handling', 'LLM06': 'Excessive agency',
 'LLM07': 'System prompt leakage', 'LLM08': 'Vector and embedding weaknesses',
 'LLM09': 'Misinformation', 'LLM10': 'Unbounded consumption',
}

D = {}

# ---------------- Runtime protection ----------------
D['prompt-injection-classifier'] = (
 "Prompt injection is text that arrives as data — a customer message, a retrieved document, a tool "
 "result — but is written to read as an instruction to the bot (“ignore your rules and move the "
 "balance”). A prompt-injection classifier is a small model or a hosted service that scores each "
 "piece of incoming text for that pattern before the bot reasons over it or acts on it, and flags or "
 "blocks what it finds. It sits in front of every other control: if an injected instruction gets "
 "through, the rest of the stack is defending a bot that has already been redirected.")
D['jailbreak-classifier'] = (
 "A jailbreak is an attempt to talk a model out of its own rules — a role-play framing, a fictional "
 "“developer mode”, encoded or fragmented instructions, sustained pressure over many turns. A "
 "jailbreak classifier is trained on those attempts and scores the user’s turn for them before the "
 "model thinks. It overlaps with the injection classifier but targets the person talking to the bot "
 "rather than content smuggled in from elsewhere.")
D['hazard-classifier'] = (
 "A classifier that places text in a taxonomy of harms — violence, self-harm, sexual content, hate, "
 "and categories a bank cares about such as facilitating fraud — and rates its severity. Applied on "
 "the way in and on the way out, so a bot neither reasons over nor says something in a category the "
 "deployer has excluded. The taxonomies come from MLCommons and the vendors; the thresholds are the "
 "deployer’s.")
D['policy-conditioned-classifier'] = (
 "Most classifiers carry a fixed taxonomy chosen by the vendor. A policy-conditioned classifier is "
 "given the deployer’s own written policy at inference time and reasons about whether a text complies "
 "with it — so a bank’s rulebook, not a vendor’s list, is what the check is made against. This is new "
 "(OpenAI’s gpt-oss-safeguard, 2025) and untested at scale.")
D['untrusted-content-marking'] = (
 "A language model cannot by itself tell an instruction from a quotation. Marking techniques make the "
 "boundary explicit: spotlighting wraps retrieved text in delimiters and tells the model it is data; an "
 "instruction hierarchy trains the model to rank the operator’s instructions above the user’s and the "
 "user’s above any content; a control/data split (CaMeL) keeps untrusted text out of the planning model "
 "altogether. The aim is that a retrieved page or a tool result can inform the bot but never command it.")
D['indirect-injection-defence'] = (
 "Indirect injection arrives not from the person talking to the bot but through what the bot fetches: "
 "a poisoned factsheet, a note in the CRM, a doctored payslip, a tool whose description carries hidden "
 "instructions. These defences treat every tool result, retrieved document and tool description as "
 "attack surface — scanning them, checking tool descriptions against a registry, and testing the bot "
 "under such attacks so that its behaviour when it meets one is known rather than hoped for.")
D['memory-provenance'] = (
 "A bot that remembers across turns or across cases can be poisoned once and misled for good. "
 "Memory-provenance defences tag every memory with where it came from and how trusted that source is, "
 "quarantine memory that was written from untrusted content, and refuse to let the bot reason over a "
 "memory whose provenance is unknown. Still largely a research topic; the attacks are well documented.")
D['pii-redaction'] = (
 "Before a line leaves the bot it is scanned for personal identifiers — names, account and card "
 "numbers, addresses, dates of birth — and the identifiers are masked or removed, so the outgoing text "
 "is safe to show even when the model was careless. Output-side redaction is a last line of defence "
 "for data protection, not a substitute for keeping the data out of the model’s context in the first "
 "place.")
D['domain-output-rules'] = (
 "The bank’s own rules for what may be said, applied as filters on the bot’s outgoing lines: no "
 "language that reads as a guarantee, no tipping off a customer about a suspicion, plain English, "
 "the required wording on a financial promotion. The rules are the regulator’s (COBS, the Consumer "
 "Duty, the Proceeds of Crime Act) written down as checks rather than left to the model’s discretion.")
D['llm-as-judge'] = (
 "A second model, or a validator, reads what the bot produced and judges it: is it hazardous, is it "
 "faithful to the records it was given, does it assert something the sources do not support? A failing "
 "judgment can block the line, stop the run or raise a finding. Judges catch what pattern rules cannot, "
 "at the cost of a second model’s own fallibility — so a judge is measured like any other control.")
D['structured-output-validation'] = (
 "Every tool call the bot makes and every output a workflow stage produces is checked against a "
 "declared schema before anything downstream reads it. A malformed or unexpected structure is refused "
 "at the boundary, which stops a large class of failures — and injected content hiding in a free-text "
 "field — from propagating into the next step.")
D['tool-allow-deny'] = (
 "A declared list of what a bot may and may not call, checked by tool name and by argument before the "
 "call runs. A deny list blocks named actions outright; an allow list permits only the named ones; "
 "argument rules constrain, for example, which accounts or what amounts a payment tool may be given. "
 "The simplest expression of least privilege for an agent.")
D['policy-decision-point'] = (
 "Instead of scattering “may this bot do this?” across the code, the question is sent to a policy "
 "engine (Open Policy Agent with Rego, or Cedar) that evaluates written policy against the action, its "
 "arguments and the context, and returns a decision. Policy is then versioned, tested and reviewed on "
 "its own, apart from the bot, and the same engine can answer for a person or a rule as well as an "
 "agent.")
D['runtime-enforcement-dsl'] = (
 "A small rule language for the agent loop: on a trigger (before a think, before an action, after a "
 "result) evaluate a predicate over the current state, and apply an enforcement — allow, block, stop "
 "the run, ask a person. AgentSpec is the research statement of this shape; Progent applies it to "
 "privilege. Craft A Bot’s policy cards are the same three parts.")
D['privilege-scopes'] = (
 "A bot starts with the least privilege its task needs. When it needs more it asks; the request and "
 "the decision are recorded, and the elevation expires. The record is what makes an audit possible — "
 "every grant a bot ever held is explained by a request someone decided.")
D['budget-cap'] = (
 "Hard ceilings on the turns and the tokens a run may consume. When a cap is reached the run ends with "
 "a named outcome rather than looping until the bill, or the risk, has grown. The simplest runtime "
 "control and among the most effective against a runaway agent.")
D['loop-detection'] = (
 "A bot that keeps proposing the same non-progress move — the same failed call, the same question, "
 "the same edit — is stopped after a set number of repetitions. Progress is judged by a predicate the "
 "world supplies, so the detector knows what counts as forward motion in that domain rather than "
 "guessing from the text.")
D['rate-limit'] = (
 "A bound on calls per minute or per account, enforced at the gateway rather than inside the bot, so "
 "that a fault or an attack cannot turn into thousands of requests. Standard in production; not "
 "applicable in a simulator, where a run has no wall clock a rate could be measured against.")
D['information-flow-control'] = (
 "Labels attached to data — a classification, a purpose — follow that data as the bot works, so a "
 "secret read for one purpose cannot flow to an outbound call or into a line the purpose forbids. Full "
 "taint tracking through a model’s reasoning is research (FIDES, CaMeL); classifying every record and "
 "gating every line by purpose is the practical part that can be built today.")
D['monitor-agent'] = (
 "A second seat — a monitor bot or an evaluator — watches the run as it happens and can stop it on a "
 "named failure. A circuit breaker is the mechanical form: an evaluator fitted at a chokepoint that "
 "trips when its verdict fails. SHADE-Arena studies how well a monitoring model catches an agent that "
 "is quietly pursuing a different goal.")
D['behavioural-drift'] = (
 "A statistic over the series of runs — Page–Hinkley change detection is the classic — that flags when "
 "what the bot does has shifted (more refusals, more escalations, more incidents) before a person "
 "reading periodic reports would notice. Drift detection is a measure over telemetry rather than a "
 "decision in the loop, and needs a stored series to work on.")
D['execution-provenance'] = (
 "Every prompt, decision, action and verdict is a typed event on a trace, digested so it cannot be "
 "altered unnoticed, carrying the principal that was behind it. This is what turns a bot’s behaviour "
 "from an anecdote into evidence a reviewer can replay, and what the EU AI Act’s record-keeping "
 "articles ask for.")
D['stage-boundary-guard'] = (
 "In a multi-stage workflow the guard decides at a stage’s input or output — whatever executed the "
 "stage: a rule, a person or a bot. Guarding the boundary rather than the executor makes the check "
 "independent of who did the work, and lets a human stage be held to the same output contract as an "
 "automated one.")

# ---------------- Secure by design ----------------
D['privilege-separation'] = (
 "The dual-LLM pattern: a privileged planner that never reads untrusted content, and a quarantined "
 "reader that reads it but cannot act. Untrusted text therefore never reaches the model that holds the "
 "tools. CaMeL formalises this with a capability system over what the reader may hand back; AirGapAgent "
 "applies the same idea to private data. An architecture, not a filter — it removes the attack instead "
 "of detecting it.")
D['formal-verification'] = (
 "Rather than checking each action as it comes, prove that a policy holds over every action a bot could "
 "take — for example that no path leads to a payment without an approval. Research today (ShieldAgent); "
 "Amazon Bedrock’s automated-reasoning checks are the nearest commercial form, and are aimed at "
 "factual policy compliance rather than agent actions.")
D['guardrail-framework'] = (
 "Programmable rails — NVIDIA NeMo Guardrails, Guardrails AI, the OpenAI Agents SDK — that wrap a "
 "model’s input and output with validators, dialogue flows and hooks. Useful as a dependency for a team "
 "building from scratch; Craft A Bot has its own guard shell and component contract, and treats a "
 "vendor’s validators as services it can reach rather than as rails it runs inside.")

# ---------------- Identity and access ----------------
D['agent-identity'] = (
 "A bot as an auditable principal: it has an identity of its own, acts on behalf of a named person, "
 "and every action is attested with what let it through — the grant, the approval, the delegation "
 "chain. Microsoft Entra Agent ID, Okta’s Cross App Access and SPIFFE are the industry’s moves to give "
 "agents identities a directory can manage and revoke.")
D['credential-hygiene'] = (
 "Keys live in a vault and are read at call time; they are never written to a file, never appear on "
 "the trace, never travel in a URL — and a test proves that no key can leak into an artefact. Basic, "
 "and the control most often found broken when agents are wired to real systems.")
D['inter-agent-authentication'] = (
 "When bots talk to bots, a message from another agent is verified — who sent it, that it was not "
 "altered in transit — before it is trusted. The attack is an impostor agent on the channel (the "
 "party-line scenario); the Agent2Agent protocol is where the industry is placing the authentication.")

# ---------------- Component hardening ----------------
D['sandboxed-execution'] = (
 "Code a bot writes or runs executes in a disposable microVM or a userspace kernel with no ambient "
 "credentials, so that a mistake or an injection cannot reach the host or the network. Standard for "
 "coding agents (E2B, Daytona, Claude Code’s sandbox); not applicable in Craft A Bot, whose bots "
 "perform declared actions on a simulated world and run no code.")
D['egress-control'] = (
 "Every outbound network call from a bot’s tools and its model provider is allowed only to a declared "
 "host; anything else is refused and the refusal is recorded. This closes the exfiltration leg of the "
 "“lethal trifecta” — private data, untrusted content, and a way to send data out — and is the control "
 "the multi-agency guidance puts first.")
D['supply-chain-integrity'] = (
 "What a bot is built from — packs, tools, models, recorded lines — is declared, versioned and "
 "digested, so a change is visible and a tampered component is refused at load. The AI counterpart of "
 "a software bill of materials (CycloneDX’s AI/ML BOM) and of content credentials (C2PA).")

# ---------------- Evaluation and assurance ----------------
D['eval-harness'] = (
 "Running a bot over a matrix of scenarios, guard configurations and random seeds, and gating a "
 "release on what it did. The UK AI Security Institute’s Inspect and Sierra’s τ-bench are the reference "
 "frameworks; the point is repeatable, comparable evidence rather than a demonstration.")
D['automated-red-teaming'] = (
 "An adversary — scripted, or a model playing one — that probes the bot at scale with attacks and "
 "records which got through. Anthropic’s Petri automates the auditing; SHADE-Arena tests sabotage and "
 "its detection. Red-teaming finds what a harness of well-behaved scenarios never will.")
D['safety-case'] = (
 "A structured argument, with the evidence attached, that a system is safe enough for its intended use "
 "— together with the transparency artefacts (model cards, system cards, an inventory entry) that "
 "describe it. The form a regulator, an internal audit function or a model-risk committee can read "
 "and challenge.")
D['incident-reporting'] = (
 "What went wrong, when, and what the bot saw and decided at that moment, recorded so the incident can "
 "be understood, reported and learned from. The AI Incident Database and the OECD monitor set the "
 "public expectation; NIST’s AI RMF makes it a management function.")
D['control-effectiveness'] = (
 "An experiment that says which control changed which outcome, by how much, and with what confidence — "
 "the difference between believing a guardrail works and knowing that it does. PRA SS1/23 asks a bank "
 "to evidence its model controls in exactly this way.")
D['fairness-and-parity'] = (
 "Outcomes compared across cohorts — for instance across the proxies for protected characteristics in "
 "lending — with confidence intervals, and where the design allows on a matched pair of cases that "
 "differ only in the cohort. A parity gate fails a run when the gap exceeds a declared threshold.")
D['governance-frameworks'] = (
 "The management-system standards and regulations — NIST AI RMF and its generative-AI profile, ISO/IEC "
 "42001, the EU AI Act, PRA SS1/23 — used as the vocabulary a control map speaks, so every control can "
 "be pointed at the obligation it serves. A reference posture, and in Craft A Bot explicitly not a "
 "compliance claim.")

# ---------------- Human oversight ----------------
D['risk-tiered-approval'] = (
 "A person is asked before a risky action, with the risk tiers declared by the world the bot acts in "
 "(reversible, irreversible). The approval mode chooses whether everything, only the irreversible, or "
 "nothing needs a person — and the choice is recorded with the run.")
D['four-eyes'] = (
 "A second person on an irreversible decision, and a ceiling — by autonomy level — on what a bot may "
 "decide alone: an amount, a decision type, a customer segment. Banking’s oldest control, expressed as "
 "a human stage in the workflow and a table of decision-rights limits.")
D['kill-switch'] = (
 "A person can stop any run at any time, and a degraded model (a provider fault, a timeout) falls back "
 "to a plain safe sentence rather than a guess. Shutdown resistance is a named frontier-safety concern; "
 "the practical control is that stop always works and the fallback is never an invention.")
D['autonomy-levels'] = (
 "A declared level of autonomy — what a bot may decide on its own — with the touches a person makes "
 "counted per case, so the level a bank claims can be checked against the level it actually runs at. "
 "The counting is what separates a policy statement from a measurement.")
D['confirmation-fatigue'] = (
 "If a person is asked to approve too often they stop reading, and oversight becomes theatre. Counting "
 "approvals per case makes that visible; adaptive throttling — asking less where the person always says "
 "yes — is the research response, and carries its own risk.")
D['explainability'] = (
 "What the bot saw, what it was offered, what it chose and what checked it — shown to the reviewer and, "
 "in plain terms, to the customer — with an explanation that names only real reasons, checked by a "
 "faithfulness evaluator. The EU AI Act and the Consumer Duty both expect an explanation a person can "
 "act on.")

assert len(D) == 45, len(D)
