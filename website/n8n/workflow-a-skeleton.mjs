// CookTwo — Workflow A: Content Generation (validation excerpt)
// The full prompts and body templates live in website/n8n/prompts.mjs and VOICE_RULES.md.
// This file is the workflow skeleton used to validate against the n8n Workflow SDK.

import { workflow, trigger, node, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const REPO_OWNER = 'barrycumbie';
const REPO_NAME = 'cfs-routing-worker';
const REPO_BRANCH = 'main';
const BACKLOG_TABLE = 'P8CiAroqSUlutB01';
const READY_QUEUE_TABLE = '1NFhfpyBJ0xMZcHQ';
const PR_TRACKER_TABLE = '2Sy54R6kB9Tf3Nds';
const WRITER_MODEL = 'nousresearch/hermes-3-llama-3.1-405b:free';
const AUDITOR_MODEL = 'google/gemma-4-26b-a4b-it:free';

const triggerSchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Every 6 hours', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } } }
});

const fetchPlan = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Fetch plan JSON from GitHub', parameters: { method: 'GET', url: 'https://api.github.com/repos/x/y/contents/plan.json' } }
});

const loadPlan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Parse plan', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: 'return $input.all();' } }
});

const getPending = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Get pending backlog rows', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: BACKLOG_TABLE }, returnAll: false, limit: 1 } }
});

const getMainSha = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Get main branch SHA', parameters: { method: 'GET', url: 'https://api.github.com/repos/x/y/git/ref/heads/main' } }
});

export default workflow('cooktwo-content-gen', 'CookTwo: Content Generation')
  .add(triggerSchedule)
  .to(fetchPlan)
  .to(loadPlan)
  .to(getPending)
  .to(getMainSha);
