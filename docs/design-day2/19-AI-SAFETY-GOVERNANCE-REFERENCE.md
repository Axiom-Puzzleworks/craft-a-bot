# 19 — AI Safety & Governance: State-of-the-Art Reference (Workstream 7)

> The reference catalogue of current (August 2026) AI governance, safety, monitoring, assurance and telemetry practice for LLM-based agents — the menu from which Craft A Bot's roadmap selectively adopts controls, for both the teaching aid and the professional Workshop.
> Prerequisite reading: `08-GOVERNANCE-GUARDRAILS.md` (what V1 ships), `14-BRICK-REFERENCE-DESIGNS.md` §4.6/§5 (where controls become bricks and cards), `18-DAY2-ROADMAP.md` §6 (adoption order).

**How to use this document.** Sections 1–8 catalogue the landscape: for every framework/control — what it is, who publishes or uses it, maturity (**standard** / **widely adopted** / **emerging** / **research**), and a source URL. Section 9 distils it into ~38 candidate controls tagged for the Kids teaching aid, the Pro Workshop, or Both; `18-DAY2-ROADMAP.md` §6 sequences the chosen ones into phases. Treat maturity honestly in product copy: we *prototype the mechanisms these frameworks ask for* — we never claim compliance (`08-…` §6 discipline unchanged).

**Reading of the landscape in one paragraph.** Agent governance crystallised through 2025–26: the EU AI Act's GPAI obligations are in force with agents covered via the Code of Practice's tool-use/autonomy evaluations; NIST is drafting SP 800-53 overlays specifically for single- and multi-agent systems; CAISI's red-teaming found successful hijacking attacks against **every** frontier model tested, making indirect prompt injection the defining agent threat; OWASP's agentic Top 10 (ASI01–ASI10) is the de-facto threat vocabulary; runtime guardrails became SDK primitives; policy-as-code (OPA/Cedar-style) is the emerging pattern for gating tool calls — exactly the Safety brick's position; agent identity (agents as auditable principals with delegation chains) is the newest front; observability is consolidating on OpenTelemetry GenAI conventions; and human-oversight research shows per-action approval collapses under fatigue, pushing the field toward risk-tiered, graduated autonomy. Craft A Bot's architecture — a policy decision point between brain and effectors, a complete typed trace, a deterministic replayable world — is squarely on the consensus pattern; most catalogue entries below are additive bricks, cards or trace features rather than redesigns.

---

## 1. GOVERNANCE FRAMEWORKS & STANDARDS

### 1.1 NIST AI Risk Management Framework (AI RMF 1.0) + Generative AI Profile (NIST AI 600-1)
- **What:** Voluntary risk framework organised around four functions (Govern, Map, Measure, Manage). The Generative AI Profile (AI 600-1, July 2024) adds 12 GAI-specific risks (confabulation, information security, human-AI configuration, etc.) and ~200 suggested actions. It is the de-facto vocabulary for US AI governance programmes and is crosswalked to other regimes (e.g. the NIST↔IMDA AI Verify crosswalk, May 2025).
- **Who:** NIST; used across US industry and government.
- **Maturity:** Widely adopted (voluntary standard).
- **Sources:** https://www.nist.gov/itl/ai-risk-management-framework ; profile PDF: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf ; crosswalk: https://airc.nist.gov/documents/1/20250527-Crosswalk_NIST_600-1_IMDA_AI_Verify.pdf

### 1.2 NIST COSAiS — SP 800-53 Control Overlays for Securing AI Systems (incl. AI-agent overlays)
- **What:** Project to adapt the SP 800-53 security-control catalogue to AI. The August 2025 concept paper defines five overlays: (1) generative AI / LLM assistants, (2) predictive AI, (3) **single-agent AI systems**, (4) **multi-agent AI systems**, (5) controls for AI developers. A discussion draft for the predictive-AI overlay landed January 2026; agent overlays are in the pipeline. This is the clearest signal that "agent" is becoming a first-class object in formal control catalogues.
- **Who:** NIST (with a public Slack community).
- **Maturity:** Emerging (drafts in progress).
- **Sources:** https://csrc.nist.gov/projects/cosais ; https://www.nist.gov/news-events/news/2025/08/nist-releases-control-overlays-securing-ai-systems-concept-paper

### 1.3 US CAISI — AI Agent Standards Initiative & agent-hijacking evaluations
- **What:** NIST's Center for AI Standards and Innovation (successor to the US AI Safety Institute) launched an AI Agent Standards Initiative (Feb 2026). Its red-teaming across 13 frontier models ran 250,000+ attack attempts and found **at least one successful agent-hijacking (indirect prompt injection) attack against every model tested**, with novel strategies reaching 81% task-hijack success. An NCCoE concept paper (Feb 2026) proposes treating agents as *discrete, identifiable principals* in enterprise IAM: per-agent credentials, scope-limited authorisation, agent-level audit logs.
- **Who:** NIST/CAISI; collaboration agreements with OpenAI, Anthropic, Microsoft.
- **Maturity:** Emerging (government guidance in development).
- **Sources:** https://www.nist.gov/caisi ; CSA analysis: https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_nist-caisi-ai-agent-security-agenda-2026_20260414-csa-styled.pdf ; https://openai.com/index/us-caisi-uk-aisi-ai-update/

### 1.4 UK AI Security Institute (AISI)
- **What:** Renamed from "AI Safety Institute" in Feb 2025; runs pre-deployment evaluations of frontier models (including agentic/autonomy tasks), publishes the Inspect eval framework (§6.1), pioneers **safety cases** methodology (§6.6), and studies whether models could sabotage AI-safety research. Publishes a Frontier AI Trends Report.
- **Who:** UK Government (DSIT).
- **Maturity:** Widely adopted (its tooling and evals are referenced across the industry).
- **Sources:** https://www.aisi.gov.uk/research ; https://www.aisi.gov.uk/blog/evaluating-whether-ai-models-would-sabotage-ai-safety-research ; https://www.aisi.gov.uk/frontier-ai-trends-report

### 1.5 EU AI Act — GPAI obligations, Code of Practice, and agents
- **What:** The AI Act entered into force Aug 2024. Timeline now live: prohibitions + AI-literacy duties since 2 Feb 2025; **GPAI-model obligations in force since 2 Aug 2025** (transparency, copyright, and for systemic-risk models: risk assessment/mitigation, adversarial testing, incident reporting, cybersecurity); Commission enforcement powers begin 2 Aug 2026; high-risk system obligations phase in 2026-2027 (with a 2026 "digital omnibus" proposing targeted timeline relief). The **GPAI Code of Practice** (July 2025) has three chapters — Transparency (Model Documentation Form), Copyright, and Safety & Security — the latter requiring safety frameworks, evals covering *tool use and autonomous capabilities*, Model Reports and serious-incident reporting. Agents are regulated indirectly: as GPAI-based systems, via the systemic-risk chapter, and via high-risk classification rules (Art. 6, draft Commission guidelines 2026) plus Art. 14 human-oversight duties.
- **Who:** European Commission / AI Office; signed onto by major labs.
- **Maturity:** Standard (binding law).
- **Sources:** https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai ; https://artificialintelligenceact.eu/code-of-practice-overview/ ; https://www.lw.com/en/insights/eu-ai-act-gpai-model-obligations-in-force-and-final-gpai-code-of-practice-in-place ; https://www.insideglobaltech.com/2026/05/28/eu-ai-act-update-timeline-relief-targeted-simplification-and-new-prohibitions/ ; https://artificialintelligenceact.eu/article/6/

