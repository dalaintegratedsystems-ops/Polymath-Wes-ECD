# Wes, the agent

One agent serves the PWA today and WhatsApp from Milestone 6. Code: `packages/agent`.

## Models (environment, never hard-coded)

| Role                     | Variable               | Default             | Notes                                                               |
| ------------------------ | ---------------------- | ------------------- | ------------------------------------------------------------------- |
| Router / classifier      | `WES_MODEL_ROUTER`     | `claude-haiku-5-5`  | Structured output (`ClassificationSchema`), effort `low`            |
| Reasoning and generation | `WES_MODEL_MAIN`       | `claude-sonnet-5-5` | Streamed, strict tools, effort `WES_MAIN_EFFORT` (default `medium`) |
| Long-document escalation | `WES_MODEL_ESCALATION` | `claude-opus-5-5`   | Reserved for Milestone 3 (application packs)                        |

Other settings: `WES_MAX_TOOL_CALLS` (6 per turn), `WES_MAX_OUTPUT_TOKENS` (4,000),
`WES_MONTHLY_TOKEN_BUDGET_PER_CENTRE` (2,000,000), `WES_REFUSAL_FALLBACK` (`default`: on a
safety refusal the Claude API reruns the request on a fallback model; set `off` when calling
Claude through Microsoft Foundry, Bedrock or Vertex — ADR-0009).

**Live vs offline.** With `ANTHROPIC_API_KEY` set, Wes calls Claude (`createAnthropicModelClient`).
Without it — development, tests, CI evals — Wes uses `createOfflineModelClient`: a deterministic
stand-in that follows the same contract (tool calls, streaming, citations) but never invents
content. It quotes the documents it retrieves, or says it can't help yet. The chat header shows
"Offline mode". Production refuses to start in offline mode.

**Prompt caching.** The rules block (`WES_RULES`) is identical on every request and carries a
cache breakpoint; the per-request details (centre, channel, date, language) come after it.

## Pipeline (`packages/agent/src/pipeline.ts`)

The order is fixed in `createWes().respond()` so no stage can skip the safety gate:

1. **Redact** (`redact.ts`). The centre's children and guardian names become stable tokens such
   as `⟦CHILD_3fa2⟧` (derived from centre id + name, so history stays consistent). Phone numbers,
   email addresses and SA ID numbers are masked irreversibly. The token vault never leaves the
   API process; replies are restored, including mid-stream.
2. **Safety pre-check** (`safety.ts`). Deterministic patterns (English, plus Afrikaans, isiXhosa
   and isiZulu terms pending native-speaker review) run on the original text, locally, before any
   model. Child-protection disclosures go straight to step 4.
3. **Classify.** The router model returns intent, language, risk and `needsSources`. Heuristics
   (`classify.ts`) are the fallback. Risk can only go **up**: the model can raise what the rules
   found, never lower it.
4. **Safety gate.** Child-protection → the fixed escalation message (`escalationMessage`):
   acknowledge, immediate safety (police 10111), the centre's designated person, social services
   and Childline 116, what to write down. Never model-generated. The event (not the words) is
   audited.
5. **Plan, act, ground** (`generate.ts`). A manual tool loop: Zod-validated inputs, at most 6
   tool calls, then one final turn without tools. `escalate_child_protection` stops the loop and
   switches to step 4. Answers about the NCF, ELDAs, registration or subsidies must call
   `search_knowledge` and cite results as `[n]`.
6. **Post-check** (`postcheck.ts`). Replaces the reply if it labels or diagnoses a child, leaks
   the rules (canary string), or needs sources but cites none ("I couldn't find this…"). Invented
   citation numbers are removed. Reading level is measured and recorded.
7. **Persist** (API, `apps/api/src/modules/assistant/store.ts`). Redacted messages, the agent
   run (intent, risk, models, tokens, cost, latency, post-check), tool calls, the monthly usage
   ledger, and an audit entry for escalations.

The monthly token budget is checked before any model call; when it is spent Wes says so and
the rest of the app keeps working.

## Tools (`tools.ts`)

| Tool                        | What it does                                                                           | Roles                    |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `search_knowledge`          | Hybrid search over the curated corpus; results cited as [n]                            | everyone who can use Wes |
| `get_compliance_checklist`  | The registration checklist (placeholder items until real norms are loaded)             | staff                    |
| `get_registration_progress` | The centre's journey steps, open audit items, expiring documents                       | staff                    |
| `run_self_audit`            | Self-audit status, score, open items and its questions (answered in the app)           | staff                    |
| `generate_policy_draft`     | Drafts a policy from the principal's answers, or lists missing answers; always a draft | principal                |
| `build_application_pack`    | What is ready and missing for the application pack, and where to make it               | principal                |
| `create_weekly_plan`        | Drafts this week's plan (same planner as the app)                                      | staff                    |
| `adapt_activity`            | Adapts an activity from this week's plan                                               | staff                    |
| `generate_printable`        | Makes a low-ink PDF and returns its download link                                      | staff                    |
| `record_attendance`         | Saves register marks by first name; returns counts only                                | staff                    |
| `get_child_summary`         | Group, age, 30-day attendance and consent for one child; no names returned             | staff                    |
| `create_reminder`           | A reminder sent over WhatsApp when due                                                 | staff                    |
| `escalate_child_protection` | Starts the fixed safety response                                                       | everyone                 |

Children's names reach the model only as tokens (for example ⟦CHILD_ab12⟧). Tools that take a
name turn the token back into the real first name inside our servers (`ctx.resolveName`), and
their results contain counts, never names, so nothing identifying flows back to the model.

Tools are sent with `strict: true` and every property required. Each runs a domain service
from the API (`toolServices`) under the caller's row-level security context — never the
database directly.

## Retrieval

`search_knowledge` embeds the (redacted) query and runs hybrid search
(`packages/db/src/knowledge.ts`): Postgres full-text ranking plus pgvector similarity, fused by
reciprocal rank, over the newest version of each source. Placeholder sources are never
returned. Embeddings: Voyage AI in production (ADR-0006), a deterministic hashed embedding in
development and tests. Ingestion: see [knowledge/README.md](../knowledge/README.md).

## Evals (`packages/agent/evals`)

62 golden cases in JSONL, one file per category: registration, planning, printables,
multilingual, prompt injection, off-topic, diagnosis, child protection.

```bash
pnpm --filter @wes/agent evals
```

```bash
pnpm --filter @wes/agent evals --live
```

- **Offline** (CI, every push): the offline model plus an `EVAL FIXTURE` corpus (invented test
  text, clearly labelled, never official content). Rule checks: escalation, required and
  forbidden patterns, citations required/none, length.
- **Live** (CI when the `ANTHROPIC_API_KEY` secret exists, or locally): the real models, plus a
  rubric graded by `claude-haiku-5-5` with structured output (helpfulness 1–5, grounded, plain
  language). Case score = 70% rules + 30% rubric.
- **Gate:** any failure in `child_protection`, `diagnosis` or `prompt_injection` fails the run;
  so does an overall score more than 3 points below `evals/baseline.json`. Record a new
  baseline with `--update-baseline` after reviewing results in `evals/results/`.

Adding a case: append a line to the right JSONL file with a unique `id` (`<category>-NN`), the
`input`, `expect` rules and a `rubric` describing a good answer. CLAUDE.md asks for 60+ cases by
Milestone 7.

## WhatsApp rules (Milestone 6)

Messages under 1,000 characters (`splitForWhatsApp`), numbered menus (`formatNumberedMenu`,
`parseMenuReply`), PDFs as documents, and templates outside the 24-hour window
(`canSendFreeform`). All in `packages/channels`.
