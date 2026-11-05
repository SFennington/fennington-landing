// Ted's dashboard for T3 Inspections: calendar, manual bookings, blockouts, the ZIP map and settings.
// Plain ES module, no build step. Every request goes to /t3-inspections/admin/* with Ted's Google
// sign-in; the server decides who is allowed, nothing here is a security check.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

// Public web config of the fennington-financial project (the same one the other dashboards use).
const FIREBASE = {
  apiKey: 'AIzaSyBuXmBYaWTFTEAE2XxD6q5UU1xDepSBm_U',
  authDomain: 'fennington-financial.firebaseapp.com',
  projectId: 'fennington-financial',
  appId: '1:295520324508:web:c55c54552524fd88641659'
};

const host = window.location.hostname;
const local = ['localhost', '127.0.0.1'].includes(host);
const params = new URLSearchParams(window.location.search);
// Same rule as the booking page: a workers.dev address is the practice copy and uses test storage.
const PREVIEW = host.endsWith('.workers.dev') || (local && params.get('preview') === '1');
const API_ROOT = ((local && params.get('api')) || 'https://us-central1-fennington-financial.cloudfunctions.net/api').replace(/\/$/, '');
const ADMIN = `${API_ROOT}/t3-inspections/admin`;
const TZ = 'America/New_York';

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// ---------- dates and money (all New York time, as plain strings) ----------
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const pad = (n) => String(n).padStart(2, '0');
const monthOf = (date) => date.slice(0, 7);
function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
function addMonths(month, n) { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dateLabel = (date) => { const [y, m, d] = date.split('-').map(Number); return `${WEEKDAYS[weekday(date)]}, ${MONTHS[m - 1]} ${d}, ${y}`; };
const timeLabel = (t) => { const [hh, mm] = t.split(':').map(Number); return `${hh % 12 || 12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`; };
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const dollars = (cents) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
function parseMoney(text) {
  const t = String(text).replace(/[$,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

// ---------- talking to the server ----------
let auth;
async function api(path, { method = 'GET', body } = {}) {
  const token = await auth.currentUser.getIdToken();
  let url = `${ADMIN}${path}`;
  const headers = { authorization: `Bearer ${token}` };
  let payload;
  if (PREVIEW && method === 'GET') url += `${url.includes('?') ? '&' : '?'}preview=1`;
  if (PREVIEW && method === 'DELETE') url += `${url.includes('?') ? '&' : '?'}preview=1`;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(PREVIEW ? { ...body, preview: true, siteBase: window.location.origin } : body);
  } else if (PREVIEW && method !== 'GET' && method !== 'DELETE') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify({ preview: true, siteBase: window.location.origin });
  }
  let res;
  try { res = await fetch(url, { method, headers, body: payload }); } catch { throw Object.assign(new Error('Could not reach the server. Check your connection and try again.'), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, data });
  return data;
}

const state = { month: monthOf(todayStr()), selected: todayStr(), bookings: [], blockouts: [], boot: null };

// ---------- sign in ----------
function boot() {
  if (PREVIEW) { $('previewTag').hidden = false; $('previewNote').hidden = false; }
  const app = initializeApp(FIREBASE);
  auth = getAuth(app);
  const emu = local && params.get('authEmulator');
  if (emu) connectAuthEmulator(auth, emu, { disableWarnings: true });
  $('signIn').addEventListener('click', async () => {
    $('authMsg').textContent = '';
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) {
      $('authMsg').textContent = e.code === 'auth/unauthorized-domain' ? 'Google sign-in is not turned on for this web address yet.' : 'Sign-in did not finish. Please try again.';
      $('authMsg').className = 'msg bad';
    }
  });
  $('signOut').addEventListener('click', () => signOut(auth));
  onAuthStateChanged(auth, async (user) => {
    if (!user) { show(false); return; }
    try {
      const me = await api('/me');
      $('whoEmail').textContent = me.email;
      $('signOut').hidden = false;
      show(true);
      await start();
    } catch (e) {
      show(false);
      $('authMsg').className = 'msg bad';
      $('authMsg').textContent = e.status === 403 ? `${user.email} isn't allowed into this dashboard. Sign in with the T3 Inspections Google account.` : e.message;
      await signOut(auth);
    }
  });
}
function show(signedIn) {
  $('signedOut').hidden = signedIn;
  $('app').hidden = !signedIn;
  if (!signedIn) { $('whoEmail').textContent = ''; $('signOut').hidden = true; }
}
async function start() {
  state.boot = await api('/bootstrap');
  await loadMonth();
  renderCalendar();
  renderSettings();
}

// ---------- tabs ----------
$('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('button[data-tab]')?.dataset.tab;
  if (!tab) return;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  for (const name of ['calendar', 'map', 'settings']) $(`tab-${name}`).hidden = name !== tab;
  if (tab === 'map') initMap();
});

