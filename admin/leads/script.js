import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const config = window.FENNINGTON_FIREBASE_CONFIG || {};
const hasConfig = config.apiKey && !String(config.apiKey).startsWith("REPLACE_");
const setupWarning = document.getElementById('setupWarning');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');
const userEmail = document.getElementById('userEmail');
const refreshButton = document.getElementById('refreshButton');
const dryRunButton = document.getElementById('dryRunButton');
const leadRows = document.getElementById('leadRows');
const leadDetail = document.getElementById('leadDetail');
const loadStatus = document.getElementById('loadStatus');

let auth;
let currentUser = null;
let leads = [];

if (!hasConfig) {
  setupWarning.hidden = false;
  signInButton.disabled = true;
  refreshButton.disabled = true;
  dryRunButton.disabled = true;
} else {
  const app = initializeApp(config);
  auth = getAuth(app);
  const provider = new GoogleAuthProvider();

  signInButton.addEventListener('click', () => signInWithPopup(auth, provider));
  signOutButton.addEventListener('click', () => signOut(auth));
  refreshButton.addEventListener('click', loadLeads);
  dryRunButton.addEventListener('click', runDryDiscovery);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    signInButton.hidden = Boolean(user);
    signOutButton.hidden = !user;
    userEmail.textContent = user?.email || 'Not signed in';
    refreshButton.disabled = !user;
    dryRunButton.disabled = !user;
    if (user) loadLeads();
    else clearLeads();
  });
}

async function apiFetch(path, options = {}) {
  if (!currentUser) throw new Error('Sign in required.');
  const token = await currentUser.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}.`);
  return body;
}

function clearLeads() {
  leads = [];
  leadRows.innerHTML = '';
  leadDetail.textContent = 'Select a lead.';
  loadStatus.textContent = 'Sign in to load leads.';
  updateStats();
}

async function loadLeads() {
  try {
    loadStatus.textContent = 'Loading leads...';
    const market = document.getElementById('marketFilter').value.trim();
    const trade = document.getElementById('tradeFilter').value.trim();
    const status = document.getElementById('statusFilter').value;
    const params = new URLSearchParams({ limit: '75' });
    if (market) params.set('market', market);
    if (trade) params.set('trade', trade);
    if (status) params.set('status', status);
    const body = await apiFetch(`/api/admin/leads?${params.toString()}`);
    leads = body.leads || [];
    renderRows();
    updateStats();
    loadStatus.textContent = `${leads.length} leads loaded.`;
  } catch (error) {
    loadStatus.textContent = error.message;
  }
}

function renderRows() {
  leadRows.innerHTML = '';
  leads.forEach((lead) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(lead.businessName || 'Unknown')}</strong><br><span class="muted">${escapeHtml(lead.phone || '')}</span></td>
      <td>${Number(lead.rating || 0).toFixed(1)}</td>
      <td>${Number(lead.reviewCount || 0)}</td>
      <td>${renderFlags(lead.websiteAudit?.flags)}</td>
      <td>${lead.emailDiscovery?.email ? escapeHtml(lead.emailDiscovery.email) : '<span class="muted">None</span>'}</td>
      <td><span class="pill">${escapeHtml(lead.outreachStatus || 'unknown')}</span></td>
      <td>${lead.slug ? `<a href="/preview/${encodeURIComponent(lead.slug)}" target="_blank" rel="noreferrer">Preview</a>` : ''}</td>
    `;
    tr.addEventListener('click', () => loadLeadDetail(lead.id));
    leadRows.appendChild(tr);
  });
}