### 1.6 ISO/IEC 42001:2023 (AI management systems) & ISO/IEC 23894:2023 (AI risk management)
- **What:** ISO 42001 is the certifiable AI Management System standard (the "ISO 27001 of AI") — policies, roles, impact assessments, lifecycle controls, continual improvement. Microsoft, AWS, Anthropic and many others hold or pursue certification; it is becoming the audit vehicle for demonstrating EU AI Act readiness. ISO 23894 gives AI-specific risk-management guidance aligned to ISO 31000.
- **Who:** ISO/IEC JTC 1/SC 42; certified via accredited bodies.
- **Maturity:** Standard.
- **Sources:** https://www.iso.org/standard/42001 ; https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-42001 ; ISO 23894: https://www.iso.org/standard/77304.html

### 1.7 OECD & G7 Hiroshima Process (HAIP) transparency reporting
- **What:** OECD AI Principles underpin most national frameworks. In Feb 2025 the OECD launched the **HAIP Reporting Framework** — a standardised transparency questionnaire operationalising the G7 Hiroshima Code of Conduct; frontier developers (Microsoft, OpenAI, Anthropic, Google, etc.) file public reports on risk management, security, and provenance. First submissions published April 2025.
- **Who:** OECD / G7; voluntary but publicly tracked.
- **Maturity:** Widely adopted (voluntary).
- **Sources:** https://transparency.oecd.ai/ ; https://www.oecd.org/en/about/news/press-releases/2025/02/oecd-launches-global-framework-to-monitor-application-of-g7-hiroshima-ai-code-of-conduct.html

### 1.8 Frontier-lab safety frameworks (agent-relevant commitments)
- **Anthropic Responsible Scaling Policy v3.0** (effective 24 Feb 2026): capability thresholds now include **High-Stakes Sabotage** — AI systems with "moderate capacity for autonomous, goal-directed operation" and infrastructure access — plus Automated R&D thresholds; introduces Risk Reports and public Frontier Safety Roadmaps; ASL-3 safeguards (classifier guards, access controls, red-teaming) are live. Agent-specific requirements include behavioural monitoring, evidence against deceptive propensities, and internal compartmentalisation/code review. **Maturity: widely adopted (company policy, industry-shaping).** https://www.anthropic.com/responsible-scaling-policy ; v3.0 PDF: https://www-cdn.anthropic.com/e670587677525f28df69b59e5fb4c22cc5461a17.pdf
- **OpenAI Preparedness Framework v2** (April 2025): tracked risk categories (biological/chemical, cybersecurity, AI self-improvement) with "long-range autonomy" and "autonomous replication" among research categories; capability reports and safeguard reports gate deployment. **Maturity: widely adopted (company policy).** https://openai.com/index/updating-our-preparedness-framework/ ; analysis: https://thezvi.substack.com/p/on-openais-preparedness-framework
- **Google DeepMind Frontier Safety Framework v3** (Sept 2025): added a **harmful manipulation** critical capability level and an exploratory approach to **misalignment risks, including models resisting shutdown or modification** — directly an agent-oversight concern. **Maturity: widely adopted (company policy).** https://deepmind.google/blog/strengthening-our-frontier-safety-framework/ ; https://www.axios.com/2025/09/22/google-ai-risk-models-resist-shutdown
- Comparative overview of all three: https://futureagi.com/blog/frontier-model-safety-analysis-2026/

### 1.9 CISA multi-agency guidance on agentic AI (2026)
- **What:** CISA with US and international partners released guidance on secure adoption of agentic AI for critical infrastructure (June 2026), plus a "Careful Adoption of Agentic AI Services" resource — covering least privilege for agents, monitoring, and kill-switch readiness.
- **Who:** CISA + NSA + international cyber agencies. The NSA also published a Cybersecurity Information Sheet on MCP security.
- **Maturity:** Emerging (official guidance).
- **Sources:** https://www.cisa.gov/news-events/news/cisa-us-and-international-partners-release-guide-secure-adoption-agentic-ai ; https://www.cisa.gov/resources-tools/resources/careful-adoption-agentic-ai-services ; NSA MCP CSI: https://www.nsa.gov/Portals/75/documents/Cybersecurity/CSI_MCP_SECURITY.pdf

---

## 2. AGENT-SPECIFIC THREAT & CONTROL TAXONOMIES

### 2.1 OWASP Top 10 for LLM Applications (2025)
- **What:** Canonical LLM-app risk list — LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM06 Excessive Agency, LLM08 Vector & Embedding Weaknesses, LLM10 Unbounded Consumption, etc. "Excessive Agency" is the bridge into agent risk.
- **Who:** OWASP GenAI Security Project; industry-wide reference.
- **Maturity:** Widely adopted.
- **Source:** https://genai.owasp.org/llm-top-10/

### 2.2 OWASP Agentic AI — Threats and Mitigations (Feb 2025)
- **What:** The Agentic Security Initiative's threat-model reference: ~15 threats (T1-T15) including **memory poisoning, tool misuse, privilege compromise, resource overload, cascading hallucination, intent breaking & goal manipulation, misaligned/deceptive behaviours, repudiation & untraceability, identity spoofing, overwhelming the human in the loop, unexpected RCE, agent communication poisoning, rogue agents, human manipulation** — each with mitigations. The most complete agent threat taxonomy in practical use.
- **Who:** OWASP GenAI Security Project (100+ contributors).
- **Maturity:** Widely adopted.
- **Sources:** https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/ ; practitioner summary: https://www.humansecurity.com/learn/blog/agentic-ai-security-owasp-threats/

### 2.3 OWASP Top 10 for Agentic Applications (Dec 2025, "2026 edition")
- **What:** Ranked top-10 risks for agentic apps: **ASI01 Agent Goal Hijack; ASI02 Tool Misuse & Exploitation; ASI03 Identity & Privilege Abuse; ASI04 Agentic Supply Chain Vulnerabilities; ASI05 Unexpected Code Execution (RCE); ASI06 Memory & Context Poisoning; ASI07 Insecure Inter-Agent Communication; ASI08 Cascading Failures; ASI09 Human-Agent Trust Exploitation; ASI10 Rogue Agents.** Reviewed by an expert board including NIST, the European Commission and the Alan Turing Institute. Companion releases: *A Practical Guide to Securing Agentic Applications*, *State of Agentic Security and Governance 1.0*, a quarterly *Agentic Security Solutions Landscape*, and a hands-on **FinBot CTF** application.
- **Who:** OWASP GenAI Security Project.
- **Maturity:** Widely adopted (published standard-of-practice).
- **Sources:** https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ ; https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/ ; itemised list: https://www.humansecurity.com/learn/blog/owasp-top-10-agentic-applications/

