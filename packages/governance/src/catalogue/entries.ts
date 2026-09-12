import type { CatalogueEntry, CatalogueSource, GuardrailCatalogue } from '@craftabot/core';

/**
 * **The Guardrail Catalogue, first edition** (WP98, `86-CATALOGUE.md` §4;
 * `83-…` §6.4.2, tenet 28): every technique the industry ships or the
 * research proposes for guarding an LLM agent, taxonomised by the current
 * survey structure, mapped to OWASP's Agentic Top 10 (2026) and the LLM
 * Top 10 (2025), cited with a year, and carrying what *this* product can
 * say about it today. **Every entry is `review: 'pending'`** until Andrew has
 * read it against its sources (`86-…` §2's sourcing rule); the page counts
 * them. The coverage column is what the code does on 2026-09-12 — the
 * roadmap's work packages move entries rightward and nothing else does.
 *
 * The sources are the ones `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` gathered
 * (August 2026), by section, with the vendor documents and papers it cites.
 */
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
const OWASP_AGENTIC_THREATS: CatalogueSource = {
	title: 'Agentic AI — Threats and Mitigations',
	publisher: 'OWASP GenAI Security Project',
	year: 2025,
	kind: 'guidance'
};
const NIST_RMF: CatalogueSource = {
	title: 'AI Risk Management Framework (AI RMF 1.0)',
	publisher: 'NIST',
	year: 2023,
	url: 'https://www.nist.gov/itl/ai-risk-management-framework',
	kind: 'standard'
};
const NIST_600: CatalogueSource = {
	title: 'AI 600-1: Generative AI Profile',
	publisher: 'NIST',
	year: 2024,
	kind: 'standard'
};
const ISO_42001: CatalogueSource = {
	title: 'ISO/IEC 42001:2023 — AI management systems',
	publisher: 'ISO/IEC',
	year: 2023,
	kind: 'standard'
};
const EU_AI_ACT: CatalogueSource = {
	title: 'Regulation (EU) 2024/1689 (the AI Act), Articles 9, 12, 13 and 14',
	publisher: 'European Union',
	year: 2024,
	kind: 'standard'
};
const PRA_SS1_23: CatalogueSource = {
	title: 'SS1/23 — Model risk management principles for banks',
	publisher: 'Prudential Regulation Authority',
	year: 2023,
	kind: 'guidance'
};
const CISA_AGENTIC: CatalogueSource = {
	title: 'Multi-agency guidance on securing agentic AI',
	publisher: 'CISA and partner agencies',
	year: 2026,
	kind: 'guidance'
};
const MITRE_ATLAS: CatalogueSource = {
	title: 'MITRE ATLAS (agentic techniques, 2025–26 updates)',
	publisher: 'MITRE',
	year: 2025,
	url: 'https://atlas.mitre.org/',
	kind: 'guidance'
};
const META_GUARDS: CatalogueSource = {
	title: 'Llama Guard 4 and Prompt Guard 2 model cards',
	publisher: 'Meta',
	year: 2025,
	kind: 'vendor'
};
const MODEL_ARMOR: CatalogueSource = {
	title: 'Model Armor documentation (filter version 3)',
	publisher: 'Google Cloud',
	year: 2026,
	kind: 'vendor'
};
const AZURE_SAFETY: CatalogueSource = {
	title: 'Azure AI Content Safety — Prompt Shields and harm categories',
	publisher: 'Microsoft',
	year: 2025,
	kind: 'vendor'
};
const LAKERA: CatalogueSource = {
	title: 'Lakera Guard documentation',
	publisher: 'Lakera',
	year: 2025,
	kind: 'vendor'
};
const BEDROCK: CatalogueSource = {
	title: 'Amazon Bedrock Guardrails (prompt-attack filter, automated reasoning checks)',
	publisher: 'AWS',
	year: 2025,
	kind: 'vendor'
};
const CONSTITUTIONAL: CatalogueSource = {
	title: 'Constitutional Classifiers: defending against universal jailbreaks',
	publisher: 'Anthropic',
	year: 2025,
	kind: 'paper'
};
const OPENAI_MOD: CatalogueSource = {
	title: 'Moderation API and gpt-oss-safeguard',
	publisher: 'OpenAI',
	year: 2025,
	kind: 'vendor'
};
const SHIELDGEMMA: CatalogueSource = {
	title: 'ShieldGemma and Granite Guardian model cards',
	publisher: 'Google and IBM',
	year: 2024,
	kind: 'vendor'
};
const SPOTLIGHTING: CatalogueSource = {
	title: 'Defending against indirect prompt injection with spotlighting',
	publisher: 'Microsoft Research',
	year: 2024,
	kind: 'paper'
};
const INSTRUCTION_HIERARCHY: CatalogueSource = {
	title: 'The Instruction Hierarchy: training LLMs to prioritise privileged instructions',
	publisher: 'OpenAI',
	year: 2024,
	kind: 'paper'
};
const CAMEL: CatalogueSource = {
	title: 'Defeating prompt injections by design (CaMeL)',
	publisher: 'Google DeepMind',
	year: 2025,
	kind: 'paper'
};
const MCP_SECURITY: CatalogueSource = {
	title: 'MCP security best practices',
	publisher: 'Model Context Protocol',
	year: 2025,
	url: 'https://modelcontextprotocol.io/',
	kind: 'guidance'
};
const MEMORY_POISONING: CatalogueSource = {
	title: 'Memory-poisoning attacks on LLM agents (2025–26 research)',
	publisher: 'arXiv',
	year: 2025,
	kind: 'paper'
};
const PRESIDIO: CatalogueSource = {
	title: 'Presidio — data protection and de-identification',
	publisher: 'Microsoft',
	year: 2024,
	url: 'https://github.com/microsoft/presidio',
	kind: 'vendor'
};
const GUARDRAILS_AI: CatalogueSource = {
	title: 'Guardrails AI validators and hub',
	publisher: 'Guardrails AI',
	year: 2025,
	url: 'https://github.com/guardrails-ai/guardrails',
	kind: 'vendor'
};
const NEMO: CatalogueSource = {
	title: 'NeMo Guardrails',
	publisher: 'NVIDIA',
	year: 2024,
	url: 'https://github.com/NVIDIA/NeMo-Guardrails',
	kind: 'vendor'
};
const OPENAI_AGENTS: CatalogueSource = {
	title: 'Agents SDK guardrails and AgentKit',
	publisher: 'OpenAI',
	year: 2025,
	kind: 'vendor'
};
const FCA_COBS: CatalogueSource = {
	title:
		'FCA Handbook — COBS 4 (financial promotions), COBS 9 (suitability), PRIN 2A (Consumer Duty)',
	publisher: 'Financial Conduct Authority',
	year: 2023,
	kind: 'standard'
};
const POCA: CatalogueSource = {
	title: 'Proceeds of Crime Act 2002, s.333A (tipping off)',
	publisher: 'UK Parliament',
	year: 2002,
	kind: 'standard'
};
const OPA: CatalogueSource = {
	title: 'Open Policy Agent and Rego',
	publisher: 'CNCF',
	year: 2024,
	url: 'https://www.openpolicyagent.org/',
	kind: 'vendor'
};
const CEDAR: CatalogueSource = {
	title: 'Cedar policy language; Bedrock AgentCore gateway policies',
	publisher: 'AWS',
	year: 2025,
	kind: 'vendor'
};
const MS_AGT: CatalogueSource = {
	title: 'Agent Governance Toolkit — OPA, Rego and Cedar policies for agents',
	publisher: 'Microsoft',
	year: 2025,
	kind: 'guidance'
};
const AGENTSPEC: CatalogueSource = {
	title: 'AgentSpec: customizable runtime enforcement for safe and reliable LLM agents',
	publisher: 'ICSE (arXiv 2503.18666)',
	year: 2026,
	url: 'https://arxiv.org/abs/2503.18666',
	kind: 'paper'
};
const PROGENT: CatalogueSource = {
	title: 'Progent: programmable privilege control for LLM agents',
	publisher: 'arXiv 2504.11703',
	year: 2025,
	url: 'https://arxiv.org/abs/2504.11703',
	kind: 'paper'
};
const VERCEL_APPROVALS: CatalogueSource = {
	title: 'AI SDK — policy-based tool approvals',
	publisher: 'Vercel',
	year: 2025,
	kind: 'vendor'
};
const CLAUDE_CODE: CatalogueSource = {
	title: 'Claude Code permissions and sandboxing',
	publisher: 'Anthropic',
	year: 2025,
	kind: 'vendor'
};
const LANGGRAPH: CatalogueSource = {
	title: 'LangGraph recursion limits and time-travel debugging',
	publisher: 'LangChain',
	year: 2025,
	kind: 'vendor'
};
const DEEPMIND_FSF: CatalogueSource = {
	title: 'Frontier Safety Framework v3 (shutdown resistance)',
	publisher: 'Google DeepMind',
	year: 2025,
	kind: 'guidance'
};
const SANDBOXES: CatalogueSource = {
	title: 'Firecracker microVMs and gVisor for agent code execution (E2B, Daytona)',
	publisher: 'AWS, Google and the sandbox vendors',
	year: 2025,
	kind: 'vendor'
};
const FIDES: CatalogueSource = {
	title: 'FIDES: information-flow control for LLM agents',
	publisher: 'arXiv',
	year: 2025,
	kind: 'paper'
};
const LETHAL_TRIFECTA: CatalogueSource = {
	title: 'The lethal trifecta for AI agents; the dual-LLM pattern',
	publisher: 'Simon Willison',
	year: 2025,
	url: 'https://simonwillison.net/',
	kind: 'guidance'
};
const SHADE_ARENA: CatalogueSource = {
	title: 'SHADE-Arena: evaluating sabotage and monitoring in LLM agents',
	publisher: 'Anthropic',
	year: 2025,
	kind: 'paper'
};
const DRIFT: CatalogueSource = {
	title: 'Page–Hinkley and behavioural drift detection on agent telemetry',
	publisher: 'E. S. Page, Biometrika; agent observability guidance',
	year: 1954,
	kind: 'paper'
};
const OTEL_GENAI: CatalogueSource = {
	title: 'OpenTelemetry semantic conventions for generative AI',
	publisher: 'OpenTelemetry',
	year: 2025,
	url: 'https://opentelemetry.io/',
	kind: 'standard'
};
const OPENINFERENCE: CatalogueSource = {
	title: 'OpenInference — GUARDRAIL and agent spans',
	publisher: 'Arize',
	year: 2025,
	kind: 'vendor'
};
const AIRGAP: CatalogueSource = {
	title: 'AirGapAgent: protecting privacy with context hijacking',
	publisher: 'arXiv',
	year: 2024,
	kind: 'paper'
};
const SHIELDAGENT: CatalogueSource = {
	title: 'ShieldAgent: shielding agents via verifiable safety policy reasoning',
	publisher: 'arXiv',
	year: 2025,
	kind: 'paper'
};
const ENTRA: CatalogueSource = {
	title: 'Microsoft Entra Agent ID',
	publisher: 'Microsoft',
	year: 2025,
	kind: 'vendor'
};
const OKTA_XAA: CatalogueSource = {
	title: 'Cross App Access (XAA) and OAuth extensions for agents',
	publisher: 'Okta',
	year: 2025,
	kind: 'vendor'
};
const SPIFFE: CatalogueSource = {
	title: 'SPIFFE/SPIRE workload identity',
	publisher: 'CNCF',
	year: 2024,
	url: 'https://spiffe.io/',
	kind: 'standard'
};
const C2PA: CatalogueSource = {
	title: 'C2PA content credentials specification',
	publisher: 'Coalition for Content Provenance and Authenticity',
	year: 2024,
	url: 'https://c2pa.org/',
	kind: 'standard'
};
const AI_BOM: CatalogueSource = {
	title: 'CycloneDX AI/ML bill of materials',
	publisher: 'OWASP CycloneDX',
	year: 2024,
	kind: 'standard'
};
const A2A: CatalogueSource = {
	title: 'Agent2Agent (A2A) protocol',
	publisher: 'Google and the Linux Foundation',
	year: 2025,
	kind: 'standard'
};
const INSPECT: CatalogueSource = {
	title: 'Inspect evaluation framework',
	publisher: 'UK AI Security Institute',
	year: 2024,
	url: 'https://inspect.aisi.org.uk/',
	kind: 'vendor'
};
const TAU_BENCH: CatalogueSource = {
	title: 'τ-bench: a benchmark for tool-agent-user interaction',
	publisher: 'Sierra (arXiv)',
	year: 2024,
	kind: 'paper'
};
const PETRI: CatalogueSource = {
	title: 'Petri: automated auditing of model behaviour',
	publisher: 'Anthropic',
	year: 2025,
	kind: 'vendor'
};
const SAFETY_CASES: CatalogueSource = {
	title: 'Safety cases for frontier AI',
	publisher: 'UK AI Security Institute and partners',
	year: 2025,
	kind: 'paper'
};
const INCIDENTS: CatalogueSource = {
	title: 'AI Incident Database; OECD AI incidents monitor',
	publisher: 'Responsible AI Collaborative; OECD',
	year: 2024,
	kind: 'guidance'
};
const AUTONOMY_STUDY: CatalogueSource = {
	title: 'Measuring autonomy in deployed agents',
	publisher: 'Anthropic',
	year: 2026,
	kind: 'paper'
};
const AUTONOMY_LEVELS: CatalogueSource = {
	title: 'Levels of AI agents; levels of autonomy for agentic systems',
	publisher: 'arXiv; Knight First Amendment Institute',
	year: 2024,
	kind: 'paper'
};
const APPROVAL_FATIGUE: CatalogueSource = {
	title: 'Approval and confirmation fatigue in agent permissioning',
	publisher: 'arXiv',
	year: 2025,
	kind: 'paper'
};

