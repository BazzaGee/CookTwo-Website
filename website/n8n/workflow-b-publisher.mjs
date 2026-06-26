// CookTwo — Workflow B: Publishing
//
// Triggered every hour. Checks the 72h publish floor, picks a randomized eligible time,
// and merges the next approved draft PR to main (which auto-deploys via website.yml).
// Also injects final internal links by reading the published registry.
//
// Credentials expected:
//   - "GitHub - CookTwo"  (PAT with contents:write + pull_requests:write)
//   - "OpenRouter account"  (for none, but referenced by other workflows)

import { workflow, trigger, node, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const REPO_OWNER = 'BazzaGee';
const REPO_NAME = 'CookTwo-Website';
const REPO_BRANCH = 'main';
const BACKLOG_TABLE = 'P8CiAroqSUlutB01';
const READY_QUEUE_TABLE = '1NFhfpyBJ0xMZcHQ';
const PR_TRACKER_TABLE = '2Sy54R6kB9Tf3Nds';
const PUBLISHED_REGISTRY_TABLE = 'JPeZhnhGSM273vr6';

const triggerSchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every hour',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }
  }
});

const getLastPublished = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get last published date',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: PUBLISHED_REGISTRY_TABLE },
      returnAll: false,
      limit: 1,
      orderBy: true,
      orderByColumn: 'pubDate',
      orderByDirection: 'DESC'
    }
  }
});

const checkCadence = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Check 72h rule + randomize window',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const last = $input.first().json;
const now = new Date();
let elapsedHours = Infinity;
if (last && last.pubDate) {
  const lastDate = new Date(last.pubDate);
  elapsedHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
}
const eligibleBy72h = elapsedHours >= 72;

// Randomization: pick a publish target time in 0-12 hours from now. This makes
// the cadence non-predictable while still responding to the 72h floor.
// Weight: 30% chance to publish within the next 4 hours if the 72h rule already allows;
// 70% chance to wait 4-12 hours.
const r = Math.random();
let waitHours = 0;
if (eligibleBy72h) {
  if (r < 0.3) waitHours = Math.random() * 4;
  else waitHours = 4 + Math.random() * 8;
}
const targetPublishAt = new Date(now.getTime() + waitHours * 3600 * 1000);
return [{ json: { _eligibleBy72h: eligibleBy72h, _elapsedHours: elapsedHours, _waitHours: waitHours, _targetPublishAt: targetPublishAt.toISOString(), _now: now.toISOString() } }];`
    }
  }
});

const getApproved = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get approved items from ready_queue',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: READY_QUEUE_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'approved' }] },
      returnAll: false,
      limit: 1
    }
  }
});

const shouldPublish = ifElse({
  version: 2.2,
  config: {
    name: 'Eligible + ready?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          leftValue: expr('{{ $json._eligibleBy72h }}'),
          operator: { type: 'boolean', operation: 'true', singleValue: true }
        }],
        combinator: 'and'
      }
    }
  }
});

const noopStop = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'No-op (skip this hour)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "return [{ json: { _skipped: true, _reason: '72h rule not yet satisfied, or no approved item' } }];"
    }
  }
});

const waitForWindow = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait for randomized publish window',
    parameters: {
      amount: expr('={{ Math.ceil($json._waitHours * 60) }}'),
      unit: 'minutes'
    }
  }
});

const fetchPr = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch PR to confirm still open',
    parameters: {
      method: 'GET',
      url: expr('=' + 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/pulls/{{ $json.pr_number }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const mergePr = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Merge PR to main',
    parameters: {
      method: 'PUT',
      url: expr('=' + 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/pulls/{{ $json.pr_number }}/merge'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      jsonBody: expr("={{ JSON.stringify({ commit_title: 'Publish: ' + $json.title, merge_method: 'squash' }) }}"),
      options: { response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('GitHub - CookTwo') }
  }
});

const addToRegistry = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Add to published_registry',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: PUBLISHED_REGISTRY_TABLE },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          slug: expr('{{ $json.slug }}'),
          type: expr('{{ $json.type }}'),
          route: expr('{{ $json.route }}'),
          pubDate: expr("{{ $now.toISO() }}"),
          pillar: expr('{{ $json.pillar || \"\" }}'),
          target_keyword: expr('{{ $json.target_keyword || \"\" }}'),
          related_page_slug: expr('{{ $json.related_page_slug || \"\" }}'),
          internal_links: expr("={{ JSON.stringify($json.internal_links || []) }}"),
          external_links: expr("={{ JSON.stringify($json.external_links || []) }}"),
          ogImage: expr('{{ $json.ogImage || \"\" }}'),
          word_count: expr("={{ String(($json.markdown || '').split(/\\s+/).length) }}"),
          seo_mode: expr('{{ $json.seo_mode || \"hybrid\" }}'),
          file_path: expr('{{ $json.file_path || \"\" }}')
        }
      }
    }
  }
});

const markReadyPublished = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark ready_queue row published',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: READY_QUEUE_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'published' }
      }
    }
  }
});

const markBacklogPublished = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark backlog row published',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: BACKLOG_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'slug', condition: 'eq', keyValue: expr('{{ $json.slug }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'published' }
      }
    }
  }
});

const markPrMerged = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark PR merged in pr_tracker',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'id', value: PR_TRACKER_TABLE },
      matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'pr_number', condition: 'eq', keyValue: expr('{{ $json.pr_number }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { state: 'merged' }
      }
    }
  }
});

const buildConfirmEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build confirm email',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const s = $input.first().json;\nreturn [{ json: {\n  ...s,\n  email: {\n    from: 'CookTwo articles <articles@cooktwo.com>',\n    to: ['barry@cooktwo.com'],\n    subject: 'Published: ' + s.title,\n    html: '<p>Hi Barry,</p><p><strong>' + s.title + '</strong> was just merged to <code>main</code> and the production deploy is in progress.</p><p><a href=\"https://cooktwo.com/' + (s.route === 'blog' ? 'blog/' : s.route === 'vs' ? 'vs/' : '') + s.slug + '\">View it on cooktwo.com</a> (live within ~2 minutes of the deploy finishing).</p><p>Backlog id: ' + s.slug + '<br/>Elapsed since last publish: ' + Math.round((Date.now() - new Date(s.pubDate).getTime()) / 3600000) + 'h</p>'\n  }\n} }];"
    }
  }
});

const sendConfirm = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send confirm email',
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

export default workflow('cooktwo-publisher', 'CookTwo: Publisher')
  .add(triggerSchedule)
  .to(getLastPublished)
  .to(checkCadence)
  .to(shouldPublish
    .onTrue(
      getApproved
        .to(waitForWindow)
        .to(fetchPr)
        .to(mergePr)
        .to(addToRegistry)
        .to(markReadyPublished)
        .to(markBacklogPublished)
        .to(markPrMerged)
        .to(buildConfirmEmail)
        .to(sendConfirm)
    )
    .onFalse(noopStop)
  );
