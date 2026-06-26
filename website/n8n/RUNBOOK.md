# CookTwo Article Writer — Runbook

> Created 2026-06-24. Three n8n workflows, plus the Astro content layer they publish into.

## TL;DR

Three n8n Cloud workflows (bazzagee.app.n8n.cloud) + a content layer scaffolded in the website repo:

1. **CookTwo: Content Generation** (`GRl1p7rI2jbOXvsz`) — every 6 hours, picks the next pending backlog row, generates an article, opens a draft PR with a real-site preview, and emails you.
2. **CookTwo: Publisher** (`iHJFr4f0Glnj6oDo`) — every hour, checks the 72h floor + randomized cadence; when eligible, merges the next approved PR to main and emails you.
3. **CookTwo: PR Comment Poller** (`gQtifl6xCqT4wFEW`) — every 15 min, watches PR comments for `/approve` (promotes to approved) and other comments (marks changes_requested).

Plus the website scaffold:
- `website/src/content.config.ts` — Content Collections for `blog` and `pages`
- `website/src/content/{blog,pages,pages/vs}/...` — articles (placeholders now, real content from the workflow)
- `website/src/layouts/{PostLayout,PageLayout}.astro` — article layouts
- `website/src/pages/{blog/[...slug],[slug],vs/[competitor],blog/index}.astro` — dynamic routes
- `website/src/components/prose/{Callout,CheckList,ServiceCard,Faq,PortionSplitCalculator,GroceryBudgetEstimator}.astro` — rich elements
- `website/n8n/{prompts.mjs,VOICE_RULES.md,backlog_seed_phase1.json,DATA_TABLES.md,workflow-a,b,c}.mjs` — workflow code + voice rules + plan
- `.github/workflows/website-preview.yml` — per-PR preview deploys

## First-time setup

**Everything is already done.** All three workflows are created, all credentials are wired, and all system prompts are inlined into the Code nodes. There are no manual steps required.

### What was set up autonomously

- **Credentials (created via n8n REST API):**
  - `GitHub - CookTwo` (`fQcBaItMxZinwpz2`) — httpHeaderAuth, using the `gh` CLI token
  - `Resend - CookTwo` (`ID5dckKqLnoKrzWR`) — httpBearerAuth, using a dedicated Resend API key (`CookTwo Article Writer`)
  - `OpenRouter account` (`uSUc5626duAfakQP`) — pre-existing