function renderFlags(flags = []) {
  if (!Array.isArray(flags) || flags.length === 0) return '<span class="muted">None</span>';
  return flags.map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`).join('');
}

function updateStats() {
  document.getElementById('newCount').textContent = leads.length;
  document.getElementById('emailReadyCount').textContent = leads.filter((lead) => lead.outreachStatus === 'email_ready').length;
  document.getElementById('approvedCount').textContent = leads.filter((lead) => lead.outreachStatus === 'approved').length;
  document.getElementById('sentCount').textContent = leads.filter((lead) => lead.outreachStatus === 'sent').length;
}

async function loadLeadDetail(leadId) {
  try {
    leadDetail.innerHTML = '<p class="muted">Loading detail...</p>';
    const body = await apiFetch(`/api/admin/leads/${encodeURIComponent(leadId)}`);
    const lead = body.lead;
    const site = body.site;
    const latestMessage = (body.outreach || [])[0];
    leadDetail.innerHTML = `
      <h3>${escapeHtml(lead.businessName || 'Unknown')}</h3>
      <p><span class="pill">${escapeHtml(lead.outreachStatus || 'unknown')}</span></p>
      <p><strong>Rating:</strong> ${Number(lead.rating || 0).toFixed(1)} from ${Number(lead.reviewCount || 0)} reviews</p>
      <p><strong>Phone:</strong> ${escapeHtml(lead.phone || 'Not available')}</p>
      <p><strong>Address:</strong> ${escapeHtml(lead.formattedAddress || 'Not available')}</p>
      <p><strong>Website:</strong> ${lead.websiteUri ? `<a href="${escapeAttr(lead.websiteUri)}" target="_blank" rel="noreferrer">${escapeHtml(lead.websiteUri)}</a>` : 'None'}</p>
      <p><strong>Email:</strong> ${escapeHtml(lead.emailDiscovery?.email || 'Not discovered')}</p>
      <p><strong>Preview:</strong> ${site?.previewPath ? `<a href="${escapeAttr(site.previewPath)}" target="_blank">${escapeHtml(site.previewPath)}</a>` : 'Not generated'}</p>
      <div class="row-actions">
        <button class="button primary" data-action="approve">Approve email</button>
        <button class="button secondary" data-action="send" ${latestMessage?.status === 'approved' ? '' : 'disabled'}>Send approved</button>
        <button class="button secondary" data-action="call">Mark call task</button>
        <button class="button secondary" data-action="audit">Rerun audit</button>
        <button class="button secondary" data-action="preview">Regenerate preview</button>
        <button class="button danger" data-action="reject">Reject</button>
      </div>
      <div class="detail-block"><h3>Qualification</h3><pre>${escapeHtml(JSON.stringify(lead.qualification || {}, null, 2))}</pre></div>
      <div class="detail-block"><h3>Website Audit</h3><pre>${escapeHtml(JSON.stringify(lead.websiteAudit || {}, null, 2))}</pre></div>
      <div class="detail-block"><h3>Latest Outreach</h3><pre>${escapeHtml(JSON.stringify(latestMessage || {}, null, 2))}</pre></div>
    `;
    leadDetail.querySelector('[data-action="approve"]').addEventListener('click', () => approveOutreach(lead));
    leadDetail.querySelector('[data-action="send"]').addEventListener('click', () => sendApproved(latestMessage?.id));
    leadDetail.querySelector('[data-action="call"]').addEventListener('click', () => simpleLeadAction(lead.id, 'call-task'));
    leadDetail.querySelector('[data-action="audit"]').addEventListener('click', () => simpleLeadAction(lead.id, 'rerun-audit'));
    leadDetail.querySelector('[data-action="preview"]').addEventListener('click', () => simpleLeadAction(lead.id, 'regenerate-preview'));
    leadDetail.querySelector('[data-action="reject"]').addEventListener('click', () => simpleLeadAction(lead.id, 'reject'));
  } catch (error) {
    leadDetail.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

async function approveOutreach(lead) {
  const email = window.prompt('Approve outreach to this email:', lead.emailDiscovery?.email || '');
  if (!email) return;
  const subject = window.prompt('Subject:', `I made a quick website preview for ${lead.businessName}`);
  if (!subject) return;
  await apiFetch(`/api/admin/leads/${encodeURIComponent(lead.id)}/approve-outreach`, {
    method: 'POST',
    body: JSON.stringify({ toEmail: email, subject, variant: 'B' })
  });
  await loadLeadDetail(lead.id);
  await loadLeads();
}

async function sendApproved(messageId) {
  if (!messageId) return;
  await apiFetch(`/api/admin/outreach/${encodeURIComponent(messageId)}/send`, { method: 'POST', body: '{}' });
  await loadLeads();
}

async function simpleLeadAction(leadId, action) {
  await apiFetch(`/api/admin/leads/${encodeURIComponent(leadId)}/${action}`, { method: 'POST', body: '{}' });
  await loadLeadDetail(leadId);
  await loadLeads();
}

async function runDryDiscovery() {
  try {
    dryRunButton.disabled = true;
    dryRunButton.textContent = 'Running dry-run...';
    const body = await apiFetch('/api/admin/jobs/discover-nashville-hvac', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true, cap: 3 })
    });
    loadStatus.textContent = `Dry-run complete. ${JSON.stringify(body.counters)}`;
  } catch (error) {
    loadStatus.textContent = error.message;
  } finally {
    dryRunButton.disabled = !currentUser;
    dryRunButton.textContent = 'Dry-run discovery';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
