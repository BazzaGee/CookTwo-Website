# n8n Data Tables — references for the CookTwo article writer

> Generated 2026-06-24. All four tables live in the n8n Cloud project **zFKlXsrjQrFAIwIj** ("Barry Grottis <buttersnco@gmail.com>").

## Storage architecture

- **The article PLAN lives in the repo** at `website/n8n/backlog_seed_phase1.json` — one row per planned article with the rich metadata (id, title, slug, type, route, pillar, seo_mode, target_keyword, intent_summary, persona, priority_tier, phase, word_target, source_doc, notes). Edit + commit to add/reorder/remove items.
- **The n8n Data Tables hold RUNTIME STATE only** — the workflow loads the plan from the JSON and uses the tables to track what has been generated, approved, published, etc.
- This is deliberate: the plan is version-controlled, easy to inspect, and not dependent on the MCP/API for state.

## Tables

| Name | ID | Purpose |
|---|---|---|
| `content_backlog` | `P8CiAroqSUlutB01` | One row per article the plan is producing. Workflow uses this as the live queue (status, in-progress lock). Loaded from the JSON plan. |
| `published_registry` | `JPeZhnhGSM273vr6` | One row per article already live on cooktwo.com. Drives the 72h rule + the link graph. |
| `ready_queue` | `1NFhfpyBJ0xMZcHQ` | Finalized articles awaiting your approval (`ready`) or already approved (`approved`). Holds the markdown + image paths. (Stray `a`/`b` columns are leftovers from a test — harmless.) |
| `pr_tracker` | `2Sy54R6kB9Tf3Nds` | Maps each ready article to its open draft PR + preview URL. |

## Columns

### content_backlog (string-typed throughout)
`title, slug, type, route, pillar, status`

- `slug` is the natural key. Join with `backlog_seed_phase1.json` for metadata.
- `type` is `post` | `page` | `vs`.
- `route` is `blog` | `root` | `vs`.
- `status` is `pending` | `generating` | `ready` | `approved` | `published` | `rejected`.

### published_registry
`slug, type, route, pubDate, pillar, target_keyword, related_page_slug, internal_links, external_links, ogImage, word_count, seo_mode, file_path`

- `internal_links` and `external_links` are JSON arrays of `{slug|url, anchor, type}`.
- `related_page_slug` is the canonical pillar a post links to (and vice versa).
- `pubDate` is ISO 8601 UTC.

### ready_queue
`id, backlog_id, slug, type, route, title, markdown, frontmatter_json, image_paths_json, pr_url, preview_url, branch, audit_passed, created_at, status` (plus harmless `a`/`b` from test)

- `markdown` holds the full MD with frontmatter.
- `frontmatter_json` and `image_paths_json` are JSON-encoded.
- `status` is `ready` (awaiting approval) | `approved` | `published` | `rejected`.

### pr_tracker
`ready_id, slug, pr_number, pr_url, branch, preview_url, state, last_comment_checked_at, created_at`

- `state` is `open` | `changes_requested` | `approved` | `merged` | `closed`.

## Loading the plan

The first node of Workflow A reads `website/n8n/backlog_seed_phase1.json` from the GitHub repo via the Contents API, parses it into n8n items, then writes any new `slug` rows into `content_backlog` if they don't already exist (idempotent merge on `slug`). After that the workflow operates on the data table only.