const P = 'pending' as const;
const RUNTIME = 'runtime-protection' as const;

function entry(input: Omit<CatalogueEntry, 'review'>): CatalogueEntry {
	return { ...input, review: P };
}

export const CATALOGUE_ENTRIES: CatalogueEntry[] = [
	// ---------------------------------------------------------------- input guardrails
	entry({
		id: 'prompt-injection-classifier',
		name: 'Prompt-injection classifier',
		summary:
			'A classifier over what the bot is about to read or do that flags an injected instruction.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think', 'pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI01', 'LLM01'],
		frameworks: ['owasp:asi01', 'nist-ai-rmf:manage', 'nist-ai-600-1'],
		sources: [META_GUARDS, MODEL_ARMOR, AZURE_SAFETY, LAKERA, BEDROCK, OWASP_AGENTIC, OWASP_LLM],
		coverage: {
			status: 'shipped',
			componentIds: [
				'guard-local/prompt-guard',
				'geap/model-armor',
				'azure-content-safety/content-safety'
			],
			note: 'Three services through the shell, each with an offline stand-in; Lakera and Bedrock are WP99’s connections.',
			since: 'WP42'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'jailbreak-classifier',
		name: 'Jailbreak classifier',
		summary: 'A classifier trained to spot attempts to override the model’s own rules.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think'],
		maturity: 'widely-adopted',
		threats: ['ASI01', 'LLM01'],
		frameworks: ['owasp:asi01', 'nist-ai-600-1'],
		sources: [META_GUARDS, MODEL_ARMOR, CONSTITUTIONAL, AZURE_SAFETY],
		coverage: {
			status: 'shipped',
			componentIds: ['guard-local/prompt-guard', 'geap/model-armor'],
			note: 'Prompt Guard 2 and Model Armor’s jailbreak detection; constitutional classifiers are a lab’s own deployment, not a service the shell can reach.',
			since: 'WP42'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'hazard-classifier',
		name: 'Hazard and content classifier',
		summary:
			'A classifier over a taxonomy of harms (MLCommons, Azure severities) applied to prompts and responses.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think', 'pre-act', 'post-act'],
		maturity: 'widely-adopted',
		threats: ['LLM05', 'ASI09'],
		frameworks: ['nist-ai-600-1', 'eu-ai-act:art-9'],
		sources: [META_GUARDS, AZURE_SAFETY, OPENAI_MOD, SHIELDGEMMA, MODEL_ARMOR],
		coverage: {
			status: 'shipped',
			componentIds: [
				'guard-local/llama-guard',
				'azure-content-safety/content-safety',
				'geap/model-armor'
			],
			note: 'Llama Guard 4 over Ollama, Azure Content Safety, and Model Armor’s responsible-AI filters.',
			since: 'WP42'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'policy-conditioned-classifier',
		name: 'Policy-conditioned classifier',
		summary:
			'A safety reasoner that takes the deployer’s written policy at inference time and classifies against it.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think', 'pre-act'],
		maturity: 'emerging',
		threats: ['ASI01', 'ASI09'],
		frameworks: ['nist-ai-600-1'],
		sources: [OPENAI_MOD],
		coverage: {
			status: 'blueprint',
			note: 'Day 6 names a component over any cartridge with the bank’s rulebook as the policy; nothing built.'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'untrusted-content-marking',
		name: 'Untrusted-content marking',
		summary:
			'Spotlighting, instruction hierarchy or a control/data split so retrieved text cannot pose as an instruction.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think', 'post-act'],
		maturity: 'emerging',
		threats: ['ASI01', 'ASI06', 'LLM01'],
		frameworks: ['owasp:asi01', 'nist-ai-600-1'],
		sources: [SPOTLIGHTING, INSTRUCTION_HIERARCHY, CAMEL],
		coverage: {
			status: 'bespoke',
			implementedBy: ['desk brief: records apart from instructions (43-DESK-WORLDS.md)'],
			note: 'The desk brief separates the records from the instructions; tool results and line answers are not yet marked — Day 6 names an untrusted-content component at post-act.'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'indirect-injection-defence',
		name: 'Indirect-injection defences for tool results',
		summary:
			'Treating tool output, retrieved documents and MCP descriptions as attack surface — poisoned tools, confused deputies.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['post-act'],
		maturity: 'emerging',
		threats: ['ASI02', 'ASI04', 'LLM01'],
		frameworks: ['owasp:asi02', 'owasp:asi04'],
		sources: [OWASP_AGENTIC, MCP_SECURITY, MITRE_ATLAS],
		coverage: {
			status: 'bespoke',
			implementedBy: [
				'the poisoned factsheet, the CRM note and the doctored payslip decks (19-… #38)'
			],
			note: 'Shipped as scenarios the decks run under pressure; a tool-description integrity check on the registry is a blueprint.'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'memory-provenance',
		name: 'Memory and context-poisoning defences',
		summary:
			'Provenance tags on what a bot remembers, quarantine of untrusted memory, refusal to reason over it.',
		category: RUNTIME,
		subcategory: 'input-guardrail',
		points: ['pre-think'],
		maturity: 'research',
		threats: ['ASI06'],
		frameworks: ['owasp:asi06'],
		sources: [MEMORY_POISONING, OWASP_AGENTIC],
		coverage: {
			status: 'bespoke',
			implementedBy: ['memory.updated on the trace (02-AGENT-MODEL.md §7)'],
			note: 'Every notebook write is on the trace; no provenance tag yet — Day 6 names a memory-provenance component and a card that refuses a think over untrusted memory.'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- output guardrails
	entry({
		id: 'pii-redaction',
		name: 'PII detection and redaction',
		summary:
			'Finding personal identifiers in what the bot is about to say and rewriting the line before it goes out.',
		category: RUNTIME,
		subcategory: 'output-guardrail',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['LLM02', 'ASI09'],
		frameworks: ['fca:consumer-duty', 'eu-ai-act:art-9'],
		obligations: ['ukgdpr:data-minimisation'],
		sources: [PRESIDIO, MODEL_ARMOR, GUARDRAILS_AI],
		coverage: {
			status: 'shipped',
			componentIds: ['geap/model-armor'],
			implementedBy: [
				'the redact verdict applied to say (85-COMPONENTS.md §4)',
				'fs-advice/pii-contained'
			],
			note: 'Model Armor’s Sensitive Data Protection through the shell, its redaction applied to the outgoing line since WP96; the PII-contained evaluator reads the redaction.',
			since: 'WP96'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'domain-output-rules',
		name: 'Domain output rules',
		summary:
			'The bank’s own rulebook as output filters: no guarantee language, no tipping off, plain English, promotions wording.',
		category: RUNTIME,
		subcategory: 'output-guardrail',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['fca:cobs-4', 'fca:consumer-duty'],
		obligations: ['fca:cobs-4:promotions', 'fca:cobs-9:suitability'],
		sources: [FCA_COBS, POCA],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/policy-card'],
			implementedBy: ['the desks’ policy cards (49-, 51-, 52-, 61-…)'],
			note: 'Every desk’s cards, compiled as components.',
			since: 'WP60'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'llm-as-judge',
		name: 'Output-side judges and hallucination checks',
		summary:
			'A second model or a validator judging an output for hazard, faithfulness or hallucination.',
		category: RUNTIME,
		subcategory: 'output-guardrail',
		points: ['post-act', 'stage-out', 'group'],
		maturity: 'widely-adopted',
		threats: ['LLM09', 'ASI09'],
		frameworks: ['nist-ai-rmf:measure', 'pra-ss1-23:p4'],
		sources: [GUARDRAILS_AI, BEDROCK, INSPECT],
		coverage: {
			status: 'shipped',
			componentIds: ['monitor/evaluator-breaker'],
			implementedBy: ['the rubric evaluators (31-…)', 'geap/eval/* (39-…)'],
			note: 'The rubric and hosted evaluators as judges with offline stand-ins; the breaker fits a judge at the chokepoint or a stage boundary. Bedrock’s automated-reasoning checks are a WP99 connection candidate, recorded research-grade for a bank’s rulebook.',
			since: 'WP43'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'structured-output-validation',
		name: 'Structured-output validation',
		summary:
			'Every tool call and stage output validated against a schema before anything reads it.',
		category: RUNTIME,
		subcategory: 'output-guardrail',
		points: ['stage-out'],
		maturity: 'widely-adopted',
		threats: ['LLM05', 'ASI05'],
		frameworks: ['nist-ai-rmf:manage'],
		sources: [GUARDRAILS_AI, OPENAI_AGENTS],
		coverage: {
			status: 'shipped',
			implementedBy: ['validateAgainst in @craftabot/workflow (69-WORKFLOWS.md §5)'],
			note: 'A mechanism of the workflow runtime, not a component: every stage’s input and output against its JSON schema.',
			since: 'WP79'
		},
		bankingRelevance: 'core'
	}),
	// ---------------------------------------------------------------- action control and policy-as-code
	entry({
		id: 'tool-allow-deny',
		name: 'Tool allow and deny lists',
		summary: 'What a bot may call, by name and by argument, decided before the call runs.',
		category: RUNTIME,
		subcategory: 'action-control',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI02', 'ASI05', 'LLM06'],
		frameworks: ['owasp:asi02', 'nist-ai-rmf:manage'],
		sources: [CLAUDE_CODE, OPENAI_AGENTS, VERCEL_APPROVALS],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/action-blocklist', 'governance/policy-card'],
			note: 'The blocklist and the card leaves over arguments (33-…).',
			since: 'WP0'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'policy-decision-point',
		name: 'Policy-as-code decision point',
		summary: 'Externalising “may this bot do this?” to a policy engine evaluated per action.',
		category: RUNTIME,
		subcategory: 'policy-as-code',
		points: ['pre-act', 'stage-in', 'stage-out'],
		maturity: 'emerging',
		threats: ['ASI02', 'ASI03'],
		frameworks: ['owasp:asi03', 'nist-ai-rmf:manage', 'iso-42001:8.4'],
		sources: [OPA, CEDAR, MS_AGT],
		coverage: {
			status: 'shipped',
			componentIds: ['pdp-opa/opa'],
			implementedBy: ['PredicateExpr v2 as the built-in engine (33-…)'],
			note: 'OPA through the shell with its live checkpoint taken; Cedar is a blueprint connection.',
			since: 'WP45'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'runtime-enforcement-dsl',
		name: 'Runtime enforcement rules',
		summary:
			'Trigger → predicate → enforcement rules intercepting the agent loop (AgentSpec’s shape).',
		category: RUNTIME,
		subcategory: 'policy-as-code',
		points: ['pre-think', 'pre-act', 'post-act'],
		maturity: 'research',
		threats: ['ASI01', 'ASI02'],
		frameworks: ['owasp:asi02'],
		sources: [AGENTSPEC, PROGENT],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/policy-card'],
			note: 'Policy cards are the AgentSpec shape: a hook, a predicate, a disposition.',
			since: 'WP22'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'privilege-scopes',
		name: 'Least-privilege scopes with recorded elevation',
		summary: 'A bot started with minimal grants, every elevation request recorded and decided.',
		category: RUNTIME,
		subcategory: 'policy-as-code',
		points: ['pre-act'],
		maturity: 'research',
		threats: ['ASI03'],
		frameworks: ['owasp:asi03', 'nist-ai-rmf:manage'],
		sources: [PROGENT, OWASP_AGENTIC_THREATS],
		coverage: {
			status: 'blueprint',
			note: 'Day 6 names a privilege-scopes component (19-… #15); the Connector’s scopes are the nearest thing today and are not elevation.'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'risk-tiered-approval',
		name: 'Risk-tiered approval',
		summary: 'A person asked before a risky action, with the tiers declared by the world.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI02', 'ASI09'],
		frameworks: ['eu-ai-act:art-14', 'pra-ss1-23:p5'],
		sources: [VERCEL_APPROVALS, OPENAI_AGENTS, EU_AI_ACT],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/approval-mode'],
			implementedBy: ['WorldActionDefinition.riskTier (33-…)'],
			note: 'Approval on everything or on what is reversible or irreversible, as the world declares.',
			since: 'WP24'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'four-eyes',
		name: 'Four-eyes and decision-rights ceilings',
		summary:
			'A second person on an irreversible decision, and a ceiling on what a bot may decide alone by autonomy level.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: ['stage-in'],
		maturity: 'widely-adopted',
		threats: ['ASI09'],
		frameworks: ['pra-ss1-23:p5', 'fca:consumer-duty', 'eu-ai-act:art-14'],
		sources: [PRA_SS1_23, EU_AI_ACT],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'the four-eyes human stage (73-…)',
				'the decision-rights ceilings (LENDING_CEILINGS)'
			],
			note: 'Workflow content, not a component: a human stage and the ceilings per configuration.',
			since: 'WP80'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'budget-cap',
		name: 'Step and token budgets',
		summary: 'A hard cap on turns and tokens so a runaway bot ends the run rather than the bill.',
		category: RUNTIME,
		subcategory: 'action-control',
		points: ['pre-think'],
		maturity: 'widely-adopted',
		threats: ['ASI08'],
		frameworks: ['nist-ai-rmf:manage'],
		sources: [LANGGRAPH, OPENAI_AGENTS],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/step-budget', 'governance/token-budget'],
			note: 'OUT_OF_STEPS is the loop score.',
			since: 'WP0'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'loop-detection',
		name: 'Loop and no-progress detection',
		summary: 'Refusing the same non-progress move proposed too many times running.',
		category: RUNTIME,
		subcategory: 'action-control',
		points: ['pre-act'],
		maturity: 'widely-adopted',
		threats: ['ASI08'],
		frameworks: ['nist-ai-rmf:manage'],
		sources: [LANGGRAPH],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/no-repetition'],
			note: 'The loop-breaker with the world’s progress predicate; a broader no-progress detector over repeated identical calls is a blueprint (19-… #7).',
			since: 'WP30'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'rate-limit',
		name: 'Rate limits',
		summary: 'Calls per minute or per account, bounded at the gateway.',
		category: RUNTIME,
		subcategory: 'action-control',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI08'],
		frameworks: ['nist-ai-rmf:manage'],
		sources: [OPENAI_AGENTS],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable to a simulator: a run has no wall clock a rate could be measured against — the budgets are the bound, and a provider’s own limit reaches the trace as provider.retried.'
		},
		bankingRelevance: 'none'
	}),
	entry({
		id: 'kill-switch',
		name: 'Kill switch and safe-mode degradation',
		summary:
			'A person can stop any run; a degraded model falls back to a plain sentence rather than a guess.',
		category: 'human-oversight',
		subcategory: 'interruptibility',
		points: ['pre-think'],
		maturity: 'widely-adopted',
		threats: ['ASI10', 'ASI08'],
		frameworks: ['eu-ai-act:art-14', 'cisa'],
		sources: [DEEPMIND_FSF, CISA_AGENTIC],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/policy-card'],
			implementedBy: [
				'Stop → run.finished STOPPED_BY_USER',
				'the Fallback card and provider-fault (61-…)'
			],
			note: 'Stop is the session’s; the Fallback card is a policy card fitted on every desk; a provider fault is an injection the incident decks judge.',
			since: 'WP72'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'sandboxed-execution',
		name: 'Sandboxed tool and code execution',
		summary:
			'Running agent-generated code in a disposable microVM or userspace kernel with no ambient credentials.',
		category: 'component-hardening',
		subcategory: 'isolation',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI05'],
		frameworks: ['owasp:asi05', 'cisa'],
		sources: [SANDBOXES, CLAUDE_CODE],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable: the world is the sandbox — a bot performs declared actions on a simulated world and runs no code; recorded so the claim is not implied.'
		},
		bankingRelevance: 'none'
	}),
	entry({
		id: 'egress-control',
		name: 'Egress control',
		summary:
			'Every outbound call from a bot’s bricks and provider allowed only to a declared host, or refused and recorded.',
		category: 'component-hardening',
		subcategory: 'isolation',
		points: ['egress'],
		maturity: 'widely-adopted',
		threats: ['ASI04', 'LLM02'],
		frameworks: ['owasp:asi04', 'nist-ai-rmf:manage'],
		sources: [CLAUDE_CODE, CISA_AGENTIC],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/egress-declared', 'governance/egress-none'],
			note: 'The session’s fetch guard as two components; a refusal is an error on the trace.',
			since: 'WP41'
		},
		bankingRelevance: 'core'
	}),
	// ---------------------------------------------------------------- information flow and monitoring
	entry({
		id: 'information-flow-control',
		name: 'Information-flow control and taint tracking',
		summary:
			'Labels on data that follow it through the bot so a secret cannot reach an egress or a line the purpose forbids.',
		category: RUNTIME,
		subcategory: 'information-flow',
		points: ['pre-act', 'post-act'],
		maturity: 'research',
		threats: ['ASI06', 'LLM02'],
		frameworks: ['owasp:asi06', 'eu-ai-act:art-9'],
		obligations: ['ukgdpr:data-minimisation'],
		sources: [FIDES, CAMEL, LETHAL_TRIFECTA],
		coverage: {
			status: 'bespoke',
			implementedBy: [
				'classification on every record and purpose-gating on every line (48-FS-BANK.md, tenet 13)'
			],
			note: 'Every record is classified and every line purpose-gated; no taint through the bot’s reasoning yet — Day 6 names a taint component and a taint-reaches card leaf.'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'monitor-agent',
		name: 'Monitor agents and circuit breakers',
		summary: 'A second seat or an evaluator watching the run and stopping it on a named failure.',
		category: RUNTIME,
		subcategory: 'monitoring',
		points: ['group', 'stage-out', 'post-act'],
		maturity: 'emerging',
		threats: ['ASI08', 'ASI10'],
		frameworks: ['owasp:asi08', 'owasp:asi10', 'nist-ai-rmf:manage'],
		sources: [SHADE_ARENA, OWASP_AGENTIC],
		coverage: {
			status: 'shipped',
			componentIds: ['monitor/evaluator-breaker'],
			implementedBy: ['the group Watchbot and the Compliance Watchbot (36-, 56-…)'],
			note: 'The breaker at the chokepoint since WP64 and at a stage boundary since WP95; the Watchbot is a brick.',
			since: 'WP48'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'behavioural-drift',
		name: 'Behavioural drift and anomaly detection',
		summary:
			'A statistic over the run series that flags a change in what the bot does before a person would.',
		category: RUNTIME,
		subcategory: 'monitoring',
		points: [],
		maturity: 'emerging',
		threats: ['ASI08'],
		frameworks: ['pra-ss1-23:p4', 'nist-ai-rmf:measure'],
		sources: [DRIFT, OTEL_GENAI],
		coverage: {
			status: 'shipped',
			implementedBy: ['@craftabot/metrics driftIn (68-…)', 'the Monitor (75-…)'],
			note: 'Page–Hinkley and the Monitor over the stored series; not a component, a fold.',
			since: 'WP49'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'execution-provenance',
		name: 'Evidence tracing and execution provenance',
		summary:
			'Every prompt, decision, action and verdict as a typed event, digested, with who was behind it.',
		category: RUNTIME,
		subcategory: 'monitoring',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI10', 'ASI03'],
		frameworks: ['eu-ai-act:art-12', 'iso-42001:9.1', 'pra-ss1-23:p2'],
		sources: [OTEL_GENAI, OPENINFERENCE, EU_AI_ACT],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'the trace and its digest (07-…)',
				'principal and attestation (55-…)',
				'the OTel mapping (35-…)'
			],
			note: 'Hard rule 3: everything observable arrives as an event.',
			since: 'WP0'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'stage-boundary-guard',
		name: 'Stage-boundary guards',
		summary:
			'A guard that decides at a stage’s input or output whatever the executor — a rule, a person or a bot.',
		category: RUNTIME,
		subcategory: 'policy-as-code',
		points: ['stage-in', 'stage-out'],
		maturity: 'emerging',
		threats: ['ASI02', 'ASI08'],
		frameworks: ['nist-ai-rmf:manage', 'pra-ss1-23:p5'],
		sources: [AGENTSPEC, OWASP_AGENTIC],
		coverage: {
			status: 'shipped',
			componentIds: ['governance/policy-card', 'monitor/evaluator-breaker', 'geap/model-armor'],
			note: 'The workflow runtime’s boundary chain (69-… §10).',
			since: 'WP95'
		},
		bankingRelevance: 'core'
	}),
	// ---------------------------------------------------------------- secure by design
	entry({
		id: 'privilege-separation',
		name: 'Privilege separation and dual-LLM patterns',
		summary:
			'A privileged planner that never reads untrusted content and a quarantined reader that never acts.',
		category: 'secure-by-design',
		subcategory: 'privilege-separation',
		points: ['group'],
		maturity: 'emerging',
		threats: ['ASI01', 'ASI07'],
		frameworks: ['owasp:asi07'],
		sources: [LETHAL_TRIFECTA, CAMEL, AIRGAP],
		coverage: {
			status: 'bespoke',
			implementedBy: ['the two-seat episode (46-, 56-…)'],
			note: 'The Watchbot is a second seat with its own brain; a quarantined reader seat is a blueprint configuration of the episode.'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'formal-verification',
		name: 'Formal verification of agent policies',
		summary:
			'Proving a policy holds over the agent’s possible actions rather than checking each one.',
		category: 'secure-by-design',
		subcategory: 'formal-verification',
		points: [],
		maturity: 'research',
		threats: ['ASI02'],
		frameworks: ['nist-ai-rmf:measure'],
		sources: [SHIELDAGENT, BEDROCK],
		coverage: {
			status: 'blueprint',
			note: 'Recorded as research; Bedrock’s automated-reasoning checks would be a policy-engine connection.'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'guardrail-framework',
		name: 'Guardrail frameworks',
		summary: 'Programmable rails (NeMo, Guardrails AI) wrapping a model’s input and output.',
		category: 'secure-by-design',
		subcategory: 'framework',
		points: ['pre-think', 'pre-act', 'post-act'],
		maturity: 'widely-adopted',
		threats: ['LLM01', 'LLM05'],
		frameworks: ['nist-ai-600-1'],
		sources: [NEMO, GUARDRAILS_AI, OPENAI_AGENTS],
		coverage: {
			status: 'not-applicable',
			note: 'Not applicable as a dependency: the guard shell (29-…) and the component contract (85-…) are the product’s own framework; a vendor framework’s validators reach it as a service, not as rails.'
		},
		bankingRelevance: 'none'
	}),
	// ---------------------------------------------------------------- identity and access
	entry({
		id: 'agent-identity',
		name: 'Agent identity, delegation chains and attestation',
		summary:
			'A bot as an auditable principal acting on behalf of a person, every action attested with what let it through.',
		category: 'identity-and-access',
		subcategory: 'identity',
		points: [],
		maturity: 'emerging',
		threats: ['ASI03', 'ASI10'],
		frameworks: ['owasp:asi03', 'eu-ai-act:art-12', 'iso-42001:8.4'],
		sources: [ENTRA, OKTA_XAA, SPIFFE],
		coverage: {
			status: 'shipped',
			implementedBy: ['principal, onBehalfOf and attestation (55-PRINCIPAL.md)'],
			note: 'On the trace when the host names one; no directory integration.',
			since: 'WP65'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'credential-hygiene',
		name: 'Credential hygiene',
		summary:
			'Keys in a vault, read at call time, never in a file, a trace or a URL, with a test that proves it.',
		category: 'identity-and-access',
		subcategory: 'credentials',
		points: [],
		maturity: 'widely-adopted',
		threats: ['ASI03', 'LLM02'],
		frameworks: ['nist-ai-rmf:manage', 'cisa'],
		sources: [CISA_AGENTIC, MCP_SECURITY],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'the vault (cab.keys.v1)',
				'the key-leak test',
				'timed vault entries (26-… §6.6)'
			],
			note: 'Hard rule 2.',
			since: 'WP0'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'supply-chain-integrity',
		name: 'Pack, tool and cassette integrity',
		summary:
			'What a bot is built from — packs, tools, recorded lines — declared, versioned and digested.',
		category: 'component-hardening',
		subcategory: 'supply-chain',
		points: [],
		maturity: 'emerging',
		threats: ['ASI04'],
		frameworks: ['owasp:asi04', 'iso-42001:8.4'],
		sources: [AI_BOM, C2PA, OWASP_AGENTIC],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'kit-file requires and semver ranges (40-…)',
				'cassette digests (47-…)',
				'the inventory entry (53-…)'
			],
			note: 'Partial: a content digest on every pack manifest checked at registration is a blueprint (19-… #30).',
			since: 'WP52'
		},
		bankingRelevance: 'supporting'
	}),
	entry({
		id: 'inter-agent-authentication',
		name: 'Inter-agent message authentication',
		summary: 'A message from another agent verified before it is trusted.',
		category: 'identity-and-access',
		subcategory: 'multi-agent',
		points: ['pre-think'],
		maturity: 'emerging',
		threats: ['ASI07'],
		frameworks: ['owasp:asi07'],
		sources: [A2A, OWASP_AGENTIC],
		coverage: {
			status: 'bespoke',
			implementedBy: ['the party-line scenario (starter/party-line)'],
			note: 'Shipped as a scenario a card can catch; authentication itself is a blueprint.'
		},
		bankingRelevance: 'supporting'
	}),
	// ---------------------------------------------------------------- evaluation and assurance
	entry({
		id: 'eval-harness',
		name: 'Evaluation harnesses and policy-compliance benchmarks',
		summary:
			'Running a bot over a matrix of scenarios, guards and seeds and gating on what it did.',
		category: 'evaluation-and-assurance',
		subcategory: 'evaluation',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['nist-ai-rmf:measure', 'pra-ss1-23:p3', 'iso-42001:9.1'],
		sources: [INSPECT, TAU_BENCH],
		coverage: {
			status: 'shipped',
			implementedBy: ['campaigns and gates (28-…)', 'the decks under pressure (49-, 51-, 52-…)'],
			note: 'Campaigns in CI on every push.',
			since: 'WP38'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'automated-red-teaming',
		name: 'Automated red-teaming',
		summary: 'An adversary that probes a bot at scale and records what got through.',
		category: 'evaluation-and-assurance',
		subcategory: 'red-teaming',
		points: [],
		maturity: 'emerging',
		threats: ['ASI01', 'ASI09'],
		frameworks: ['nist-ai-rmf:measure', 'eu-ai-act:art-9'],
		sources: [PETRI, SHADE_ARENA],
		coverage: {
			status: 'shipped',
			implementedBy: ['the adversary tier and the scripted adversary (28-…)'],
			note: 'No live adversary seat; a red-team persona on the live counterpart is a bespoke configuration.',
			since: 'WP38'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'safety-case',
		name: 'Safety cases and transparency artefacts',
		summary:
			'A structured argument, with evidence, that a system is safe enough for its use — and the cards that describe it.',
		category: 'evaluation-and-assurance',
		subcategory: 'assurance',
		points: [],
		maturity: 'emerging',
		threats: [],
		frameworks: ['pra-ss1-23:p1', 'iso-42001:9.1', 'eu-ai-act:art-13'],
		sources: [SAFETY_CASES, PRA_SS1_23, AI_BOM],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'the safety case v2 (37-…)',
				'the assurance pack (53-…)',
				'the inventory entry'
			],
			note: 'Rendered as markdown and one HTML file a reviewer opens with no app.',
			since: 'WP67'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'incident-reporting',
		name: 'Incident reporting',
		summary: 'What went wrong, when, and what the bot saw and decided at that tick.',
		category: 'evaluation-and-assurance',
		subcategory: 'assurance',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['eu-ai-act:art-12', 'nist-ai-rmf:manage'],
		sources: [INCIDENTS, NIST_RMF],
		coverage: {
			status: 'shipped',
			implementedBy: ['the incidents fold and the Incidents screen (37-, 54-…)'],
			note: 'Each incident’s findings carry the decision explained.',
			since: 'WP49'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'control-effectiveness',
		name: 'Control-effectiveness measurement',
		summary: 'An experiment that says which control changed what, by how much, and how sure.',
		category: 'evaluation-and-assurance',
		subcategory: 'assurance',
		points: [],
		maturity: 'emerging',
		threats: [],
		frameworks: ['pra-ss1-23:p4', 'nist-ai-rmf:measure'],
		sources: [PRA_SS1_23, NIST_RMF],
		coverage: {
			status: 'shipped',
			implementedBy: ['experiments (72-…)', 'the Control Effectiveness Register (80-…)'],
			note: 'The register joins a stack’s controls since WP97.',
			since: 'WP90'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'fairness-and-parity',
		name: 'Fairness and parity measurement',
		summary:
			'Outcomes compared across cohorts with intervals, on a matched pair where the design allows.',
		category: 'evaluation-and-assurance',
		subcategory: 'evaluation',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['fca:consumer-duty', 'eu-ai-act:art-9'],
		obligations: ['equality-act:fairness'],
		sources: [PRA_SS1_23, ISO_42001],
		coverage: {
			status: 'shipped',
			implementedBy: ['@craftabot/metrics fairness (68-…)', 'the parity gate (50-, 74-…)'],
			note: 'The matched pair on the Lending Desk.',
			since: 'WP61'
		},
		bankingRelevance: 'core'
	}),
	// ---------------------------------------------------------------- human oversight
	entry({
		id: 'autonomy-levels',
		name: 'Levels of autonomy',
		summary:
			'What a bot may decide alone, by level, with the touches a person makes counted per case.',
		category: 'human-oversight',
		subcategory: 'autonomy',
		points: [],
		maturity: 'emerging',
		threats: ['ASI09'],
		frameworks: ['eu-ai-act:art-14', 'pra-ss1-23:p5'],
		sources: [AUTONOMY_LEVELS, AUTONOMY_STUDY],
		coverage: {
			status: 'shipped',
			implementedBy: [
				'the five reference configurations by level (73-, 76-…)',
				'the human-load metrics'
			],
			note: 'Touches per case, unattended rate and ceiling breaches on every report.',
			since: 'WP80'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'confirmation-fatigue',
		name: 'Confirmation fatigue',
		summary: 'Measuring how many approvals a person is asked for, so oversight is not theatre.',
		category: 'human-oversight',
		subcategory: 'human-in-the-loop',
		points: [],
		maturity: 'research',
		threats: ['ASI09'],
		frameworks: ['eu-ai-act:art-14'],
		sources: [APPROVAL_FATIGUE, AUTONOMY_STUDY],
		coverage: {
			status: 'shipped',
			implementedBy: ['approvalsPerCase in the human-load rows (73-…)'],
			note: 'Counted; no adaptive throttling.',
			since: 'WP80'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'explainability',
		name: 'Explainability to end users',
		summary:
			'What the bot saw, was offered, chose and what checked it — and an explanation that names only real reasons.',
		category: 'human-oversight',
		subcategory: 'explainability',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['eu-ai-act:art-13', 'fca:consumer-duty', 'pra-ss1-23:p2'],
		sources: [EU_AI_ACT, FCA_COBS],
		coverage: {
			status: 'shipped',
			implementedBy: ['decisionExplanation (54-…)', 'fs-lending/explanation-faithful'],
			note: 'Explain in the Run Lab; the faithfulness evaluator on the lending desk.',
			since: 'WP66'
		},
		bankingRelevance: 'core'
	}),
	entry({
		id: 'governance-frameworks',
		name: 'Governance frameworks and management systems',
		summary:
			'NIST AI RMF, ISO/IEC 42001, the EU AI Act and SS1/23 as the vocabulary the control map speaks.',
		category: 'evaluation-and-assurance',
		subcategory: 'framework',
		points: [],
		maturity: 'widely-adopted',
		threats: [],
		frameworks: ['nist-ai-rmf', 'iso-42001', 'eu-ai-act', 'pra-ss1-23'],
		sources: [NIST_RMF, NIST_600, ISO_42001, EU_AI_ACT, PRA_SS1_23],
		coverage: {
			status: 'shipped',
			implementedBy: ['the control maps (53-…)', 'the obligation vocabulary (48-…)'],
			note: 'A reference posture, not a compliance claim (08-… §6).',
			since: 'WP67'
		},
		bankingRelevance: 'core'
	})
];

export const GUARDRAIL_CATALOGUE: GuardrailCatalogue = {
	schemaVersion: 1,
	edition: '2026-09',
	entries: CATALOGUE_ENTRIES
};
