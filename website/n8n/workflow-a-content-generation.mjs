// CookTwo — Workflow A: Content Generation
//
// Triggered every 6 hours. Picks the next pending backlog row, generates the article
// (planner -> writer -> image gen -> auditor), opens a draft PR on GitHub, and notifies
// you via Resend with the preview URL. You approve on the PR; the publisher (Workflow B)
// promotes it to main on its randomized cadence.
//
// Prompts, schema, and full body templates live in website/n8n/prompts.mjs and
// VOICE_RULES.md. This file is the workflow skeleton — the body of each OpenRouter call
// is built dynamically by the corresponding "Build * body" Set node using expressions
// that pull the system prompts from environment-injected constants at runtime.
//
// Credentials expected to exist in the n8n instance:
//   - "OpenRouter account"  (httpBearerAuth, type openRouterApi)
//   - "GitHub - CookTwo"    (httpHeaderAuth with header "Authorization: token <PAT>",
//                             scope: repo, contents: write, pull_requests: write)
//   - "Resend - CookTwo"    (httpBearerAuth, type httpBearerAuth, header "Authorization: Bearer <key>")

import { workflow, trigger, node, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const REPO_OWNER = 'BazzaGee';
const REPO_NAME = 'CookTwo-Website';
const REPO_BRANCH = 'main';
const BACKLOG_TABLE = 'P8CiAroqSUlutB01';
const READY_QUEUE_TABLE = '1NFhfpyBJ0xMZcHQ';
const PR_TRACKER_TABLE = '2Sy54R6kB9Tf3Nds';

// OpenRouter model ids (verified 2026-06-24)
const WRITER_MODEL = 'nousresearch/hermes-3-llama-3.1-405b:free';
const AUDITOR_MODEL = 'google/gemma-4-26b-a4b-it:free';

// OpenAI-compatible OpenRouter request envelope builder. Each OpenRouter call uses this
// pattern: POST https://openrouter.ai/api/v1/chat/completions with the bearer auth, and
// a body of { model, messages, temperature, max_tokens, response_format: { type: 'json_object' } }.
const buildOrBody = (model, system, user, opts = {}) => ({
  model,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ],
  temperature: opts.temperature ?? 0.7,
  max_tokens: opts.max_tokens ?? 4096,
  response_format: { type: 'json_object' }
});

// System prompts inlined at build time. (The full versions with examples live in
// website/n8n/prompts.mjs. The string bodies below are loaded at workflow run-time via
// a Set node that reads them from the repo file via a Code node; for clarity they're
// referenced as workflow constants here.)
const PROMPTS = {
  PLANNER: 'PLANNER_SYSTEM_PROMPT_PLACEHOLDER',
  WRITER: 'WRITER_SYSTEM_PROMPT_PLACEHOLDER',
  AUDITOR: 'AUDITOR_SYSTEM_PROMPT_PLACEHOLDER'
};

// ──────────────────────────────────────────────────────────────────────────────
//  NODES
// ──────────────────────────────────────────────────────────────────────────────

const triggerSchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every 6 hours',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } }
  }
});

const fetchPlan = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch plan JSON from GitHub',
    parameters: {
      method: 'GET',
      url: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/website/n8n/backlog_seed_phase1.json?ref=${REPO_BRANCH}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }] },
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const decodePlan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decode plan + filter to pending',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.first().json;
const plan = JSON.parse(Buffer.from(items.content, 'base64').toString('utf8'));
const pending = plan.filter(r => r.status === 'pending' || !r.status);
return pending.slice(0, 1).map(p => ({ json: p }));`
    }
  }
});

const getMainSha = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Get main branch SHA',
    parameters: {
      method: 'GET',
      url: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${REPO_BRANCH}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const buildPlannerBody = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Build planner request body',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [{
          id: 'body',
          name: 'body',
          type: 'string',
          value: expr(`={{ JSON.stringify({ model: '${WRITER_MODEL}', messages: [{ role: 'system', content: $env.COOKTWO_PLANNER_PROMPT }, { role: 'user', content: 'Brief: ' + JSON.stringify($json) }], temperature: 0.6, max_tokens: 3000, response_format: { type: 'json_object' } }) }}`)
        }]
      }
    }
  }
});

const callPlanner = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'OpenRouter: Planner (Hermes 405B)',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: expr('={{ $json.body }}'),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpBearerAuth: newCredential('OpenRouter account') }
  }
});

const parsePlan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse plan JSON',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
let plan = {};
try { plan = JSON.parse(raw); } catch (e) { throw new Error('Planner did not return valid JSON: ' + raw.slice(0, 500)); }
const brief = $('Decode plan + filter to pending').first().json;
return [{ json: { ...brief, plan } }];`
    }
  }
});