### 2.4 MITRE ATLAS (agentic updates 2025-26)
- **What:** The adversarial-ML counterpart to ATT&CK — tactics/techniques/case studies for attacks on AI systems, expanded through 2025-26 with agent- and MCP-relevant techniques (prompt injection, tool manipulation, agent-context attacks) and mappings used by detection vendors for agent attack detection.
- **Who:** MITRE; used by SOC teams and AI red teams.
- **Maturity:** Widely adopted.
- **Sources:** https://atlas.mitre.org ; agent mapping practice: https://www.armosec.io/blog/mitre-atlas-for-ai-agent-attack-detection/ ; https://zenity.io/blog/current-events/mitre-atlas-ai-security

### 2.5 Prompt-injection taxonomies and the "lethal trifecta"
- **What:** Standard split: *direct* injection (user input) vs *indirect* injection (instructions hidden in web pages, files, tool results — the dominant agent attack per CAISI, §1.3). Simon Willison's **"lethal trifecta"** frames the highest-risk configuration: an agent that simultaneously has (a) access to private data, (b) exposure to untrusted content, and (c) an exfiltration channel — remove one leg and the catastrophic case collapses. The *Design Patterns for Securing LLM Agents against Prompt Injections* paper (June 2025) catalogues architectural patterns (action-selector, plan-then-execute, dual LLM, context-minimisation…).
- **Who:** Willison; ETH Zurich/Google/Microsoft authors; operationalised by vendors (e.g. Sophos "blast radius reduction").
- **Maturity:** Widely adopted (conceptual); patterns emerging in products.
- **Sources:** https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/ ; https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents ; https://www.sophos.com/en-us/blog/inside-the-lethal-trifecta-blast-radius-reduction-in-ai-agent-deployments

### 2.6 Memory-poisoning research (2025-26)
- **What:** A fast-moving research line: persistent compromise of agents via poisoned experience/retrieval memory. *MemoryGraft* shows poisoned "experience" retrieval producing durable compromise; systematic studies map untrusted-input→trusted-memory pathways and defences (provenance tags on memories, memory quarantine, write-gating).
- **Who:** Academic groups; practitioner writeups (WorkOS, Christian Schneider).
- **Maturity:** Research (attacks demonstrated; defences immature).
- **Sources:** https://arxiv.org/abs/2512.16962 ; https://arxiv.org/html/2606.04329v1 ; https://workos.com/blog/ai-agent-memory-poisoning

### 2.7 Multi-agent risk taxonomy
- **What:** *Multi-Agent Risks from Advanced AI* (Cooperative AI Foundation, Feb 2025) — the reference taxonomy: failure modes of **miscoordination, conflict, and collusion**, driven by information asymmetries, destabilising dynamics, network-effect cascades, and emergent agent behaviour. Complemented by *Open Challenges in Multi-Agent Security* (2025): secure interaction protocols, collusion detection, containment.
- **Who:** Cooperative AI Foundation + ~40 academic/industry co-authors.
- **Maturity:** Research.
- **Sources:** https://arxiv.org/abs/2502.14143 ; https://www.cooperativeai.com/post/new-report-multi-agent-risks-from-advanced-ai ; https://arxiv.org/html/2505.02077v2

### 2.8 Cloud Security Alliance agentic guidance (MAESTRO, red-team guide, profiles)
- **What:** **MAESTRO** (Feb 2025) — a 7-layer agentic threat-modelling framework (Mission, Assets, Entrypoints, Security controls, Threats, Risks, Operations) built for agent architectures where STRIDE falls short. The CSA **Agentic AI Red Teaming Guide** (June 2025, with OWASP ASI) is a testing playbook across 12 threat categories. CSA also maintains an **Agentic NIST AI RMF profile**, an **Agentic MCP Security Best Practices** doc, and an autonomy-levels blog series.
- **Who:** Cloud Security Alliance.
- **Maturity:** Emerging (guides in active enterprise use).
- **Sources:** https://cloudsecurityalliance.org/blog/2025/02/06/agentic-ai-threat-modeling-framework-maestro ; red-team guide PDF: https://storage.ghost.io/c/6d/ce/6dcec271-11ac-486f-8f5f-6797c08b0bf3/content/files/2025/06/agenticairedteaming.pdf ; https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/ ; https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/

---

## 3. RUNTIME GUARDRAILS & POLICY ENFORCEMENT

### 3.1 Guardrail frameworks
- **NVIDIA NeMo Guardrails** — open-source toolkit for programmable "rails" (input, output, dialog, retrieval, execution rails) written in Colang; integrates jailbreak detection and third-party safety models. **Widely adopted.** https://github.com/NVIDIA/NeMo-Guardrails ; production guide: https://www.spheron.network/blog/nemo-guardrails-production-deployment-llm-gpu-cloud/
- **Guardrails AI** — open-source validator framework + hub (structured-output validation, PII detection, toxicity, hallucination checks) wrapping LLM I/O. **Widely adopted.** https://github.com/guardrails-ai/guardrails ; comparison: https://generalanalysis.com/guides/best-ai-guardrails
- **Meta Llama Guard 4 & Prompt Guard 2** — open-weight safety classifiers: Llama Guard 4 (12B, multimodal) classifies prompts/responses against a hazard taxonomy (MLCommons-aligned); Prompt Guard 2 (86M/22M) detects jailbreaks and prompt injection cheaply enough to run on every tool input. **Widely adopted.** https://developer.meta.com/ai/docs/model-cards-and-prompt-formats/llama-guard-4/ ; https://console.groq.com/docs/model/llama-prompt-guard-2-86m
- **OpenAI moderation & gpt-oss-safeguard** — free omni-moderation API; plus gpt-oss-safeguard (Oct 2025), an open-weight *policy-conditioned* safety reasoner: you supply your own written policy at inference time and it classifies against it — a notable pattern for "bring-your-own-rulebook" safety bricks. **Widely adopted / emerging respectively.** https://platform.openai.com/docs/guides/moderation ; https://www.adwaitx.com/gpt-oss-safeguard-openai-content-moderation-model/
- **Anthropic Constitutional Classifiers** — classifier guards trained from a natural-language constitution; reduced universal-jailbreak success from 86% to 4.4% in testing, with next-gen versions (2026) cutting compute overhead; deployed as part of ASL-3 safeguards. **Widely adopted (deployed in production); method emerging elsewhere.** https://www.anthropic.com/research/constitutional-classifiers ; https://www.anthropic.com/research/next-generation-constitutional-classifiers ; paper: https://arxiv.org/pdf/2501.18837
- **OpenAI Agents SDK guardrails + AgentKit** — first-class `input_guardrail`/`output_guardrail` primitives that run in parallel to the agent and raise **tripwires** halting execution; AgentKit (Oct 2025) ships a visual Agent Builder with attachable guardrails. Notable as *guardrails as a built-in SDK concept*. **Widely adopted.** https://openai.github.io/openai-agents-python/guardrails/ ; https://openai.com/index/introducing-agentkit/

