'use strict';

/**
 * Citadel Command Center — vanilla JS single-page app. No framework, no
 * build step (see apps/dashboard's package.json): this file is served
 * as-is. Hash-based routing (#/section/:id) so the Express side stays a
 * plain static file server with one /config.js route — see server.ts.
 *
 * Every render function fetches fresh from apps/api's /dashboard/* JSON
 * API and renders exactly what came back — no client-side fabrication of
 * counts, statuses, or content.
 */

const API_BASE = window.CITADEL_API_BASE || 'http://localhost:3000';
const root = document.getElementById('view-root');
const tabs = document.getElementById('tabs');

const ACTOR_KEY = 'citadel.dashboard.actorName';

function getActorName() {
  return localStorage.getItem(ACTOR_KEY) || '';
}
function setActorName(name) {
  localStorage.setItem(ACTOR_KEY, name);
}

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

const STATUS_BADGE_KIND = {
  DRAFT: 'neutral',
  REVIEW: 'warn',
  REVISION_REQUIRED: 'warn',
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  REJECTED: 'danger',
  FAILED: 'danger',
  UNRESPONDED: 'neutral',
  CONFIGURED: 'ok',
  AVAILABLE: 'ok',
  NOT_CONFIGURED: 'warn',
  ERROR: 'danger',
};

function badge(status) {
  const kind = STATUS_BADGE_KIND[status] || 'neutral';
  return `<span class="badge badge-${kind}">${esc(status)}</span>`;
}

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-actor-label': getActorName() || 'Dashboard staff',
      ...(options && options.headers),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_err) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error && body.error.message) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.code = body && body.error && body.error.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

function notice(kind, message) {
  return `<div class="notice notice-${kind}">${esc(message)}</div>`;
}

function panel(innerHtml) {
  return `<div class="panel">${innerHtml}</div>`;
}

// --- Router -----------------------------------------------------------------