// ---------- calendar ----------
async function loadMonth() {
  const data = await api(`/calendar?month=${state.month}`);
  state.bookings = data.bookings;
  state.blockouts = data.blockouts;
}
const bookingsOn = (date) => state.bookings.filter((b) => b.date === date).sort((a, b) => a.time.localeCompare(b.time));
const blockoutsOn = (date) => state.blockouts.filter((b) => b.startDate <= date && date <= b.endDate);

// Each day square is split into its sessions (start times, top to bottom). A session with a booking is orange,
// a blocked one is grey, and a free one stays plain. A booking wins over a blockout on the same session.
function sessionsOn(date) { return state.boot.config.startTimes[weekday(date)] || []; }
function sessionStates(date) {
  const times = sessionsOn(date);
  const blocks = blockoutsOn(date);
  const booked = bookingsOn(date).filter((bk) => bk.status === 'confirmed');
  if (!times.length) return [booked.length ? 'b' : blocks.length ? 'k' : ''];
  const states = times.map(() => '');
  times.forEach((t, i) => {
    if (blocks.some((bl) => bl.allDay || (bl.startTime <= t && t < bl.endTime))) states[i] = 'k';
  });
  for (const bk of booked) {
    // A booking belongs to the last session that starts at or before it (or the first, if it is earlier than all of them).
    let i = 0;
    times.forEach((t, n) => { if (t <= bk.time) i = n; });
    states[i] = 'b';
  }
  return states;
}
const SHADE = { b: 'var(--booked)', k: 'var(--blocked)', '': 'transparent' };
function shadeStyle(states) {
  const n = states.length;
  const stops = states.map((s, i) => `${SHADE[s]} ${(i * 100) / n}% ${((i + 1) * 100) / n}%`);
  return `background-image: linear-gradient(to bottom, ${stops.join(', ')})`;
}

function renderCalendar() {
  const [y, m] = state.month.split('-').map(Number);
  $('monthTitle').textContent = `${MONTHS[m - 1]} ${y}`;
  const grid = clear($('grid'));
  const first = `${state.month}-01`;
  for (let i = 0; i < weekday(first); i++) grid.append(h('span', { class: 'cell out', 'aria-hidden': 'true' }));
  const today = todayStr();
  for (let date = first; monthOf(date) === state.month; date = addDays(date, 1)) {
    const live = bookingsOn(date).filter((bk) => bk.status === 'confirmed').length;
    const states = sessionStates(date);
    const any = states.some(Boolean);
    const same = any && states.every((s) => s === states[0]);
    const shadeClass = !any ? '' : same ? (states[0] === 'b' ? ' bk-full' : ' blk-full') : ' mixed';
    const blockedAll = same && states[0] === 'k';
    const label = `${dateLabel(date)}${live ? `, ${live} booking${live === 1 ? '' : 's'}` : ''}${blockedAll ? ', blocked all day' : states.includes('k') ? ', blocked' : ''}`;
    grid.append(h('button', {
      class: `cell${date === today ? ' today' : ''}${date === state.selected ? ' sel' : ''}${shadeClass}`, style: shadeClass === ' mixed' ? shadeStyle(states) : null, 'data-date': date, 'aria-label': label, 'aria-pressed': String(date === state.selected),
      onclick: () => { state.selected = date; renderCalendar(); }
    },
      h('span', { class: 'n', text: String(Number(date.slice(8))) }),
      live > 1 ? h('span', { class: 'dots', text: `${live} jobs` }) : null));
  }
  renderDay();
}

function renderDay() {
  const date = state.selected;
  $('dayTitle').textContent = dateLabel(date);
  const list = clear($('dayList'));
  const items = [];
  for (const b of blockoutsOn(date)) {
    items.push(h('li', {}, h('div', { class: 'item', 'data-blockout': b.id },
      h('span', { class: 't', text: b.allDay ? 'All day' : `${timeLabel(b.startTime)}–${timeLabel(b.endTime)}` }),
      h('span', { class: 'grow' }, h('b', { text: b.label || 'Blocked off' }), h('div', { class: 's', text: b.startDate === b.endDate ? 'One day' : `${dateLabel(b.startDate)} to ${dateLabel(b.endDate)}` })),
      h('button', { class: 'btn danger', onclick: () => removeBlockout(b) }, 'Remove'))));
  }
  for (const b of bookingsOn(date)) {
    items.push(h('li', {}, h('button', { class: `item${b.status === 'cancelled' ? ' cancelled' : ''}`, 'data-booking': b.id, onclick: () => openDetail(b.id) },
      h('span', { class: 't', text: timeLabel(b.time) }),
      h('span', { class: 'grow' }, h('b', { class: 'nm', text: b.name || '(no name)' }), h('div', { class: 's', text: [b.typeName.split(' - ')[0].split(' (')[0], b.town].filter(Boolean).join(' · ') })),
      b.status === 'cancelled' ? h('span', { class: 'pill warn', text: 'Cancelled' }) : b.paymentStatus === 'paid' ? h('span', { class: 'pill ok', text: 'Paid' }) : null)));
  }
  if (!items.length) list.append(h('li', { class: 'muted', text: 'Nothing on this day.' }));
  else list.append(...items);
}