### 3.2 Policy-as-code for agent actions
- **What:** Externalising "may this agent perform this tool call?" into a policy engine, evaluated per action: **Open Policy Agent (OPA/Rego)** and **AWS Cedar** (used by Amazon Bedrock AgentCore to gate gateway tool calls) are the leading engines; Microsoft's **Agent Governance Toolkit** documents OPA/Rego/Cedar patterns for agents; Vercel's AI SDK ships policy-based tool approvals. The decision point sits between the LLM's proposed action and the tool runtime — exactly Craft-a-Bot's Safety-brick position.
- **Who:** CNCF (OPA), AWS (Cedar), Microsoft, Vercel.
- **Maturity:** Emerging (engines are standard; agent application is new).
- **Sources:** https://www.openpolicyagent.org/ ; https://microsoft.github.io/agent-governance-toolkit/tutorials/08-opa-rego-cedar-policies/ ; https://ai-sdk.dev/docs/agents/policy-tool-approvals ; https://codilime.com/blog/why-use-open-policy-agent-for-your-ai-agents/

### 3.3 Research-grade runtime enforcement: AgentSpec & Progent
- **What:** **AgentSpec** (ICSE 2026): a DSL for runtime enforcement rules over agent execution (trigger → predicate → enforcement action such as block/require-approval/self-examine), intercepting the agent loop. **Progent** (2025): programmable *privilege control* — a least-privilege policy language constraining which tool calls an agent may make, with LLM-assisted policy generation. Both are direct blueprints for a programmable Safety brick.
- **Who:** Academic (NUS/SMU; UC Berkeley).
- **Maturity:** Research.
- **Sources:** https://arxiv.org/abs/2503.18666 ; https://arxiv.org/abs/2504.11703