const routes = [
  { pattern: /^#\/overview$/, handler: renderOverview, tab: 'overview' },
  { pattern: /^#\/clients$/, handler: renderClients, tab: 'clients' },
  { pattern: /^#\/clients\/([^/]+)$/, handler: renderClientDetail, tab: 'clients' },
  { pattern: /^#\/approvals$/, handler: () => renderContentList({ isApprovalsView: true }), tab: 'approvals' },
  { pattern: /^#\/content$/, handler: () => renderContentList({ isApprovalsView: false }), tab: 'content' },
  { pattern: /^#\/content\/([^/]+)$/, handler: renderContentDetail, tab: null },
  { pattern: /^#\/seo$/, handler: renderSeoList, tab: 'seo' },
  { pattern: /^#\/seo\/([^/]+)$/, handler: renderSeoDetail, tab: 'seo' },
  { pattern: /^#\/website$/, handler: renderWebsiteAuditList, tab: 'website' },
  { pattern: /^#\/website\/([^/]+)$/, handler: renderWebsiteAuditDetail, tab: 'website' },
  { pattern: /^#\/reviews$/, handler: renderReviewsList, tab: 'reviews' },
  { pattern: /^#\/reviews\/([^/]+)$/, handler: renderReviewDetail, tab: 'reviews' },
  { pattern: /^#\/activity$/, handler: renderActivity, tab: 'activity' },
  { pattern: /^#\/system$/, handler: renderSystem, tab: 'system' },
];

function setActiveTab(name) {
  for (const a of tabs.querySelectorAll('a')) {
    a.classList.toggle('active', a.dataset.tab === name);
  }
}

/**
 * Query params live inside the hash fragment (#/reviews?status=DRAFT), not
 * window.location.search — this app never touches the real query string,
 * so routes read filters from here instead.
 */
function currentQueryParams() {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  return new URLSearchParams(queryIndex === -1 ? '' : hash.slice(queryIndex + 1));
}

async function router() {
  const fullHash = window.location.hash || '#/overview';
  const hash = fullHash.split('?')[0];
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      setActiveTab(route.tab);
      root.innerHTML = '<p class="muted">Loading…</p>';
      try {
        await route.handler(...match.slice(1));
      } catch (err) {
        root.innerHTML = notice('error', err.message || 'Something went wrong.');
      }
      return;
    }
  }
  window.location.hash = '#/overview';
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// --- Overview -----------------------------------------------------------------

async function renderOverview() {
  const data = await api('/dashboard/overview');
  const c = data.counts;
  root.innerHTML = `
    <h1>Overview</h1>
    <div class="cards">
      <div class="card"><div class="count">${c.clients}</div><div class="label">Clients</div></div>
      <div class="card"><div class="count">${c.pendingApprovals}</div><div class="label">Pending Approvals</div></div>
      <div class="card"><div class="count">${c.draftContent}</div><div class="label">Draft Content</div></div>
      <div class="card"><div class="count">${c.revisionRequiredContent}</div><div class="label">Revision Required</div></div>
    </div>

    <h2>Recent AI Activity</h2>
    ${panel(renderActivityTable(data.recentActivity))}

    <h2>Recent SEO Audits</h2>
    ${panel(renderSeoTable(data.recentSeoAudits))}

    <h2>Recent Website Audits</h2>
    ${panel(renderWebsiteAuditTable(data.recentWebsiteAudits))}

    <h2>Recent Reviews</h2>
    ${panel(renderReviewsTable(data.recentReviews))}
  `;
  wireClickableRows();
}

function renderActivityTable(entries) {
  if (!entries || entries.length === 0) return '<p class="muted">No AI activity yet.</p>';
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${fmtDate(e.createdAt)}</td>
        <td>${esc(e.agent)}</td>
        <td>${esc(e.task)}</td>
        <td>${e.success ? '<span class="badge badge-ok">SUCCESS</span>' : '<span class="badge badge-danger">FAILED</span>'}</td>
        <td>${e.executionTimeMs} ms</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Agent</th><th>Task</th><th>Result</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// --- Clients --------------------------------------------------------------------

async function renderClients() {
  const data = await api('/dashboard/clients');
  const rows = data.clients
    .map(
      (c) => `
      <tr class="clickable" data-href="#/clients/${esc(c.id)}">
        <td>${esc(c.companyName)}</td>
        <td>${esc(c.slug)}</td>
        <td>${esc(c.industry || '—')}</td>
        <td>${badge(c.status)}</td>
        <td>${fmtDate(c.createdAt)}</td>
      </tr>`,
    )
    .join('');
  root.innerHTML = `
    <h1>Clients</h1>
    ${
      data.clients.length === 0
        ? notice('warn', 'No clients yet.')
        : panel(
            `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Slug</th><th>Industry</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`,
          )
    }
  `;
  wireClickableRows();
}

async function renderClientDetail(clientId) {
  const data = await api(`/dashboard/clients/${encodeURIComponent(clientId)}`);
  const ctx = data.client;
  const core = ctx.core;

  const servicesHtml = ctx.services.length
    ? `<ul>${ctx.services.map((s) => `<li>${esc(s.serviceName)}${s.active ? '' : ' <span class="badge badge-neutral">inactive</span>'}</li>`).join('')}</ul>`
    : '<p class="muted">No services on file.</p>';

  const areasHtml = ctx.serviceAreas.length
    ? `<div class="pill-list">${ctx.serviceAreas.map((a) => `<span class="badge badge-neutral">${esc(a.name)}</span>`).join('')}</div>`
    : '<p class="muted">No service areas on file.</p>';

  const offersHtml = ctx.offers.length
    ? `<ul>${ctx.offers.map((o) => `<li><strong>${esc(o.offerName)}</strong> — ${esc(o.description || '')}${o.active ? '' : ' <span class="badge badge-neutral">inactive</span>'}</li>`).join('')}</ul>`
    : '<p class="muted">No offers on file.</p>';

  const faqsHtml = ctx.faqs.length
    ? `<dl>${ctx.faqs.map((f) => `<dt><strong>${esc(f.question)}</strong></dt><dd>${esc(f.answer)}</dd>`).join('')}</dl>`
    : '<p class="muted">No FAQs on file.</p>';

  const notesHtml = ctx.marketingNotes.length
    ? `<ul>${ctx.marketingNotes.map((n) => `<li>${esc(n.note)} <span class="muted">(${esc(n.category || 'general')})</span></li>`).join('')}</ul>`
    : '<p class="muted">No marketing notes on file.</p>';

  const brand = ctx.brandProfile;
  const brandHtml = brand
    ? `<dl class="kv">
        <dt>Voice</dt><dd>${esc(brand.brandVoice || '—')}</dd>
        <dt>Tone</dt><dd>${esc(brand.tone || '—')}</dd>
        <dt>Preferred phrases</dt><dd>${(brand.preferredPhrases || []).map(esc).join(', ') || '—'}</dd>
        <dt>Forbidden phrases</dt><dd>${(brand.forbiddenPhrases || []).map(esc).join(', ') || '—'}</dd>
        <dt>Emoji policy</dt><dd>${esc(brand.emojiPolicy || '—')}</dd>
      </dl>`
    : '<p class="muted">No brand profile on file.</p>';

  const seo = ctx.seoProfile;
  const seoHtml = seo
    ? `<dl class="kv">
        <dt>Primary keywords</dt><dd>${(seo.primaryKeywords || []).map(esc).join(', ') || '—'}</dd>
        <dt>Secondary keywords</dt><dd>${(seo.secondaryKeywords || []).map(esc).join(', ') || '—'}</dd>
        <dt>Target locations</dt><dd>${(seo.targetLocations || []).map(esc).join(', ') || '—'}</dd>
        <dt>Competitors</dt><dd>${(seo.competitors || []).map(esc).join(', ') || '—'}</dd>
      </dl>`
    : '<p class="muted">No SEO profile on file.</p>';

  const audience = ctx.targetAudience;
  const audienceHtml = audience
    ? `<dl class="kv">
        <dt>Primary customer</dt><dd>${esc(audience.primaryCustomer || '—')}</dd>
        <dt>Problems</dt><dd>${(audience.customerProblems || []).map(esc).join(', ') || '—'}</dd>
        <dt>Motivations</dt><dd>${(audience.buyingMotivations || []).map(esc).join(', ') || '—'}</dd>
      </dl>`
    : '<p class="muted">No target audience on file.</p>';

  const recentContentHtml = ctx.recentContent.length
    ? `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Platform</th><th>Status</th><th>Created</th></tr></thead><tbody>${ctx.recentContent
        .map(
          (item) =>
            `<tr class="clickable" data-href="#/content/${esc(item.id)}"><td>${esc(item.type)}</td><td>${esc(item.platform || '—')}</td><td>${badge(item.status)}</td><td>${fmtDate(item.createdAt)}</td></tr>`,
        )
        .join('')}</tbody></table></div>`
    : '<p class="muted">No content generated yet.</p>';

  root.innerHTML = `
    <a class="back-link" href="#/clients">&larr; All clients</a>
    <h1>${esc(core.companyName)}</h1>
    ${panel(`<dl class="kv">
      <dt>Slug</dt><dd>${esc(core.slug)}</dd>
      <dt>Status</dt><dd>${badge(core.status)}</dd>
      <dt>Industry</dt><dd>${esc(core.industry || '—')}</dd>
      <dt>Website</dt><dd>${esc(core.website || '—')}</dd>
      <dt>Phone</dt><dd>${esc(core.phone || '—')}</dd>
      <dt>Email</dt><dd>${esc(core.email || '—')}</dd>
      <dt>Location</dt><dd>${esc([core.city, core.state].filter(Boolean).join(', ') || '—')}</dd>
    </dl>`)}

    <h2>Services</h2>${panel(servicesHtml)}
    <h2>Service Areas</h2>${panel(areasHtml)}
    <h2>Brand Profile</h2>${panel(brandHtml)}
    <h2>SEO Profile</h2>${panel(seoHtml)}
    <h2>Target Audience</h2>${panel(audienceHtml)}
    <h2>Offers</h2>${panel(offersHtml)}
    <h2>FAQs</h2>${panel(faqsHtml)}
    <h2>Marketing Notes</h2>${panel(notesHtml)}
    <h2>Recent Content</h2>${panel(recentContentHtml)}
  `;
  wireClickableRows();
}

// --- Approvals / Content ---------------------------------------------------------

const CONTENT_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUIRED', 'FAILED'];

async function renderContentList({ isApprovalsView }) {
  const params = currentQueryParams();
  const statusParam = isApprovalsView ? params.get('status') || '' : params.get('status') || 'all';
  const query = statusParam ? `?status=${encodeURIComponent(statusParam)}` : '';
  const data = await api(`/dashboard/approvals${query}`);

  const title = isApprovalsView ? 'Approval Center' : 'Content';
  const description = isApprovalsView
    ? 'Content waiting on a human decision. Defaults to REVIEW and REVISION_REQUIRED.'
    : 'All AI-generated content across every client.';

  const statusOptions = CONTENT_STATUSES.map((s) => `<option value="${s}" ${statusParam === s ? 'selected' : ''}>${s}</option>`).join('');

  const rows = data.contentItems
    .map(
      (item) => `
      <tr class="clickable" data-href="#/content/${esc(item.id)}">
        <td>${esc(item.clientName || item.clientId)}</td>
        <td>${esc(item.type)}</td>
        <td>${esc(item.platform || '—')}</td>
        <td>${badge(item.status)}</td>
        <td>${fmtDate(item.createdAt)}</td>
        <td>${esc(item.agent)}</td>
        <td>${esc(truncate(item.preview, 80))}</td>
      </tr>`,
    )
    .join('');

  root.innerHTML = `
    <h1>${title}</h1>
    <p class="muted">${description}</p>
    <div class="toolbar">
      <label for="status-filter">Status</label>
      <select id="status-filter">
        <option value="" ${!params.get('status') ? 'selected' : ''}>${isApprovalsView ? 'Default (REVIEW + REVISION_REQUIRED)' : 'Select…'}</option>
        <option value="all" ${statusParam === 'all' ? 'selected' : ''}>All statuses</option>
        ${statusOptions}
      </select>
    </div>
    ${
      data.contentItems.length === 0
        ? notice('warn', 'Nothing here right now.')
        : panel(
            `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Type</th><th>Platform</th><th>Status</th><th>Created</th><th>Agent</th><th>Preview</th></tr></thead><tbody>${rows}</tbody></table></div>`,
          )
    }
  `;
  wireClickableRows();

  document.getElementById('status-filter').addEventListener('change', (e) => {
    const value = e.target.value;
    const base = isApprovalsView ? '#/approvals' : '#/content';
    window.location.hash = value ? `${base}?status=${encodeURIComponent(value)}` : base;
  });
}

async function renderContentDetail(contentId) {
  const data = await api(`/dashboard/content/${encodeURIComponent(contentId)}`);
  const item = data.contentItem;
  const client = data.client;

  const versionsRows = data.versions
    .map(
      (v, idx) => `
      <tr>
        <td>${data.versions.length - idx}</td>
        <td>${v.source === 'HUMAN_EDIT' ? '<span class="badge badge-warn">HUMAN EDIT</span>' : '<span class="badge badge-ok">AI GENERATED</span>'}</td>
        <td>${esc(v.editedBy)}</td>
        <td>${fmtDate(v.createdAt)}</td>
      </tr>`,
    )
    .join('');

  root.innerHTML = `
    <a class="back-link" href="#/approvals">&larr; Back</a>
    <h1>${esc(item.type)} for ${esc(client.companyName)}</h1>
    ${panel(`<dl class="kv">
      <dt>Status</dt><dd>${badge(item.status)}</dd>
      <dt>Platform</dt><dd>${esc(item.platform || '—')}</dd>
      <dt>Created</dt><dd>${fmtDate(item.createdAt)}</dd>
      <dt>Created by</dt><dd>${esc(item.createdBy)}</dd>
      <dt>Reviewer</dt><dd>${esc(item.reviewer || '—')}</dd>
      ${item.rejectionReason ? `<dt>Rejection / revision note</dt><dd>${esc(item.rejectionReason)}</dd>` : ''}
    </dl>`)}

    <h2>Current Content</h2>
    ${panel(`<pre class="body-preview">${esc(item.body)}</pre>`)}

    <h2>Actions</h2>
    ${panel(renderContentActions(item))}

    <h2>Edit</h2>
    ${panel(renderContentEditForm(item))}

    <h2>Version History</h2>
    ${panel(
      data.versions.length
        ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Source</th><th>Author</th><th>Timestamp</th></tr></thead><tbody>${versionsRows}</tbody></table></div>`
        : '<p class="muted">No versions recorded.</p>',
    )}
  `;

  wireContentActions(item);
}

function renderContentActions(item) {
  const actionable = ['DRAFT', 'REVIEW', 'REVISION_REQUIRED'].includes(item.status);
  const disabled = actionable ? '' : 'disabled';
  return `
    <div class="field">
      <label for="actor-name">Acting as</label>
      <input type="text" id="actor-name" value="${esc(getActorName())}" placeholder="Your name" />
    </div>
    <div class="field">
      <label for="action-reason">Reason (required for reject / request revision)</label>
      <input type="text" id="action-reason" placeholder="Why is this being rejected or sent back?" />
    </div>
    <div class="actions">
      <button class="primary" id="btn-approve" ${disabled}>Approve</button>
      <button class="danger" id="btn-reject" ${disabled}>Reject</button>
      <button id="btn-revision" ${disabled}>Request Revision</button>
    </div>
    ${disabled ? notice('warn', `Content in ${item.status} cannot be approved, rejected, or sent back from here.`) : ''}
  `;
}

function renderContentEditForm(item) {
  return `
    <div class="field">
      <label for="edit-body">Body</label>
      <textarea id="edit-body" rows="6">${esc(item.body)}</textarea>
    </div>
    <div class="actions">
      <button class="primary" id="btn-save-edit">Save Edit (new version)</button>
    </div>
  `;
}

function wireContentActions(item) {
  const actorInput = document.getElementById('actor-name');
  const reasonInput = document.getElementById('action-reason');

  function currentActor() {
    const name = actorInput.value.trim();
    if (name) setActorName(name);
    return name;
  }

  const approveBtn = document.getElementById('btn-approve');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      if (!reviewer) return alert('Enter your name first.');
      await runAction(approveBtn, () => api(`/dashboard/content/${item.id}/approve`, { method: 'POST', body: JSON.stringify({ reviewer }) }));
    });
  }

  const rejectBtn = document.getElementById('btn-reject');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      const reason = reasonInput.value.trim();
      if (!reviewer) return alert('Enter your name first.');
      if (!reason) return alert('A reason is required to reject.');
      await runAction(rejectBtn, () => api(`/dashboard/content/${item.id}/reject`, { method: 'POST', body: JSON.stringify({ reviewer, reason }) }));
    });
  }

  const revisionBtn = document.getElementById('btn-revision');
  if (revisionBtn) {
    revisionBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      const reason = reasonInput.value.trim();
      if (!reviewer) return alert('Enter your name first.');
      if (!reason) return alert('A reason is required to request revision.');
      await runAction(revisionBtn, () => api(`/dashboard/content/${item.id}/revision`, { method: 'POST', body: JSON.stringify({ reviewer, reason }) }));
    });
  }

  const saveEditBtn = document.getElementById('btn-save-edit');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
      const editedBy = currentActor();
      const body = document.getElementById('edit-body').value;
      if (!editedBy) return alert('Enter your name first.');
      if (!body.trim()) return alert('Body cannot be empty.');
      await runAction(saveEditBtn, () => api(`/dashboard/content/${item.id}/edit`, { method: 'POST', body: JSON.stringify({ body, editedBy }) }));
    });
  }

  async function runAction(button, fn) {
    button.disabled = true;
    try {
      await fn();
      await renderContentDetail(item.id);
    } catch (err) {
      root.insertAdjacentHTML('afterbegin', notice('error', err.message));
      button.disabled = false;
    }
  }
}

// --- SEO -----------------------------------------------------------------------

function renderSeoTable(audits) {
  if (!audits || audits.length === 0) return '<p class="muted">No SEO audits yet.</p>';
  const rows = audits
    .map(
      (a) => `
      <tr class="clickable" data-href="#/seo/${esc(a.id)}">
        <td>${esc(a.clientName || a.clientId)}</td>
        <td>${esc(a.url)}</td>
        <td>${a.overallScore}</td>
        <td>${fmtDate(a.createdAt)}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Client</th><th>URL</th><th>Score</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderSeoList() {
  const data = await api('/dashboard/seo');
  root.innerHTML = `
    <h1>SEO Audits</h1>
    ${data.seoAudits.length === 0 ? notice('warn', 'No SEO audits have been run yet.') : panel(renderSeoTable(data.seoAudits))}
  `;
  wireClickableRows();
}

function categoryPanel(name, category) {
  const issues = category.issues
    .map((i) => `<li><span class="badge badge-${i.severity === 'critical' ? 'danger' : i.severity === 'warning' ? 'warn' : 'neutral'}">${esc(i.severity)}</span> ${esc(i.message)}</li>`)
    .join('');
  return `<div class="panel"><strong>${esc(name)}</strong> — score ${category.score}/100
    ${category.issues.length ? `<ul>${issues}</ul>` : '<p class="muted">No issues found.</p>'}
  </div>`;
}

async function renderSeoDetail(auditId) {
  const data = await api(`/dashboard/seo/${encodeURIComponent(auditId)}`);
  const audit = data.seoAudit;
  const result = audit.result;

  const recsHtml = result.recommendations.length
    ? `<ul>${result.recommendations
        .map(
          (r) =>
            `<li><span class="badge badge-${r.priority === 'high' ? 'danger' : r.priority === 'medium' ? 'warn' : 'neutral'}">${esc(r.priority)}</span> <strong>${esc(r.title)}</strong> — ${esc(r.description)}</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">No recommendations.</p>';

  const evidenceHtml = result.evidence.length
    ? `<ul>${result.evidence.map((e) => `<li><code>${esc(e.id)}</code> (${esc(e.type)}) — ${esc(e.description)}</li>`).join('')}</ul>`
    : '<p class="muted">No evidence recorded.</p>';

  const keywordsHtml = result.keywordOpportunities.length
    ? `<div class="pill-list">${result.keywordOpportunities.map((k) => `<span class="badge badge-neutral">${esc(k)}</span>`).join('')}</div>`
    : '<p class="muted">No keyword opportunities identified.</p>';

  root.innerHTML = `
    <a class="back-link" href="#/seo">&larr; All SEO audits</a>
    <h1>SEO Audit — ${esc(data.client.companyName)}</h1>
    ${panel(`<dl class="kv">
      <dt>URL</dt><dd>${esc(audit.url)}</dd>
      <dt>Overall score</dt><dd>${audit.overallScore}/100</dd>
      <dt>Date</dt><dd>${fmtDate(audit.createdAt)}</dd>
      <dt>Model</dt><dd>${esc(audit.modelProvider)} / ${esc(audit.modelUsed)}</dd>
    </dl>`)}

    <h2>Categories</h2>
    ${categoryPanel('Technical', result.technical)}
    ${categoryPanel('On-Page', result.onPage)}
    ${categoryPanel('Local SEO', result.localSeo)}
    ${categoryPanel('Conversion', result.conversion)}

    <h2>Keyword Opportunities</h2>${panel(keywordsHtml)}
    <h2>Recommendations</h2>${panel(recsHtml)}
    <h2>Evidence</h2>${panel(evidenceHtml)}
  `;
}

// --- Website Audits (Phase 7) ----------------------------------------------------

function renderWebsiteAuditTable(audits) {
  if (!audits || audits.length === 0) return '<p class="muted">No website audits yet.</p>';
  const rows = audits
    .map(
      (a) => `
      <tr class="clickable" data-href="#/website/${esc(a.id)}">
        <td>${esc(a.clientName || a.clientId)}</td>
        <td>${esc(a.url)}</td>
        <td>${a.overallScore}</td>
        <td>${fmtDate(a.createdAt)}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Client</th><th>URL</th><th>Score</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderWebsiteAuditList() {
  const data = await api('/dashboard/website-audits');
  root.innerHTML = `
    <h1>Website Audits</h1>
    <p class="muted">Marketing effectiveness and conversion — how well each site turns visitors into customers. Distinct from SEO (search visibility).</p>
    ${data.websiteAudits.length === 0 ? notice('warn', 'No website audits have been run yet.') : panel(renderWebsiteAuditTable(data.websiteAudits))}
  `;
  wireClickableRows();
}

/**
 * strengths+issues categories (first impression, conversion, content) share
 * this rendering; customer journey and brand call it with the fields they
 * actually have. Brand's category object has no `strengths` key at all
 * (see shared/types/website-audit.ts's WebsiteBrandResultSchema) — checked
 * with `'strengths' in category` rather than truthiness, so an empty-but-
 * present strengths array (a real "nothing found" result) still renders
 * its heading, while Brand's genuinely absent field renders none at all.
 */
function websiteCategoryPanel(name, category, { issuesLabel = 'Issues', issuesField = 'issues' } = {}) {
  const hasStrengths = 'strengths' in category;
  const issues = category[issuesField] || [];
  const strengthsHtml = (category.strengths || []).length
    ? `<ul>${category.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '<p class="muted">None noted.</p>';
  const issuesHtml = issues.length ? `<ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="muted">None found.</p>';
  return `<div class="panel"><strong>${esc(name)}</strong> — score ${category.score}/100
    ${hasStrengths ? `<h3 class="panel-subhead">Strengths</h3>${strengthsHtml}` : ''}
    <h3 class="panel-subhead">${esc(issuesLabel)}</h3>${issuesHtml}
  </div>`;
}

function impactBadgeKind(impact) {
  if (impact === 'HIGH IMPACT') return 'danger';
  if (impact === 'MEDIUM IMPACT') return 'warn';
  return 'neutral';
}

async function renderWebsiteAuditDetail(auditId) {
  const data = await api(`/dashboard/website-audits/${encodeURIComponent(auditId)}`);
  const audit = data.websiteAudit;
  const result = audit.result;

  function recommendationList(recs) {
    if (!recs.length) return '<p class="muted">None.</p>';
    return `<ul>${recs
      .map(
        (r) => `<li>
          <span class="badge badge-${impactBadgeKind(r.impact)}">${esc(r.impact)}</span>
          <span class="badge badge-neutral">${esc(r.category)}</span>
          <span class="badge badge-neutral">effort: ${esc(r.effort)}</span>
          <strong>${esc(r.title)}</strong> — ${esc(r.description)}
        </li>`,
      )
      .join('')}</ul>`;
  }

  const evidenceHtml = result.evidence.length
    ? `<ul>${result.evidence.map((e) => `<li><code>${esc(e.id)}</code> (${esc(e.type)}) — ${esc(e.description)}</li>`).join('')}</ul>`
    : '<p class="muted">No evidence recorded.</p>';

  root.innerHTML = `
    <a class="back-link" href="#/website">&larr; All website audits</a>
    <h1>Website Audit — ${esc(data.client.companyName)}</h1>
    ${panel(`<dl class="kv">
      <dt>URL</dt><dd>${esc(audit.url)}</dd>
      <dt>Overall score</dt><dd>${audit.overallScore}/100</dd>
      <dt>Date</dt><dd>${fmtDate(audit.createdAt)}</dd>
      <dt>Model</dt><dd>${esc(audit.modelProvider)} / ${esc(audit.modelUsed)}</dd>
    </dl>`)}

    ${notice('warn', `Mobile: ${result.mobile.note}`)}

    <h2>Categories</h2>
    ${websiteCategoryPanel('First Impression', result.firstImpression)}
    ${websiteCategoryPanel('Conversion', result.conversion)}
    ${websiteCategoryPanel('Customer Journey', result.customerJourney, { issuesLabel: 'Friction Points', issuesField: 'frictionPoints' })}
    ${websiteCategoryPanel('Content', result.content)}
    ${websiteCategoryPanel('Brand', result.brand)}

    <h2>Quick Wins</h2>${panel(recommendationList(result.quickWins))}
    <h2>High-Impact Changes</h2>${panel(recommendationList(result.highImpactChanges))}
    <h2>All Recommendations</h2>${panel(recommendationList(result.priorityRecommendations))}
    <h2>Evidence</h2>${panel(evidenceHtml)}
  `;
}

// --- Reviews -------------------------------------------------------------------

function renderReviewsTable(reviews) {
  if (!reviews || reviews.length === 0) return '<p class="muted">No reviews yet.</p>';
  const rows = reviews
    .map(
      (r) => `
      <tr class="clickable" data-href="#/reviews/${esc(r.id)}">
        <td>${esc(r.clientName || r.clientId)}</td>
        <td>${esc(r.reviewerName || 'Anonymous')}</td>
        <td>${r.rating} / 5</td>
        <td>${badge(r.responseStatus)}</td>
        <td>${fmtDate(r.reviewDate)}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Reviewer</th><th>Rating</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const REVIEW_STATUSES = ['UNRESPONDED', 'DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUIRED'];

async function renderReviewsList() {
  const params = currentQueryParams();
  const statusParam = params.get('status') || '';
  const query = statusParam ? `?status=${encodeURIComponent(statusParam)}` : '';
  const data = await api(`/dashboard/reviews${query}`);

  const statusOptions = REVIEW_STATUSES.map((s) => `<option value="${s}" ${statusParam === s ? 'selected' : ''}>${s}</option>`).join('');

  root.innerHTML = `
    <h1>Reviews</h1>
    <div class="toolbar">
      <label for="review-status-filter">Status</label>
      <select id="review-status-filter">
        <option value="" ${!statusParam ? 'selected' : ''}>All statuses</option>
        ${statusOptions}
      </select>
    </div>
    ${data.reviews.length === 0 ? notice('warn', 'No reviews match this filter.') : panel(renderReviewsTable(data.reviews))}
  `;
  wireClickableRows();

  document.getElementById('review-status-filter').addEventListener('change', (e) => {
    const value = e.target.value;
    window.location.hash = value ? `#/reviews?status=${encodeURIComponent(value)}` : '#/reviews';
  });
}

async function renderReviewDetail(reviewId) {
  const data = await api(`/dashboard/reviews/${encodeURIComponent(reviewId)}`);
  const review = data.review;
  const client = data.client;
  const analysis = data.analysis;

  const versionsRows = data.versions
    .map(
      (v, idx) => `
      <tr>
        <td>${data.versions.length - idx}</td>
        <td>${v.source === 'HUMAN_EDIT' ? '<span class="badge badge-warn">HUMAN EDIT</span>' : '<span class="badge badge-ok">AI GENERATED</span>'}</td>
        <td>${esc(v.createdBy)}</td>
        <td>${v.qaPassed ? '<span class="badge badge-ok">QA PASS</span>' : '<span class="badge badge-danger">QA FAIL</span>'}</td>
        <td>${fmtDate(v.createdAt)}</td>
      </tr>`,
    )
    .join('');

  root.innerHTML = `
    <a class="back-link" href="#/reviews">&larr; All reviews</a>
    <h1>Review from ${esc(review.reviewerName || 'Anonymous')} — ${esc(client.companyName)}</h1>

    ${analysis.escalationNeeded ? notice('error', 'Escalation recommended — this review needs prompt human attention before responding.') : ''}

    ${panel(`<dl class="kv">
      <dt>Rating</dt><dd>${review.rating} / 5</dd>
      <dt>Source</dt><dd>${esc(review.source)}</dd>
      <dt>Date</dt><dd>${fmtDate(review.reviewDate)}</dd>
      <dt>Status</dt><dd>${badge(review.responseStatus)}</dd>
      <dt>Classification</dt><dd>${esc(analysis.classification)}</dd>
    </dl>`)}

    <h2>Original Review</h2>
    ${panel(`<pre class="body-preview">${esc(review.reviewText)}</pre>`)}

    <h2>Analysis</h2>
    ${panel(`
      <p><strong>Positive points:</strong> ${analysis.positivePoints.length ? analysis.positivePoints.map(esc).join('; ') : '—'}</p>
      <p><strong>Negative points:</strong> ${analysis.negativePoints.length ? analysis.negativePoints.map(esc).join('; ') : '—'}</p>
      <p><strong>Concerns:</strong> ${analysis.concerns.length ? analysis.concerns.map(esc).join('; ') : '—'}</p>
    `)}

    <h2>Current Response</h2>
    ${panel(review.responseText ? `<pre class="body-preview">${esc(review.responseText)}</pre>` : '<p class="muted">No response drafted yet.</p>')}

    <h2>Actions</h2>
    ${panel(renderReviewActions(review))}

    <h2>Edit Response</h2>
    ${panel(renderReviewEditForm(review))}

    <h2>Response Version History</h2>
    ${panel(
      data.versions.length
        ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Source</th><th>Author</th><th>QA</th><th>Timestamp</th></tr></thead><tbody>${versionsRows}</tbody></table></div>`
        : '<p class="muted">No response versions yet.</p>',
    )}
  `;

  wireReviewActions(review);
}

function renderReviewActions(review) {
  const disabled = review.responseStatus === 'DRAFT' ? '' : 'disabled';
  return `
    <div class="field">
      <label for="actor-name">Acting as</label>
      <input type="text" id="actor-name" value="${esc(getActorName())}" placeholder="Your name" />
    </div>
    <div class="field">
      <label for="action-reason">Reason (required for reject / request revision)</label>
      <input type="text" id="action-reason" placeholder="Why is this being rejected or sent back?" />
    </div>
    <div class="actions">
      <button class="primary" id="btn-approve" ${disabled}>Approve</button>
      <button class="danger" id="btn-reject" ${disabled}>Reject</button>
      <button id="btn-revision" ${disabled}>Request Revision</button>
    </div>
    ${disabled ? notice('warn', `A response must be in DRAFT to approve, reject, or send back (current: ${review.responseStatus}). Publishing is not available from this dashboard.`) : ''}
  `;
}

function renderReviewEditForm(review) {
  return `
    <div class="field">
      <label for="edit-response">Response text</label>
      <textarea id="edit-response" rows="4">${esc(review.responseText || '')}</textarea>
    </div>
    <div class="actions">
      <button class="primary" id="btn-save-edit">Save Edit (moves to DRAFT)</button>
    </div>
  `;
}

function wireReviewActions(review) {
  const actorInput = document.getElementById('actor-name');
  const reasonInput = document.getElementById('action-reason');

  function currentActor() {
    const name = actorInput.value.trim();
    if (name) setActorName(name);
    return name;
  }

  const approveBtn = document.getElementById('btn-approve');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      if (!reviewer) return alert('Enter your name first.');
      await runAction(approveBtn, () => api(`/dashboard/reviews/${review.id}/approve`, { method: 'POST', body: JSON.stringify({ reviewer }) }));
    });
  }
  const rejectBtn = document.getElementById('btn-reject');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      const reason = reasonInput.value.trim();
      if (!reviewer) return alert('Enter your name first.');
      if (!reason) return alert('A reason is required to reject.');
      await runAction(rejectBtn, () => api(`/dashboard/reviews/${review.id}/reject`, { method: 'POST', body: JSON.stringify({ reviewer, reason }) }));
    });
  }
  const revisionBtn = document.getElementById('btn-revision');
  if (revisionBtn) {
    revisionBtn.addEventListener('click', async () => {
      const reviewer = currentActor();
      const reason = reasonInput.value.trim();
      if (!reviewer) return alert('Enter your name first.');
      if (!reason) return alert('A reason is required to request revision.');
      await runAction(revisionBtn, () => api(`/dashboard/reviews/${review.id}/revision`, { method: 'POST', body: JSON.stringify({ reviewer, reason }) }));
    });
  }
  const saveEditBtn = document.getElementById('btn-save-edit');
  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', async () => {
      const editedBy = currentActor();
      const responseText = document.getElementById('edit-response').value;
      if (!editedBy) return alert('Enter your name first.');
      if (!responseText.trim()) return alert('Response text cannot be empty.');
      await runAction(saveEditBtn, () =>
        api(`/dashboard/reviews/${review.id}/edit`, { method: 'POST', body: JSON.stringify({ responseText, editedBy }) }),
      );
    });
  }

  async function runAction(button, fn) {
    button.disabled = true;
    try {
      await fn();
      await renderReviewDetail(review.id);
    } catch (err) {
      root.insertAdjacentHTML('afterbegin', notice('error', err.message));
      button.disabled = false;
    }
  }
}

// --- AI Activity -----------------------------------------------------------------

async function renderActivity() {
  const data = await api('/dashboard/activity?limit=100');
  root.innerHTML = `
    <h1>AI Activity</h1>
    <p class="muted">Every AI generation, SEO audit, and review task run by the platform — ids and outcomes only, never generated content or credentials.</p>
    ${data.activity.length === 0 ? notice('warn', 'No activity recorded yet.') : panel(renderFullActivityTable(data.activity))}
  `;
}

function renderFullActivityTable(entries) {
  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${fmtDate(e.createdAt)}</td>
        <td>${esc(e.clientId || '—')}</td>
        <td>${esc(e.agent)}</td>
        <td>${esc(e.task)}</td>
        <td>${e.success ? '<span class="badge badge-ok">SUCCESS</span>' : '<span class="badge badge-danger">FAILED</span>'}</td>
        <td>${e.executionTimeMs} ms</td>
        <td>${esc(e.errorCode || '—')}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Client</th><th>Agent</th><th>Task</th><th>Result</th><th>Duration</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// --- System -----------------------------------------------------------------------

async function renderSystem() {
  const data = await api('/dashboard/system');
  const rows = data.components
    .map(
      (c) => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${badge(c.status)}</td>
        <td>${esc(c.detail)}</td>
      </tr>`,
    )
    .join('');
  root.innerHTML = `
    <h1>System Status</h1>
    ${panel(`<div class="table-wrap"><table><thead><tr><th>Component</th><th>Status</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
  `;
}

// --- Shared helpers ----------------------------------------------------------------

function wireClickableRows() {
  root.querySelectorAll('tr.clickable[data-href]').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.hash = row.dataset.href;
    });
  });
}