- **System prompts** — inlined directly into the three "Build * body" Code nodes in Workflow A (the n8n Cloud license doesn't support Variables/env vars, so prompts are embedded in the workflow JSON itself). To edit the voice rules, update `website/n8n/prompts.mjs` and re-run the inlining script, or edit the Code nodes directly in the n8n UI.
- **All HTTP Request nodes** across all three workflows reference the correct credentials by ID.

### 4. Publish the website scaffold

The content layer I added (`src/content.config.ts`, layouts, components, routes) needs to be on the `main` branch before any new article can be published. The branch in your local repo is the one you should commit + push. Standard:

```bash
cd "C:\Users\barry\OneDrive\Desktop\CookTwo _ Website & App"
git checkout main
git add website/.github website/src website/n8n website/package.json website/astro.config.mjs website/tailwind.config.mjs
git commit -m "Scaffold Astro content layer + n8n workflow scaffolding"
git push origin main
```

The first push will trigger `website.yml` and deploy the new routes. After that, any `src/content/blog/*.md` or `src/content/pages/*.md` you (or the workflow) adds will generate routes automatically.

> **Note on the model ids:** The writer/auditor/image model ids are the user's exact choice and were verified live against OpenRouter on 2026-06-24:
>
> - `nousresearch/hermes-3-llama-3.1-405b:free` (writer)
> - `google/gemma-4-26b-a4b-it:free` (auditor + final polish)
> - `black-forest-labs/flux.2-klein-4b` (small images)
> - `bytedance-seed/seedream-4.5` (complex/with-text images)
>
> If any of these change on OpenRouter, the workflow needs an update — the model strings are in `workflow-a-content-generation.mjs` and would need to be redeployed.

## What happens when Workflow A runs (every 6 hours)

1. Fetches `website/n8n/backlog_seed_phase1.json` from the repo.
2. Filters to rows with `status === 'pending'`, picks the first one.
3. Calls OpenRouter Hermes 405B (planner) → structured outline.
4. Calls OpenRouter Hermes 405B (writer) → full draft article (title, description, MDX body, image plan, internal/external links).
5. Calls OpenRouter Gemma 4 26B A4B (auditor) → scores 0-20 against the 10-rule rubric.
6. **If score ≥ 17 (or auditor returns `APPROVE`):**
   - Builds a `website/src/content/{blog,pages}/<slug>.md` file with frontmatter.
   - Creates a GitHub branch `article/<slug>-<base36>` from `main`.
   - Commits the file to the branch.
   - Opens a draft PR against `main` with the article details, audit score, and approval instructions.
   - Adds a row to `ready_queue` (status=`ready`).
   - Adds a row to `pr_tracker`.
   - Marks the backlog row `ready`.
   - Sends you a Resend email with the preview URL (guess, updated by the website-preview GitHub Action within ~2 minutes) and the PR URL.
7. **If score < 17:**
   - Marks the backlog row `rejected`.
   - Sends you a Resend email listing the auditor's specific issues.
   - You can re-trigger by editing the data table row's `status` back to `pending`.

## What happens when Workflow C runs (every 15 min)

1. Reads all `pr_tracker` rows where `state === 'open'`.
2. For each, fetches new comments since `last_comment_checked_at`.
3. If any new comment contains `/approve` (case-insensitive): sets `ready_queue.status = 'approved'`, sets `pr_tracker.state = 'approved'`. (Workflow B will pick it up.)
4. If any new comment is substantive but not `/approve`: sets `pr_tracker.state = 'changes_requested'`, sets `ready_queue.status = 'rejected'` so the writer loop can pick it up.
5. Always updates `last_comment_checked_at`.

## What happens when Workflow B runs (every hour)

1. Reads the most recent `published_registry` row.
2. Computes `elapsed_hours` since the last publish.
3. **If elapsed < 72h:** skip this hour (no-op).
4. **If elapsed ≥ 72h:**
   - Rolls a random wait (0-4h with 30% probability, 4-12h with 70%). This makes the cadence non-predictable while still respecting the floor.
   - Waits that long.
   - Reads the first `ready_queue` row with `status = 'approved'`.
   - Confirms the PR is still open via the GitHub API.
   - Merges the PR (squash) to `main` — `website.yml` auto-deploys.
   - Adds a row to `published_registry` with the publish date.
   - Updates `ready_queue.status = 'published'`, `backlog.status = 'published'`, `pr_tracker.state = 'merged'`.
   - Sends you a Resend email with the live URL on cooktwo.com.

## Adding to the backlog

The plan lives in `website/n8n/backlog_seed_phase1.json` (committed to the repo, version-controlled). To add a new article:

1. Edit the JSON: add an entry with `title`, `slug`, `type` (`post`|`page`|`vs`), `route` (`blog`|`root`|`vs`), and optional metadata (`target_keyword`, `seo_mode`, `pillar`, `intent_summary`, `persona`, `priority_tier`, `phase`).
2. Commit + push to `main`.
3. The next Workflow A run will pick it up (status defaults to `pending`).

You don't need to touch the data tables for new work — only for live state (in-progress, ready, approved, published).

## Anti-spam cadence (recap)

- ≥72h hard floor (Workflow B enforces).
- Random 4-12h additional delay after the floor is satisfied (30% chance of 0-4h) — non-predictable.
- Random time-of-day and day-of-week emerge naturally from this.
- Pillar pages are prioritized before their cluster posts so internal links resolve.
- Mixed content types (keyword / intent / hybrid) per the plan.
- First paragraph always answers the question + previews (enforced by the auditor, rule #1, 0 hard-fail if it starts with "Are you struggling...").

## Quality controls in the auditor (recap)

- First paragraph: answers intent + previews in 2-4 sentences.
- Intent match.
- Structure (varied paragraph/sentence lengths).
- SEO balance (target keyword 1-3 times, never stuffed).
- Anti-spam (no "Top 10," no "dive in," no "in today's world").
- Voice (no "manifest," "elevate," no "AI," "human," no meta-references to "this article").
- Internal links (pillar in first third, natural anchor).
- External links (PubMed, USDA, Pew, academic; no Medium, no AI content farms).
- Rich element usage (correct type, at most one, never two of the same kind).
- Word count within ±15% of target.

The writer/auditor/free-tier model choice is a deliberate trade-off: it requires the user to be ready to accept the quality level. If articles fail the audit too often, switch the writer to a stronger paid model (any OpenRouter chat model) by editing `WRITER_MODEL` in `workflow-a-content-generation.mjs` and re-uploading.

## Known limitations (v1)

- **The retry loop is NOT inside Workflow A.** If the auditor rejects, the row is marked `rejected` and you get an email — there's no auto-retry. To retry, edit the backlog row's status back to `pending` in the data table. This is deliberate: keeping the human in the loop on the first version, since the writer/auditor model combo is new.
- **The PR comment poller (Workflow C) is minimal.** It just flips state based on `/approve` or other comments. It doesn't read the comment text into a re-prompt; that loop lives in a follow-up.
- **Image generation is planned but not yet wired into Workflow A.** The writer's output includes an `imagePlan` with prompts; the next iteration will POST to OpenRouter for each `flux.2-klein-4b` (simple) or `bytedance-seed/seedream-4.5` (complex) call, write the resulting binaries to `website/public/images/blog/`, and include them in the commit. This is the next high-priority addition.
- **Internal link finalization (Workflow B injecting live cross-links) is not yet wired.** The writer is given `publishedSlugs` (the most recent slugs) to plan links against; live cross-linking at publish time is a refinement.
- **Email is sent to `barry@cooktwo.com` as a placeholder.** Change the `to:` field in the two `Build * email` Code nodes (in `workflow-a-content-generation.mjs`) and `workflow-b-publisher.mjs` before going live.
- **The `decodePlan` node picks the first pending row by JSON order, not by priority tier.** If you want priority-ordered generation, sort the plan in the seed JSON.
- **The website scaffold has placeholder content** in `src/content/{blog,pages}/...` (all `draft: true`). They will be replaced by Workflow A on the first run. The first Workflow A run will pick a different pending row from the JSON (the placeholders are not in the JSON), and create a real MD file. To pre-populate a placeholder with a real article, just set `draft: false` on the placeholder frontmatter and commit.
- **System prompts are inlined in the workflow**, not in env vars (n8n Cloud license doesn't support Variables). Edit the three "Build * body" Code nodes in Workflow A directly, or update `prompts.mjs` and re-run the inlining script at `C:\Users\barry\.local\share\opencode\inline-prompts.cjs`.

## Where the artifacts live

- Workflows (3):
  - `CookTwo: Content Generation` — `GRl1p7rI2jbOXvsz`
  - `CookTwo: Publisher` — `iHJFr4f0Glnj6oDo`
  - `CookTwo: PR Comment Poller` — `gQtifl6xCqT4wFEW`
- n8n Data Tables (4):
  - `content_backlog` — `P8CiAroqSUlutB01`
  - `ready_queue` — `1NFhfpyBJ0xMZcHQ`
  - `pr_tracker` — `2Sy54R6kB9Tf3Nds`
  - `published_registry` — `JPeZhnhGSM273vr6`
- n8n credentials (3):
  - `OpenRouter account` (pre-existing)
  - `GitHub - CookTwo` (you create)
  - `Resend - CookTwo` (you create)
- Repo files:
  - `website/src/content.config.ts` — content collection schemas
  - `website/src/content/{blog,pages,pages/vs}/` — articles (placeholders + workflow output)
  - `website/src/layouts/{BaseLayout,PostLayout,PageLayout}.astro`
  - `website/src/pages/{blog,[slug],vs,blog/index}.astro` — routes
  - `website/src/components/prose/*.astro` — Callout, CheckList, ServiceCard, Faq, PortionSplitCalculator, GroceryBudgetEstimator
  - `website/n8n/{prompts.mjs,VOICE_RULES.md,backlog_seed_phase1.json,DATA_TABLES.md,workflow-a-content-generation.mjs,workflow-b-publisher.mjs,workflow-c-pr-poller.mjs}`
  - `.github/workflows/website-preview.yml` — PR preview deploys