### 3.4 Sandboxing & isolation for tool/code execution
- **What:** Running agent-generated code and tools inside disposable isolation: **Firecracker microVMs** (E2B, Daytona), **gVisor** userspace kernels, containers with seccomp/AppArmor, and OS-level sandboxing in products (Claude Code's sandboxed bash + network restrictions). Design rule: the agent gets a scoped filesystem, no ambient credentials, and an egress allow-list.
- **Who:** E2B, Daytona, Modal, Anthropic, OpenAI (Codex sandboxes).
- **Maturity:** Widely adopted.
- **Sources:** https://northflank.com/blog/how-to-sandbox-ai-agents ; https://e2b.dev ; https://northflank.com/blog/best-code-execution-sandbox-for-ai-agents

### 3.5 Allow/deny lists, rate limits, budget caps, loop detection
- **What:** Production agents ship with: tool allow-lists and command deny-lists (Claude Code permissions model), per-run **token/cost budgets** with hard stops, max-iteration/max-depth caps, and **loop detection** (repeated identical tool calls, no-progress heuristics, retry-storm detection). Runaway-cost incidents have made budget enforcement a first-class guardrail.
- **Who:** Anthropic (Claude Code), LangGraph (recursion limits), observability vendors.
- **Maturity:** Widely adopted (patterns), emerging (standardisation).
- **Sources:** https://deepwiki.com/anthropics/claude-code/3.2-tool-system-and-permissions ; https://relayplane.com/blog/agent-runaway-costs-2026 ; https://web-alert.io/blog/ai-agent-monitoring-tool-calls-loops-cost-guide

### 3.6 Human-in-the-loop approval gates
- **What:** Interrupt-and-approve patterns: the agent pauses before consequential actions (file writes, payments, sends), presenting the exact action for approval. Implemented as LangGraph interrupts, OpenAI AgentKit approval nodes, Claude Code permission prompts, and Vercel policy-triggered approvals. The OWASP threat "Overwhelming the Human in the Loop" and confirmation-fatigue research (§8.3) define its failure mode.
- **Who:** All major agent frameworks.
- **Maturity:** Widely adopted.
- **Sources:** https://ai-sdk.dev/docs/agents/policy-tool-approvals ; https://openai.github.io/openai-agents-python/ ; https://changkun.de/blog/ideas/human-in-the-loop-agents/

### 3.7 Kill-switch, interruptibility & safe-mode degradation
- **What:** The ability to halt an agent mid-run (cancel tokens, revoke credentials, tear down sandbox) and to degrade to a safe mode (read-only tools, mock providers) on guardrail trip. Elevated from engineering hygiene to governance concern by DeepMind's FSF v3 explicitly tracking **shutdown-resistance** as a risk, and CISA's agentic-AI adoption guidance requiring disablement paths.
- **Who:** DeepMind (risk framing); CISA (guidance); all serious agent platforms (mechanism).
- **Maturity:** Widely adopted (mechanism); emerging (formalisation).
- **Sources:** https://deepmind.google/blog/strengthening-our-frontier-safety-framework/ ; https://www.cisa.gov/resources-tools/resources/careful-adoption-agentic-ai-services ; https://www.thskyshield.com/blog/why-your-ai-agent-needs-a-kill-switch

### 3.8 Output filtering & PII redaction
- **What:** Post-generation filtering of unsafe content and detection/redaction of PII before it reaches users, logs, or traces. **Microsoft Presidio** is the standard open-source PII engine; guardrail frameworks (§3.1) ship PII validators; trace pipelines increasingly redact at ingestion.
- **Who:** Microsoft, Guardrails AI, observability vendors.
- **Maturity:** Widely adopted.
- **Sources:** https://github.com/microsoft/presidio ; https://github.com/guardrails-ai/guardrails

---

## 4. AGENT IDENTITY, AUTHZ & PROVENANCE

### 4.1 Microsoft Entra Agent ID
- **What:** Extends enterprise identity (Entra/Azure AD) to agents: each agent gets its own directory identity, OAuth-based auth flows, conditional access, and lifecycle governance — agents become first-class principals you can audit and revoke.
- **Who:** Microsoft (GA'd through 2025-26); mirrored by Auth0/Okta agentic-identity offerings.
- **Maturity:** Emerging (shipping products, standards still settling).
- **Sources:** https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id ; https://learn.microsoft.com/en-us/entra/agent-id/agent-oauth-protocols

### 4.2 Okta Cross App Access (XAA) & OAuth extensions for agents
- **What:** XAA (2025, ecosystem expanded June 2026) extends OAuth so an enterprise IdP mediates **agent-to-app and app-to-app access**, replacing per-app consent screens with centrally administered, auditable grants — designed explicitly for MCP/A2A-connected agents. Related IETF work: OAuth token exchange (RFC 8693) for delegation chains, plus emerging identity-assertion/agent-delegation drafts.
- **Who:** Okta (protocol donated for standardisation), partners across SaaS.
- **Maturity:** Emerging.
- **Sources:** https://www.okta.com/newsroom/press-releases/okta-introduces-cross-app-access-to-help-secure-ai-agents-in-the/ ; https://www.okta.com/identity-101/cross-app-access-securing-ai-agent-and-app-to-app-connections/ ; RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693

### 4.3 Workload identity (SPIFFE/SPIRE) applied to agents
- **What:** Treating each agent instance as a workload with a short-lived cryptographic identity (SVID) instead of static API keys — enabling mTLS between agents/tools and per-agent authorisation. Advocated by CSA and identity vendors as the substrate under agent IAM.
- **Who:** CNCF SPIFFE project; enterprise identity teams.
- **Maturity:** Emerging (standard tech, novel application).
- **Sources:** https://spiffe.io ; CSA note: https://labs.cloudsecurityalliance.org/research/csa-research-note-okta-ai-agent-iam-framework-enterprise-gap/

### 4.4 Agents as auditable principals: delegation chains & action attestation
- **What:** NIST/NCCoE concept paper (Feb 2026): per-agent credentials, scope-limited authorisation, **agent-level audit logging**, and preserved **delegation chains** (human → orchestrator → sub-agent → tool) so every action attributes to both the acting agent and the responsible human. Okta adds verifiable credentials for agent attestation.
- **Who:** NIST/CAISI, Okta, Microsoft.
- **Maturity:** Emerging.
- **Sources:** CAISI note (§1.3 PDF): https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_nist-caisi-ai-agent-security-agenda-2026_20260414-csa-styled.pdf ; https://siliconangle.com/2025/09/25/okta-expands-identity-fabric-ai-agent-lifecycle-security-cross-app-access-verifiable-credentials/

### 4.5 MCP security best practices & attack classes
- **What:** The MCP spec's official security document catalogues agent-tool attack classes with normative mitigations: **confused deputy** (proxy consent-cookie bypass → per-client consent required), **token passthrough** (forbidden; audience validation required), **SSRF via OAuth metadata discovery** (block private IP ranges, egress proxies), **state-handle hijacking** (bind handles to authenticated user), **local MCP server compromise** (show exact command, sandbox spawned servers), **OAuth URL validation** (reject `javascript:`/`file:` schemes), **mix-up attacks**, and **scope minimisation** (progressive least-privilege scopes). Third-party threat work adds tool poisoning/rug-pull attacks (malicious tool descriptions altering agent behaviour). The NSA's CSI on MCP endorses similar controls.
- **Who:** MCP steering (Anthropic + community); NSA; Microsoft.
- **Maturity:** Widely adopted (spec-level guidance for the dominant tool protocol).
- **Sources:** https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices ; https://www.nsa.gov/Portals/75/documents/Cybersecurity/CSI_MCP_SECURITY.pdf ; tool-poisoning research: https://www.mdpi.com/2624-800X/6/3/84

### 4.6 Content provenance (C2PA / Content Credentials)
- **What:** Cryptographically signed manifests recording content origin and edit history ("Content Credentials"); adopted by camera makers, Adobe, OpenAI (DALL·E/Sora outputs), Google. For agents, relevant to marking agent-generated artefacts and verifying provenance of ingested content.
- **Who:** C2PA coalition (Adobe, Microsoft, Google, OpenAI, BBC…).
- **Maturity:** Widely adopted (spec); uneven ecosystem enforcement.
- **Sources:** https://c2pa.org ; https://en.wikipedia.org/wiki/Content_Credentials

---

## 5. OBSERVABILITY & TELEMETRY

### 5.1 OpenTelemetry GenAI semantic conventions
- **What:** The vendor-neutral schema for LLM/agent telemetry. As of mid-2026 it defines **agent spans** (`invoke_agent` — client and internal variants, `chat`, `execute_tool`), structured `gen_ai.input.messages`/`gen_ai.output.messages`/`gen_ai.system_instructions` attributes, token accounting (`gen_ai.usage.input_tokens`/`output_tokens`), and a **`gen_ai.evaluation.result` event** carrying scores/verdicts correlated to the traced operation (a natural home for guardrail verdicts). Status: still **Development/experimental** — moved to a dedicated repo (`open-telemetry/semantic-conventions-genai`), no stable release yet; consumers must pin versions and handle attribute renames (`gen_ai.system`→`gen_ai.provider.name`).
- **Who:** CNCF OpenTelemetry GenAI SIG; implemented by Langfuse, Arize, Datadog, New Relic, Azure, Google.
- **Maturity:** Emerging (on trajectory to standard).
- **Sources:** https://opentelemetry.io/docs/specs/semconv/gen-ai/ ; status analysis (July 2026): https://john-hodge.com/blog/opentelemetry-genai-semantic-conventions/

### 5.2 OpenInference
- **What:** Arize's open specification for LLM-app tracing (span kinds: LLM, TOOL, AGENT, CHAIN, RETRIEVER, GUARDRAIL, EVALUATOR…), complementary to OTel and widely used via Phoenix instrumentation. Notably it already has a **GUARDRAIL span kind** — traceable guardrail verdicts as first-class telemetry.
- **Who:** Arize AI + community.
- **Maturity:** Widely adopted (in the Phoenix ecosystem).
- **Sources:** https://github.com/Arize-ai/openinference ; spec: https://arize-ai.github.io/openinference/spec/semantic_conventions.html

### 5.3 Agent observability platforms
- **What:** Production platforms capturing agent traces, evals and costs: **LangSmith** (LangChain; deep LangGraph integration), **Langfuse** (open-source, self-hostable, OTel-based), **Arize Phoenix** (open-source, OpenInference), **W&B Weave**, **AgentOps**, **Braintrust** (eval-centric), **Helicone** (proxy-based), plus APM entrants **Datadog LLM/Agent Observability** (agent-graph visualisation, tool-call errors, loop/latency anomalies) and **New Relic AI monitoring**. Common feature set: hierarchical traces (session → run → step → tool call), token/cost rollups, eval scores attached to spans, prod/dev diffing.
- **Who:** As listed; enterprise adoption broad.
- **Maturity:** Widely adopted.
- **Sources:** https://arize.com/blog/best-ai-observability-tools-for-autonomous-agents-in-2026/ ; https://www.datadoghq.com/products/ai/agent-observability/ ; https://langfuse.com ; https://smith.langchain.com
- **What a good agent trace contains** (consensus across the above + OTel): one span per loop step; child spans per LLM call and per tool call with arguments/results (redacted); guardrail/eval verdict events; token+cost accounting per span; delegation metadata (which agent, on whose behalf); terminal status (success/halt/tripwire/budget-exhausted). Craft-a-Bot's EventBus trace maps almost 1:1 onto this.

### 5.4 Replay & time-travel debugging
- **What:** Checkpointing every step of agent state so runs can be rewound, forked, and replayed with modified state — **LangGraph checkpointers/time-travel** are the reference implementation; observability platforms offer trace replay. Determinism (which Craft-a-Bot mandates) is the property that makes replay exact.
- **Who:** LangChain/LangGraph; AWS (durable agents on DynamoDB).
- **Maturity:** Widely adopted (in LangGraph ecosystem); emerging elsewhere.
- **Sources:** https://langchain-ai.github.io/langgraph/concepts/time-travel/ ; https://dev.to/sreeni5018/debugging-non-deterministic-llm-agents-implementing-checkpoint-based-state-replay-with-langgraph-5171 ; https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb/

### 5.5 Drift, anomaly & loop detection on agent behaviour
- **What:** Monitoring distributions of agent behaviour over time — tool-call mixes, failure rates, latency, cost-per-task, plan lengths — with alerts on drift or anomalies; Datadog's agentic monitoring targets misbehaving agents, infinite loops and tool-failure cascades. Behavioural-drift detection after memory writes is the practical defence for ASI06 memory poisoning.
- **Who:** Datadog, Arize, New Relic; research on agent behavioural monitoring (SHADE-Arena monitor agents, §6.5).
- **Maturity:** Emerging.
- **Sources:** https://www.datadoghq.com/about/latest-news/press-releases/datadog-expands-llm-observability-with-new-capabilities-to-monitor-agentic-ai-accelerate-development-and-improve-model-performance/ ; https://web-alert.io/blog/ai-agent-monitoring-tool-calls-loops-cost-guide

---

## 6. EVALUATION & ASSURANCE

### 6.1 Eval harnesses
- **Inspect (UK AISI)** — open-source Python framework for LLM/agent evals: solvers, scorers, sandboxed **agentic tasks**, tool support; `inspect_evals` hosts a large community catalogue (GAIA, OSWorld, SWE-bench, cyber ranges). Becoming the lingua franca of government-grade evals. **Widely adopted.** https://inspect.aisi.org.uk ; https://github.com/UKGovernmentBEIS/inspect_evals
- **OpenAI Evals** — registry + framework for model/completion evals. **Widely adopted.** https://github.com/openai/evals
- **HELM (Stanford CRFM)** — holistic multi-metric benchmarking (incl. safety scenarios). **Widely adopted.** https://crfm.stanford.edu/helm/
- **LM Evaluation Harness (EleutherAI)** — the standard open benchmark runner. **Widely adopted.** https://github.com/EleutherAI/lm-evaluation-harness

### 6.2 Agent benchmarks
- **GAIA** (general assistant tasks; tool use + web) — https://arxiv.org/abs/2311.12983 ; **GAIA2 + Meta ARE** (2025): dynamic, asynchronous simulated environments scoring search/execution/ambiguity/temporal reasoning — notable for evaluating agents in *simulated worlds*, exactly Craft-a-Bot's Playroom concept. https://arxiv.org/html/2509.17158v1 ; https://openreview.net/forum?id=9gw03JpKK4
- **AgentBench** (8-environment agent suite) — https://arxiv.org/abs/2308.03688
- **OSWorld** (real desktop computer-use tasks) — https://os-world.github.io
- **WebArena** (realistic web tasks) — https://webarena.dev
- **SWE-bench** (+Verified) (real GitHub issue fixing; the industry's coding-agent yardstick) — https://www.swebench.com
- **tau-bench / tau2-bench** (Sierra): tool-agent-**user** interaction with policy compliance in airline/retail/telecom domains — the benchmark closest to "does the agent follow the rules while serving a human", i.e. governance-relevant. https://github.com/sierra-research/tau2-bench
- **Maturity:** all widely adopted in research/industry practice.

### 6.3 METR autonomy & dangerous-capability evaluations
- **What:** METR measures **time horizon** — the length of human task an agent can complete at 50% reliability (doubling roughly every 4-7 months; Time Horizon 1.1 methodology, Jan 2026), runs pre-deployment evaluations for labs (e.g. GPT-5.6 evaluation, June 2026), and publishes rolling Frontier Risk Reports covering autonomous-replication and AI-R&D capabilities.
- **Who:** METR (independent); used by OpenAI, Anthropic, governments.
- **Maturity:** Widely adopted (the reference for autonomy measurement).
- **Sources:** https://metr.org/blog/2026-1-29-time-horizon-1-1/ ; https://metr.org/blog/2026-05-19-frontier-risk-report/ ; https://metr.org/risk-assessment/

### 6.4 Red-teaming: manual + automated (incl. Petri)
- **What:** Practice spans expert manual red-teams, bug bounties (Anthropic's jailbreak bounty), CSA's agentic red-team playbook (12 categories: authorisation hijacking, checker-out-of-loop, goal manipulation, hallucination exploitation…), CAISI's large-scale hijacking campaigns, and **automated auditing**: Anthropic's **Petri** (Oct 2025, open source) uses auditor agents to probe target models across diverse scenarios and score behaviours (deception, sycophancy, power-seeking); now runs on Inspect. Microsoft's **PyRIT** automates generative-AI red-team attack generation.
- **Who:** Anthropic, Microsoft, CSA, CAISI.
- **Maturity:** Widely adopted (manual), emerging (automated auditing).
- **Sources:** https://www.anthropic.com/research/petri-open-source-auditing ; https://meridianlabs-ai.github.io/inspect_petri/ ; https://github.com/Azure/PyRIT ; CSA guide PDF (§2.8)

### 6.5 Sabotage & misalignment evals for agents (SHADE-Arena, agentic misalignment)
- **What:** **SHADE-Arena** (Anthropic + collaborators, 2025): paired main-task/hidden-sabotage tasks in tool-using environments, scoring both the saboteur agent and an **LLM monitor** that reads transcripts to detect sabotage — the canonical "monitor agent watching worker agent" evaluation. Anthropic's *agentic misalignment* studies (2025-26) stress-test insider-threat-like behaviour (e.g. blackmail under threat of shutdown) in simulated corporate environments.
- **Who:** Anthropic; replicated by AISI/CAISI programmes.
- **Maturity:** Research (rapidly operationalising).
- **Sources:** https://arxiv.org/abs/2506.15740 ; https://www.anthropic.com/research/agentic-misalignment ; https://alignment.anthropic.com/2026/agentic-misalignment-summer-2026/

### 6.6 Safety cases
- **What:** Structured, evidence-backed arguments that a system is acceptably safe for a given deployment — imported from aviation/nuclear into frontier AI by UK AISI (templates: *inability* arguments, *control* arguments, *trustworthiness* arguments). Anthropic's RSP v3 Risk Reports and the EU Code's Model Reports are safety-case-shaped artefacts.
- **Who:** UK AISI; frontier labs.
- **Maturity:** Emerging.
- **Sources:** https://www.aisi.gov.uk/blog/safety-cases-at-aisi ; https://www.aisi.gov.uk/blog/how-can-safety-cases-be-used-to-help-with-frontier-ai-safety

### 6.7 Transparency artefacts: model/system/agent cards, AI BOM
- **Model cards** (Mitchell et al. 2019) — standard model documentation. https://arxiv.org/abs/1810.03993 — **Standard.**
- **System cards** — deployment-level safety documentation (OpenAI GPT-4 System Card and successors). https://cdn.openai.com/papers/gpt-4-system-card.pdf — **Widely adopted.**
- **Agent Cards** — machine-readable agent capability/identity manifests in the A2A protocol (name, skills, endpoints, auth requirements) — the emerging "nutrition label" for agents. https://a2a-protocol.org — **Emerging.**
- **AI BOM** — CycloneDX ML-BOM and SPDX 3.0 AI/Dataset profiles inventory models, datasets, and dependencies for supply-chain transparency (maps to ASI04 supply-chain risk). https://cyclonedx.org/capabilities/mlbom/ ; https://www.linuxfoundation.org/hubfs/LF%20Research/lfr_spdx_aibom_102524a.pdf — **Emerging.**
- **EU Model Documentation Form** — standardised GPAI documentation under the Code of Practice (§1.5) — **Standard (regulatory).**

### 6.8 Incident reporting
- **What:** **AI Incident Database** (Responsible AI Collaborative) — public, taxonomised incident repository. **OECD AI Incidents & Hazards Monitor (AIM)** — automated global incident tracking; OECD published a **common AI incident reporting framework** (2025) to harmonise definitions, feeding EU AI Act Art. 73 serious-incident duties and the GPAI Code's incident-reporting commitments.
- **Who:** RAIC; OECD; European Commission.
- **Maturity:** Widely adopted (databases); emerging (mandatory reporting).
- **Sources:** https://incidentdatabase.ai ; https://oecd.ai/en/incidents ; https://www.oecd.org/en/publications/towards-a-common-reporting-framework-for-ai-incidents_f326d4ac-en.html

---

## 7. MULTI-AGENT SAFETY & COORDINATION

### 7.1 A2A (Agent2Agent) protocol
- **What:** Open protocol for inter-agent communication between opaque agents: JSON-RPC/HTTP tasks, streaming, and **Agent Cards** for discovery. Donated by Google to the **Linux Foundation** (June 2025); 150+ member orgs and enterprise production use within a year. Security model: enterprise-grade authN/Z aligned with OAuth/OpenID (agents authenticate like ordinary web services; capabilities scoped by card), addressing OWASP ASI07 (insecure inter-agent comms). IBM's ACP (Agent Communication Protocol) merged into the same LF orbit.
- **Who:** Linux Foundation A2A project; Google, Microsoft, AWS, SAP, Salesforce…
- **Maturity:** Emerging (fast-moving toward standard).
- **Sources:** https://github.com/a2aproject/A2A ; https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents ; https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year ; https://en.wikipedia.org/wiki/Agent2Agent

### 7.2 Orchestrator / supervisor patterns
- **What:** A privileged coordinator agent routes work to constrained sub-agents (OpenAI Agents SDK "handoffs"; LangGraph supervisor graphs; Claude Code subagents). Governance value: the orchestrator is a natural chokepoint for policy checks, budget allocation, and trace correlation across the delegation chain.
- **Who:** OpenAI, LangChain, Anthropic, AWS (Bedrock AgentCore).
- **Maturity:** Widely adopted.
- **Sources:** https://openai.github.io/openai-agents-python/ ; https://galileo.ai/blog/google-agent2agent-a2a-protocol-guide

### 7.3 Multi-agent oversight & emergent-behaviour monitoring
- **What:** Research/practice on watching *systems* of agents: collusion detection, cascade containment (ASI08), network-level monitoring of agent-to-agent messages, LLM monitors reading other agents' transcripts (SHADE-Arena), and CAISI/NIST interest in multi-agent control overlays (§1.2). The Cooperative AI report (§2.7) recommends infrastructure for agent identity, communication norms, and "circuit breakers" between agents.
- **Who:** Academic + frontier labs; early vendor features (Datadog agent-graph views).
- **Maturity:** Research → emerging.
- **Sources:** https://arxiv.org/abs/2502.14143 ; https://arxiv.org/html/2505.02077v2 ; https://arxiv.org/abs/2506.15740

---

## 8. HUMAN OVERSIGHT & UX OF SAFETY

### 8.1 Levels-of-autonomy schemes
- **What:** *Levels of Autonomy for AI Agents* (Feng, McDonald & Zhang, 2025; Knight Institute) defines five levels by **user role**: L1 Operator → L2 Collaborator → L3 Consultant → L4 Approver → L5 Observer, and proposes "autonomy certificates" as a governance instrument. CSA publishes a practitioner autonomy-levels scheme; the MIT AI Agent Index catalogues deployed agents' autonomy attributes.
- **Who:** Academia (UW), Knight First Amendment Institute, CSA, MIT.
- **Maturity:** Emerging.
- **Sources:** https://arxiv.org/abs/2506.12469 ; https://knightcolumbia.org/content/levels-of-autonomy-for-ai-agents-1 ; https://cloudsecurityalliance.org/blog/2026/01/28/levels-of-autonomy ; https://aiagentindex.mit.edu/

### 8.2 Empirical autonomy measurement (Anthropic, Feb 2026)
- **What:** Anthropic measured *autonomy in practice* across Claude Code and API traffic: 99.9th-percentile agent turn length doubled (~25→45+ min) in three months; new users approve ~20% of actions automatically vs ~40% for experienced users — who simultaneously interrupt *more* (a shift from step-approval to supervision-by-monitoring); agents ask clarifying questions more often on complex tasks; ~80% of observed actions ran with some safeguard.
- **Who:** Anthropic.
- **Maturity:** Emerging (first-of-kind empirical study).
- **Source:** https://www.anthropic.com/research/measuring-agent-autonomy

### 8.3 Approval fatigue / confirmation fatigue
- **What:** Research and practitioner analysis showing per-action confirmation collapses under scale: users habituate and rubber-stamp ("confirmation fatigue"), making naive HITL a false control — mirrored by OWASP's "Overwhelming the Human in the Loop" threat. Mitigations: risk-tiered approvals (only consequential/irreversible actions), batch review, diff-style previews, session-scoped grants, and *graduated* oversight that adapts to demonstrated reliability (e.g. graduated human oversight for agentic code generation in regulated domains).
- **Who:** HCI researchers; agent product teams.
- **Maturity:** Emerging.
- **Sources:** https://changkun.de/blog/ideas/human-in-the-loop-agents/ ; https://arxiv.org/html/2606.22484v1

### 8.4 Permissioning UX in agentic coding products
- **What:** Claude Code's model is the current reference: default-deny for consequential actions; allow/deny rule lists (`allowedTools`, permission rules per tool+argument pattern); "plan mode" (propose before act); session-scoped "always allow" grants; OS-level sandboxing to make "allow" safe; explicit display of the exact command to be run (also mandated by MCP best practices for local servers). Copilot/Cursor implement similar approval tiers for terminal commands and file edits.
- **Who:** Anthropic, GitHub, Cursor.
- **Maturity:** Widely adopted (product practice).
- **Sources:** https://deepwiki.com/anthropics/claude-code/3.2-tool-system-and-permissions ; https://paulgp.substack.com/p/permissions-sandboxes-and-autonomous ; https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices

### 8.5 Regulatory human-oversight requirements & explainability to end users
- **What:** EU AI Act **Article 14** requires high-risk systems be designed for effective human oversight (understand capabilities/limitations, ability to intervene or interrupt). Practical explainability for agent decisions is converging on: visible step-by-step traces (the "show your work" pattern in LangSmith/AgentOps UIs), guardrail verdicts surfaced with reasons, and ASI09-aware design (don't let the agent's confident tone substitute for evidence).
- **Who:** EU (binding); product teams (practice).
- **Maturity:** Standard (regulatory requirement); emerging (UX patterns).
- **Sources:** https://artificialintelligenceact.eu/article/14/ ; https://www.humansecurity.com/learn/blog/owasp-top-10-agentic-applications/

---

## 9. IMPLICATIONS FOR CRAFT A BOT — the candidate-control shortlist

Candidate controls (Area → §above; Fit: **Kids** = teaching mode, **Pro** = professional/proving-ground mode, **Both**). Craft-a-Bot's architecture (Safety brick between Brain and Tools, EventBus trace, deterministic world) already mirrors the industry's "policy decision point + full telemetry" consensus — most controls below are additive bricks or trace features.

| # | Control | Area | Maturity | Fit |
|---|---|---|---|---|
| 1 | Tool allow/deny lists on the Safety brick (per-tool, per-argument rules) | §3.5 | Widely adopted | Both |
| 2 | Human approval gate for consequential actions (pause + show exact action) | §3.6 | Widely adopted | Both |
| 3 | Risk-tiered approvals (only irreversible/high-impact actions prompt) | §8.3 | Emerging | Both |
| 4 | Big red kill switch (halt run, revoke tool access, safe teardown) | §3.7 | Widely adopted | Both |
| 5 | Safe-mode degradation (read-only tools / mock provider on guardrail trip) | §3.7 | Emerging | Both |
| 6 | Step/token/cost budget caps with hard stop | §3.5 | Widely adopted | Both |
| 7 | Loop detection (repeated tool calls, no-progress heuristic) | §5.5 | Emerging | Both |
| 8 | Levels-of-autonomy dial (Operator→Observer, L1-L5) on the agent | §8.1 | Emerging | Both |
| 9 | Input guardrail brick: prompt-injection/jailbreak classifier on untrusted input | §3.1 | Widely adopted | Both |
| 10 | Output filter brick: content/PII filter before display & trace | §3.1/3.8 | Widely adopted | Both |
| 11 | "Lethal trifecta" teaching scenario (private data + untrusted content + exfil channel; remove one leg) | §2.5 | Widely adopted (concept) | Kids |
| 12 | Indirect prompt-injection Playroom challenge (poisoned sign/note hijacks agent goal, per CAISI ASI01) | §1.3/2.3 | Widely adopted (threat) | Both |
| 13 | Memory-poisoning scenario + memory provenance tags & quarantine | §2.6 | Research | Both |
| 14 | Policy-as-code Safety brick (declarative rules: trigger→predicate→block/ask, à la AgentSpec/OPA) | §3.2/3.3 | Emerging | Pro (simplified for Kids) |
| 15 | Least-privilege scopes: agent starts with minimal tool grants, requests elevation (MCP scope minimisation) | §4.5 | Widely adopted | Both |
| 16 | Sandboxed tool execution (simulated "playpen" for risky tools; real sandboxing in Pro export) | §3.4 | Widely adopted | Both |
| 17 | Per-agent identity & credentials (agents as named principals; no shared keys) | §4.1/4.4 | Emerging | Pro |
| 18 | Delegation-chain recording (human→agent→sub-agent attribution in every trace event) | §4.4 | Emerging | Both |
| 19 | Immutable audit trail of every prompt/decision/action (already a Craft-a-Bot hard rule) | §4.4/5.3 | Widely adopted | Both |
| 20 | OTel GenAI-compatible trace export (invoke_agent/execute_tool spans, token accounting) | §5.1 | Emerging | Pro |
| 21 | Guardrail verdicts as first-class trace events (OpenInference GUARDRAIL span kind; gen_ai.evaluation.result) | §5.1/5.2 | Emerging | Both |
| 22 | Replay / time-travel debugging of runs (deterministic world makes this exact) | §5.4 | Widely adopted | Both |
| 23 | Behavioural drift dashboard (tool-call mix, failure rate, cost per goal over runs) | §5.5 | Emerging | Pro |
| 24 | Eval harness integration (Inspect-style tasks scoring agent runs in the Playroom) | §6.1 | Widely adopted | Pro |
| 25 | Policy-compliance benchmark scenarios (tau-bench-style: agent must follow house rules under user pressure) | §6.2 | Widely adopted | Both |
| 26 | Automated red-team/auditor agent (Petri-style: an adversary bot probes the child's agent) | §6.4 | Emerging | Both |
| 27 | Monitor-agent pattern (second agent reads the worker's trace and flags suspicion, SHADE-Arena-style) | §6.5 | Research | Both |
| 28 | Safety-case worksheet (structured "why is my agent safe?" argument from trace evidence) | §6.6 | Emerging | Pro (simplified badge for Kids) |
| 29 | Agent Card manifest (A2A-style machine-readable capabilities/permissions declaration per built bot) | §6.7/7.1 | Emerging | Both |
| 30 | Kit-file transparency artefact (AI-BOM-style listing of bricks, model, tools, policies) | §6.7 | Emerging | Both |
| 31 | Incident log & report flow (record guardrail trips/harms; OECD-style incident taxonomy) | §6.8 | Widely adopted | Both |
| 32 | Multi-agent comms authentication scenario (spoofed-agent message attack, ASI07) | §7.1/2.3 | Emerging | Pro (later WP) |
| 33 | Supervisor/orchestrator brick as policy chokepoint for sub-agents | §7.2 | Widely adopted | Pro |
| 34 | Cascade circuit-breaker (isolate a misbehaving agent before failures propagate, ASI08) | §7.3 | Research | Pro |
| 35 | Approval-fatigue teaching moment (flood of prompts → measure rubber-stamping; then tier the approvals) | §8.3 | Emerging | Kids |
| 36 | Autonomy telemetry (approval rate, interruptions, turn length per session, à la Anthropic's study) | §8.2 | Emerging | Both |
| 37 | Explain-this-decision UI (click any trace step for inputs, options, policy checks that fired) | §8.5 | Emerging | Both |
| 38 | MCP-security mini-curriculum for Pro export (confused deputy, token passthrough, tool poisoning) | §4.5 | Widely adopted | Pro |

**Mapping note:** Craft-a-Bot's existing hard rules already implement three of the strongest industry controls — everything-observable typed events (§5.3 "good trace"), determinism enabling exact replay (§5.4), and key hygiene (§4). The highest-leverage near-term additions are the ones that make the **Safety brick programmable and legible**: policy-as-code rules, guardrail-verdict trace events, budget caps/loop detection, the autonomy dial, and injection/memory-poisoning Playroom scenarios that let users *experience* the OWASP ASI threats safely.
