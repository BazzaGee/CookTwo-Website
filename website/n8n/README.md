# CookTwo — n8n integration

This folder holds the n8n side of the CookTwo article writer. The three workflows that drive the system live in your n8n Cloud instance (bazzagee.app.n8n.cloud); the artifacts that make them comprehensible and editable live here in the repo.

## Workflows

| Workflow | ID | Trigger | Purpose |
|---|---|---|---|
| CookTwo: Content Generation | `GRl1p7rI2jbOXvsz` | every 6 hours | Picks a pending backlog row, generates the article, opens a draft PR with a real-site preview, emails you. |
| CookTwo: Publisher | `iHJFr4f0Glnj6oDo` | every hour | Checks the 72h publish floor + randomized cadence; when eligible, merges the next approved PR to main. |
| CookTwo: PR Comment Poller | `gQtifl6xCqT4wFEW` | every 15 min | Watches PR comments for `/approve` and change requests. |

## Files

- `RUNBOOK.md` — full operator's manual: how to set up, what runs when, how to add to the backlog, known limitations.
- `prompts.mjs` — system prompts for the planner, writer, and auditor. Loaded at runtime via n8n environment variables (`COOKTWO_PLANNER_PROMPT`, `COOKTWO_WRITER_PROMPT`, `COOKTWO_AUDITOR_PROMPT`).
- `VOICE_RULES.md` — the human-readable voice and quality ruleset the writer/auditor use. Edit this when you want to change the tone; update the prompts in `prompts.mjs` to match.
- `backlog_seed_phase1.json` — the canonical plan. One row per planned article. Edit + commit to add/reorder/remove items. The workflows pull this from the repo on every run.
- `DATA_TABLES.md` — schema and purpose of the four n8n Data Tables the workflows use.
- `workflow-a-content-generation.mjs` — source for Workflow A.
- `workflow-b-publisher.mjs` — source for Workflow B.
- `workflow-c-pr-poller.mjs` — source for Workflow C.

## Editing the workflows

The workflows were created in n8n Cloud via the n8n Workflow SDK. To edit one of them:

1. Open the n8n instance → Workflows → click the workflow.
2. Edit in the visual editor.
3. Save. The change is live.

The source `.mjs` files in this folder are reference / regeneration points — if you ever need to rebuild the workflow from scratch (e.g. moving to a new n8n instance, or you want to share a working definition with a teammate), use `validate_workflow` and `create_workflow_from_code` with the file content.

## Editing the backlog

Edit `backlog_seed_phase1.json`, commit, push. The next Workflow A run picks up the change automatically — the workflow reads the JSON from the repo on every run.

Status lifecycle:

```
pending  ->  (Workflow A picks it up)
generating  ->  (during planner/writer/auditor)
ready  ->  (auditor passed, PR is open, awaiting your review)
approved  ->  (you /approve'd on the PR; Workflow B will publish)
published  ->  (live on cooktwo.com)
rejected  ->  (auditor failed, or you requested changes; edit to set status=pending to retry)
```
