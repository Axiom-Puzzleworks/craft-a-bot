import type { CatalogueEntry, CatalogueSource } from '@craftabot/core';

/**
 * **The catalogue's second edition** (WP132, `110-CONTROL-SUITE-PLAN.md`
 * §3): the techniques the first edition did not name. Two kinds. Class A:
 * mechanisms the code already had that no entry claimed — fail closed, the
 * orchestrator chokepoint and the cascade breaker, the Gate, purpose
 * limitation, the reader's confidence gate. Class D: what a bank's control
 * framework names that a survey of agent security does not — contestability,
 * mandatory disclosure, vulnerability, timeliness, change control,
 * failover, override reasons, shadow running — and three techniques said
 * *not applicable* so the claim is not implied. Every entry is
 * `review: 'pending'`; its coverage is what the code does on 2026-10-01,
 * and an entry that is only partly built says so as *bespoke*.
 */
const BEDROCK_AR: CatalogueSource = {
	title: 'Amazon Bedrock Guardrails — automated reasoning checks',
	publisher: 'AWS',
	year: 2025,
	kind: 'vendor'
};
const UK_GDPR: CatalogueSource = {
	title: 'UK GDPR, Articles 5 (principles), 22 (automated decisions) and 25 (by design)',
	publisher: 'UK Parliament (Data Protection Act 2018 and the retained Regulation)',
	year: 2018,
	kind: 'standard'
};
const ICO_AI: CatalogueSource = {
	title: 'Guidance on AI and data protection',
	publisher: 'Information Commissioner’s Office',
	year: 2023,
	kind: 'guidance'
};
const EU_AI_ACT_DEPLOYERS: CatalogueSource = {
	title: 'Regulation (EU) 2024/1689 (the AI Act), Articles 15, 26 and 86',
	publisher: 'European Union',
	year: 2024,
	kind: 'standard'
};
const EU_AI_ACT_OVERSIGHT: CatalogueSource = {
	title: 'Regulation (EU) 2024/1689 (the AI Act), Article 14 (human oversight)',
	publisher: 'European Union',
	year: 2024,
	kind: 'standard'
};
const FCA_DISP: CatalogueSource = {
	title: 'FCA Handbook — DISP 1 (complaint handling and its time limits)',
	publisher: 'Financial Conduct Authority',
	year: 2024,
	kind: 'standard'
};
const FCA_CONC: CatalogueSource = {
	title: 'FCA Handbook — CONC 5 (creditworthiness) and CONC 7 (arrears, default and recovery)',
	publisher: 'Financial Conduct Authority',
	year: 2023,
	kind: 'standard'
};
const FCA_COBS: CatalogueSource = {
	title: 'FCA Handbook — COBS 4 (financial promotions) and COBS 9 (suitability)',
	publisher: 'Financial Conduct Authority',
	year: 2023,
	kind: 'standard'
};
const FCA_FG21: CatalogueSource = {
	title: 'FG21/1 — Guidance for firms on the fair treatment of vulnerable customers',
	publisher: 'Financial Conduct Authority',
	year: 2021,
	kind: 'guidance'
};
const PSR_APP: CatalogueSource = {
	title: 'Specific Requirement 1 — APP scam reimbursement',
	publisher: 'Payment Systems Regulator',
	year: 2024,
	kind: 'standard'
};
const PRA_SS1_21: CatalogueSource = {
	title: 'SS1/21 — Operational resilience: impact tolerances for important business services',
	publisher: 'Prudential Regulation Authority',
	year: 2021,
	kind: 'guidance'
};
const PRA_SS1_23: CatalogueSource = {
	title: 'SS1/23 — Model risk management principles for banks',
	publisher: 'Prudential Regulation Authority',
	year: 2023,
	kind: 'guidance'
};
const DORA: CatalogueSource = {
	title: 'Regulation (EU) 2022/2554 — the Digital Operational Resilience Act',
	publisher: 'European Union',
	year: 2022,
	kind: 'standard'
};
const NIST_800_53: CatalogueSource = {
	title:
		'SP 800-53 Rev. 5 — Security and privacy controls (AC-6 least privilege, CM-3 change control, SC-24 fail in known state)',
	publisher: 'NIST',
	year: 2020,
	kind: 'standard'
};
const OWASP_AGENTIC: CatalogueSource = {
	title: 'OWASP Top 10 for Agentic Applications (2026 edition)',
	publisher: 'OWASP GenAI Security Project',
	year: 2025,
	url: 'https://genai.owasp.org/',
	kind: 'guidance'
};
const OWASP_LLM: CatalogueSource = {
	title: 'OWASP Top 10 for LLM Applications 2025',
	publisher: 'OWASP GenAI Security Project',
	year: 2025,
	url: 'https://genai.owasp.org/llm-top-10/',
	kind: 'guidance'
};
const CISA_AGENTIC: CatalogueSource = {
	title: 'Multi-agency guidance on securing agentic AI',
	publisher: 'CISA and partner agencies',
	year: 2026,
	kind: 'guidance'
};
const STABILITY_PATTERNS: CatalogueSource = {
	title: 'Release It! — stability patterns: timeouts, circuit breakers, fail fast',
	publisher: 'M. Nygard (Pragmatic Bookshelf, 2nd edition)',
	year: 2018,
	kind: 'guidance'
};
const CALIBRATION: CatalogueSource = {
	title: 'On calibration of modern neural networks',
	publisher: 'Guo, Pleiss, Sun and Weinberger (ICML)',
	year: 2017,
	kind: 'paper'
};
const SELECTIVE: CatalogueSource = {
	title: 'Selective classification for deep neural networks',
	publisher: 'Geifman and El-Yaniv (NeurIPS)',
	year: 2017,
	kind: 'paper'
};
const ML_TEST_SCORE: CatalogueSource = {
	title: 'The ML Test Score: a rubric for ML production readiness and technical debt reduction',
	publisher: 'Breck, Cai, Nielsen, Salib and Sculley (Google)',
	year: 2017,
	kind: 'paper'
};
const AGENT_GATEWAYS: CatalogueSource = {
	title: 'Cedar policy language; Bedrock AgentCore gateway policies',
	publisher: 'AWS',
	year: 2025,
	kind: 'vendor'
};
const AGENT_GOVERNANCE_TOOLKIT: CatalogueSource = {
	title: 'Agent Governance Toolkit — OPA, Rego and Cedar policies for agents',
	publisher: 'Microsoft',
	year: 2025,
	kind: 'guidance'
};
const APPROVAL_FATIGUE: CatalogueSource = {
	title: 'Approval and confirmation fatigue in agent permissioning',
	publisher: 'arXiv',
	year: 2025,
	kind: 'paper'
};
const SECRET_SCANNING: CatalogueSource = {
	title: 'Secret scanning and push protection',
	publisher: 'GitHub',
	year: 2024,
	kind: 'vendor'
};
const C2PA: CatalogueSource = {
	title: 'C2PA content credentials specification',
	publisher: 'Coalition for Content Provenance and Authenticity',
	year: 2024,
	url: 'https://c2pa.org/',
	kind: 'standard'
};

