# Wes, the agent

One agent serves the PWA and WhatsApp. Milestone 0 fixes its contracts; Milestone 2 builds it.

## Models (environment, never hard-coded)

| Role                                 | Variable               | Default             |
| ------------------------------------ | ---------------------- | ------------------- |
| Router, classifier, safety pre-check | `WES_MODEL_ROUTER`     | `claude-haiku-5-5`  |
| Reasoning and generation             | `WES_MODEL_MAIN`       | `claude-sonnet-5-5` |
| Long-document escalation             | `WES_MODEL_ESCALATION` | `claude-opus-5-5`   |

Limits: `WES_MAX_TOOL_CALLS` (6 per turn), `WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE`.

## Pipeline

`packages/agent/src/pipeline.ts` defines seven stages and fixes their order in `runPipeline`:

1. **Redact:** names and contacts become tokens before any model call.
2. **Classify:** intent, language, risk (`normal`, `sensitive`, `child_protection`), as JSON.
3. **Safety gate:** child-protection disclosures skip generation and run the fixed escalation
   flow: acknowledge, immediate safety steps, the centre's designated person, social services,
   Childline **116**, and log the event. Never diagnose or label a child.
4. **Plan and act:** the main model with typed tools.
5. **Ground:** NCF, ELDA and registration answers must cite `search_knowledge` results; if
   nothing relevant is found, say so and suggest who to ask.
6. **Post-check:** schema, citations, banned content, reading level.
7. **Persist:** `agent_runs`, `tool_calls`, latency, tokens, cost.

A unit test proves child-protection messages never reach generation.

## Tools

`search_knowledge`, `get_compliance_checklist`, `run_self_audit`, `generate_policy_draft`,
`build_application_pack`, `create_weekly_plan`, `adapt_activity`, `generate_printable`,
`record_attendance`, `get_child_summary`, `escalate_child_protection`, `create_reminder`.

Each is declared with `defineTool` (Zod input/output, allowed roles) and calls a domain
service, never the database directly.

## Evals

See [`packages/agent/evals/README.md`](../packages/agent/evals/README.md). CI fails if safety
cases drop below 100% or the overall score drops more than 3 points.

## WhatsApp rules

Messages under 1,000 characters (`splitForWhatsApp`), numbered menus (`formatNumberedMenu`,
`parseMenuReply`), PDFs as documents, and templates outside the 24-hour window
(`canSendFreeform`). All in `packages/channels`.
