/* =========================================================
   Дашборд плану роботи Держдітслужби на 2027 рік
   Джерело: Google Таблиця, аркуш «План роботи»
   ========================================================= */

const CONFIG = {
  SHEET_ID: '1E1diHFjqI4iI62akeGYS_qFDNVfFSGrhu1NTlZDdPrM',
  SHEET_NAME: 'План роботи',
  GID: '691320805',
  TITLES_SHEET_NAME: 'Для редагування',   // звідси беруться назви розділів
  REFRESH_MS: 60 * 1000                    // автооновлення щохвилини
};

/* ---------------- Чиста логіка (парсинг) ---------------- */

const TERM_ORDER = ['Протягом року', 'I квартал', 'II квартал', 'III квартал', 'IV квартал', 'Інше / не вказано'];
const MONTHS = [['січ', 1], ['лют', 2], ['берез', 3], ['квіт', 4], ['трав', 5], ['черв', 6],
  ['лип', 7], ['серп', 8], ['верес', 9], ['жовт', 10], ['листопад', 11], ['груд', 12]];
const QUARTERS = ['I квартал', 'II квартал', 'III квартал', 'IV квартал'];

function clean(s) {
  return (s == null ? '' : String(s)).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
function isNA(s) { return !s || /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!)/i.test(s); }

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/);
  const head = lines.find(l => l.includes('Зміст завдання')) || '';
  if (!head) return ',';
  return head.split(';').length > head.split(',').length ? ';' : ',';
}

function parseCsv(text, delim) {
  text = text.replace(/^\uFEFF/, '');
  delim = delim || ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function termInfo(term) {
  const raw = clean(term);
  if (!raw) return { cat: TERM_ORDER[5], dated: false };
  const low = raw.toLowerCase();
  if (/протягом року|постійно|щодня|щотижня|щомісяця|щокварталу|щороку|періодично/.test(low)) {
    return { cat: TERM_ORDER[0], dated: false };
  }
  // квартали (кирилична «і» → латинська «i» для римських цифр)
  const ql = low.replace(/і/g, 'i');
  const qm = ql.match(/(^|[^a-zа-я])(iv|iii|ii|i|[1-4])\s*[-–]?\s*(?:й|го)?\s*кв(?:арт|\.)/);
  if (qm) {
    const map = { i: 1, ii: 2, iii: 3, iv: 4, 1: 1, 2: 2, 3: 3, 4: 4 };
    return { cat: QUARTERS[map[qm[2]] - 1], dated: true };
  }
  // дати dd.mm.yyyy та назви місяців — беремо найраніший місяць
  const months = [];
  let m;
  const dre = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g;
  while ((m = dre.exec(raw))) { const mm = +m[2]; if (mm >= 1 && mm <= 12) months.push(mm); }
  MONTHS.forEach(([stem, n]) => { if (low.includes(stem)) months.push(n); });
  if (months.length) {
    const first = Math.min(...months);
    return { cat: QUARTERS[Math.ceil(first / 3) - 1], dated: true };
  }
  return { cat: TERM_ORDER[5], dated: false };
}

function buildTasks(rows) {
  const out = [];
  let priority = '', sec = { num: '', title: '' };
  for (const r of rows) {
    const cells = r.map(clean);
    if (!cells.some(Boolean)) continue;
    const a = cells[0] || '';

    if (/^Пріоритетний напрям/i.test(a)) {
      let p = clean(a.replace(/^Пріоритетний напрям діяльності\s*:?\s*/i, '')).replace(/\.$/, '');
      priority = p.charAt(0).toUpperCase() + p.slice(1);
      continue;
    }
    const m = a.match(/^Розділ\s*0*(\d+)\.?\s*([\s\S]*)$/i);
    if (m) { sec = { num: m[1], title: clean(m[2]) }; continue; }

    if (/^\d+(\.\d+)+$/.test(a)) {
      const task = isNA(cells[1]) ? '' : cells[1];
      const resp = isNA(cells[2]) ? '' : cells[2];
      const term = isNA(cells[3]) ? '' : cells[3];
      const indicator = isNA(cells[4]) ? '' : cells[4];
      const result = isNA(cells[5]) ? '' : cells[5];
      const respList = Array.from(new Set(resp.split(/\s*[;\n]\s*/).map(clean).filter(Boolean)));
      const ti = termInfo(term);
      // колонка G «Розділ» (якщо є) має пріоритет над рядком-заголовком розділу
      let secNum = sec.num, secTitle = sec.title;
      const gm = (cells[6] || '').match(/^Розділ\s*0*(\d+)\.?\s*([\s\S]*)$/i);
      if (gm) { secNum = gm[1]; secTitle = clean(gm[2]) || secTitle; }
      const t = {
        num: a, priority, sectionNum: secNum, sectionTitle: secTitle,
        task, resp, respList, term, indicator, result,
        termCat: ti.cat, dated: ti.dated, filled: !!task
      };
      t.hay = [t.num, t.task, t.resp, t.term, t.indicator, t.result, t.sectionTitle].join(' ').toLowerCase();
      out.push(t);
    }
  }
  return out;
}

function natCompare(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/* Назви розділів з аркуша «Для редагування».
   Підтримуються два вигляди:
   1) одна клітинка «Розділ 01. Назва…»;
   2) окремі клітинки: номер («1», «01», «Розділ 1») і поруч — назва. */
function extractSectionTitles(rows) {
  const map = {};
  // 1) «Розділ N. Назва» в одній клітинці
  for (const r of rows) {
    for (const raw of r) {
      const c = clean(raw);
      const m = c.match(/^Розділ\s*0*(\d+)\s*[.:)\-–—]?\s*([\s\S]+)$/i);
      if (m && clean(m[2]).length > 3 && !map[m[1]]) map[m[1]] = clean(m[2]);
    }
  }
  if (Object.keys(map).length) return map;
  // 2) номер і назва в сусідніх клітинках
  for (const r of rows) {
    const cells = r.map(clean);
    for (let i = 0; i < cells.length - 1; i++) {
      const m = cells[i].match(/^(?:Розділ\s*)?0*(\d+)\.?$/i);
      if (!m) continue;
      const next = cells.slice(i + 1).find(x => x && !isNA(x));
      if (next && next.length > 15 && !map[m[1]]) { map[m[1]] = next; break; }
    }
  }
  return map;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCsv, buildTasks, termInfo, natCompare, detectDelimiter, extractSectionTitles };
}

