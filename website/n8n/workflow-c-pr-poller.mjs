// CookTwo — Workflow C: PR Comment Poller
//
// Triggered every 15 minutes. For each open PR in pr_tracker, fetches new comments since
// the last check, and:
//   - if a comment contains "/approve" (case-insensitive), marks the ready_queue row as
//     'approved' and the pr_tracker row as 'approved'
//   - if any other substantive comment is found, marks the pr_tracker row as
//     'changes_requested' (which the writer loop would pick up on the next run, or the
//     user can re-trigger via the workflow manually)
//
// Credentials expected:
//   - "GitHub - CookTwo"

import { workflow, trigger, node, expr, newCredential } from '@n8n/workflow-sdk';

const REPO_OWNER = 'BazzaGee';
const REPO_NAME = 'CookTwo-Website';
const READY_QUEUE_TABLE = '1NFhfpyBJ0xMZcHQ';
const PR_TRACKER_TABLE = '2Sy54R6kB9Tf3Nds';

const triggerSchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Every 15 minutes', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } }
});

const listOpenPrs = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'List open PRs',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'state', condition: 'eq', keyValue: 'open' }] },
      returnAll: true
    }
  }
});

const fetchPrComments = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch PR comments',
    parameters: {
      method: 'GET',
      url: expr('=https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/issues/{{ $json.pr_number }}/comments?per_page=50'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const analyzeComments = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Analyze comments for /approve or change requests',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const pr = $('List open PRs').all().find(r => r.json.pr_number === String($json[0]?.pr_number)) || { json: $('List open PRs').first().json };\nconst comments = $input.first().json || [];\nconst lastChecked = new Date(pr.json.last_comment_checked_at || 0).getTime();\nconst newComments = comments.filter(c => new Date(c.created_at).getTime() > lastChecked);\nconst hasApprove = newComments.some(c => /\\/approve/i.test(c.body || ''));\nconst hasChanges = newComments.some(c => c.body && c.body.trim().length > 0 && !/\\/approve/i.test(c.body));\nreturn [{ json: { ...pr.json, newComments: newComments.length, hasApprove, hasChanges, lastCheckedAt: new Date().toISOString() } }];"
    }
  }
});

const markApproved = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark ready_queue approved',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: READY_QUEUE_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'approved' } }
    }
  }
});

const markPrApproved = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark PR approved in pr_tracker',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'pr_number', condition: 'eq', keyValue: expr('{{ $json.pr_number }}') }] },
      columns: { mappingMode: 'defineBelow', value: { state: 'approved', last_comment_checked_at: expr("{{ $now.toISO() }}") } }
    }
  }
});

const markChanges = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark PR changes_requested in pr_tracker',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'pr_number', condition: 'eq', keyValue: expr('{{ $json.pr_number }}') }] },
      columns: { mappingMode: 'defineBelow', value: { state: 'changes_requested', last_comment_checked_at: expr("{{ $now.toISO() }}") } }
    }
  }
});

const markReadyRejected = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark ready_queue rejected (changes requested)',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: READY_QUEUE_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'rejected' } }
    }
  }
});

const updateLastChecked = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Update last_comment_checked_at',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'pr_number', condition: 'eq', keyValue: expr('{{ $json.pr_number }}') }] },
      columns: { mappingMode: 'defineBelow', value: { last_comment_checked_at: expr("{{ $now.toISO() }}") } }
    }
  }
});

export default workflow('cooktwo-pr-poller', 'CookTwo: PR Comment Poller')
  .add(triggerSchedule)
  .to(listOpenPrs)
  .to(fetchPrComments)
  .to(analyzeComments)
  .to(updateLastChecked); // (no-op if no new comments)