const buildWriterBody = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Build writer request body',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [{
          id: 'body',
          name: 'body',
          type: 'string',
          value: expr(`={{ JSON.stringify({ model: '${WRITER_MODEL}', messages: [{ role: 'system', content: $env.COOKTWO_WRITER_PROMPT }, { role: 'user', content: 'Plan:\\n' + JSON.stringify($json.plan) + '\\n\\nBrief:\\n' + JSON.stringify({ slug: $json.slug, title: $json.title, target_keyword: $json.target_keyword, seo_mode: $json.seo_mode, word_target: $json.word_target, pillar: $json.pillar, intent_summary: $json.intent_summary, persona: $json.persona, type: $json.type, route: $json.route }) }], temperature: 0.7, max_tokens: 6000, response_format: { type: 'json_object' } }) }}`)
        }]
      }
    }
  }
});

const callWriter = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'OpenRouter: Writer (Hermes 405B)',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: expr('={{ $json.body }}'),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpBearerAuth: newCredential('OpenRouter account') }
  }
});

const parseDraft = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse draft JSON',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
let draft = {};
try { draft = JSON.parse(raw); } catch (e) { throw new Error('Writer did not return valid JSON: ' + raw.slice(0, 500)); }
const planState = $('Parse plan JSON').first().json;
return [{ json: { ...planState, draft } }];`
    }
  }
});

const buildAuditorBody = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Build auditor request body',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [{
          id: 'body',
          name: 'body',
          type: 'string',
          value: expr(`={{ JSON.stringify({ model: '${AUDITOR_MODEL}', messages: [{ role: 'system', content: $env.COOKTWO_AUDITOR_PROMPT }, { role: 'user', content: 'Brief:\\n' + JSON.stringify({ slug: $json.slug, title: $json.title, target_keyword: $json.target_keyword, seo_mode: $json.seo_mode, word_target: $json.word_target, pillar: $json.pillar, intent_summary: $json.intent_summary, persona: $json.persona, type: $json.type, route: $json.route }) + '\\n\\nDraft:\\n' + JSON.stringify($json.draft) }], temperature: 0.3, max_tokens: 6000, response_format: { type: 'json_object' } }) }}`)
        }]
      }
    }
  }
});

const callAuditor = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'OpenRouter: Auditor (Gemma 4 26B A4B)',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: expr('={{ $json.body }}'),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpBearerAuth: newCredential('OpenRouter account') }
  }
});

const parseAudit = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse audit + decide',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
let audit = {};
try { audit = JSON.parse(raw); } catch (e) { throw new Error('Auditor did not return valid JSON: ' + raw.slice(0, 500)); }
const state = $('Parse draft JSON').first().json;
return [{ json: { ...state, audit, _passed: (audit.totalScore || 0) >= 17 } }];`
    }
  }
});

const auditGate = ifElse({
  version: 2.2,
  config: {
    name: 'Audit passed (>=17/20)?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          leftValue: expr('{{ $json._passed }}'),
          operator: { type: 'boolean', operation: 'true', singleValue: true }
        }],
        combinator: 'and'
      }
    }
  }
});