/* ---------------- Інтерфейс ---------------- */

if (typeof document !== 'undefined') {
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  const EMPTY_FILTERS = () => ({ q: '', priority: '', section: '', resp: '', term: '' });
  const state = {
    all: [],
    filters: EMPTY_FILTERS(),
    sort: { key: 'num', dir: 1 },
    page: 1,
    pageSize: store.get('pageSize', 25),
    view: store.get('view', 'table'),
    current: [],      // поточний відфільтрований список (для модального вікна)
    modalIndex: -1,
    timer: null,
    lastSignature: '',
    loading: false
  };

  /* ---------- Завантаження даних ---------- */

  async function fetchCsv(sheetName, gid) {
    const base = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID;
    const urls = [base + '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName)];
    if (gid) urls.push(base + '/export?format=csv&gid=' + gid);
    let last;
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text();
        if (/^\s*</.test(t)) throw new Error('Отримано не CSV (можливо, немає доступу)');
        return t;
      } catch (e) { last = e; }
    }
    throw last || new Error('Невідома помилка');
  }

  function nowTime() { return new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); }

  function setBadge(text, cls) {
    const b = $('#srcBadge');
    b.textContent = text;
    b.className = 'badge ' + (cls || '');
  }

  function applyTitles(tasks, titles) {
    if (!titles) return;
    tasks.forEach(t => {
      if (t.sectionNum && titles[t.sectionNum]) {
        t.sectionTitle = titles[t.sectionNum];
        t.hay = [t.num, t.task, t.resp, t.term, t.indicator, t.result, t.sectionTitle].join(' ').toLowerCase();
      }
    });
  }

  function setData(tasks, label, cls, keepPage) {
    state.all = tasks;
    if (!keepPage) state.page = 1;
    setBadge(label, cls);
    buildSelects();
    render();
  }

  /* manual = true — натиснули «Оновити дані»; false — автоматичне оновлення щохвилини */
  async function loadRemote(manual) {
    if (state.loading) return;
    // не перемальовуємо сторінку, поки користувач дивиться картку завдання
    if (!manual && !$('#modal').hidden) return;
    state.loading = true;
    const btn = $('#btnRefresh');
    if (manual) { btn.disabled = true; btn.textContent = '↻ Оновлення…'; }
    try {
      const [planText, titlesText] = await Promise.all([
        fetchCsv(CONFIG.SHEET_NAME, CONFIG.GID),
        fetchCsv(CONFIG.TITLES_SHEET_NAME).catch(() => '')
      ]);
      const signature = planText + '\u0001' + titlesText;
      const first = !state.lastSignature;
      if (signature === state.lastSignature && !manual) {
        setBadge('Google Таблиця · перевірено ' + nowTime(), 'ok');
        return;
      }
      const tasks = buildTasks(parseCsv(planText, ','));
      if (!tasks.length) throw new Error('У таблиці не знайдено пунктів плану');
      if (titlesText) applyTitles(tasks, extractSectionTitles(parseCsv(titlesText, ',')));
      const changed = signature !== state.lastSignature;
      state.lastSignature = signature;
      setData(tasks, 'Google Таблиця · оновлено ' + nowTime(), 'ok', !first);
      if (manual) toast('Дані оновлено з Google Таблиці');
      else if (changed && !first) toast('Дані в таблиці змінилися — дашборд оновлено');
    } catch (err) {
      console.warn('Не вдалося завантажити Google Таблицю:', err);
      if (!state.all.length) {
        setData(buildTasks(window.FALLBACK_ROWS || []), 'Резервні дані (знімок) · таблиця недоступна · повторна спроба щохвилини', 'warn');
        toast('Не вдалося отримати дані з Google Таблиці. Перевірте інтернет і доступ до таблиці (запускайте через Live Server).', 6000);
      } else {
        setBadge('Не вдалося оновити о ' + nowTime() + ' · показано попередні дані', 'warn');
        if (manual) toast('Не вдалося оновити дані з Google Таблиці', 4000);
      }
    } finally {
      state.loading = false;
      btn.disabled = false; btn.textContent = '↻ Оновити дані';
    }
  }

  /* ---------- Фільтрація ---------- */

  function filtered(skip) {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    return state.all.filter(t => {
      if (!t.filled) return false;
      if (q && !t.hay.includes(q)) return false;
      if (skip !== 'priority' && f.priority && t.priority !== f.priority) return false;
      if (skip !== 'section' && f.section && t.sectionNum !== f.section) return false;
      if (skip !== 'resp' && f.resp && !t.respList.includes(f.resp)) return false;
      if (skip !== 'term' && f.term) {
        if (f.term === '__dated') { if (!t.dated) return false; }
        else if (t.termCat !== f.term) return false;
      }
      return true;
    });
  }

  function anyFilter() {
    const f = state.filters;
    return !!(f.q || f.priority || f.section || f.resp || f.term);
  }

  function setFilter(key, value) {
    state.filters[key] = value;
    state.page = 1;
    render();
  }
  function toggleFilter(key, value) {
    setFilter(key, state.filters[key] === value ? '' : value);
  }
  function resetFilters() {
    state.filters = EMPTY_FILTERS();
    state.page = 1;
    $('#fSearch').value = '';
    render();
  }

  /* ---------- Селекти ---------- */

  function buildSelects() {
    const filledTasks = state.all.filter(t => t.filled);
    const priorities = Array.from(new Set(filledTasks.map(t => t.priority).filter(Boolean)));
    const sections = [];
    filledTasks.forEach(t => { if (t.sectionNum && !sections.find(s => s.num === t.sectionNum)) sections.push({ num: t.sectionNum, title: t.sectionTitle }); });
    // розділи без заповнених завдань теж показуємо
    state.all.forEach(t => { if (t.sectionNum && !sections.find(s => s.num === t.sectionNum)) sections.push({ num: t.sectionNum, title: t.sectionTitle }); });
    sections.sort((a, b) => a.num - b.num);
    const resps = Array.from(new Set(filledTasks.flatMap(t => t.respList))).sort((a, b) => a.localeCompare(b, 'uk'));

    const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
    const opt = (v, l, title) => '<option value="' + esc(v) + '" title="' + esc(title || l) + '">' + esc(l) + '</option>';

    $('#fPriority').innerHTML = opt('', 'Усі напрями') + priorities.map(p => opt(p, short(p, 48), p)).join('');
    $('#fSection').innerHTML = opt('', 'Усі розділи') + sections.map(s => opt(s.num, 'Розділ ' + s.num + '. ' + short(s.title, 44), s.title)).join('');
    $('#fResp').innerHTML = opt('', 'Усі підрозділи') + resps.map(r => opt(r, short(r, 52), r)).join('');
    $('#fTerm').innerHTML = opt('', 'Усі терміни') + opt('__dated', 'З конкретним терміном') +
      TERM_ORDER.map(c => opt(c, c)).join('');
  }

  function syncControls() {
    const f = state.filters;
    if ($('#fSearch').value !== f.q) $('#fSearch').value = f.q;
    $('#fPriority').value = f.priority;
    $('#fSection').value = f.section;
    $('#fResp').value = f.resp;
    $('#fTerm').value = f.term;
    $('#pageSize').value = String(state.pageSize);
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  }

  /* ---------- KPI ---------- */

  function renderKpis() {
    const filled = state.all.filter(t => t.filled);
    const sections = new Set(filled.map(t => t.sectionNum)).size;
    const resps = new Set(filled.flatMap(t => t.respList)).size;
    const year = filled.filter(t => t.termCat === TERM_ORDER[0]).length;
    const dated = filled.filter(t => t.dated).length;
    const f = state.filters;
    const items = [
      { id: 'all', v: filled.length, l: 'Завдань у плані', active: !anyFilter() },
      { id: 'sections', v: sections, l: 'Розділів із завданнями' },
      { id: 'resps', v: resps, l: 'Підрозділів-виконавців' },
      { id: 'year', v: year, l: 'Виконуються протягом року', active: f.term === TERM_ORDER[0] },
      { id: 'dated', v: dated, l: 'З конкретним терміном', active: f.term === '__dated' }
    ];
    $('#kpis').innerHTML = items.map(i =>
      '<button type="button" class="kpi' + (i.active ? ' active' : '') + (i.warn ? ' warn' : '') + '" data-kpi="' + i.id + '">' +
      '<div class="kpi-value">' + i.v + '</div><div class="kpi-label">' + i.l + '</div></button>').join('');
  }

  /* ---------- Графіки ---------- */

  function drawBars(sel, entries, activeKey, dim) {
    const el = $(sel);
    if (!entries.length) { el.innerHTML = '<div class="empty">Немає даних за поточними фільтрами</div>'; return; }
    // довжина лінії = частка від загальної кількості завдань у плані
    const total = Math.max(state.all.filter(t => t.filled).length, 1);
    el.innerHTML = entries.map(e => {
      const pct = Math.min(e.count / total * 100, 100);
      return '<button type="button" class="bar' + (activeKey === e.key ? ' active' : '') + '" data-dim="' + dim + '" data-key="' + esc(e.key) + '" ' +
        'title="' + esc((e.title || e.label) + ' — ' + e.count + ' із ' + total + ' (' + pct.toFixed(0) + '%)') + '">' +
        '<span class="bar-label">' + esc(e.label) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="bar-count">' + e.count + '</span></button>';
    }).join('');
  }

  function renderCharts() {
    const f = state.filters;

    const byResp = {};
    filtered('resp').forEach(t => t.respList.forEach(r => { byResp[r] = (byResp[r] || 0) + 1; }));
    drawBars('#chResp', Object.entries(byResp).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
      .map(([k, c]) => ({ key: k, label: k, count: c })), f.resp, 'resp');

    const bySec = {};
    const secTitle = {};
    filtered('section').forEach(t => { bySec[t.sectionNum] = (bySec[t.sectionNum] || 0) + 1; secTitle[t.sectionNum] = t.sectionTitle; });
    drawBars('#chSection', Object.keys(bySec).sort((a, b) => a - b)
      .map(k => ({ key: k, label: 'Розділ ' + k + '. ' + (secTitle[k] || '').slice(0, 60) + ((secTitle[k] || '').length > 60 ? '…' : ''), title: secTitle[k], count: bySec[k] })), f.section, 'section');

    const byTerm = {};
    filtered('term').forEach(t => { byTerm[t.termCat] = (byTerm[t.termCat] || 0) + 1; });
    drawBars('#chTerm', TERM_ORDER.filter(c => byTerm[c] || f.term === c)
      .map(c => ({ key: c, label: c, count: byTerm[c] || 0 })), f.term, 'term');

  }

  /* ---------- Чіпи активних фільтрів ---------- */

  function renderChips() {
    const f = state.filters, chips = [];
    const add = (key, label) => chips.push('<button type="button" class="chip" data-chip="' + key + '">' + esc(label) + ' <b>✕</b></button>');
    if (f.q) add('q', 'Пошук: «' + f.q + '»');
    if (f.priority) add('priority', 'Напрям: ' + (f.priority.length > 40 ? f.priority.slice(0, 39) + '…' : f.priority));
    if (f.section) add('section', 'Розділ ' + f.section);
    if (f.resp) add('resp', f.resp);
    if (f.term) add('term', 'Термін: ' + (f.term === '__dated' ? 'конкретний' : f.term));
    $('#chips').innerHTML = chips.join('');
  }

  /* ---------- Таблиця / картки ---------- */

  const COLS = [
    { key: 'num', label: '№ з/п', w: '70px' },
    { key: 'task', label: 'Зміст завдання' },
    { key: 'resp', label: 'Відповідальні за виконання', w: '200px' },
    { key: 'term', label: 'Термін виконання', w: '140px' },
    { key: 'indicator', label: 'Індикатор виконання' },
    { key: 'result', label: 'Очікуваний результат' }
  ];

  function sorted(list) {
    const { key, dir } = state.sort;
    const arr = list.slice();
    arr.sort((a, b) => {
      let r;
      if (key === 'num') r = natCompare(a.num, b.num);
      else if (key === 'section') r = (+a.sectionNum || 0) - (+b.sectionNum || 0);
      else if (key === 'term') r = TERM_ORDER.indexOf(a.termCat) - TERM_ORDER.indexOf(b.termCat) || a.term.localeCompare(b.term, 'uk');
      else r = (a[key] || '').localeCompare(b[key] || '', 'uk');
      return r * dir || natCompare(a.num, b.num);
    });
    return arr;
  }

  function hl(text) {
    const s = esc(text);
    const q = state.filters.q.trim();
    if (!q) return s;
    try { return s.replace(new RegExp(escRe(esc(q)), 'gi'), m => '<mark>' + m + '</mark>'); }
    catch (e) { return s; }
  }

  function termTag(t) {
    if (!t.filled) return '<span class="tag empty">не заповнено</span>';
    return '<span class="tag' + (t.dated ? ' dated' : '') + '">' + esc(t.term || t.termCat) + '</span>';
  }

  function renderResults() {
    const list = sorted(filtered(null));
    state.current = list;
    const total = state.all.filter(t => t.filled).length;
    $('#resCount').textContent = 'Завдання: ' + list.length + (anyFilter() ? ' із ' + total : '');

    const size = state.pageSize;
    const pages = size ? Math.max(1, Math.ceil(list.length / size)) : 1;
    if (state.page > pages) state.page = pages;
    const start = size ? (state.page - 1) * size : 0;
    const slice = size ? list.slice(start, start + size) : list;

    const tableWrap = $('#tableWrap'), cardsWrap = $('#cardsWrap');
    tableWrap.hidden = state.view !== 'table';
    cardsWrap.hidden = state.view !== 'cards';

    if (!list.length) {
      const msg = '<div class="empty" style="padding:24px;text-align:center">Нічого не знайдено. Змініть або скиньте фільтри.</div>';
      tableWrap.innerHTML = msg; cardsWrap.innerHTML = msg; $('#pager').innerHTML = '';
      return;
    }

    // групування за розділами (коли список відсортовано за №)
    const grouped = state.sort.key === 'num' || state.sort.key === 'section';
    const secCount = {};
    list.forEach(t => { secCount[t.sectionNum] = (secCount[t.sectionNum] || 0) + 1; });
    let lastSec = null, lastPr = null;
    const heads = (t, table) => {
      if (!grouped) return '';
      let h = '';
      if (t.priority !== lastPr) {
        const txt = 'Пріоритетний напрям: ' + (t.priority || '—');
        h += table ? '<tr class="group-priority"><td colspan="6">' + esc(txt) + '</td></tr>'
                   : '<h3 class="group-priority">' + esc(txt) + '</h3>';
      }
      if (t.sectionNum !== lastSec || t.priority !== lastPr) {
        const txt = 'Розділ ' + t.sectionNum + '. ' + t.sectionTitle;
        const cnt = '<span class="group-count">завдань: ' + secCount[t.sectionNum] + '</span>';
        h += table ? '<tr class="group-row"><td colspan="6">' + esc(txt) + ' ' + cnt + '</td></tr>'
                   : '<h4 class="group-row">' + esc(txt) + ' ' + cnt + '</h4>';
      }
      lastSec = t.sectionNum; lastPr = t.priority;
      return h;
    };

    if (state.view === 'table') {
      const arrow = k => state.sort.key === k ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '';
      tableWrap.innerHTML = '<table><thead><tr>' +
        COLS.map(c => '<th' + (c.w ? ' style="width:' + c.w + '"' : '') + ' aria-sort="' + (state.sort.key === c.key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
          '<button type="button" data-sort="' + c.key + '">' + c.label + arrow(c.key) + '</button></th>').join('') +
        '</tr></thead><tbody>' +
        slice.map(t => {
          const i = list.indexOf(t);
          return heads(t, true) + '<tr tabindex="0" data-idx="' + i + '" class="' + (t.filled ? '' : 'unfilled') + '">' +
            '<td class="num">' + esc(t.num) + '</td>' +
            '<td><div class="clamp">' + (t.filled ? hl(t.task) : '<i>Пункт не заповнено</i>') + '</div></td>' +
            '<td>' + hl(t.resp) + '</td>' +
            '<td>' + termTag(t) + '</td>' +
            '<td><div class="clamp">' + hl(t.indicator) + '</div></td>' +
            '<td><div class="clamp">' + hl(t.result) + '</div></td></tr>';
        }).join('') + '</tbody></table>';
      cardsWrap.innerHTML = '';
    } else {
      cardsWrap.innerHTML = slice.map(t => {
        const i = list.indexOf(t);
        return heads(t, false) + '<article class="card' + (t.filled ? '' : ' unfilled') + '" tabindex="0" data-idx="' + i + '">' +
          '<div class="card-head"><span class="num-badge">' + esc(t.num) + '</span>' + termTag(t) + '</div>' +
          '<div class="card-sec">Розділ ' + esc(t.sectionNum) + '. ' + esc(t.sectionTitle) + '</div>' +
          '<div class="clamp">' + (t.filled ? hl(t.task) : '<i>Пункт не заповнено</i>') + '</div>' +
          '<div class="card-resp">' + hl(t.resp) + '</div></article>';
      }).join('');
      tableWrap.innerHTML = '';
    }
    renderPager(pages);
  }

  function renderPager(pages) {
    const el = $('#pager');
    if (pages <= 1) { el.innerHTML = ''; return; }
    const p = state.page, nums = new Set([1, pages, p - 1, p, p + 1, 2, pages - 1]);
    const arr = Array.from(nums).filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    let html = '<button type="button" data-page="' + (p - 1) + '"' + (p === 1 ? ' disabled' : '') + '>‹</button>';
    let prev = 0;
    arr.forEach(n => {
      if (n - prev > 1) html += '<span>…</span>';
      html += '<button type="button" data-page="' + n + '" class="' + (n === p ? 'active' : '') + '">' + n + '</button>';
      prev = n;
    });
    html += '<button type="button" data-page="' + (p + 1) + '"' + (p === pages ? ' disabled' : '') + '>›</button>';
    el.innerHTML = html;
  }

  /* ---------- Загальний рендер ---------- */

  function render() {
    syncControls();
    renderKpis();
    renderCharts();
    renderChips();
    renderResults();
    const filled = state.all.filter(t => t.filled).length;
    $('#heroSub').textContent = state.all.length ? 'Завдань у плані: ' + filled : 'Даних немає';
  }

  /* ---------- Модальне вікно ---------- */

  function openModal(i) {
    const t = state.current[i];
    if (!t) return;
    state.modalIndex = i;
    $('#mNum').textContent = '№ ' + t.num;
    $('#mTitle').textContent = t.filled ? t.task : 'Пункт не заповнено';
    const row = (h, v) => '<div class="mrow"><h4>' + h + '</h4><p>' + (v ? esc(v) : '—') + '</p></div>';
    $('#mBody').innerHTML =
      row('Пріоритетний напрям', t.priority) +
      row('Розділ', t.sectionNum ? 'Розділ ' + t.sectionNum + '. ' + t.sectionTitle : '') +
      row('Відповідальні за виконання', t.resp) +
      row('Термін виконання', t.term) +
      row('Індикатор виконання', t.indicator) +
      row('Очікуваний результат', t.result);
    $('#mPrev').disabled = i <= 0;
    $('#mNext').disabled = i >= state.current.length - 1;
    $('#modal').hidden = false;
    $('#mClose').focus();
  }
  function closeModal() { $('#modal').hidden = true; state.modalIndex = -1; }
  function stepModal(d) { if (state.modalIndex >= 0) openModal(state.modalIndex + d); }

  function copyCurrent() {
    const t = state.current[state.modalIndex];
    if (!t) return;
    const text = ['№ ' + t.num, t.task, 'Відповідальні: ' + t.resp, 'Термін: ' + t.term,
      'Індикатор: ' + t.indicator, 'Очікуваний результат: ' + t.result].join('\n');
    const done = () => toast('Скопійовано в буфер обміну');
    if (navigator.clipboard && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { toast('Не вдалося скопіювати'); }
    ta.remove();
  }

  /* ---------- Експорт / імпорт ---------- */

  function exportCsv() {
    const list = state.current.length ? state.current : sorted(filtered(null));
    if (!list.length) { toast('Немає даних для експорту'); return; }
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['№ з/п', 'Пріоритетний напрям', 'Розділ', 'Зміст завдання', 'Відповідальні за виконання', 'Термін виконання', 'Категорія терміну', 'Індикатор виконання', 'Очікуваний результат'];
    const lines = [head.map(q).join(';')].concat(list.map(t =>
      [t.num, t.priority, t.sectionNum ? 'Розділ ' + t.sectionNum + '. ' + t.sectionTitle : '', t.task, t.resp, t.term, t.termCat, t.indicator, t.result].map(q).join(';')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plan-roboty-2027.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Експортовано рядків: ' + list.length);
  }

  /* ---------- Звіт для друку ---------- */

  function printReport() {
    const list = state.current.slice().sort((a, b) => natCompare(a.num, b.num));
    if (!list.length) { toast('Немає даних для звіту'); return; }
    const f = state.filters;

    const parts = [];
    if (f.q) parts.push('пошук: «' + f.q + '»');
    if (f.priority) parts.push('напрям: ' + f.priority);
    if (f.section) parts.push('розділ ' + f.section);
    if (f.resp) parts.push('виконавець: ' + f.resp);
    if (f.term) parts.push('термін: ' + (f.term === '__dated' ? 'конкретний' : f.term));

    const sections = new Set(list.map(t => t.sectionNum)).size;
    const resps = new Set(list.flatMap(t => t.respList)).size;
    const year = list.filter(t => t.termCat === TERM_ORDER[0]).length;
    const dated = list.filter(t => t.dated).length;
    const stamp = new Date().toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    let html =
      '<div class="rep-head"><img src="logo.svg" alt="" class="rep-logo"><div>' +
      '<div class="rep-org">Державна служба України у справах дітей</div>' +
      '<h1>План роботи на 2027 рік</h1>' +
      '<div class="rep-meta">Звіт сформовано: ' + esc(stamp) + '</div></div></div>' +
      (parts.length ? '<p class="rep-filters"><b>Застосовані фільтри:</b> ' + esc(parts.join('; ')) + '</p>' : '') +
      '<div class="rep-stats">' +
      '<span><b>' + list.length + '</b> завдань</span><span><b>' + sections + '</b> розділів</span>' +
      '<span><b>' + resps + '</b> виконавців</span><span><b>' + year + '</b> протягом року</span>' +
      '<span><b>' + dated + '</b> з конкретним терміном</span></div>';

    let curSec = null, curPr = null, open = false;
    const closeTable = () => { if (open) { html += '</tbody></table>'; open = false; } };
    list.forEach(t => {
      if (t.sectionNum !== curSec || t.priority !== curPr) {
        closeTable();
        if (t.priority !== curPr) html += '<h3 class="rep-priority">Пріоритетний напрям: ' + esc(t.priority || '—') + '</h3>';
        html += '<h2 class="rep-section">Розділ ' + esc(t.sectionNum) + '. ' + esc(t.sectionTitle) + '</h2>' +
          '<table class="rep-table"><thead><tr><th style="width:5%">№</th><th style="width:25%">Зміст завдання</th>' +
          '<th style="width:15%">Відповідальні</th><th style="width:9%">Термін</th>' +
          '<th style="width:23%">Індикатор виконання</th><th style="width:23%">Очікуваний результат</th></tr></thead><tbody>';
        open = true; curSec = t.sectionNum; curPr = t.priority;
      }
      html += '<tr><td>' + esc(t.num) + '</td><td>' + esc(t.task) + '</td><td>' + esc(t.resp) + '</td><td>' +
        esc(t.term || t.termCat) + '</td><td>' + esc(t.indicator) + '</td><td>' + esc(t.result) + '</td></tr>';
    });
    closeTable();

    const box = $('#printReport');
    // обгортка з порожніми thead/tfoot створює поля на кожній сторінці,
    // бо @page margin = 0 (так браузер не друкує дату, назву сторінки, адресу сайту й номери сторінок)
    box.innerHTML = '<table class="rep-wrap"><thead><tr><td></td></tr></thead>' +
      '<tfoot><tr><td></td></tr></tfoot><tbody><tr><td>' + html + '</td></tr></tbody></table>';
    box.hidden = false;
    document.body.classList.add('report-mode');
    const cleanup = () => {
      document.body.classList.remove('report-mode');
      box.hidden = true; box.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 100);
  }

  /* ---------- Доступність, тости, автооновлення ---------- */

  function applyFont(i) {
    document.documentElement.style.fontSize = ['16px', '18px', '20px'][i] || '16px';
    $$('[data-font]').forEach(b => b.classList.toggle('active', +b.dataset.font === i));
    store.set('font', i);
  }
  function applyBW(on) {
    document.body.classList.toggle('bw', on);
    $('#btnBW').classList.toggle('active', on);
    $('#btnBW').setAttribute('aria-pressed', String(on));
    store.set('bw', on);
  }

  let toastTimer;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2500);
  }

  function startAutoRefresh() {
    clearInterval(state.timer);
    state.timer = setInterval(() => loadRemote(false), CONFIG.REFRESH_MS);
  }

  /* ---------- Події ---------- */

  function bind() {
    $('#btnRefresh').addEventListener('click', () => loadRemote(true));
    $('#btnExport').addEventListener('click', exportCsv);
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnReport').addEventListener('click', printReport);
    $('#brand').addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

    $$('[data-font]').forEach(b => b.addEventListener('click', () => applyFont(+b.dataset.font)));
    $('#btnBW').addEventListener('click', () => applyBW(!document.body.classList.contains('bw')));

    let searchTimer;
    $('#fSearch').addEventListener('input', e => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => setFilter('q', v), 180);
    });
    $('#fPriority').addEventListener('change', e => setFilter('priority', e.target.value));
    $('#fSection').addEventListener('change', e => setFilter('section', e.target.value));
    $('#fResp').addEventListener('change', e => setFilter('resp', e.target.value));
    $('#fTerm').addEventListener('change', e => setFilter('term', e.target.value));
    $('#btnReset').addEventListener('click', resetFilters);

    $('#pageSize').addEventListener('change', e => {
      state.pageSize = +e.target.value; state.page = 1; store.set('pageSize', state.pageSize); renderResults();
    });
    $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
      state.view = b.dataset.view; store.set('view', state.view); syncControls(); renderResults();
    }));

    // KPI
    $('#kpis').addEventListener('click', e => {
      const b = e.target.closest('[data-kpi]'); if (!b) return;
      const id = b.dataset.kpi;
      if (id === 'all') resetFilters();
      else if (id === 'year') toggleFilter('term', TERM_ORDER[0]);
      else if (id === 'dated') toggleFilter('term', '__dated');
      else if (id === 'sections') $('#chSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
      else if (id === 'resps') $('#chResp').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // графіки (делегування)
    $('.charts').addEventListener('click', e => {
      const b = e.target.closest('.bar'); if (!b) return;
      toggleFilter(b.dataset.dim, b.dataset.key);
    });

    // чіпи
    $('#chips').addEventListener('click', e => {
      const c = e.target.closest('[data-chip]'); if (!c) return;
      const k = c.dataset.chip;
      if (k === 'q') $('#fSearch').value = '';
      setFilter(k, '');
    });

    // сортування, відкриття рядків, пагінація
    $('#tableWrap').addEventListener('click', e => {
      const s = e.target.closest('[data-sort]');
      if (s) {
        const k = s.dataset.sort;
        state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
        state.page = 1; renderResults(); return;
      }
      const tr = e.target.closest('tr[data-idx]'); if (tr) openModal(+tr.dataset.idx);
    });
    $('#cardsWrap').addEventListener('click', e => {
      const c = e.target.closest('[data-idx]'); if (c) openModal(+c.dataset.idx);
    });
    const keyOpen = e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const r = e.target.closest('[data-idx]');
      if (r && r === e.target) { e.preventDefault(); openModal(+r.dataset.idx); }
    };
    $('#tableWrap').addEventListener('keydown', keyOpen);
    $('#cardsWrap').addEventListener('keydown', keyOpen);
    $('#pager').addEventListener('click', e => {
      const b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
      state.page = +b.dataset.page; renderResults();
      $('#results').scrollIntoView({ behavior: 'smooth' });
    });

    // модальне вікно
    $('#mClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', e => { if (e.target.dataset.close) closeModal(); });
    $('#mPrev').addEventListener('click', () => stepModal(-1));
    $('#mNext').addEventListener('click', () => stepModal(1));
    $('#mCopy').addEventListener('click', copyCurrent);
    document.addEventListener('keydown', e => {
      if ($('#modal').hidden) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowLeft') stepModal(-1);
      else if (e.key === 'ArrowRight') stepModal(1);
    });
  }

  /* ---------- Старт ---------- */

  function init() {
    bind();
    applyFont(store.get('font', 0));
    applyBW(store.get('bw', false));
    syncControls();
    startAutoRefresh();   // автоматичне оновлення з Google Таблиці щохвилини
    loadRemote(false);
  }
  init();
})();
}