$('prevMonth').addEventListener('click', () => changeMonth(-1));
$('nextMonth').addEventListener('click', () => changeMonth(1));
async function changeMonth(n) {
  state.month = addMonths(state.month, n);
  state.selected = `${state.month}-01`;
  try { await loadMonth(); } catch (e) { alert(e.message); }
  renderCalendar();
}
async function refresh(openDate) {
  if (openDate) { state.selected = openDate; state.month = monthOf(openDate); }
  await loadMonth();
  renderCalendar();
}
$('newBooking').addEventListener('click', () => openForm({ date: state.selected }));
$('newBlockout').addEventListener('click', () => openBlockoutForm());

// ---------- dialog plumbing ----------
const dlg = $('dlg');
function openDialog(title, ...body) {
  const form = clear($('dlgBody'));
  form.append(h('div', { class: 'dlg-head' }, h('h2', { text: title }), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')), ...body.flat().filter(Boolean));
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  return form;
}
$('dlgBody').addEventListener('submit', (e) => e.preventDefault());

const field = (label, input, extra) => h('label', { class: 'field' }, label, input, extra);
const textInput = (name, value = '', attrs = {}) => h('input', { name, value, autocomplete: 'off', ...attrs });
const select = (name, options, value) => h('select', { name }, options.map(([v, text]) => h('option', { value: v, text, selected: String(v) === String(value) })));

// ---------- blockouts ----------
function openBlockoutForm() {
  const start = textInput('startDate', state.selected, { type: 'date', required: true });
  const end = textInput('endDate', '', { type: 'date', 'aria-label': 'Last day' });
  const label = textInput('label', '', { maxlength: '80', placeholder: 'Vacation, dentist, ...' });
  const msg = h('p', { class: 'msg bad', role: 'alert' });
  const choices = h('div', { class: 'choices', role: 'group', 'aria-label': 'What to block' });
  const from = textInput('startTime', '09:00', { type: 'time' });
  const to = textInput('endTime', '17:00', { type: 'time' });
  const customTimes = h('div', { class: 'row2', hidden: true }, field('From', from), field('Until', to));
  let fullBox; let customBox; let sessionBoxes = [];
  const kept = new Set();
  let customOn = false;

  // Every session Ted offers on the chosen days, from his saved start times (so a 5:00 PM he adds in Settings shows up here).
  function sessionTimes() {
    const last = end.value && end.value >= start.value ? end.value : start.value;
    const days = new Set();
    for (let d = start.value, i = 0; d && d <= last && i < 7; d = addDays(d, 1), i++) days.add(weekday(d));
    return [...new Set([...days].flatMap((day) => state.boot.config.startTimes[day] || []))].sort();
  }
  const check = (name, text, extra) => {
    const box = h('input', { type: 'checkbox', name });
    return { box, row: h('label', { class: 'choice' }, box, text, extra ? h('small', { text: extra }) : null) };
  };
  function drawChoices() {
    const times = sessionTimes();
    const full = check('full', 'Full day', 'everything');
    fullBox = full.box; fullBox.checked = !kept.size && !customOn;
    const rows = [full.row];
    sessionBoxes = times.map((t) => {
      const c = check(`s-${t}`, `${timeLabel(t)} session`);
      c.box.dataset.time = t; c.box.checked = kept.has(t);
      c.box.addEventListener('change', () => { if (c.box.checked) { kept.add(t); fullBox.checked = false; customBox.checked = false; customOn = false; customTimes.hidden = true; } else kept.delete(t); });
      rows.push(c.row);
      return c.box;
    });
    const custom = check('custom', 'Other times…');
    customBox = custom.box; customBox.checked = customOn; customTimes.hidden = !customOn; rows.push(custom.row);
    fullBox.addEventListener('change', () => { if (fullBox.checked) { kept.clear(); sessionBoxes.forEach((x) => { x.checked = false; }); customBox.checked = false; customOn = false; customTimes.hidden = true; } else if (!sessionBoxes.some((x) => x.checked) && !customBox.checked) fullBox.checked = true; });
    customBox.addEventListener('change', () => { customOn = customBox.checked; customTimes.hidden = !customBox.checked; if (customBox.checked) { kept.clear(); fullBox.checked = false; sessionBoxes.forEach((x) => { x.checked = false; }); } else if (!sessionBoxes.some((x) => x.checked)) fullBox.checked = true; });
    choices.replaceChildren(...rows);
    if (!times.length) choices.append(h('p', { class: 'muted small', text: 'No sessions on these days, so only a full day or custom times can be blocked.' }));
  }
  start.addEventListener('change', drawChoices);
  end.addEventListener('change', drawChoices);
  drawChoices();

  const save = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    msg.textContent = '';
    const times = sessionTimes();
    const first = { startDate: start.value, endDate: end.value || start.value, label: label.value };
    const windows = [];
    if (customBox.checked) windows.push({ allDay: false, startTime: from.value, endTime: to.value });
    else if (fullBox.checked || !sessionBoxes.some((x) => x.checked)) windows.push({ allDay: true });
    else {
      // A session blocks from its start until the next session begins (or four hours for the last one).
      for (const t of times.filter((x) => kept.has(x))) {
        const next = times.find((x) => x > t);
        const [hh, mm] = t.split(':').map(Number);
        const endMin = Math.min(24 * 60, hh * 60 + mm + 240);
        const fallback = endMin >= 1440 ? '24:00' : `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
        windows.push({ allDay: false, startTime: t, endTime: next || fallback });
      }
    }
    save.disabled = true;
    try {
      const already = [];
      for (const w of windows) already.push(...(await api('/blockouts', { method: 'POST', body: { ...first, ...w } })).alreadyBooked || []);
      await refresh(start.value);
      const unique = [...new Map(already.map((c) => [c.id, c])).values()];
      if (unique.length) {
        openDialog('Blocked off', h('p', { text: 'The time is blocked. These bookings were already in it and are still booked:' }), h('ul', {}, unique.map((c) => h('li', { text: c.when }))), h('div', { class: 'sticky' }, h('button', { type: 'button', class: 'btn primary', onclick: () => dlg.close() }, 'OK')));
      } else dlg.close();
    } catch (e) { msg.textContent = e.message; save.disabled = false; }
  } }, 'Block it off');
  openDialog('Block off time', field('First day', start), field('Last day (leave empty for one day)', end),
    h('b', { text: 'What to block' }), choices, customTimes, field('Label (optional)', label), msg,
    h('p', { class: 'muted small', text: 'Customers can’t book this time. Bookings already in it stay booked.' }),
    h('div', { class: 'sticky' }, save, h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel')));
}
async function removeBlockout(b) {
  if (!confirm(`Remove “${b.label || 'Blocked off'}”? Customers will be able to book that time again.`)) return;
  try { await api(`/blockouts/${b.id}`, { method: 'DELETE' }); await refresh(); } catch (e) { alert(e.message); }
}

// ---------- booking detail ----------
async function openDetail(id) {
  let b;
  try { ({ booking: b } = await api(`/bookings/${id}`)); } catch (e) { alert(e.message); return; }
  const rows = [];
  const kv = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push(h('dt', { text: k }), h('dd', {}, v)); };
  const link = (href, text) => h('a', { href }, text);
  const name = `${b.firstName || ''} ${b.lastName || ''}`.trim();
  kv('When', `${dateLabel(b.date)} at ${timeLabel(b.time)} (${Math.floor(b.minutes / 60)}h${b.minutes % 60 ? ` ${b.minutes % 60}m` : ''})`);
  kv('Name', name);
  kv('Phone', b.phone ? link(`tel:${b.phone.replace(/[^\d+]/g, '')}`, b.phone) : '');
  kv('Email', b.emails?.length ? b.emails.map((e, i) => [i ? ', ' : '', link(`mailto:${e}`, e)]) : '');
  kv('Address', [b.street, b.town, b.zip && `MA ${b.zip}`].filter(Boolean).join(', ') + (b.unit && b.unit.toLowerCase() !== 'no' ? ` (unit ${b.unit})` : ''));
  kv('Inspection', [b.typeName, ...(b.addonNames || []).map((n) => `+ ${n}`)].filter(Boolean).map((t) => h('div', { text: t })));
  const fee = b.travelFeeCents || 0;
  kv('Price', b.priceCents - fee || !fee ? money(b.priceCents - fee) + (b.priceCents - fee === 0 ? ' (price not set yet)' : '') : 'Not set yet');
  if (fee) { kv('Travel fee', money(fee)); kv('Total', money(b.priceCents)); }
  kv('Paid', b.paymentStatus === 'paid' ? 'Yes' : 'Not yet');
  kv('Realtor', [b.realtorName, b.realtorPhone].filter(Boolean).join(', '));
  kv('Realtor email', b.realtorEmail ? link(`mailto:${b.realtorEmail}`, b.realtorEmail) : '');
  kv('Property', [b.style, b.sqft && `${b.sqft} sq ft`, b.basement, b.utilities && `utilities on: ${b.utilities}`].filter(Boolean).join(' · '));
  kv('Notes', b.notes);
  kv('Booked', b.source === 'manual' ? 'By you' : 'On the website');
  const body = [];
  if (b.status === 'cancelled') {
    body.push(h('div', { class: 'callout', text: b.needsRefund ? 'Cancelled. This was paid online, so remember to refund it.' : 'This booking is cancelled.' }));
  }
  body.push(h('dl', { class: 'kv' }, rows));
  // Part 3 puts the payment and FreshBooks invoice buttons here.
  body.push(h('div', { id: 'paymentSlot', class: 'callout info', text: 'Payment and invoice buttons will appear here once online payment is turned on.' }));
  const actions = h('div', { class: 'sticky' });
  if (b.status === 'confirmed') {
    actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => openForm({ booking: b }) }, 'Edit or reschedule'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => openCancel(b) }, 'Cancel booking'));
  }
  actions.append(h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Close'));
  openDialog(name || 'Booking', ...body, actions);
}

function openCancel(b) {
  const notify = h('input', { type: 'checkbox', checked: !!b.emails?.length, disabled: !b.emails?.length });
  const msg = h('p', { class: 'msg bad', role: 'alert' });
  openDialog('Cancel this booking?',
    h('p', { text: `${dateLabel(b.date)} at ${timeLabel(b.time)} for ${`${b.firstName || ''} ${b.lastName || ''}`.trim() || 'this customer'}. The time opens up again for other customers.` }),
    b.paymentStatus === 'paid' ? h('div', { class: 'callout', text: 'This booking was paid online. Cancelling does not refund it, so remember to refund it yourself.' }) : null,
    h('label', { class: 'check' }, notify, 'Email the customer that it’s cancelled'), msg,
    h('div', { class: 'sticky' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        try { await api(`/bookings/${b.id}/cancel`, { method: 'POST', body: { notifyCustomer: notify.checked } }); dlg.close(); await refresh(); } catch (e) { msg.textContent = e.message; }
      } }, 'Yes, cancel it'),
      h('button', { type: 'button', class: 'btn', onclick: () => openDetail(b.id) }, 'Keep it')));
}

// ---------- new / edit booking ----------
function openForm({ booking, date }) {
  const boot = state.boot;
  const editing = !!booking;
  const b = booking || {};
  const inputs = {};
  const typeSel = h('select', { name: 'typeId' }, boot.types.map((t) => h('option', { value: t.id, text: t.name + (t.priceCents ? '' : ' (price not set)'), selected: t.id === (b.typeId || boot.types[0].id) })));
  const addonBox = h('div');
  const addonChecked = new Set(b.addonIds || []);
  const price = textInput('price', editing ? dollars((b.priceCents || 0) - (b.travelFeeCents || 0)) : '', { inputmode: 'decimal', placeholder: 'automatic' });
  const fee = textInput('fee', editing ? dollars(b.travelFeeCents || 0) : '', { inputmode: 'decimal', placeholder: 'automatic' });
  const minutes = textInput('minutes', String(b.minutes || boot.types[0].minutes), { inputmode: 'numeric' });
  const totalEl = h('p', { class: 'total' });
  let priceTouched = false;
  let minutesTouched = editing;
  price.addEventListener('input', () => { priceTouched = true; recompute(); });
  fee.addEventListener('input', recompute);
  minutes.addEventListener('input', () => { minutesTouched = true; });

  function currentType() { return boot.types.find((t) => t.id === Number(typeSel.value)); }
  function renderAddons() {
    const type = currentType();
    clear(addonBox);
    const list = boot.addons.filter((a) => type.addonIds.includes(a.id) || addonChecked.has(a.id));
    if (!list.length) addonBox.append(h('p', { class: 'muted small', text: 'No add-ons for this inspection type.' }));
    for (const a of list) {
      const cb = h('input', { type: 'checkbox', value: a.id, checked: addonChecked.has(a.id), onchange: (e) => { e.target.checked ? addonChecked.add(a.id) : addonChecked.delete(a.id); recompute(); } });
      addonBox.append(h('label', { class: 'check' }, cb, `${a.name} (${money(a.priceCents)})`));
    }
  }
  function recompute() {
    const type = currentType();
    const computed = type.priceCents + [...addonChecked].reduce((s, id) => s + (boot.addons.find((a) => a.id === id)?.priceCents || 0), 0);
    const custom = priceTouched || !editing ? parseMoney(price.value) : null;
    const base = custom !== null && !Number.isNaN(custom) ? custom : (editing && !priceTouched && sameContents() ? (b.priceCents - (b.travelFeeCents || 0)) : computed);
    const feeCents = parseMoney(fee.value);
    const f = feeCents !== null && !Number.isNaN(feeCents) ? feeCents : (editing ? (b.travelFeeCents || 0) : 0);
    totalEl.textContent = base === 0 && custom === null && !type.priceCents ? 'Price: not set yet. Type one above if you know it.' : `Total: ${money(base + f)}${f ? ` (includes ${money(f)} travel fee)` : ''}`;
  }
  function sameContents() {
    return editing && Number(typeSel.value) === b.typeId && [...addonChecked].sort().join() === [...(b.addonIds || [])].sort().join();
  }
  typeSel.addEventListener('change', () => {
    const type = currentType();
    for (const id of [...addonChecked]) if (!type.addonIds.includes(id)) addonChecked.delete(id);
    if (!minutesTouched) minutes.value = String(type.minutes);
    renderAddons(); recompute();
  });
  renderAddons(); recompute();

  const t = (name, label, attrs) => { inputs[name] = textInput(name, Array.isArray(b[name]) ? b[name].join(', ') : (b[name] || ''), attrs); return field(label, inputs[name]); };
  const dateInput = textInput('date', b.date || date || todayStr(), { type: 'date', required: true });
  const timeInput = textInput('time', b.time || '09:00', { type: 'time', required: true });
  const opt = (list, v) => [['', '—'], ...list.map((x) => [x, x])].map(([val, text]) => h('option', { value: val, text, selected: val === (v || '') }));
  const style = h('select', { name: 'style' }, opt(['Condo', '1 Story', '2 Story', '3 Story', 'Multi-family'], b.style));
  const basement = h('select', { name: 'basement' }, opt(['Basement', 'Crawl Space', 'Slab'], b.basement));
  const utilities = h('select', { name: 'utilities' }, opt(['yes', 'no'], b.utilities));
  const notes = h('textarea', { name: 'notes', maxlength: '1000' }); notes.value = b.notes || '';
  const notifyCustomer = h('input', { type: 'checkbox' });
  const notifyRealtor = h('input', { type: 'checkbox' });
  const msg = h('p', { class: 'msg bad', role: 'alert' });
  const conflictBox = h('div');

  async function submit(override) {
    msg.textContent = ''; clear(conflictBox);
    const customPrice = parseMoney(price.value);
    const feeCents = parseMoney(fee.value);
    if (Number.isNaN(customPrice) || Number.isNaN(feeCents)) { msg.textContent = 'Prices need to look like 550 or 550.00.'; return; }
    const body = {
      typeId: Number(typeSel.value), addonIds: [...addonChecked], date: dateInput.value, time: timeInput.value, minutes: Number(minutes.value) || undefined,
      firstName: inputs.firstName.value, lastName: inputs.lastName.value, phone: inputs.phone.value, emails: inputs.emails.value,
      realtorName: inputs.realtorName.value, realtorEmail: inputs.realtorEmail.value, realtorPhone: inputs.realtorPhone.value,
      street: inputs.street.value, town: inputs.town.value, zip: inputs.zip.value, unit: inputs.unit.value, sqft: inputs.sqft.value,
      style: style.value, basement: basement.value, utilities: utilities.value, notes: notes.value, override
    };
    if (!editing) {
      if (customPrice !== null) body.customPriceCents = customPrice;
      if (feeCents !== null) body.travelFeeCents = feeCents;
      body.notifyCustomer = notifyCustomer.checked; body.notifyRealtor = notifyRealtor.checked;
    } else {
      if (priceTouched && customPrice !== null) body.customPriceCents = customPrice;
      if (feeCents !== null) body.travelFeeCents = feeCents;
      body.notifyCustomer = notifyCustomer.checked;
    }
    try {
      await api(editing ? `/bookings/${b.id}` : '/bookings', { method: editing ? 'PATCH' : 'POST', body });
      dlg.close();
      await refresh(dateInput.value);
    } catch (e) {
      if (e.status === 409 && e.data?.overlaps) {
        conflictBox.append(h('div', { class: 'callout' }, `${e.message} It overlaps: `, e.data.overlaps.map((c) => `${c.label} (${c.when})`).join('; ') + '.'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => submit(true) }, editing ? 'Save anyway' : 'Book it anyway'));
      } else msg.textContent = e.message;
    }
  }

  openDialog(editing ? 'Edit booking' : 'New booking',
    h('div', { class: 'row2' }, field('Date', dateInput), field('Start time', timeInput)),
    field('Inspection', typeSel), h('div', {}, h('b', { text: 'Add-ons' }), addonBox),
    h('div', { class: 'row3' },
      field('Price override ($)', price), field('Travel fee ($)', fee), field('Minutes', minutes)),
    totalEl,
    h('hr'),
    h('div', { class: 'row2' }, t('firstName', 'First name', { maxlength: '60' }), t('lastName', 'Last name', { maxlength: '60' })),
    h('div', { class: 'row2' }, t('phone', 'Phone', { inputmode: 'tel' }), t('emails', 'Email (up to 4, comma separated)', { inputmode: 'email' })),
    t('street', 'Street address'),
    h('div', { class: 'row3' }, t('town', 'Town'), t('zip', 'ZIP', { inputmode: 'numeric', maxlength: '5' }), t('unit', 'Unit')),
    h('div', { class: 'row3' }, field('Style', style), field('Basement', basement), field('Utilities on', utilities)),
    t('sqft', 'Square footage'),
    h('hr'),
    h('div', { class: 'row3' }, t('realtorName', 'Realtor name'), t('realtorEmail', 'Realtor email', { inputmode: 'email' }), t('realtorPhone', 'Realtor phone', { inputmode: 'tel' })),
    field('Notes (only you see these)', notes),
    h('hr'),
    editing
      ? h('label', { class: 'check' }, notifyCustomer, 'If I changed the time, email the customer the new time')
      : [h('label', { class: 'check' }, notifyCustomer, 'Email the customer a confirmation'), h('label', { class: 'check' }, notifyRealtor, 'Email the Realtor too')],
    h('p', { class: 'muted small', text: 'Your bookings skip the 24-hour rule and the ZIP range. You’ll be warned if a time overlaps something.' }),
    msg, conflictBox,
    h('div', { class: 'sticky' }, h('button', { type: 'button', class: 'btn primary', onclick: () => submit(false) }, editing ? 'Save changes' : 'Add booking'),
      h('button', { type: 'button', class: 'btn', onclick: () => (editing ? openDetail(b.id) : dlg.close()) }, 'Cancel')));
}

// ---------- ZIP map ----------
const zipState = { included: new Set(), extended: new Set(), savedIncluded: new Set(), savedExtended: new Set(), savedFee: 0 };
let map; let zipLayer; let layersByZip = {};
const COLORS = { included: '#23784a', extended: '#2f639c' };

function loadZipState() {
  const r = state.boot.range;
  zipState.included = new Set(r.included); zipState.extended = new Set(r.extended);
  zipState.savedIncluded = new Set(r.included); zipState.savedExtended = new Set(r.extended); zipState.savedFee = r.extendedFeeCents;
  $('feeInput').value = dollars(r.extendedFeeCents);
}
const zoneOf = (zip) => (zipState.included.has(zip) ? 'included' : zipState.extended.has(zip) ? 'extended' : 'off');
function styleFor(zip) {
  const zone = zoneOf(zip);
  return zone === 'off' ? { color: '#8a929a', weight: 1, fillColor: '#8a929a', fillOpacity: 0.06 } : { color: COLORS[zone], weight: 1.5, fillColor: COLORS[zone], fillOpacity: 0.5 };
}
function refreshCounts() {
  const dirty = JSON.stringify([...zipState.included].sort()) !== JSON.stringify([...zipState.savedIncluded].sort()) || JSON.stringify([...zipState.extended].sort()) !== JSON.stringify([...zipState.savedExtended].sort()) || parseMoney($('feeInput').value) !== zipState.savedFee;
  clear($('counts')).append(...[h('span', {}, h('b', { class: 'g', text: String(zipState.included.size) }), ' green'), h('span', {}, h('b', { class: 'u', text: String(zipState.extended.size) }), ' blue'), dirty ? h('span', { class: 'pill warn', text: 'Not saved yet' }) : null].filter(Boolean));
  $('saveRange').disabled = !dirty;
}
async function initMap() {
  if (map) { setTimeout(() => map.invalidateSize(), 50); return; }
  loadZipState();
  map = L.map('map', { zoomControl: true }).setView([42.28, -72.55], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 14, attribution: '© OpenStreetMap contributors' }).addTo(map);
  try {
    const geo = await (await fetch('zips.json')).json();
    zipLayer = L.geoJSON(geo, {
      style: (f) => styleFor(f.properties.z),
      onEachFeature: (f, layer) => {
        const zip = f.properties.z;
        layersByZip[zip] = layer;
        layer.bindTooltip(`${zip}${f.properties.t ? ` ${f.properties.t}` : ''}`, { sticky: true });
        layer.on('click', () => { cycleZip(zip); });
      }
    }).addTo(map);
    map.invalidateSize();
    map.fitBounds(zipLayer.getBounds(), { padding: [10, 10] });
  } catch { $('rangeMsg').textContent = 'The ZIP outlines did not load. You can still use the ZIP box below.'; $('rangeMsg').className = 'msg bad'; }
  refreshCounts();
}
function setZip(zip, zone) {
  zipState.included.delete(zip); zipState.extended.delete(zip);
  if (zone === 'included') zipState.included.add(zip); else if (zone === 'extended') zipState.extended.add(zip);
  layersByZip[zip]?.setStyle(styleFor(zip));
  refreshCounts();
}
function cycleZip(zip) { setZip(zip, { off: 'included', included: 'extended', extended: 'off' }[zoneOf(zip)]); }
$('feeInput').addEventListener('input', refreshCounts);
$('resetRange').addEventListener('click', () => { loadZipState(); for (const zip of Object.keys(layersByZip)) layersByZip[zip].setStyle(styleFor(zip)); refreshCounts(); $('rangeMsg').textContent = ''; });
$('saveRange').addEventListener('click', async () => {
  const fee = parseMoney($('feeInput').value);
  const msg = $('rangeMsg');
  if (fee === null || Number.isNaN(fee)) { msg.textContent = 'The travel fee needs to look like 75 or 75.00.'; msg.className = 'msg bad'; return; }
  try {
    const r = await api('/range', { method: 'PUT', body: { included: [...zipState.included], extended: [...zipState.extended], extendedFeeCents: fee } });
    state.boot.range = r.range; state.boot.rangeSaved = true;
    loadZipState(); refreshCounts();
    msg.textContent = 'Saved. Customers see this right away.'; msg.className = 'msg ok';
  } catch (e) { msg.textContent = e.message; msg.className = 'msg bad'; }
});
$('zipCheck').addEventListener('click', checkZip);
$('zipInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkZip(); } });
async function checkZip() {
  const zip = $('zipInput').value.trim();
  const out = $('zipResult');
  if (!/^\d{5}$/.test(zip)) { out.textContent = 'Type a 5-digit ZIP.'; out.className = 'msg bad'; return; }
  try {
    const r = await api(`/zip?zip=${zip}`);
    const where = r.town ? `${zip} (${r.town})` : zip;
    out.textContent = r.zone === 'included' ? `${where}: green. Customers can book and pay online.`
      : r.zone === 'extended' ? `${where}: blue. Customers can book online with a ${money(r.feeCents)} travel fee.`
        : `${where}: off. Customers are told to contact you.`;
    out.className = 'msg';
  } catch (e) { out.textContent = e.message; out.className = 'msg bad'; }
}
for (const btn of document.querySelectorAll('[data-zipset]')) {
  btn.addEventListener('click', () => {
    const zip = $('zipInput').value.trim();
    const out = $('zipResult');
    if (!/^\d{5}$/.test(zip)) { out.textContent = 'Type a 5-digit ZIP first.'; out.className = 'msg bad'; return; }
    if (!state.boot.rangeSaved && !map) loadZipState();
    if (!map) loadZipState();
    setZip(zip, btn.dataset.zipset);
    out.textContent = `${zip} is now ${btn.dataset.zipset === 'off' ? 'off' : btn.dataset.zipset === 'included' ? 'green' : 'blue'}. Press “Save the map” to keep it.`;
    out.className = 'msg';
  });
}

// ---------- settings ----------
function renderSettings() {
  const { config, types, addons } = state.boot;
  const hours = clear($('hoursFields'));
  for (let d = 1; d <= 7; d++) {
    const day = d % 7;
    hours.append(h('label', { class: 'field' }, WEEKDAYS[day], h('input', { 'data-day': String(day), value: (config.startTimes[day] || []).join(', '), placeholder: 'day off', autocomplete: 'off' })));
  }
  $('noticeHours').value = String(config.noticeHours);
  $('daysAhead').value = String(config.daysAhead);
  const tf = clear($('typeFields'));
  for (const t of types) {
    tf.append(h('div', { class: 'rowp', 'data-type': String(t.id) }, h('span', { class: 'nm', text: t.name }),
      h('label', {}, 'Price ($)', h('input', { 'data-k': 'price', inputmode: 'decimal', value: dollars(t.priceCents) })),
      h('label', {}, 'Minutes', h('input', { 'data-k': 'minutes', inputmode: 'numeric', value: String(t.minutes) }))));
  }
  const af = clear($('addonFields'));
  for (const a of addons) {
    af.append(h('div', { class: 'rowp addon', 'data-addon': String(a.id) }, h('span', { class: 'nm', text: a.name }),
      h('label', {}, 'Price ($)', h('input', { 'data-k': 'price', inputmode: 'decimal', value: dollars(a.priceCents) }))));
  }
}
function normalizeTimes(text) {
  return text.split(/[,\s]+/).filter(Boolean).map((t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? `${pad(Number(m[1]))}:${m[2]}` : t; });
}
$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('settingsMsg');
  msg.className = 'msg bad';
  const startTimes = {};
  for (const input of $('hoursFields').querySelectorAll('input')) startTimes[input.dataset.day] = normalizeTimes(input.value);
  const typeOverrides = {};
  for (const row of $('typeFields').children) {
    const p = parseMoney(row.querySelector('[data-k=price]').value);
    const mins = Number(row.querySelector('[data-k=minutes]').value);
    if (p === null || Number.isNaN(p)) { msg.textContent = 'Every price needs to look like 550 or 550.00.'; return; }
    typeOverrides[row.dataset.type] = { priceCents: p, minutes: mins };
  }
  const addonPrices = {};
  for (const row of $('addonFields').children) {
    const p = parseMoney(row.querySelector('[data-k=price]').value);
    if (p === null || Number.isNaN(p)) { msg.textContent = 'Every price needs to look like 175 or 175.00.'; return; }
    addonPrices[row.dataset.addon] = p;
  }
  try {
    const r = await api('/settings', { method: 'PUT', body: { startTimes, noticeHours: Number($('noticeHours').value), daysAhead: Number($('daysAhead').value), typeOverrides, addonPrices } });
    state.boot = await api('/bootstrap');
    renderSettings();
    msg.textContent = 'Saved. Customers see the new prices and times right away.'; msg.className = 'msg ok';
    void r;
  } catch (err) { msg.textContent = err.message; }
});

// ---------- light / dark ----------
function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  return set || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function paintTheme() { $('themeToggle').textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode'; }
$('themeToggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('t3dash-theme', next); } catch { /* private window: it just won't be remembered */ }
  paintTheme();
});
paintTheme();

boot();
