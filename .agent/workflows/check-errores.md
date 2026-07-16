---
description: check-errores
---

Comprehensive End-to-End Review with a Single Consolidated Findings List

Objective
Perform a complete and rigorous review of all work completed to date. Verify the accuracy, consistency, and correctness of every component (logic, structure, data, dependencies, implementation details). Identify errors, inconsistencies, missing elements, and potential risks. Provide precise corrections and a clear readiness verdict for moving to the next test stage.

Scope

- Include all available artifacts (A–Z): requirements, specs, designs, code repositories, data assets/schemas, tests and results, CI/CD configs, infrastructure/IaC, APIs/contracts, dependencies/manifests, runbooks, user docs, tickets/roadmaps, release notes, and compliance/security materials.
- If any artifact is unavailable, mark it as Missing and assess risk/impact.

Severity Taxonomy (apply to each finding)

- Critical: Blocks operation or poses major security/compliance risk; must fix before proceeding.
- High: Likely failure, data loss, or major deviation from requirements; fix before proceeding if feasible.
- Medium: Degradation, maintainability, or UX issues; fix soon or before release.
- Low: Minor inconsistencies or optimizations; non-blocking.
- Info: Observations or suggestions; non-blocking.

Categories (tag each finding with one or more)

- Requirements/Traceability, Logic/Algorithms, Architecture/Structure, Data/Schema/Quality, Dependencies/Integrations, Implementation/Code Quality, Testing/QA, Security/Privacy/Compliance, Performance/Reliability, Documentation/Operations, Process/Project, UX/Accessibility.

Method (reasoning steps before conclusions)

1. Inventory: Enumerate all artifacts and versions; note gaps.
2. Traceability: Map requirements ↔ design ↔ code/modules ↔ tests ↔ results.
3. Logic & Structure: Validate control flow, invariants, contracts, and modular boundaries.
4. Data: Check schemas, types, constraints, lineage, quality, PII handling, and migrations.
5. Dependencies & Integration: Verify versions, API contracts, environment configs, and external services.
6. Implementation: Review code health, error handling, logging, configuration, and CI/CD pipelines.
7. Security & Compliance: Threats, secrets, access control, libraries/CVEs, data protection, policies.
8. Performance & Reliability: Benchmarks, SLAs/SLOs, capacity, failover, idempotency, timeouts/retries.
9. Testing & QA: Unit/integration/E2E coverage, flaky tests, test data, pass/fail trends.
10. Documentation & Operations: Runbooks, diagrams, onboarding, observability, alerts.
11. Consistency Cross-Checks: Naming, conventions, domain models, metrics.
12. Synthesis: Quantify impact/likelihood, propose precise fixes, assign owners, and set priorities.
13. Store all findings in HISTORY_ERROR_LOGS_COMBINED and always reference it as the authoritative source for future checks.

Readiness Criteria (default)
Declare Ready to proceed only if all are true:

- No unresolved Critical items and at most Low/Info accepted risks; High items either resolved or explicitly waived with mitigation and owner/date.
- All acceptance tests and core E2E paths pass; key SLAs/SLOs met or justified.
- Security checks show no blocking issues (e.g., no leaked secrets; no Critical CVEs).
- Documentation/runbooks sufficient to install, operate, and troubleshoot.
- Dependencies, configs, and migrations validated in target environment.

Deliverables (Output Format)
Provide a single machine-readable JSON object with these keys:
{
"metadata": {
"review_title": "...",
"date": "YYYY-MM-DD",
"system_type": "e.g., service | data pipeline | mixed",
"artifacts_reviewed": ["name or path@version"],
"artifacts_missing": ["name or path"]
},
"analysis_brief": [
"Short bullet points summarizing key checks performed and evidence (no step-by-step inner monologue)."
],
"rollup_metrics": {
"counts_by_severity": {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0},
"total_findings": 0,
"tests_pass_rate": "e.g., 97.3%",
"coverage": "e.g., 82% lines",
"open_blockers": 0
},
"consolidated_findings": [
{
"id": "F-001",
"title": "Concise finding title",
"severity": "Critical | High | Medium | Low | Info",
"category": ["Testing/QA"],
"location": "file or component or doc reference",
"evidence": "What was observed; logs/lines/metrics summarized",
"impact": "Business/technical consequence",
"likelihood": "High | Medium | Low",
"risk_score": 0,
"root_cause": "Brief cause hypothesis",
"recommendation": "Precise correction or improvement",
"implementation_steps": ["Step 1", "Step 2"],
"owner": "role or person",
"status": "Open | In Progress | Resolved | Accepted Risk",
"due_date": "YYYY-MM-DD",
"references": ["artifact path@version", "ticket#"]
}
],
"proposed_next_steps": [
"Ordered list of actions to reach readiness, tied to finding IDs."
],
"readiness_verdict": {
"ready_to_proceed": true,
"rationale": "One-paragraph justification referencing counts_by_severity and key criteria",
"waivers": [
{"finding_id": "F-010", "risk_acceptor": "role", "expiry": "YYYY-MM-DD", "mitigation": "..."}
]
}
}

Instructions & Constraints

- Use the single consolidated_findings list for all issues; sort by severity (Critical→Info), then by risk_score.
- Be evidence-based: cite specific files, lines, commits, test runs, metrics, or documents.
- If data is unknown or not available, mark fields as "Unknown" and include the associated risk.
- Keep recommendations actionable and minimal to resolve the issue; avoid generic advice.
- Prefer deterministic checks over subjective opinions; note assumptions explicitly.

Example Finding (abbreviated)
{
"id": "F-007",
"title": "Login retries lack exponential backoff",
"severity": "High",
"category": ["Performance/Reliability", "Security/Privacy/Compliance"],
"location": "auth/client.js:210-245",
"evidence": "5 retry attempts at fixed 100ms; load test shows 429 spike at p95",
"impact": "Thundering herd under partial outage; account lock risk",
"likelihood": "High",
"risk_score": 72,
"root_cause": "Fixed-interval retry policy",
"recommendation": "Implement exponential backoff with jitter (base 200ms, factor 2, max 5s)",
"implementation_steps": [
"Introduce backoff util with decorrelated jitter",
"Update retry policy in auth client; add unit/integration tests"
],
"owner": "Platform Team",
"status": "Open",
"due_date": "2026-02-05",
"references": ["commit abc123", "LoadTest#LT-54"]
}
