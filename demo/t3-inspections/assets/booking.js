// T3 Inspections online booking. Replaces the Acuity embed. Talks to the public booking
// routes in functions/src/index.ts (/t3-inspections/booking/*). The server re-checks
// everything (range, notice, overlap, price), so nothing here is trusted for the real rules.
(() => {
  const root = document.getElementById('t3-booking');
  if (!root) return;
  const manageRoot = root.hasAttribute('data-manage');

  // Online payment is built in a later step. Until then the only button is "Reserve".
  const PAYMENTS_ENABLED = false;

  // Anywhere except t3inspections.com itself (a workers.dev preview address) the page runs in
  // preview mode: bookings go to separate test storage and every email goes to Ted only.
  const PREVIEW = window.location.hostname.endsWith('.workers.dev');
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiOverride = local ? new URLSearchParams(window.location.search).get('bookingApi') : null;
  const API_ROOT = (apiOverride || 'https://us-central1-fennington-financial.cloudfunctions.net/api').replace(/\/$/, '');
  const API = `${API_ROOT}/t3-inspections/booking`;
  const CONTACT_API = `${API_ROOT}/t3-inspections/contact`;
  const TZ = 'America/New_York';
  const PHONE = '(413) 282-8616';
  const PHONE_HREF = 'tel:+14132828616';
  const EMAIL = 'T3Towne@gmail.com';

  const INTRO = 'Please fill in all the required info below including the FULL address and Realtor info (if applicable). I look forward to working with you and your new home purchase!';
  const PAY_LATER_NOTE = 'No payment is needed now. Ted takes payment after your inspection, so there is no online payment fee.';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const STYLES = ['Condo', '1 Story', '2 Story', '3 Story', 'Multi-family'];
  const BASEMENTS = ['Basement', 'Crawl Space', 'Slab'];

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const icon = (paths) => {
    const span = document.createElement('span');
    span.className = 't3b-icon';
    span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`; // static markup only
    return span;
  };
  const CALENDAR_ICON = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';

  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  const duration = (minutes) => [Math.floor(minutes / 60) && `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) === 1 ? '' : 's'}`, minutes % 60 && `${minutes % 60} minutes`].filter(Boolean).join(' ');
  const timeLabel = (time) => { const [hh, mm] = time.split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
  const dateLabel = (date) => { const [y, m, d] = date.split('-').map(Number); return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`; };
  const todayNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  if (PREVIEW) {
    root.before(h('p', { class: 't3b-preview', role: 'note' }, h('b', { text: 'Preview.' }), ' Nothing you book here is real: it never touches Ted’s calendar, and every email goes to Ted only, marked [PREVIEW].'));
  }

  const api = async (path, options) => {
    const url = `${API}${path}`;
    const res = await fetch(PREVIEW && !options ? `${url}${url.includes('?') ? '&' : '?'}preview=1` : url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again, or call Ted.'), { status: res.status });
    return data;
  };
  const postJson = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(PREVIEW ? { ...body, preview: true, siteBase: window.location.origin } : body) });

  // ---- Calendar: month grid on the left, times for the chosen day on the right ----
  function calendar({ typeId, onPick }) {
    const state = { month: todayNY().slice(0, 7), days: {}, date: '', times: [], loading: true, error: '' };
    const grid = h('div', { class: 't3b-cal' });
    const side = h('div', { class: 't3b-times' });
    const wrap = h('div', { class: 't3b-card t3b-datetime' }, grid, side);

    const shift = (delta) => {
      const [y, m] = state.month.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1 + delta, 1));
      state.month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
      state.date = '';
      state.times = [];
      load();
    };
    const drawSide = () => {
      side.replaceChildren();
      if (state.error) { side.append(h('p', { class: 't3b-msg', role: 'alert', text: state.error })); return; }
      if (state.loading) { side.append(h('p', { class: 't3b-note', text: 'Loading times…' })); return; }
      if (!Object.values(state.days).some(Boolean)) { side.append(h('p', { class: 't3b-note', text: `No times are open this month. Try the next month, or call Ted at ${PHONE}.` })); return; }
      if (!state.date) { side.append(h('p', { class: 't3b-note', text: 'Choose a day to see the times.' })); return; }
      side.append(h('h3', { class: 't3b-day', text: dateLabel(state.date) }));
      side.append(h('p', { class: 't3b-tz' }, 'Time zone: ', h('span', { text: 'Eastern Time' })));
      const list = h('div', { class: 't3b-timelist' });
      for (const slot of state.times) list.append(h('button', { type: 'button', class: 't3b-time', onclick: () => onPick(state.date, slot.time) }, h('b', { text: slot.label })));
      side.append(list);
    };
    const drawGrid = () => {
      grid.replaceChildren();
      const [y, m] = state.month.split('-').map(Number);
      const thisMonth = todayNY().slice(0, 7);
      grid.append(h('div', { class: 't3b-calhead' },
        h('button', { type: 'button', class: 't3b-arrow', 'aria-label': 'Previous month', disabled: state.month <= thisMonth, onclick: () => shift(-1) }, icon('<path d="m15 6-6 6 6 6"/>')),
        h('span', { class: 't3b-month', 'aria-live': 'polite', text: `${MONTHS[m - 1]} ${y}` }),
        h('button', { type: 'button', class: 't3b-arrow', 'aria-label': 'Next month', onclick: () => shift(1) }, icon('<path d="m9 6 6 6-6 6"/>'))));
      const table = h('div', { class: 't3b-grid', role: 'grid' });
      for (const letter of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) table.append(h('div', { class: 't3b-wd', text: letter }));
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      for (let i = 0; i < first; i += 1) table.append(h('div'));
      const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let d = 1; d <= count; d += 1) {
        const date = `${state.month}-${String(d).padStart(2, '0')}`;
        const open = Boolean(state.days[date]);
        table.append(h('button', {
          type: 'button', class: `t3b-day-btn${date === state.date ? ' on' : ''}`, disabled: !open,
          'aria-label': `${dateLabel(date)}${open ? '' : ', not available'}`, 'aria-pressed': date === state.date ? 'true' : 'false',
          onclick: () => pick(date)
        }, String(d)));
      }
      grid.append(table);
    };
    const pick = async (date) => {
      state.date = date;
      state.times = [];
      state.loading = true;
      drawGrid();
      drawSide();
      try {
        state.times = (await api(`/times?type=${typeId}&date=${date}`)).times;
        state.error = '';
      } catch (error) { state.error = error.message; }
      state.loading = false;
      drawSide();
    };
    const load = async () => {
      state.loading = true;
      state.error = '';
      drawGrid();
      drawSide();
      try {
        state.days = (await api(`/days?type=${typeId}&month=${state.month}`)).days;
        state.loading = false;
        const firstOpen = Object.keys(state.days).find((date) => state.days[date]);
        drawGrid();
        if (firstOpen) await pick(firstOpen); else drawSide();
      } catch (error) {
        state.loading = false;
        state.error = error.message;
        drawGrid();
        drawSide();
      }
    };
    load();
    return wrap;
  }

  // ---- Manage mode: the "my inspection" page, opened from the link in the email ----
  async function runManage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('b') || '';
    const token = params.get('t') || '';
    const show = (...nodes) => root.replaceChildren(...nodes);
    if (!id || !token) { show(h('p', { class: 't3b-msg', text: `This link is missing something. Please use the link in your confirmation email, or call Ted at ${PHONE}.` })); return; }
    let booking;
    try { booking = await api(`/manage?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`); }
    catch (error) { show(h('p', { class: 't3b-msg', role: 'alert', text: error.message })); return; }

    const summary = () => h('div', { class: 't3b-card t3b-pad' },
      h('div', { class: 't3b-rowname', text: booking.typeName }),
      ...booking.addonNames.map((name) => h('div', { class: 't3b-detail', text: `+ ${name}` })),
      h('div', { class: 't3b-detail', text: booking.when }),
      h('div', { class: 't3b-detail', text: booking.address }));

    const back = () => { runManage(); };
    const reschedule = () => {
      show(h('button', { type: 'button', class: 't3b-back', onclick: back }, icon('<path d="m15 6-6 6 6 6"/>'), 'My inspection'),
        h('h2', { class: 't3b-step', text: 'Choose a new time' }),
        calendar({
          typeId: booking.typeId,
          onPick: async (date, time) => {
            try {
              const done = await postJson('/manage/reschedule', { id, token, date, time });
              show(h('h2', { class: 't3b-step', text: 'Inspection moved' }), h('div', { class: 't3b-card t3b-pad' }, h('p', { text: `Your inspection is now ${done.when}. We emailed you the new details.` })));
            } catch (error) { window.alert(error.message); }
          }
        }));
    };
    const cancel = () => {
      const error = h('p', { class: 't3b-msg', role: 'alert', hidden: true });
      show(h('h2', { class: 't3b-step', text: 'Cancel this inspection?' }), summary(),
        h('div', { class: 't3b-actions' },
          h('button', { type: 'button', class: 't3b-btn', onclick: async (event) => {
            event.target.disabled = true;
            try {
              await postJson('/manage/cancel', { id, token });
              show(h('h2', { class: 't3b-step', text: 'Inspection cancelled' }), h('div', { class: 't3b-card t3b-pad' }, h('p', { text: 'Your inspection was cancelled and we emailed you a confirmation.' }), h('a', { class: 't3b-link', href: '../schedule-now/', text: 'Book a new time' })));
            } catch (err) { event.target.disabled = false; error.textContent = err.message; error.hidden = false; }
          } }, 'Yes, cancel it'),
          h('button', { type: 'button', class: 't3b-btn t3b-btn-ghost', onclick: back }, 'Keep it')), error);
    };

    if (booking.status !== 'confirmed') { show(h('h2', { class: 't3b-step', text: 'This inspection was cancelled' }), summary(), h('a', { class: 't3b-link', href: '../schedule-now/', text: 'Book a new time' })); return; }
    show(h('h2', { class: 't3b-step', text: `Hi ${booking.firstName}, here is your inspection` }), summary(),
      booking.canChange
        ? h('div', { class: 't3b-actions' }, h('button', { type: 'button', class: 't3b-btn', onclick: reschedule }, 'Reschedule'), h('button', { type: 'button', class: 't3b-btn t3b-btn-ghost', onclick: cancel }, 'Cancel inspection'))
        : h('p', { class: 't3b-note' }, 'It is within 24 hours of your inspection, so changes need a call. Please call Ted at ', h('a', { href: PHONE_HREF, text: PHONE }), '.'));
  }

  if (manageRoot) { runManage(); return; }

  // ---- Booking flow ----
  const flow = { types: [], addons: [], step: 'list', type: null, addonIds: new Set(), date: '', time: '', range: null, error: '', form: { utilities: '' } };
  const typeById = (id) => flow.types.find((t) => t.id === Number(id));
  const totalCents = () => flow.type.priceCents + [...flow.addonIds].reduce((sum, id) => sum + (flow.addons.find((a) => a.id === id)?.priceCents || 0), 0);
  const detailLine = (type, total) => (total ? `${duration(type.minutes)} @ ${money(total)}` : duration(type.minutes));
  const go = (step) => { flow.step = step; flow.error = ''; draw(); root.scrollIntoView({ block: 'start' }); };

  const intro = () => h('p', { class: 't3b-intro', text: INTRO });
  const stepTitle = (text, back) => h('div', { class: 't3b-stephead' },
    back ? h('button', { type: 'button', class: 't3b-back', onclick: back.fn }, icon('<path d="m15 6-6 6 6 6"/>'), back.label) : h('span'),
    h('h2', { class: 't3b-step' }, step_icon(text)),
    h('span'));
  function step_icon(text) { return text === 'Select Appointment' ? [icon(CALENDAR_ICON), text] : text; }

  function drawList() {
    const categories = [...new Set(flow.types.map((t) => t.category))];
    return [intro(), stepTitle('Select Appointment'), ...categories.flatMap((category) => [
      h('p', { class: 't3b-cat', text: category }),
      h('ul', { class: 't3b-card t3b-list' }, ...flow.types.filter((t) => t.category === category).map((type) =>
        h('li', {}, h('div', {}, h('div', { class: 't3b-rowname', text: type.name }), h('span', { class: 't3b-detail', text: detailLine(type, type.priceCents) })),
          h('button', { type: 'button', class: 't3b-btn t3b-btn-sm', onclick: () => choose(type) }, 'Book'))))
    ])];
  }
  function choose(type) {
    flow.type = type;
    flow.addonIds = new Set();
    flow.date = '';
    flow.time = '';
    go('time');
  }

  const typeCard = (withWhen) => h('div', { class: 't3b-card t3b-pad t3b-typecard' },
    h('div', {},
      h('div', { class: 't3b-rowname', text: flow.type.name }),
      ...[...flow.addonIds].map((id) => h('div', { class: 't3b-detail', text: `+ ${flow.addons.find((a) => a.id === id).name}` })),
      h('div', { class: 't3b-detail', text: detailLine(flow.type, totalCents()) }),
      withWhen ? h('div', { class: 't3b-detail', text: `${dateLabel(flow.date)}, ${new Date(`${flow.date}T12:00:00Z`).getUTCFullYear()} at ${timeLabel(flow.time)}` }) : null),
    h('button', { type: 'button', class: 't3b-x', 'aria-label': 'Choose a different inspection', onclick: () => go('list') }, icon('<path d="M6 6l12 12M18 6 6 18"/>')));

  function drawTime() {
    const addons = flow.type.addonIds.map((id) => flow.addons.find((a) => a.id === id)).filter(Boolean);
    return [intro(), stepTitle('Date & Time', { label: 'Select Appointment', fn: () => go('list') }),
      h('h3', { class: 't3b-label', text: 'Appointment type' }), typeCard(false),
      addons.length ? [h('h3', { class: 't3b-label', text: 'Add to appointment' }),
        h('div', { class: 't3b-card t3b-pad t3b-addons' }, ...addons.map((addon) => {
          const box = h('input', { type: 'checkbox', id: `t3b-addon-${addon.id}`, checked: flow.addonIds.has(addon.id), onchange: (e) => {
            if (e.target.checked) flow.addonIds.add(addon.id); else flow.addonIds.delete(addon.id);
            card.replaceWith(draftCard());
          } });
          return h('label', { class: 't3b-addon', for: `t3b-addon-${addon.id}` }, box, h('span', {}, addon.name, h('small', { text: `+ ${money(addon.priceCents)}` })));
        }))] : null,
      calendar({ typeId: flow.type.id, onPick: (date, time) => { flow.date = date; flow.time = time; go('form'); } })];
  }
  // The appointment card above the add-ons keeps its total up to date as boxes are ticked.
  let card = null;
  const draftCard = () => { card = typeCard(false); return card; };

  const FIELD_ERRORS = {};
  function field({ name, label, required, type = 'text', hint, autocomplete, inputmode, maxlength, area = 'client' }) {
    const id = `t3b-${name}`;
    const error = h('p', { class: 't3b-err', id: `${id}-err`, hidden: true });
    FIELD_ERRORS[name] = error;
    const input = h('input', { type, id, name, autocomplete, inputmode, maxlength, 'aria-describedby': `${id}-err`, 'aria-required': required ? 'true' : null, value: flow.form[name] || '',
      class: area === 'property' ? 't3b-in t3b-in-white' : 't3b-in', oninput: (e) => { flow.form[name] = e.target.value; error.hidden = true; input.classList.remove('bad'); if (name === 'zip') checkZip(); } });
    return h('div', { class: 't3b-field' }, h('label', { for: id }, label, required ? h('span', { class: 't3b-req', 'aria-hidden': 'true', text: ' *' }) : null), hint ? h('p', { class: 't3b-hint', text: hint }) : null, input, error);
  }
  function select({ name, label, options }) {
    const id = `t3b-${name}`;
    const error = h('p', { class: 't3b-err', hidden: true });
    FIELD_ERRORS[name] = error;
    const el = h('select', { id, name, class: 't3b-in t3b-in-white', 'aria-required': 'true', onchange: (e) => { flow.form[name] = e.target.value; error.hidden = true; el.classList.remove('bad'); } },
      h('option', { value: '', text: 'Select an option' }), ...options.map((o) => h('option', { value: o, text: o, selected: flow.form[name] === o })));
    return h('div', { class: 't3b-field' }, h('label', { for: id }, label, h('span', { class: 't3b-req', 'aria-hidden': 'true', text: ' *' })), el, error);
  }

  let zipSeq = 0;
  let outOfRange = h('div');
  async function checkZip() {
    const zip = String(flow.form.zip || '').replace(/\D/g, '').slice(0, 5);
    const mine = ++zipSeq;
    if (zip.length < 5) { flow.range = null; paintRange(); return; }
    try {
      const result = await api(`/range?zip=${zip}`);
      if (mine !== zipSeq) return;
      flow.range = { zip, ...result };
    } catch { flow.range = null; }
    paintRange();
  }
  function paintRange() {
    const blocked = flow.range && !flow.range.inRange;
    const submit = document.getElementById('t3b-submit');
    if (submit) submit.hidden = Boolean(blocked);
    const note = document.getElementById('t3b-paynote');
    if (note) note.hidden = Boolean(blocked);
    outOfRange.replaceWith((outOfRange = blocked ? rangePanel() : h('div')));
  }
  function rangePanel() {
    const status = h('p', { class: 't3b-note', 'aria-live': 'polite' });
    const send = h('button', { type: 'button', class: 't3b-btn', onclick: async () => {
      const f = flow.form;
      const email = String(f.email || '').split(',')[0].trim();
      if (!f.firstName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = 'Please add your name and a valid email above, then try again.'; return; }
      send.disabled = true;
      if (PREVIEW) {
        status.textContent = 'Preview: nothing was sent. On the live site this goes to Ted.';
        send.hidden = true;
        return;
      }
      try {
        const res = await fetch(CONTACT_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          name: `${f.firstName || ''} ${f.lastName || ''}`.trim(), email, phone: f.phone || '', address: `${f.street || ''}, ${f.town || ''} ${f.zip || ''}`,
          message: `Online booking request outside the online booking area.\nInspection: ${flow.type.name}${[...flow.addonIds].length ? ` + ${[...flow.addonIds].map((id) => flow.addons.find((a) => a.id === id).name).join(', ')}` : ''}\nPreferred time: ${dateLabel(flow.date)} at ${timeLabel(flow.time)}\nStyle: ${f.style || '?'}, ${f.sqft || '?'} sq ft, ${f.basement || '?'}, utilities on: ${f.utilities || '?'}\nRealtor: ${[f.realtorName, f.realtorEmail, f.realtorPhone].filter(Boolean).join(', ') || 'none given'}`,
          pageUrl: window.location.href }) });
        if (!res.ok) throw new Error('failed');
        status.textContent = 'Sent. Ted will contact you about your options.';
        send.hidden = true;
      } catch { send.disabled = false; status.textContent = `That didn't send. Please call Ted at ${PHONE}.`; }
    } }, 'Send my details to Ted');
    return h('div', { class: 't3b-range', role: 'status' },
      h('h3', { text: 'Contact us for this address' }),
      h('p', {}, `We can't book this ZIP code online${flow.range?.zip ? ` (${flow.range.zip})` : ''}, but Ted may still be able to help. Call `, h('a', { href: PHONE_HREF, text: PHONE }), ' or email ', h('a', { href: `mailto:${EMAIL}`, text: EMAIL }), ' to talk about your options.'),
      send, status);
  }

  function validateForm() {
    const f = flow.form;
    const bad = {};
    const need = (key, message) => { if (!String(f[key] || '').trim()) bad[key] = message; };
    need('firstName', 'First name is required');
    need('lastName', 'Last name is required');
    if (String(f.phone || '').replace(/\D/g, '').length < 10) bad.phone = 'Phone is required';
    const emails = String(f.email || '').split(/[,;\s]+/).filter(Boolean);
    if (!emails.length) bad.email = 'Email is required';
    else if (!emails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) bad.email = 'Please check the email address';
    if (f.realtorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.realtorEmail).trim())) bad.realtorEmail = "The Realtor's email doesn't look right";
    need('street', 'Street address is required');
    need('town', 'Town is required');
    if (!/^\d{5}/.test(String(f.zip || '').trim())) bad.zip = 'ZIP code is required';
    need('unit', 'Unit number is required (type "no" if there is none)');
    need('style', 'Please choose the style of the property');
    need('sqft', 'Square footage is required');
    need('basement', 'Please say whether there is a basement');
    if (!f.utilities) bad.utilities = 'Please say whether the utilities are on';
    for (const [key, el] of Object.entries(FIELD_ERRORS)) {
      el.hidden = !bad[key];
      el.textContent = bad[key] || '';
      document.getElementById(`t3b-${key}`)?.classList.toggle('bad', Boolean(bad[key]));
    }
    return bad;
  }

  function drawForm() {
    const f = flow.form;
    for (const key of Object.keys(FIELD_ERRORS)) delete FIELD_ERRORS[key];
    const errorBox = h('p', { class: 't3b-msg', role: 'alert', hidden: true });
    const utilitiesError = h('p', { class: 't3b-err', hidden: true });
    FIELD_ERRORS.utilities = utilitiesError;
    outOfRange = h('div');
    const submit = h('button', { type: 'submit', class: 't3b-btn t3b-btn-lg', id: 't3b-submit' }, PAYMENTS_ENABLED ? 'Reserve without paying' : 'Reserve my inspection');
    const form = h('form', { class: 't3b-card t3b-pad t3b-form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      if (Object.keys(validateForm()).length) { form.querySelector('.bad')?.focus(); return; }
      if (flow.range && !flow.range.inRange) return;
      submit.disabled = true;
      submit.textContent = 'Reserving…';
      try {
        const done = await postJson('', {
          typeId: flow.type.id, addonIds: [...flow.addonIds], date: flow.date, time: flow.time,
          firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email,
          realtorName: f.realtorName || '', realtorEmail: f.realtorEmail || '', realtorPhone: f.realtorPhone || '',
          street: f.street, town: f.town, zip: String(f.zip).trim().slice(0, 5), unit: f.unit, style: f.style, sqft: f.sqft, basement: f.basement, utilities: f.utilities,
          extra_info: f.extra_info || ''
        });
        flow.done = done;
        go('done');
      } catch (error) {
        submit.disabled = false;
        submit.textContent = PAYMENTS_ENABLED ? 'Reserve without paying' : 'Reserve my inspection';
        if (error.status === 409) { flow.notice = error.message; flow.date = ''; flow.time = ''; go('time'); return; }
        errorBox.textContent = error.message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'center' });
      }
    } },
      h('div', { class: 't3b-cols' },
        h('div', {},
          field({ name: 'firstName', label: 'First name', required: true, autocomplete: 'given-name' }),
          field({ name: 'lastName', label: 'Last name', required: true, autocomplete: 'family-name' }),
          field({ name: 'phone', label: 'Phone', required: true, type: 'tel', autocomplete: 'tel', inputmode: 'tel' }),
          field({ name: 'email', label: 'Email', required: true, type: 'text', autocomplete: 'email', inputmode: 'email', hint: 'Separate several addresses with commas' }))),
      h('h3', { class: 't3b-section', text: 'Property Information' }),
      h('p', { text: 'Please answer the questions below to help me give you the best home inspection I can.' }),
      h('div', { class: 't3b-cols' }, h('div', {},
        field({ name: 'realtorName', label: "Realtor's name", area: 'property', autocomplete: 'off' }),
        field({ name: 'realtorEmail', label: "Realtor's email", area: 'property', type: 'email', autocomplete: 'off', hint: "They'll get a copy of the confirmation" }),
        field({ name: 'realtorPhone', label: "Realtor's phone number", area: 'property', type: 'tel', autocomplete: 'off' }),
        field({ name: 'street', label: 'Street address of the property', required: true, area: 'property', autocomplete: 'street-address' }),
        field({ name: 'town', label: 'Town / city', required: true, area: 'property', autocomplete: 'address-level2' }),
        field({ name: 'zip', label: 'ZIP code', required: true, area: 'property', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 10 }),
        outOfRange,
        field({ name: 'unit', label: 'Condo or Unit number? (if not type "no")', required: true, area: 'property' }),
        select({ name: 'style', label: 'What is the style of the property?', options: STYLES }),
        field({ name: 'sqft', label: 'What is the square footage?', required: true, area: 'property', inputmode: 'numeric' }),
        select({ name: 'basement', label: 'Is there a basement?', options: BASEMENTS }),
        h('fieldset', { class: 't3b-field t3b-radios' }, h('legend', {}, 'Are the utilities turned on? (if not will limit the inspection process)', h('span', { class: 't3b-req', 'aria-hidden': 'true', text: ' *' })),
          ...['yes', 'no'].map((value) => h('label', { class: 't3b-radio' }, h('input', { type: 'radio', name: 'utilities', value, checked: f.utilities === value, onchange: () => { f.utilities = value; utilitiesError.hidden = true; } }), h('span', { text: value === 'yes' ? 'Yes' : 'No' }))), utilitiesError),
        h('div', { class: 'hp-field', 'aria-hidden': 'true' }, h('label', { for: 't3b-extra' }, 'Leave this empty'), h('input', { id: 't3b-extra', name: 'extra_info', tabindex: '-1', autocomplete: 'off', oninput: (e) => { f.extra_info = e.target.value; } })))),
      h('p', { class: 't3b-paynote', id: 't3b-paynote', text: PAY_LATER_NOTE }),
      errorBox,
      h('div', { class: 't3b-actions' }, submit));
    setTimeout(checkZip, 0);
    return [intro(), stepTitle('Your Information', { label: 'Date & Time', fn: () => go('time') }), h('h3', { class: 't3b-label', text: 'Appointment type' }), typeCard(true), h('h3', { class: 't3b-label', text: 'Your information' }), form];
  }

  function drawDone() {
    const d = flow.done;
    return [h('div', { class: 't3b-card t3b-pad t3b-done', role: 'status' },
      icon('<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>'),
      h('h2', { class: 't3b-step', text: 'Appointment scheduled' }),
      h('p', {}, `${flow.form.firstName}, your home inspection is scheduled for `, h('b', { text: d.when }), '.'),
      h('div', { class: 't3b-detail', text: flow.type.name }),
      h('div', { class: 't3b-detail', text: `${flow.form.street}, ${flow.form.town} ${String(flow.form.zip).trim().slice(0, 5)}` }),
      h('p', { class: 't3b-note', text: d.emailStatus === 'sent' ? 'A confirmation was emailed to you. A reminder will arrive the day before.' : `We saved your booking, but the confirmation email may be delayed. Questions? Call Ted at ${PHONE}.` }),
      h('p', { class: 't3b-note' }, 'Need to change something? Use the link in your confirmation email, or call ', h('a', { href: PHONE_HREF, text: PHONE }), '.'))];
  }

  function draw() {
    const parts = { list: drawList, time: drawTime, form: drawForm, done: drawDone }[flow.step]();
    root.replaceChildren(...parts.flat().filter(Boolean));
    if (flow.step === 'time' && flow.notice) {
      root.prepend(h('p', { class: 't3b-msg', role: 'alert', text: flow.notice }));
      flow.notice = '';
    }
    if (flow.step === 'time') { const old = root.querySelector('.t3b-typecard'); if (old) card = old; }
  }

  (async () => {
    root.append(h('p', { class: 't3b-note', text: 'Loading…' }));
    try {
      const catalog = await api('/catalog');
      flow.types = catalog.types;
      flow.addons = catalog.addons;
    } catch {
      root.replaceChildren(h('p', { class: 't3b-msg', role: 'alert' }, `Online booking isn't available right now. Please call Ted at `, h('a', { href: PHONE_HREF, text: PHONE }), ` or email `, h('a', { href: `mailto:${EMAIL}`, text: EMAIL }), '.'));
      return;
    }
    const wanted = typeById(new URLSearchParams(window.location.search).get('type'));
    if (wanted) choose(wanted); else draw();
  })();
})();