const finalizeBuild = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Finalize: build frontmatter + paths',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const s = $input.first().json;
const d = s.draft || {};
const fm = d.frontmatter || {};
const slug = s.slug;
let filePath;
if (s.route === 'blog') {
  filePath = 'website/src/content/blog/' + slug + '.md';
} else if (s.route === 'vs') {
  filePath = 'website/src/content/pages/vs/' + slug.replace(/^vs\\//, '') + '.md';
} else {
  filePath = 'website/src/content/pages/' + slug + '.md';
}
const yaml = [
  '---',
  'title: ' + JSON.stringify(fm.title || d.title || ''),
  'description: ' + JSON.stringify(fm.description || d.description || ''),
  'pubDate: ' + (fm.pubDate || new Date().toISOString().split('T')[0]),
  'author: ' + JSON.stringify(fm.author || 'CookTwo'),
  'ogImage: ' + JSON.stringify(fm.ogImage || ('/images/blog/' + slug + '-1.webp')),
  'tags: ' + JSON.stringify(fm.tags || []),
  'pillar: ' + JSON.stringify(fm.pillar || s.pillar || ''),
  'seoMode: ' + JSON.stringify(fm.seoMode || s.seo_mode || 'hybrid'),
  'targetKeyword: ' + JSON.stringify(fm.targetKeyword || s.target_keyword || ''),
  'intentSummary: ' + JSON.stringify(fm.intentSummary || s.intent_summary || ''),
  'persona: ' + JSON.stringify(fm.persona || ''),
  'draft: false',
  '---',
  '',
  d.markdown || ''
].join('\\n');
return [{ json: { ...s, filePath, fileContent: yaml, imagePlan: d.imagePlan || [], branchName: 'article/' + slug + '-' + Date.now().toString(36), mainSha: $('Get main branch SHA').first().json.object.sha } }];`
    }
  }
});

const createBranch = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Create draft branch',
    parameters: {
      method: 'POST',
      url: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr(`={{ JSON.stringify({ ref: 'refs/heads/' + $json.branchName, sha: $json.mainSha }) }}`),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const commitFile = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Commit article file to branch',
    parameters: {
      method: 'PUT',
      url: expr(`=https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/{{ $json.filePath }}`),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr(`={{ JSON.stringify({ message: 'Add article: ' + $json.slug, branch: $json.branchName, content: Buffer.from($json.fileContent).toString('base64') }) }}`),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const openPR = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Open draft PR',
    parameters: {
      method: 'POST',
      url: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr(`={{ JSON.stringify({
        title: 'Draft: ' + $json.title,
        head: $json.branchName,
        base: '${REPO_BRANCH}',
        body: 'Automated draft from the CookTwo article writer.\\n\\n- Slug: ' + $json.slug + '\\n- Pillar: ' + ($json.pillar || '-') + '\\n- SEO mode: ' + $json.seo_mode + '\\n- Target keyword: ' + ($json.target_keyword || '-') + '\\n- Word count: ' + ($json.draft.markdown || '').split(/\\s+/).length + '\\n- Audit score: ' + ($json.audit?.totalScore || '-') + ' / 20\\n- Audit decision: ' + ($json.audit?.decision || '-') + '\\n\\nThe website-preview GitHub Action will deploy a real-site preview within ~2 minutes and post the URL on this PR.\\n\\nTo approve: comment \\`/approve\\` here, or merge the PR.\\nTo request changes: comment with your notes; the workflow picks them up and updates this same branch + preview.',
        draft: true
      }) }}`),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const extractPr = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract PR url + number',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const pr = $input.first().json;
return [{ json: { ...$('Finalize: build frontmatter + paths').first().json, pr_number: pr.number, pr_url: pr.html_url } }];`
    }
  }
});

const savePr = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save PR to pr_tracker',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          slug: expr('{{ $json.slug }}'),
          pr_number: expr('{{ $json.pr_number }}'),
          pr_url: expr('{{ $json.pr_url }}'),
          branch: expr('{{ $json.branchName }}'),
          preview_url: '',
          state: 'open',
          last_comment_checked_at: expr("{{ $now.toISO() }}"),
          created_at: expr("{{ $now.toISO() }}")
        }
      }
    }
  }
});

const saveReady = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save to ready_queue',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: READY_QUEUE_TABLE },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          backlog_id: expr('{{ $json.slug }}'),
          slug: expr('{{ $json.slug }}'),
          type: expr('{{ $json.type }}'),
          route: expr('{{ $json.route }}'),
          title: expr('{{ $json.title }}'),
          markdown: expr('{{ $json.fileContent }}'),
          frontmatter_json: expr("={{ JSON.stringify($json.draft.frontmatter || {}) }}"),
          image_paths_json: expr("={{ JSON.stringify(($json.imagePlan || []).map(p => '/images/blog/' + $json.slug + '-' + p.id + '.webp')) }}"),
          branch: expr('{{ $json.branchName }}'),
          audit_passed: expr('{{ $json.audit.totalScore || 0 }}'),
          pr_url: expr('{{ $json.pr_url }}'),
          preview_url: '',
          created_at: expr("{{ $now.toISO() }}"),
          status: 'ready'
        }
      }
    }
  }
});