function entry(input: Omit<CatalogueEntry, 'review'>): CatalogueEntry {
	return { ...input, review: 'pending' };
}

/** The entries the second edition adds (WP132), in the order the page lists them within their categories. */
export const SECOND_EDITION_ENTRIES: CatalogueEntry[] = [
	// ---------------------------------------------------------------- runtime protection
	entry({
		id: 'data-minimisation',
		name: 'Purpose limitation and data minimisation',
		summary:
			'A bot reads only what its purpose needs; a special-category record is read for its declared purpose or not at all.',
		category: 'runtime-protection',
		subcategory: 'information-flow',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['LLM02', 'ASI06'],
		frameworks: ['uk-gdpr:art-5', 'uk-gdpr:art-25'],
		obligations: ['ukgdpr:data-minimisation', 'ukgdpr:purpose-limitation'],
		sources: [UK_GDPR, ICO_AI],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:fs-bank/purpose-gating',
				'mechanism:desk/record-classification',
				'policy-card:fs-advice/policy/purpose-limited-lookup',
				'evaluator:fs-advice/data-minimised'
			],
			note: 'Every bank line is purpose-gated and a special-category record never enters the context ladder; the card refuses a lookup outside the purpose and the evaluator scores what was read.',
			since: 'WP59'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'mandatory-disclosure',
		name: 'Mandatory disclosure',
		summary:
			'What a customer must be told — a risk warning, a scam warning, what a plan asks of them — said, and recorded as said.',
		category: 'runtime-protection',
		subcategory: 'output-guardrail',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['fca:cobs-4', 'fca:conc-7', 'psr:sr1'],
		obligations: ['fca:cobs-4:promotions', 'fca:conc-7:arrears', 'psr:app-reimbursement'],
		sources: [FCA_COBS, FCA_CONC, PSR_APP],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:core/disclosure',
				'trace-guarantee:disclosure.given',
				'evaluator:fs-advice/risk-warning-disclosed',
				'evaluator:fs-collections/debt-advice-disclosed',
				'evaluator:fs-disputes/reimbursement-rights-disclosed',
				'evaluator:fs-lending/review-right-disclosed',
				'evaluator:fs-advice/ombudsman-disclosed',
				'policy-card:fs-advice/policy/risk-warning-rides-with-every-recommendation',
				'evaluator:fs-advice/warning-given',
				'evaluator:fs-fraud/scam-warning-given'
			],
			note: 'The bank’s disclosures are registered with their exact wording and the obligations they cite (fs-bank’s DISCLOSURES): CONC 7’s debt advice, COBS 4’s risk warning, PSR APP reimbursement rights, a lending review right, DISP’s Ombudsman (WP145). The customer-facing action that reaches the moment makes the disclosure itself, so it cannot be skipped, and the trace carries disclosure.given with the digest of the words said; an evaluator per desk holds each run to it. Diverged: no card blocks a decision until the disclosure is made — the action that makes the decision makes the disclosure, so a card would guard nothing.'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'cost-cap',
		name: 'Cost budget',
		summary: 'A cap on what a run or a campaign may spend, in money, before it stops.',
		category: 'runtime-protection',
		subcategory: 'action-control',
		points: ['pre-think'],
		maturity: 'widely-adopted',
		threats: ['LLM10', 'ASI08'],
		frameworks: ['owasp:llm10'],
		sources: [OWASP_LLM],
		coverage: {
			status: 'bespoke',
			componentIds: ['governance/token-budget'],
			note: 'Tokens are capped and every report counts them; a cap in money, from a cited list price, is not built (WP148).'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'tool-argument-validation',
		name: 'Tool-argument validation',
		summary:
			'Every tool call’s arguments checked against the tool’s declared parameters before it runs, a malformed call refused as a verdict.',
		category: 'runtime-protection',
		subcategory: 'action-control',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['LLM05', 'ASI02'],
		frameworks: ['owasp:llm05'],
		sources: [OWASP_LLM, OWASP_AGENTIC],
		coverage: {
			status: 'blueprint',
			note: 'Each tool and world action checks its own arguments and refuses with a narration; nothing validates a call against its declared parameters before it runs (WP148).'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'cascade-breaker',
		name: 'Cascade circuit breaker',
		summary:
			'An episode stopped after a set number of refusals or a named failure, before one seat’s fault spreads to the rest.',
		category: 'runtime-protection',
		subcategory: 'monitoring',
		points: ['group'],
		maturity: 'research',
		threats: ['ASI08'],
		frameworks: ['owasp:asi08'],
		sources: [OWASP_AGENTIC, STABILITY_PATTERNS],
		coverage: {
			status: 'shipped',
			componentIds: ['monitor/evaluator-breaker'],
			implementedBy: ['mechanism:monitor/group-circuit-breaker'],
			note: 'The group circuit breaker stops an episode at its refusal limit; the evaluator breaker stops one on a named evaluator failure.',
			since: 'WP48'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- secure by design
	entry({
		id: 'orchestrator-chokepoint',
		name: 'Orchestrator chokepoint',
		summary:
			'Every seat of a multi-agent episode acting through one chain, where the supervisor’s guards and observers sit.',
		category: 'secure-by-design',
		subcategory: 'multi-agent',
		points: ['group'],
		maturity: 'widely-adopted',
		threats: ['ASI07', 'ASI08'],
		frameworks: ['owasp:asi07'],
		sources: [OWASP_AGENTIC, CISA_AGENTIC],
		coverage: {
			status: 'shipped',
			componentIds: ['monitor/evaluator-breaker'],
			implementedBy: ['mechanism:core/group-chokepoint', 'mechanism:core/group-token-budget'],
			note: 'The session group runs every seat’s actions through one chain with the group’s budget, observers and breakers.',
			since: 'WP29'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'guardrail-gateway',
		name: 'Guardrail gateway',
		summary:
			'A proxy in front of any agent’s model traffic that runs the guards on the wire, whoever wrote the agent.',
		category: 'secure-by-design',
		subcategory: 'gateway',
		points: ['pre-think', 'pre-act', 'post-act'],
		maturity: 'emerging',
		threats: ['ASI01', 'ASI02'],
		frameworks: ['owasp:asi02'],
		sources: [AGENT_GATEWAYS, AGENT_GOVERNANCE_TOOLKIT],
		coverage: {
			status: 'shipped',
			implementedBy: ['mechanism:gate/enforce', 'mechanism:gate/loopback'],
			note: 'The Gate runs a saved stack over the chat-completions wire, loopback-bound with one upstream host; a reference implementation, not a product.',
			since: 'WP127'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- identity and access
	entry({
		id: 'secret-scan',
		name: 'Keeping secrets out of what leaves',
		summary:
			'Keys and credentials scrubbed from anything that leaves — exports, traces, logs, what a bot says — and a test that proves it.',
		category: 'identity-and-access',
		subcategory: 'credentials',
		points: [],
		maturity: 'widely-adopted',
		threats: ['LLM02'],
		frameworks: ['owasp:llm02'],
		sources: [SECRET_SCANNING, OWASP_LLM],
		coverage: {
			status: 'shipped',
			implementedBy: ['mechanism:core/export-scrub', 'mechanism:core/key-leak-test'],
			note: 'Every export passes an exact-match scrub of the vault’s keys, and CI proves none reaches a record; what a bot says is not scanned — it is never given a secret to say.',
			since: 'WP4'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- component hardening
	entry({
		id: 'fail-closed',
		name: 'Fail closed and bounded waits',
		summary:
			'A check that cannot run stops the action rather than letting it through, and no call waits forever.',
		category: 'component-hardening',
		subcategory: 'resilience',
		points: ['pre-think', 'pre-act', 'post-act'],
		maturity: 'widely-adopted',
		threats: ['ASI08'],
		frameworks: ['nist-800-53:sc-24'],
		sources: [NIST_800_53, STABILITY_PATTERNS, CISA_AGENTIC],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:hosted/fail-closed',
				'mechanism:hosted/hook-clamp',
				'mechanism:core/request-timeout'
			],
			note: 'A guard service that cannot answer stops the run with the cause could-not-check unless its config says otherwise; every provider call has a timeout.',
			since: 'WP39'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'dependency-failover',
		name: 'Dependency failover and degraded service',
		summary:
			'When a model or a line fails, the bot falls back to another or to a plain sentence, inside a stated tolerance.',
		category: 'component-hardening',
		subcategory: 'resilience',
		points: ['pre-think'],
		maturity: 'widely-adopted',
		threats: ['ASI08'],
		frameworks: ['pra-ss1-21'],
		obligations: ['pra:ss1-21:resilience'],
		sources: [PRA_SS1_21, DORA, STABILITY_PATTERNS],
		coverage: {
			status: 'bespoke',
			implementedBy: [
				'mechanism:core/provider-fault',
				'policy-card:fs-bank/policy/fallback',
				'evaluator:fs-bank/told-plainly'
			],
			note: 'A faulted provider is an injection the incident decks judge, and the Fallback card tells the customer plainly; no component fails over to a second provider in the shipped packs (WP148).'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'prompt-integrity',
		name: 'Prompt integrity',
		summary:
			'The system prompt and brief a bot runs with digested and compared with the ones that were validated.',
		category: 'component-hardening',
		subcategory: 'supply-chain',
		points: [],
		maturity: 'emerging',
		threats: ['LLM07', 'ASI04'],
		frameworks: ['owasp:llm07'],
		sources: [OWASP_LLM],
		coverage: {
			status: 'bespoke',
			implementedBy: ['mechanism:core/cassette-digest'],
			note: 'A prompt is digested to key a recorded answer, so a changed prompt misses its cassette; nothing compares a run’s prompt with a validated one (WP149).'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- evaluation and assurance
	entry({
		id: 'calibration-monitoring',
		name: 'Calibration monitoring',
		summary:
			'Whether a reader’s stated confidence matches how often it is right — reliability, ECE, Brier — over an answer key.',
		category: 'evaluation-and-assurance',
		subcategory: 'evaluation',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['pra-ss1-23:p4', 'nist-ai-rmf:measure'],
		obligations: ['pra:ss1-23:validation'],
		sources: [CALIBRATION, PRA_SS1_23],
		coverage: {
			status: 'shipped',
			implementedBy: ['mechanism:metrics/calibration'],
			note: 'The calibration pane on any report with readings and an answer key; the figures validated against the branch’s published ones.',
			since: 'WP118'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'model-change-control',
		name: 'Model inventory and change control',
		summary:
			'The model, stack, settings and prompt a bot runs with pinned and digested, and a change read before it runs.',
		category: 'evaluation-and-assurance',
		subcategory: 'assurance',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI04'],
		frameworks: ['pra-ss1-23:p1', 'nist-800-53:cm-3'],
		obligations: ['pra:ss1-23:identification', 'pra:ss1-23:governance'],
		sources: [PRA_SS1_23, NIST_800_53, EU_AI_ACT_DEPLOYERS],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:core/build-digest',
				'mechanism:core/agent-card',
				'mechanism:core/kit-requires',
				'mechanism:core/cassette-digest',
				'mechanism:core/pack-digest',
				'gate:no-regression'
			],
			note: 'A build digest over the goal card and its dial (the knobs) and every brick’s kind and config (the cartridge, the personality, the stack) is on every exported kit file (WP147); a host that names the build it validated gets run.started.changed when a run is of another; a knob a shipped campaign or experiment sets is a reading on the reading desk, read like a calibration row; the bank’s model-change-control row cites them with the no-regression gate. The packs a bot is built from are pinned by their own digest (WP141). Not done: nothing yet stores a validated digest for the Workbench’s own bots — the harness names it with run --validated.',
			since: 'WP147'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'shadow-mode',
		name: 'Shadow running',
		summary:
			'A control or a model run beside the live path on real traffic, its verdicts recorded and never applied, before it is trusted.',
		category: 'evaluation-and-assurance',
		subcategory: 'assurance',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['pra-ss1-23:p4'],
		obligations: ['pra:ss1-23:validation'],
		sources: [ML_TEST_SCORE, PRA_SS1_23],
		coverage: {
			status: 'shipped',
			implementedBy: ['mechanism:gate/shadow'],
			note: 'The Gate runs a stack over an agent’s live traffic and records every verdict without applying one; a campaign cannot yet fit a stack in shadow (WP149).',
			since: 'WP127'
		},
		bankingRelevance: 'core'
	}),
	// ---------------------------------------------------------------- human oversight
	entry({
		id: 'confidence-gate',
		name: 'Confidence gating and abstention',
		summary:
			'A judgment below its confidence threshold handed to a rule or a person instead of acted on.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: [],
		maturity: 'emerging',
		threats: ['ASI09'],
		frameworks: ['eu-ai-act:art-14', 'pra-ss1-23:p4'],
		obligations: ['pra:ss1-23:validation'],
		sources: [SELECTIVE, EU_AI_ACT_OVERSIGHT, PRA_SS1_23],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:workflow/reader-gate',
				'mechanism:metrics/calibration',
				'reader:fs-servicing/reader/category',
				'reader:fs-servicing/reader/support-need',
				'reader:fs-disputes/reader/classification',
				'reader:fs-advice/reader/root-cause'
			],
			note: 'A reader stage below its threshold, or hearing a steer, goes to its else. Since WP138 the servicing, disputes and complaints journeys read on gated readers wherever those stages were rules, at the desks’ line of 0.8 with the bank’s rule as the else; the rule readers answer at confidence 1, so the gate fires only when a less certain reader is swapped in — which the optional TypeSafe journey does.',
			since: 'WP117'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'vulnerability-detection',
		name: 'Vulnerability detection and support',
		summary:
			'A sign that a customer is vulnerable noticed, recorded, and acted on — referral, forbearance, adjusted service.',
		category: 'human-oversight',
		subcategory: 'customer-outcomes',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['fca:fg21-1', 'fca:consumer-duty'],
		obligations: ['fca:fg21-1:vulnerability', 'fca:cd:support'],
		sources: [FCA_FG21],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'policy-card:fs-advice/policy/vulnerability-means-refer',
				'evaluator:fs-advice/vulnerability-actioned',
				'evaluator:fs-collections/vulnerability-actioned',
				'policy-card:fs-servicing/policy/record-a-disclosure',
				'evaluator:fs-servicing/disclosure-recorded',
				'component:fs-bank/guard/vulnerability-detection'
			],
			note: 'Every journey’s intake stage asks the bank’s support-need reader, behind the desks’ line, whether the customer’s own words disclose a need, and records the finding at stage-in before anything is decided (WP145); the advice, collections and servicing desks act on and record it. The reader is a keyword rule — a measured model is the slot’s next step — and it can only read words the item carries: an alert or an application has none.',
			since: 'WP60'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'contestability',
		name: 'Contestability and appeal',
		summary:
			'A customer told they can challenge an automated decision, a route to a person, and the appeal recorded and decided.',
		category: 'human-oversight',
		subcategory: 'contestability',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['uk-gdpr:art-22', 'eu-ai-act:art-86', 'fca:disp-1'],
		obligations: ['fca:disp:complaints'],
		sources: [UK_GDPR, EU_AI_ACT_DEPLOYERS, FCA_DISP],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:workflow/appeal',
				'evaluator:fs-lending/appeal-handled',
				'evaluator:fs-lending/review-right-disclosed',
				'evaluator:fs-advice/ombudsman-disclosed'
			],
			note: 'A contested decline on the lending, onboarding and disputes desks is handed to the bank’s one review journey, complaints, as a handoff of kind appeal (WP145): a person approves its outcome below Level 5, and the run records the handoff. The customer is told the route — the review right with a declined loan’s reasons, the Ombudsman with every final response — in registered words digested on the trace. The complaints journey’s own adverse decision is not handed on: its route out is the Ombudsman.',
			since: 'WP145'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'timeliness',
		name: 'Timeliness and escalation by the clock',
		summary:
			'A case past its deadline escalated to a person, with the regulator’s timescales as the deadlines.',
		category: 'human-oversight',
		subcategory: 'escalation',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['fca:disp-1', 'psr:sr1'],
		obligations: ['fca:disp:complaints', 'psr:app-reimbursement'],
		sources: [FCA_DISP, PSR_APP],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'mechanism:workflow/deadlines',
				'trace-guarantee:stage.overdue',
				'gate:timeliness',
				'evaluator:fs-fraud/time-to-decision',
				'evaluator:fs-advice/complaint-acknowledged'
			],
			note: 'A stage carries a deadline in journey ticks, citing its timescale (WP146): the complaints journey’s acknowledgement and final response (DISP 1.6), the disputes journey’s reimbursement (the PSR’s, a stated mapping). A stage done past it is recorded overdue and written stage.overdue; the bank clock counts the case and lists it among the day’s incidents — its escalation to a person; the timeliness gate holds a book to it. A tick is the simulator’s unit, not a day: the deadlines are measured against the shipped configurations and stated as assumptions.',
			since: 'WP146'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'override-reason',
		name: 'Override reasons',
		summary:
			'When a person overrules a bot’s recommendation or waives a guard’s refusal, the reason is on the record.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['eu-ai-act:art-14', 'pra-ss1-23:p5'],
		obligations: ['pra:ss1-23:mitigants'],
		sources: [EU_AI_ACT_OVERSIGHT, PRA_SS1_23],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'trace-guarantee:approval.resolved',
				'mechanism:core/principal',
				'mechanism:workflow/override-reason',
				'gate:override-reason'
			],
			note: 'A person’s decision against what the case recommended is recorded as an override on the approval and on approval.resolved, with the reason they gave (WP146); the override-reason gate holds a campaign to the share of overrides with a reason. Diverged: a gate, not an evaluator — an agent run’s evaluator cannot see a journey’s human stage. Not required by the runtime: an override without a reason is recorded as such, which is what the gate counts, rather than refused. The fallible reviewer model gives no reasons, so a campaign over it reads the gate failing — a true finding about a model of a person, not a person.',
			since: 'WP146'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'adaptive-approval',
		name: 'Adaptive approval',
		summary:
			'The approval tier raised or lowered as a person’s approvals per case climb, so oversight does not become rubber-stamping.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: ['pre-act'],
		maturity: 'research',
		threats: ['ASI09'],
		frameworks: ['eu-ai-act:art-14'],
		sources: [APPROVAL_FATIGUE],
		coverage: {
			status: 'blueprint',
			note: 'Approvals per case are counted (confirmation fatigue); nothing changes the tier as they climb (WP149).'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- not applicable, said
	entry({
		id: 'data-retention',
		name: 'Retention and deletion',
		summary: 'Records kept only as long as their purpose needs, then deleted on a schedule.',
		category: 'identity-and-access',
		subcategory: 'data-governance',
		points: [],
		maturity: 'widely-adopted',
		threats: ['LLM02'],
		frameworks: ['uk-gdpr:art-5'],
		sources: [UK_GDPR],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable: the product is local-first and retains nothing on anyone’s behalf — every record is synthetic and stays in the user’s own browser or folder until they delete it.'
		},
		bankingRelevance: 'none'
	}),
	entry({
		id: 'configuration-access-control',
		name: 'Access control on the controls',
		summary: 'Who may change a guard, a threshold or a stack, enforced by role.',
		category: 'identity-and-access',
		subcategory: 'access-control',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI03'],
		frameworks: ['nist-800-53:ac-6'],
		sources: [NIST_800_53],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable: there is no tenancy — one person runs the toolkit on their own machine; a change to a control is recorded (readings, the principal), never authorised.'
		},
		bankingRelevance: 'none'
	}),
	entry({
		id: 'output-content-provenance',
		name: 'Content credentials on outputs',
		summary: 'Signed provenance on generated media so a reader can tell what made it.',
		category: 'component-hardening',
		subcategory: 'provenance',
		points: [],
		maturity: 'emerging',
		threats: ['ASI09'],
		frameworks: [],
		sources: [C2PA],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable: a bot here says text to a simulated customer and makes no media; what it said is on the digested trace instead.'
		},
		bankingRelevance: 'none'
	}),
	entry({
		id: 'automated-reasoning-checks',
		name: 'Automated-reasoning checks on answers',
		summary:
			'What the bot is about to say translated to logic and checked against rules written as logic: proved, contradicted, or left open.',
		category: 'runtime-protection',
		subcategory: 'output-guardrail',
		points: ['pre-act'],
		maturity: 'emerging',
		threats: ['LLM09'],
		frameworks: ['nist-ai-600-1'],
		sources: [BEDROCK_AR],
		coverage: {
			status: 'connectable',
			componentIds: ['bedrock-guardrails/automated-reasoning'],
			note: 'Connectable, checkpoint pending (WP144) — the first entry with the status: the adapter reads ApplyGuardrail’s automated-reasoning findings (a contradicted claim is a violation; one the checker could not translate is partial, never an allow), its stand-in runs in CI, and no live answer has been taken (`npm run smoke:bedrock-ar` with an account and a policy). Formal verification of a whole policy stays a blueprint.',
			since: 'WP144'
		},
		bankingRelevance: 'supporting'
	})
];