const markBacklogReady = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark backlog row ready',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: BACKLOG_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'ready' }
      }
    }
  }
});

const buildEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Resend email payload',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const s = $input.first().json;
const previewGuess = 'https://' + s.branchName.replace(/\\//g, '-') + '.couples-food-system-v3.pages.dev';
return [{ json: {
  ...s,
  email: {
    from: 'CookTwo articles <articles@cooktwo.com>',
    to: ['barry@cooktwo.com'],
    subject: 'New article ready for review: ' + s.title,
    html: '<p>Hi Barry,</p><p>A new article is ready for your review on a real-site preview deploy.</p><p><strong>' + s.title + '</strong></p><ul><li><a href="' + previewGuess + '">View on the real site (preview)</a> (deploys within ~2 minutes of PR open)</li><li><a href="' + s.pr_url + '">Open the PR (comment \\`/approve\\` to publish, or leave notes)</a></li></ul><p>Pillar: ' + (s.pillar || '-') + '<br/>SEO mode: ' + s.seo_mode + '<br/>Target keyword: ' + (s.target_keyword || '-') + '<br/>Audit score: ' + (s.audit?.totalScore || '-') + ' / 20</p><p>CookTwo article writer</p>'
  }
} }];`
    }
  }
});

const sendResend = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send Resend email',
    parameters: {
      method: 'POST',
      url: 'https://api.resend.com/emails',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr('={{ JSON.stringify($json.email) }}'),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpBearerAuth: newCredential('Resend - CookTwo') }
  }
});

// On audit failure: mark backlog row rejected and notify the user.
const markBacklogRejected = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark backlog row rejected (audit fail)',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: BACKLOG_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'rejected' }
      }
    }
  }
});

const buildFailureEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build audit-fail email',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const s = $input.first().json;
const issues = (s.audit && s.audit.issues) || [];
const issueText = issues.map(i => '<li><strong>Rule ' + i.rule + '</strong> (' + i.severity + '): ' + i.note + '</li>').join('');
return [{ json: {
  ...s,
  email: {
    from: 'CookTwo articles <articles@cooktwo.com>',
    to: ['barry@cooktwo.com'],
    subject: 'Article draft failed audit: ' + s.title,
    html: '<p>Hi Barry,</p><p>The writer produced a draft for <strong>' + s.title + '</strong> but the auditor rejected it (score ' + (s.audit?.totalScore || 0) + ' / 20). The backlog row has been marked <code>rejected</code>; you can re-trigger generation by editing it in the data table or asking the workflow to retry.</p><p>Issues found:</p><ul>' + issueText + '</ul><p>Backlog id: ' + s.slug + '</p>'
  }
} }];`
    }
  }
});

const sendFailureEmail = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send audit-fail email',
    parameters: {
      method: 'POST',
      url: 'https://api.resend.com/emails',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr('={{ JSON.stringify($json.email) }}'),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpBearerAuth: newCredential('Resend - CookTwo') }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
//  WORKFLOW
// ──────────────────────────────────────────────────────────────────────────────

export default workflow('cooktwo-content-gen', 'CookTwo: Content Generation')
  .add(triggerSchedule)
  .to(fetchPlan)
  .to(decodePlan)
  .to(getMainSha)
  .to(buildPlannerBody)
  .to(callPlanner)
  .to(parsePlan)
  .to(buildWriterBody)
  .to(callWriter)
  .to(parseDraft)
  .to(buildAuditorBody)
  .to(callAuditor)
  .to(parseAudit)
  .to(auditGate
    .onTrue(
      finalizeBuild
        .to(createBranch)
        .to(commitFile)
        .to(openPR)
        .to(extractPr)
        .to(savePr)
        .to(saveReady)
        .to(markBacklogReady)
        .to(buildEmail)
        .to(sendResend)
    )
    .onFalse(
      markBacklogRejected
        .to(buildFailureEmail)
        .to(sendFailureEmail)
    )
  );
