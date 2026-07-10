// ── State ──────────────────────────────────────────────────────────────────────
let ALL = [], FD = [];
let compStartDate = '', compEndDate = '', compMetric = 'premio_novo';
let CLAIMS = [], FD_CLAIMS = [];
let claimsSourceCounts = { sinistrosAvisados: 0, sinistrosPagamentos: 0 };
let sinistralView = 'seg', rentabilView = 'seg';
const PROD_TABS = ['visao-geral', 'producao', 'retencao', 'comparativo', 'metas', 'crosssell'];
let activeTipos = new Set();
const MS = { col: new Set(), grp: new Set(), ram: new Set(), seg: new Set() };
// Cross-sell state
const CROSS = { pessoa: 'PF', col: new Set(), ram: new Set() };
let crossSearch = '';
let crossSortKey = 'ltv', crossSortDir = 'desc';
let crossPage = 1;
let crossPenMode = 'penetracao'; // 'penetracao' | 'oportunidade'
const CROSS_PAGE_SIZE = 50;
let activeCancelMotivos = null;
const charts = {};
let sortKey = 'premio', sortDir = 'desc';
let periods = [];
const PERIOD_COLORS = ['#378ADD', '#639922', '#E24B4A', '#BA7517', '#534AB7', '#1D9E75', '#D4537E'];
// Retenção state
const RET_MS = { col: new Set(), ram: new Set(), grp: new Set(), mot: new Set() };
let retActiveTipos = new Set();
let retDetailFilter = '';
let retSortKey = 'pctQtd', retSortDir = 'desc';
const sectionState = { kpis: true, chart: true, table: true, 'ret-kpis': true, 'ret-charts': true, 'ret-cohort': true, 'ret-risco': true, 'ret-prod': true, 'ret-detail': true, 'cross-campanha': true, 'cross-table': true, 'comp-chart': true, 'comp-kpis': true, 'sin-kpis': true, 'sin-charts': true, 'sin-sinistralidade': true, 'sin-rentabilidade': true, 'metas-semanal': true, 'metas-colab': true };
let metaSortKey = 'totalAnt', metaSortDir = 'desc';
let metaWeekTeam = 'geral';    // geral | pessoais | patrimoniais
let metaWeekMetric = 'premio'; // premio | comissao
// Classificação de ramos para a aba Metas.
// normRamo: maiúsculas, sem acento, espaços colapsados — tolera variações de grafia da planilha.
const normRamo = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
// Ramos que NÃO entram na contagem da meta (match por trecho normalizado).
const META_EXCLUDED_KEYS = ['VIAGEM', 'CARTA VERDE', 'ACIDENTES PESSOAIS', 'PREVIDENCIA', 'EVENTOS ALEATORIOS', 'TRANSPORTES NACIONAIS'];
// Ramos da equipe Pessoal; os demais não-excluídos caem em Patrimonial.
const META_PESSOAIS_KEYS = ['VIDA', 'SAUDE', 'ODONTO', 'RC PROFISSIONAL', 'RC GERAL', 'RC ADMINISTRADORES', 'ADMINISTRADORES E DIRETORES', 'D&O'];
// → 'excluded' | 'pessoais' | 'patrimoniais'
function classifyRamo(ramo) {
  const n = normRamo(ramo);
  if (META_EXCLUDED_KEYS.some(k => n.includes(k))) return 'excluded';
  if (META_PESSOAIS_KEYS.some(k => n.includes(k))) return 'pessoais';
  return 'patrimoniais';
}

// Produção da meta = N, R, EN, ER (mesma definição do resto do dashboard).
// O lado "novos" agrega N + endosso novo; "renovações" agrega R + endosso renovação.
function metaTipoSide(tipo) {
  if (tipo === 'N' || tipo === 'EN') return 'N';
  if (tipo === 'R' || tipo === 'ER') return 'R';
  return null; // CN, CR e demais não entram na base da meta
}

// ── Column mapping ─────────────────────────────────────────────────────────────
const COL = {
  tipo: 'TIPO DE NEGÓCIO', vig: 'INÍCIO DE VIGÊNCIA', em: 'DATA EMISSÃO',
  fim: 'TÉRMINO DE VIGÊNCIA', cli: 'CLIENTE', seg: 'SEGURADORA',
  ramo: 'RAMO', grp: 'GRUPO DE PRODUÇÃO', premio: 'PRÊMIO', com: 'COMISSÃO',
  colab: 'COLABORADOR', sit: 'SITUAÇÃO', motivo: 'MOTIVO CANCELAMENTO', cancel: 'DATA CANCELAMENTO',
  doc: 'CPF/CNPJ', pessoa: 'TIPO PESSOA', tipoDoc: 'TIPO DOCUMENTO', campanha: 'CAMPANHA'
};
const TIPO_LABELS = { R: 'R — Renovação', N: 'N — Negócio novo', ER: 'ER — Endosso renov.', EN: 'EN — Endosso novo', CR: 'CR — Cancel. renov.', CN: 'CN — Cancel. novo' };
const PALETA = ['#378ADD', '#639922', '#E24B4A', '#BA7517', '#534AB7', '#1D9E75', '#D4537E', '#888780', '#5DCAA5', '#F09595', '#97C459', '#BC8CFF'];

// ── Theme Responsiveness ───────────────────────────────────────────────────────
const darkQuery = window.matchMedia('(prefers-color-scheme:dark)');
const dark = () => darkQuery.matches;
const axisClr = () => dark() ? '#8b949e' : '#888';
const gridClr = () => dark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.055)';
const labelClr = () => dark() ? '#c9d1d9' : '#444';
const borderClr = () => dark() ? '#161b22' : '#fff';

darkQuery.addEventListener('change', () => {
  if (typeof ALL !== 'undefined' && ALL.length > 0) {
    if (document.getElementById('dash').style.display !== 'none') {
      render();
      const tP = document.getElementById('tab-producao');
      if (tP && tP.classList.contains('active')) renderProdTab();
      const tR = document.getElementById('tab-retencao');
      if (tR && tR.classList.contains('active')) renderRetTab();
      const tC = document.getElementById('tab-comparativo');
      if (tC && tC.classList.contains('active')) renderCompTab();
      const tM = document.getElementById('tab-metas');
      if (tM && tM.classList.contains('active')) renderMetasTab();
    }
  }
});

// ── Formatters ─────────────────────────────────────────────────────────────────
const fBRL = v => (!v && v !== 0) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);
const fN = v => new Intl.NumberFormat('pt-BR').format(Math.round(v));
const fP = v => (v * 100).toFixed(2) + '%';
const fPct = v => v != null ? (v * 100).toFixed(2) + '%' : '—';
const fShort = v => v >= 1e6 ? 'R$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? 'R$' + (v / 1e3).toFixed(2) + 'k' : 'R$' + Math.round(v);

function toDate(v) {
  if (!v) return null; if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
  const p = new Date(v); return isNaN(p) ? null : p;
}
const fmtD = d => { if (!d) return ''; const dt = toDate(d); return dt ? dt.toISOString().slice(0, 10) : ''; };
const today = () => new Date();
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getMetric = name => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : 'premio'; };
function mkChart(id, cfg) { if (charts[id]) charts[id].destroy(); const c = document.getElementById(id); if (!c) return; charts[id] = new Chart(c, cfg); }

// churn badge color helper
function churnBadge(pct) {
  const cls = pct >= 0.15 ? 'churn-badge-red' : pct >= 0.05 ? 'churn-badge-amber' : 'churn-badge-green';
  return `<span class="churn-badge ${cls}">${fP(pct)}</span>`;
}

// ── Modo TV ────────────────────────────────────────────────────────────────────
// Esconde as barras de filtro para exibição passiva (ex: TV do time). Preferência
// salva no localStorage — persiste entre reloads, já que a tela fica ligada o dia todo.
function applyTvMode(on) {
  document.body.classList.toggle('tv-mode', on);
  const btn = document.getElementById('tv-mode-btn');
  if (btn) btn.innerHTML = on ? '&#128250; Sair do modo TV' : '&#128250; Modo TV';
}
function toggleTvMode() {
  const on = !document.body.classList.contains('tv-mode');
  localStorage.setItem('tvMode', on ? '1' : '0');
  applyTvMode(on);
}
applyTvMode(localStorage.getItem('tvMode') === '1');

// ── Tab navigation ─────────────────────────────────────────────────────────────
function hasProducaoData() { return ALL.length > 0; }
function hasSinistrosData() { return CLAIMS.length > 0; }

function ensureTabNoDataEl(pane) {
  let el = pane.querySelector(':scope > .tab-no-data');
  if (!el) {
    el = document.createElement('div');
    el.className = 'tab-no-data';
    el.innerHTML = '<p class="tab-no-data-title">Sem fonte de dados</p><p class="tab-no-data-hint">A planilha correspondente não foi encontrada ou ainda não foi carregada no SharePoint.</p>';
    pane.appendChild(el);
  }
  return el;
}

function showTabNoData(id) {
  const pane = document.getElementById('tab-' + id);
  if (!pane) return;
  const noData = ensureTabNoDataEl(pane);
  pane.querySelectorAll(':scope > *:not(.tab-no-data)').forEach(c => { c.style.display = 'none'; });
  noData.style.display = 'flex';
}

function hideTabNoData(id) {
  const pane = document.getElementById('tab-' + id);
  if (!pane) return;
  const noData = pane.querySelector(':scope > .tab-no-data');
  if (noData) noData.style.display = 'none';
  pane.querySelectorAll(':scope > *:not(.tab-no-data)').forEach(c => { c.style.display = ''; });
}

function showTab(id, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');

  if (PROD_TABS.includes(id) && !hasProducaoData()) {
    showTabNoData(id);
    return;
  }
  if (id === 'sinistros' && !hasSinistrosData()) {
    showTabNoData(id);
    return;
  }
  hideTabNoData(id);

  if (id === 'visao-geral') render();
  if (id === 'producao') renderProdTab();
  if (id === 'retencao') renderRetTab();
  if (id === 'comparativo') renderCompTab();
  if (id === 'metas') renderMetasTab();
  if (id === 'crosssell') renderCrossTab();
  if (id === 'sinistros') renderSinistrosTab();
}

// ── Collapsible sections ───────────────────────────────────────────────────────
function toggleSection(key) {
  sectionState[key] = !sectionState[key];
  const body = document.getElementById('sb-' + key);
  const btn = document.getElementById('cb-' + key);
  const hdr = document.querySelector('#sc-' + key + ' .section-header');
  if (sectionState[key]) {
    body.style.display = ''; btn.textContent = '−';
    if (hdr) hdr.classList.add('open');
    if (key === 'chart') renderProdChart();
    if (key === 'ret-charts') renderRetCharts();
    if (key === 'ret-cohort') renderCohorts();
    if (key === 'ret-risco') renderRiskWarning();
    if (key === 'comp-chart' || key === 'comp-kpis') renderCompTab();
    if (['sin-kpis', 'sin-charts', 'sin-sinistralidade', 'sin-rentabilidade'].includes(key)) renderSinistrosTab();
    if (key === 'metas-semanal') renderMetasSemanal();
    if (key === 'metas-colab') renderMetasColabTable();
  } else {
    body.style.display = 'none'; btn.textContent = '+';
    if (hdr) hdr.classList.remove('open');
  }
}

// ── Multi-select ───────────────────────────────────────────────────────────────
function buildMultiSelect(containerId, msObj, key, vals, placeholder) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  const trigger = document.createElement('div'); trigger.className = 'ms-trigger';
  trigger.innerHTML = `<span class="ms-trigger-text placeholder">${placeholder}</span><span class="ms-arrow">▼</span>`;
  const dropdown = document.createElement('div'); dropdown.className = 'ms-dropdown';
  const search = document.createElement('input'); search.type = 'text'; search.className = 'ms-search'; search.placeholder = 'Buscar...';
  search.addEventListener('input', () => renderMsListGeneric(list, vals, msObj, key, search.value));
  dropdown.appendChild(search);
  const list = document.createElement('div'); list.className = 'ms-list';
  renderMsListGeneric(list, vals, msObj, key); dropdown.appendChild(list);
  const footer = document.createElement('div'); footer.className = 'ms-footer';
  footer.innerHTML = `<button>Marcar todos</button><button>Limpar</button>`;
  footer.querySelectorAll('button')[0].addEventListener('click', () => { vals.forEach(v => msObj[key].add(v)); renderMsListGeneric(list, vals, msObj, key); updateMsTriggerGeneric(wrap, msObj, key, placeholder); triggerFilter(containerId); });
  footer.querySelectorAll('button')[1].addEventListener('click', () => { msObj[key].clear(); renderMsListGeneric(list, vals, msObj, key); updateMsTriggerGeneric(wrap, msObj, key, placeholder); triggerFilter(containerId); });
  dropdown.appendChild(footer);
  wrap.appendChild(trigger); wrap.appendChild(dropdown);
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) { dropdown.classList.add('open'); trigger.classList.add('open'); search.value = ''; renderMsListGeneric(list, vals, msObj, key); search.focus(); }
  });
  wrap._msObj = msObj; wrap._key = key; wrap._vals = vals; wrap._list = list; wrap._placeholder = placeholder; wrap._cid = containerId;
  updateMsTriggerGeneric(wrap, msObj, key, placeholder);
}
function renderMsListGeneric(list, vals, msObj, key, filterStr = '') {
  const f = filterStr.toLowerCase();
  const filtered = f ? vals.filter(v => v.toLowerCase().includes(f)) : vals;
  if (!filtered.length) { list.innerHTML = '<div class="ms-empty">Nenhum resultado</div>'; return; }
  list.innerHTML = '';
  filtered.forEach(v => {
    const id = `ms-${key}-${v.replace(/\W/g, '_').slice(0, 30)}`;
    const item = document.createElement('div'); item.className = 'ms-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = msObj[key].has(v);
    cb.addEventListener('change', () => {
      if (cb.checked) msObj[key].add(v); else msObj[key].delete(v);
      const w = [...document.querySelectorAll('.ms-wrap')].find(w => w._msObj === msObj && w._key === key);
      if (w) updateMsTriggerGeneric(w, msObj, key, w._placeholder);
      triggerFilter(w ? w._cid : '');
    });
    const lbl = document.createElement('label'); lbl.htmlFor = id; lbl.title = v; lbl.textContent = v;
    item.appendChild(cb); item.appendChild(lbl); list.appendChild(item);
  });
}
function updateMsTriggerGeneric(wrap, msObj, key, placeholder) {
  const sel = msObj[key];
  const txt = wrap.querySelector('.ms-trigger-text');
  const trigger = wrap.querySelector('.ms-trigger');
  const old = trigger.querySelector('.ms-badge'); if (old) old.remove();
  if (sel.size === 0) { txt.textContent = placeholder; txt.className = 'ms-trigger-text placeholder'; }
  else if (sel.size === 1) { txt.textContent = [...sel][0]; txt.className = 'ms-trigger-text'; }
  else {
    txt.textContent = [...sel][0]; txt.className = 'ms-trigger-text';
    const badge = document.createElement('span'); badge.className = 'ms-badge'; badge.textContent = '+' + (sel.size - 1);
    trigger.insertBefore(badge, trigger.querySelector('.ms-arrow'));
  }
}
function triggerFilter(cid) {
  if (cid && cid.startsWith('ms-ret')) renderRetTab();
  else if (cid && cid.startsWith('ms-cross')) { crossPage = 1; renderCrossTab(); }
  else applyFilters();
}
function closeAllDropdowns() {
  document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger.open').forEach(t => t.classList.remove('open'));
}
document.addEventListener('click', function (e) { if (!e.target.closest('.ms-wrap')) closeAllDropdowns(); });

// ── Cancel filter (main tab) ───────────────────────────────────────────────────
function buildCancelFilter(canceladas) {
  const mot = {}; canceladas.forEach(r => { const m = r.motivo || 'Não informado'; mot[m] = (mot[m] || 0) + 1; });
  const sorted = Object.entries(mot).sort((a, b) => b[1] - a[1]);
  const list = document.getElementById('cancel-cb-list'); list.innerHTML = '';
  sorted.forEach(([m, n]) => {
    const id = 'cb-' + m.replace(/\W/g, '_').slice(0, 30);
    const item = document.createElement('div'); item.className = 'cancel-cb-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id;
    cb.checked = !activeCancelMotivos || activeCancelMotivos.has(m);
    cb.addEventListener('change', () => cancelCbToggle(m, cb.checked));
    const lbl = document.createElement('label'); lbl.htmlFor = id; lbl.textContent = m;
    const cnt = document.createElement('span'); cnt.className = 'cb-count'; cnt.textContent = n;
    item.appendChild(cb); item.appendChild(lbl); item.appendChild(cnt); list.appendChild(item);
  });
  updateCancelFilterCount();
}
function cancelCbToggle(motivo, checked) {
  if (!activeCancelMotivos) {
    activeCancelMotivos = new Set([...document.querySelectorAll('#cancel-cb-list .cancel-cb-item label')].map(l => l.textContent));
  }
  if (checked) activeCancelMotivos.add(motivo); else activeCancelMotivos.delete(motivo);
  const total = document.querySelectorAll('#cancel-cb-list input[type=checkbox]').length;
  if (activeCancelMotivos.size >= total) activeCancelMotivos = null;
  updateCancelFilterCount(); renderCancelamentos();
}
function cancelCbAll() { activeCancelMotivos = null; document.querySelectorAll('#cancel-cb-list input[type=checkbox]').forEach(cb => cb.checked = true); updateCancelFilterCount(); renderCancelamentos(); }
function cancelCbNone() { activeCancelMotivos = new Set(); document.querySelectorAll('#cancel-cb-list input[type=checkbox]').forEach(cb => cb.checked = false); updateCancelFilterCount(); renderCancelamentos(); }
function updateCancelFilterCount() {
  const total = document.querySelectorAll('#cancel-cb-list input[type=checkbox]').length;
  const sel = activeCancelMotivos ? activeCancelMotivos.size : total;
  document.getElementById('cancel-filter-count').textContent = sel === total ? 'todos' : sel + ' de ' + total;
}
function toggleCancelFilter() {
  const list = document.getElementById('cancel-cb-list'), arrow = document.getElementById('cancel-filter-arrow');
  const open = list.classList.toggle('open'); arrow.classList.toggle('open', open);
}

// ── File handling ──────────────────────────────────────────────────────────────
function parseProducaoArrayBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map(r => {
    const docDigits = String(r[COL.doc] || '').replace(/\D/g, '');
    const pessoaTxt = normRamo(r[COL.pessoa]);
    // Fallback pelo tamanho do documento: o CNPJ nesta base vem com máscara de 15 dígitos
    // (ex: 032.259.341/0001-72), não os 14 padrão — por isso ">11" em vez de "===14".
    const tipoPessoa = pessoaTxt.startsWith('JUR') ? 'PJ' : pessoaTxt.startsWith('FIS') ? 'PF'
      : docDigits.length === 11 ? 'PF' : docDigits.length > 11 ? 'PJ' : '';
    return {
      tipo: String(r[COL.tipo] || '').trim(), vig: toDate(r[COL.vig]), em: toDate(r[COL.em]),
      fim: toDate(r[COL.fim]), cli: String(r[COL.cli] || ''), seg: String(r[COL.seg] || ''),
      ramo: String(r[COL.ramo] || ''), grp: String(r[COL.grp] || ''),
      premio: parseFloat(r[COL.premio]) || 0, com: parseFloat(r[COL.com]) || 0,
      colab: String(r[COL.colab] || ''), sit: String(r[COL.sit] || ''),
      motivo: String(r[COL.motivo] || ''), cancel: toDate(r[COL.cancel]),
      docDigits, tipoPessoa, tipoDoc: String(r[COL.tipoDoc] || '').trim(),
      campanha: String(r[COL.campanha] || '').trim()
    };
  });
}

// ── Formatação de documento (CPF/CNPJ) ─────────────────────────────────────────
function formatDoc(digits, tipoPessoa) {
  if (!digits) return '—';
  if (tipoPessoa === 'PF' && digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (tipoPessoa === 'PJ' && digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}

function claimDedupeKey(r) {
  const id = (r.id || r.sinNum || '').trim();
  return id || null;
}

function mergeClaimsRows(target, incoming) {
  const seen = new Set(target.map(claimDedupeKey).filter(Boolean));
  incoming.forEach(r => {
    const k = claimDedupeKey(r);
    if (k) {
      if (seen.has(k)) return;
      seen.add(k);
    }
    target.push(r);
  });
}

function parseClaimsArrayBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map(r => ({
    id: String(r[COL_SIN.id] || '').trim(),
    sinNum: String(r[COL_SIN.sinNum] || '').trim(),
    abertura: toDate(r[COL_SIN.abertura]),
    aviso: toDate(r[COL_SIN.aviso]),
    encerra: toDate(r[COL_SIN.encerra]),
    status: String(r[COL_SIN.status] || '').trim(),
    seg: String(r[COL_SIN.seg] || '').trim(),
    ramo: String(r[COL_SIN.ramo] || '').trim(),
    cli: String(r[COL_SIN.cli] || '').trim(),
    valor: parseFloat(r[COL_SIN.valor]) || 0,
    pago: parseFloat(r[COL_SIN.pago]) || 0,
    impSeg: parseFloat(r[COL_SIN.impSeg]) || 0,
    franquia: parseFloat(r[COL_SIN.franquia]) || 0,
    prejEst: parseFloat(r[COL_SIN.prejEst]) || 0,
    premioPago: parseFloat(r[COL_SIN.premioPago]) || 0,
    motivo: String(r[COL_SIN.motivo] || '').trim(),
    tipoSin: String(r[COL_SIN.tipoSin] || '').trim(),
    colab: String(r[COL_SIN.colab] || '').trim(),
    grp: String(r[COL_SIN.grp] || '').trim()
  }));
}

function loadClaimsFromBuffers(buffersById) {
  const merged = [];
  claimsSourceCounts = { sinistrosAvisados: 0, sinistrosPagamentos: 0 };
  if (buffersById.sinistrosAvisados) {
    const rows = parseClaimsArrayBuffer(buffersById.sinistrosAvisados);
    claimsSourceCounts.sinistrosAvisados = rows.length;
    mergeClaimsRows(merged, rows);
  }
  if (buffersById.sinistrosPagamentos) {
    const rows = parseClaimsArrayBuffer(buffersById.sinistrosPagamentos);
    claimsSourceCounts.sinistrosPagamentos = rows.length;
    mergeClaimsRows(merged, rows);
  }
  CLAIMS = merged;
}

function updateDashHeader() {
  const parts = [];
  if (hasProducaoData()) parts.push('Produção: ' + fN(ALL.length));
  if (hasSinistrosData()) {
    let sinPart = 'Sinistros: ' + fN(CLAIMS.length);
    const av = claimsSourceCounts.sinistrosAvisados;
    const pg = claimsSourceCounts.sinistrosPagamentos;
    if (av || pg) sinPart += ' (avisados ' + fN(av) + ' · pagos ' + fN(pg) + ')';
    parts.push(sinPart);
  }
  document.getElementById('dash-subtitle').textContent = parts.length ? parts.join(' · ') : 'Nenhuma fonte carregada';
  if (hasProducaoData()) document.getElementById('rec-badge').textContent = fN(FD.length) + ' registros';
  else if (hasSinistrosData()) document.getElementById('rec-badge').textContent = fN(CLAIMS.length) + ' sinistros';
  else document.getElementById('rec-badge').textContent = '—';
  const filters = document.querySelector('.filters');
  if (filters) filters.style.opacity = hasProducaoData() ? '1' : '0.45';
}

function initDashboard(opts) {
  opts = opts || {};
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('dash').style.display = 'block';
  updateDashHeader();

  if (hasProducaoData()) {
    FD = [...ALL];
    if (!opts.keepFilters) {
      activeTipos = new Set();
      Object.keys(MS).forEach(k => MS[k].clear());
      activeCancelMotivos = null;
      periods = [];
      CROSS.pessoa = 'PF'; CROSS.col.clear(); CROSS.ram.clear(); crossSearch = '';
    }
    populateFilters();
    buildTipoBtns();
    const t0 = today();
    compStartDate = `${t0.getFullYear()}-01-01`;
    compEndDate = fmtD(t0);
    const cs = document.getElementById('comp-start');
    const ce = document.getElementById('comp-end');
    if (cs) cs.value = compStartDate;
    if (ce) ce.value = compEndDate;
  }

  if (hasSinistrosData()) recomputeFdClaims();

  const activePane = document.querySelector('.tab-pane.active');
  const activeId = activePane ? activePane.id.replace('tab-', '') : 'visao-geral';
  const activeBtn = document.querySelector('.tab-btn.active');

  if (opts.preferredTab) {
    const btn = document.querySelector('.tab-btn[onclick*="' + opts.preferredTab + '"]');
    if (btn) showTab(opts.preferredTab, btn);
    return;
  }

  if (PROD_TABS.includes(activeId) && !hasProducaoData() && hasSinistrosData()) {
    const sinBtn = document.querySelector('.tab-btn[onclick*="sinistros"]');
    if (sinBtn) { showTab('sinistros', sinBtn); return; }
  }

  if (activeBtn) showTab(activeId, activeBtn);
  else {
    const vgBtn = document.querySelector('.tab-btn[onclick*="visao-geral"]');
    if (vgBtn) showTab('visao-geral', vgBtn);
  }
}

function applySharePointData(payloads, warnings) {
  try {
    if (payloads.producao) ALL = parseProducaoArrayBuffer(payloads.producao);
    loadClaimsFromBuffers({
      sinistrosAvisados: payloads.sinistrosAvisados || null,
      sinistrosPagamentos: payloads.sinistrosPagamentos || null
    });
    if (warnings && warnings.length) console.warn('[SP] Avisos:', warnings.join(' · '));
    const preferredTab = !hasProducaoData() && hasSinistrosData() ? 'sinistros' : 'visao-geral';
    initDashboard({ preferredTab });
  } catch (err) {
    console.error('[SharePoint parse]', err);
    if (typeof _showError === 'function') _showError('Erro ao processar planilhas: ' + err.message);
  }
}

// ── Azure AD / SharePoint (MSAL) ──────────────────────────────────────────────
// Configuração no Azure AD (portal.azure.com):
//   1. Registro de app → Autenticação → Plataforma "Aplicativo de página única (SPA)"
//      URI de redirecionamento: http://localhost:5500/auth.html
//   2. Permissões de API → Microsoft Graph → Permissões delegadas → Files.Read.All
//   3. Conceder consentimento de administrador
//
// Estratégia (Brave-friendly):
//   - Sem ssoSilent (usa iframe + cookies de terceiros → Brave bloqueia)
//   - acquireTokenSilent só com conta em cache (sem iframe, sem cookies)
//   - loginPopup direto se não houver conta (popup é disparado pelo click)
//   - cache em localStorage (conta persiste entre sessões)
const _SP_TENANT  = '59190e65-5cad-4885-9f2d-77a59385667b';
const _SP_CLIENT  = '18d14ac5-16fc-46f4-8ffa-95f880138247';
const _SP_HOST    = 'santolinseguros.sharepoint.com';
const _SP_LIBRARY = 'Santolin';
const _SP_FOLDER  = 'Dashboard';
const _SP_SCOPES  = ['https://graph.microsoft.com/Files.Read.All'];
const _GRAPH      = 'https://graph.microsoft.com/v1.0';
const _SP_FILES   = { producao: 'producao.xlsx', sinistrosAvisados: 'sinistrosAvisados.xlsx', sinistrosPagamentos: 'sinistrosPagamentos.xlsx' };

let _msalApp   = null;
let _spDriveId = null;

function _buildMsal() {
  if (_msalApp) return _msalApp;
  if (typeof msal === 'undefined') {
    console.error('[MSAL] biblioteca não carregada — verifique a conexão com o CDN');
    return null;
  }
  // Usa a origem real da página (protocolo + host + porta) em vez de fixar localhost,
  // para funcionar tanto local (localhost:5500) quanto no site publicado (HTTPS).
  // Cada origem usada precisa estar registrada como redirect URI no app do Azure AD.
  const path = window.location.pathname.replace(/[^/]*$/, '');
  const redirectUri = `${window.location.origin}${path}auth.html`;
  console.log('[MSAL] redirectUri =', redirectUri);
  _msalApp = new msal.PublicClientApplication({
    auth: {
      clientId: _SP_CLIENT,
      authority: `https://login.microsoftonline.com/${_SP_TENANT}`,
      redirectUri,
    },
    cache: { cacheLocation: 'localStorage' }
  });
  return _msalApp;
}

async function _getSpToken() {
  const app = _buildMsal();
  if (!app) {
    alert('Biblioteca MSAL não carregou. Veja o console (F12).');
    return null;
  }

  // 1. Token silencioso a partir da conta em cache (não precisa de iframe nem cookie)
  const accounts = app.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const r = await app.acquireTokenSilent({ scopes: _SP_SCOPES, account: accounts[0] });
      console.log('[MSAL] token silencioso OK');
      return r.accessToken;
    } catch (e) {
      console.log('[MSAL] silencioso falhou, abrindo popup:', e.errorCode || e.message);
    }
  }

  // 2. Popup de login (precisa ser disparado pelo clique para o Brave não bloquear)
  try {
    const r = await app.loginPopup({
      scopes: _SP_SCOPES,
      prompt: accounts.length ? undefined : 'select_account',
    });
    console.log('[MSAL] login popup OK', r.account?.username);
    return r.accessToken;
  } catch (e) {
    console.error('[MSAL] popup falhou:', e);
    alert('Falha no login Microsoft: ' + (e.errorMessage || e.message || 'erro desconhecido') +
          '\n\nSe o Brave bloqueou o popup, libere popups para localhost e tente de novo.');
    return null;
  }
}

async function chooseProd() {
  const token = await _getSpToken();
  if (token) _spFetchAndLoad(token, 'prod');
}

async function chooseSin() {
  const token = await _getSpToken();
  if (token) _spFetchAndLoad(token, 'sin');
}

async function _spGetDriveId(token) {
  if (_spDriveId) return _spDriveId;
  const siteResp  = await fetch(`${_GRAPH}/sites/${_SP_HOST}`, { headers: { Authorization: `Bearer ${token}` } });
  const site      = await siteResp.json();
  const driveResp = await fetch(`${_GRAPH}/sites/${site.id}/drives`, { headers: { Authorization: `Bearer ${token}` } });
  const { value: drives } = await driveResp.json();
  const drive = drives.find(d => d.name.toLowerCase() === _SP_LIBRARY.toLowerCase());
  if (!drive) throw new Error(`Biblioteca "${_SP_LIBRARY}" não encontrada`);
  _spDriveId = drive.id;
  return _spDriveId;
}

async function _spFetchAndLoad(token, mode) {
  const keys = mode === 'prod'
    ? ['producao', 'sinistrosAvisados', 'sinistrosPagamentos']
    : ['sinistrosAvisados', 'sinistrosPagamentos'];

  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display = 'flex';
  document.getElementById('upload-zone').style.display = 'none';
  document.getElementById('progress-wrap').style.display = 'block';
  document.getElementById('progress-label').textContent = 'Carregando do SharePoint...';
  setProgress(10, 'Autenticado. Localizando arquivos...');

  try {
    const driveId = await _spGetDriveId(token);
    const payloads = {}, warnings = [];
    let done = 0;
    for (const key of keys) {
      setProgress(20 + Math.round(done / keys.length * 65), `Baixando ${_SP_FILES[key]}...`);
      const url  = `${_GRAPH}/drives/${driveId}/root:/${_SP_FOLDER}/${_SP_FILES[key]}:/content`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      done++;
      if (resp.ok) payloads[key] = await resp.arrayBuffer();
      else if (resp.status !== 404) warnings.push(`${key}: HTTP ${resp.status}`);
    }
    if (!Object.keys(payloads).length) throw new Error('Nenhum arquivo encontrado na pasta Dashboard');
    setProgress(95, 'Processando planilhas...');
    await new Promise(r => setTimeout(r, 50));
    applySharePointData(payloads, warnings);
  } catch (err) {
    console.warn('[SP fetch]', err);
    document.getElementById('progress-wrap').style.display = 'none';
    _spFallback(mode);
  }
}

function _spFallback(mode) {
  if (mode === 'sin') {
    document.getElementById('landing-screen').style.display = 'none';
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('dash').style.display = 'block';
    updateDashHeader();
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-sinistros').classList.add('active');
    const btn = document.querySelector('.tab-btn[onclick*="sinistros"]');
    if (btn) btn.classList.add('active');
    document.getElementById('sin-upload-card').style.display = '';
    document.getElementById('sin-dashboard').style.display = 'none';
  } else {
    document.getElementById('landing-screen').style.display = 'none';
    document.getElementById('upload-screen').style.display = 'flex';
    document.getElementById('upload-zone').style.display = '';
    document.getElementById('progress-wrap').style.display = 'none';
  }
}

function handleDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }
function setProgress(pct, msg) { document.getElementById('progress-bar-fill').style.width = pct + '%'; document.getElementById('progress-text').textContent = msg; }

function handleFile(file) {
  if (!file) return;
  const uploadScreen = document.getElementById('upload-screen');
  const dashVisible = document.getElementById('dash').style.display !== 'none';
  if (!dashVisible && uploadScreen) {
    document.getElementById('upload-zone').style.display = 'none';
    document.getElementById('progress-wrap').style.display = 'block';
    document.getElementById('progress-label').textContent = file.name;
    setProgress(10, 'Lendo arquivo...');
  }
  const reader = new FileReader();
  reader.onload = e => {
    if (!dashVisible) setProgress(30, 'Processando planilha...');
    setTimeout(() => {
      try {
        ALL = parseProducaoArrayBuffer(e.target.result);
        if (!dashVisible) {
          setProgress(100, 'Pronto!');
          setTimeout(() => initDashboard({ preferredTab: 'visao-geral' }), 300);
        } else {
          initDashboard({ keepFilters: true, preferredTab: document.querySelector('.tab-pane.active')?.id.replace('tab-', '') || 'visao-geral' });
        }
      } catch (err) {
        if (!dashVisible) {
          document.getElementById('progress-label').textContent = 'Erro ao processar arquivo';
          document.getElementById('progress-text').textContent = err.message;
        } else alert('Erro ao processar produção: ' + err.message);
        console.error(err);
      }
    }, dashVisible ? 0 : 50);
  };
  reader.readAsArrayBuffer(file);
}

function initDash(fname) { initDashboard({ preferredTab: 'visao-geral' }); }

// ── Global filters ─────────────────────────────────────────────────────────────
function populateFilters() {
  const uniq = field => [...new Set(ALL.map(r => r[field]).filter(Boolean))].sort();
  buildMultiSelect('ms-col', MS, 'col', uniq('colab'), 'Todos');
  buildMultiSelect('ms-grp', MS, 'grp', uniq('grp'), 'Todos');
  buildMultiSelect('ms-ram', MS, 'ram', uniq('ramo'), 'Todos');
  buildMultiSelect('ms-seg', MS, 'seg', uniq('seg'), 'Todas');
  buildMultiSelect('ms-ret-col', RET_MS, 'col', uniq('colab'), 'Todos');
  buildMultiSelect('ms-ret-ram', RET_MS, 'ram', uniq('ramo'), 'Todos');
  buildMultiSelect('ms-ret-grp', RET_MS, 'grp', uniq('grp'), 'Todos');
  buildMultiSelect('ms-ret-mot', RET_MS, 'mot', [...new Set(ALL.filter(r => r.sit === 'Cancelada').map(r => r.motivo || 'Não informado').filter(Boolean))].sort(), 'Todos');
  buildCrossFilters();
  ['f-vig-s', 'f-vig-e', 'f-em-s', 'f-em-e'].forEach(id => document.getElementById(id).addEventListener('change', applyFilters));
  ['ret-vig-s', 'ret-vig-e', 'ret-can-s', 'ret-can-e'].forEach(id => document.getElementById(id).addEventListener('change', renderRetTab));
}
function buildTipoBtns() {
  const tipos = [...new Set(ALL.map(r => r.tipo).filter(Boolean))].sort();
  const c = document.getElementById('tipo-btns'); c.innerHTML = '';
  tipos.forEach(t => {
    const btn = document.createElement('button'); btn.className = 'tipo-btn'; btn.textContent = TIPO_LABELS[t] || t; btn.dataset.tipo = t;
    btn.addEventListener('click', () => toggleTipo(t, btn)); c.appendChild(btn);
  });
}
function toggleTipo(t, btn) { activeTipos.has(t) ? (activeTipos.delete(t), btn.classList.remove('active')) : (activeTipos.add(t), btn.classList.add('active')); applyFilters(); }
function recomputeFdClaims() {
  const vs = document.getElementById('f-vig-s').value, ve = document.getElementById('f-vig-e').value;
  FD_CLAIMS = CLAIMS.filter(r => {
    if (vs && r.aviso && fmtD(r.aviso) < vs) return false;
    if (ve && r.aviso && fmtD(r.aviso) > ve) return false;
    if (MS.col.size > 0 && !MS.col.has(r.colab)) return false;
    if (MS.grp.size > 0 && !MS.grp.has(r.grp)) return false;
    if (MS.ram.size > 0 && !MS.ram.has(r.ramo)) return false;
    if (MS.seg.size > 0 && !MS.seg.has(r.seg)) return false;
    return true;
  });
}

function applyFilters() {
  const vs = document.getElementById('f-vig-s').value, ve = document.getElementById('f-vig-e').value;
  const es = document.getElementById('f-em-s').value, ee = document.getElementById('f-em-e').value;
  FD = ALL.filter(r => {
    if (vs && r.vig && fmtD(r.vig) < vs) return false; if (ve && r.vig && fmtD(r.vig) > ve) return false;
    if (es && r.em && fmtD(r.em) < es) return false; if (ee && r.em && fmtD(r.em) > ee) return false;
    if (MS.col.size > 0 && !MS.col.has(r.colab)) return false;
    if (MS.grp.size > 0 && !MS.grp.has(r.grp)) return false;
    if (MS.ram.size > 0 && !MS.ram.has(r.ramo)) return false;
    if (MS.seg.size > 0 && !MS.seg.has(r.seg)) return false;
    if (activeTipos.size > 0 && !activeTipos.has(r.tipo)) return false;
    return true;
  });
  recomputeFdClaims();
  document.getElementById('rec-badge').textContent = fN(FD.length) + ' registros';
  activeCancelMotivos = null;
  render();
  if (document.getElementById('tab-producao').classList.contains('active')) renderProdTab();
  if (document.getElementById('tab-comparativo').classList.contains('active')) renderCompTab();
  if (document.getElementById('tab-metas').classList.contains('active')) renderMetasTab();
  if (document.getElementById('tab-sinistros').classList.contains('active')) renderSinistrosTab();
}
function resetFilters() {
  ['f-vig-s', 'f-vig-e', 'f-em-s', 'f-em-e'].forEach(id => document.getElementById(id).value = '');
  Object.keys(MS).forEach(k => MS[k].clear());
  [...document.querySelectorAll('.ms-wrap')].forEach(w => { if (w._msObj === MS && w._key) { renderMsListGeneric(w._list, w._vals, MS, w._key); updateMsTriggerGeneric(w, MS, w._key, w._placeholder); } });
  activeTipos = new Set(); document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
  activeCancelMotivos = null; FD = [...ALL]; FD_CLAIMS = [...CLAIMS];
  document.getElementById('rec-badge').textContent = fN(FD.length) + ' registros';
  render();
  if (document.getElementById('tab-producao').classList.contains('active')) renderProdTab();
  if (document.getElementById('tab-comparativo').classList.contains('active')) renderCompTab();
  if (document.getElementById('tab-metas').classList.contains('active')) renderMetasTab();
  if (document.getElementById('tab-sinistros').classList.contains('active')) renderSinistrosTab();
}
function resetRetFilters() {
  ['ret-vig-s', 'ret-vig-e', 'ret-can-s', 'ret-can-e'].forEach(id => document.getElementById(id).value = '');
  Object.keys(RET_MS).forEach(k => RET_MS[k].clear());
  [...document.querySelectorAll('.ms-wrap')].forEach(w => { if (w._msObj === RET_MS && w._key) { renderMsListGeneric(w._list, w._vals, RET_MS, w._key); updateMsTriggerGeneric(w, RET_MS, w._key, w._placeholder); } });
  retActiveTipos = new Set();
  document.querySelectorAll('#ret-tipo-R,#ret-tipo-N,#ret-tipo-CR,#ret-tipo-CN').forEach(b => b.classList.remove('active'));
  renderRetTab();
}
function toggleRetTipo(t, btn) {
  if (retActiveTipos.has(t)) { retActiveTipos.delete(t); btn.classList.remove('active'); }
  else { retActiveTipos.add(t); btn.classList.add('active'); }
  renderRetTab();
}

// ── Get retenção filtered data ─────────────────────────────────────────────────
function getRetData() {
  const vs = document.getElementById('ret-vig-s').value, ve = document.getElementById('ret-vig-e').value;
  const cs = document.getElementById('ret-can-s').value, ce = document.getElementById('ret-can-e').value;
  return ALL.filter(r => {
    if (vs && r.vig && fmtD(r.vig) < vs) return false;
    if (ve && r.vig && fmtD(r.vig) > ve) return false;
    if (cs && r.cancel && fmtD(r.cancel) < cs) return false;
    if (ce && r.cancel && fmtD(r.cancel) > ce) return false;
    if (RET_MS.col.size > 0 && !RET_MS.col.has(r.colab)) return false;
    if (RET_MS.ram.size > 0 && !RET_MS.ram.has(r.ramo)) return false;
    if (RET_MS.grp.size > 0 && !RET_MS.grp.has(r.grp)) return false;
    if (RET_MS.mot.size > 0 && (r.sit === 'Cancelada' || r.tipo === 'CN' || r.tipo === 'CR') && !RET_MS.mot.has(r.motivo || 'Não informado')) return false;
    if (retActiveTipos.size > 0 && !retActiveTipos.has(r.tipo)) return false;
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VISÃO GERAL ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function render() { renderKPIs(); renderEvolucao(); renderCancelamentos(); renderSeguradora(); renderRamo(); }

function renderKPIs() {
  const vs = document.getElementById('f-vig-s').value, ve = document.getElementById('f-vig-e').value;
  const es = document.getElementById('f-em-s').value, ee = document.getElementById('f-em-e').value;
  const filtersEmpty = !vs && !ve && !es && !ee;

  let d = FD;
  if (filtersEmpty) {
    const cy = today().getFullYear();
    d = FD.filter(r => {
      const dt = toDate(r.vig) || toDate(r.em);
      return dt && dt.getFullYear() === cy;
    });
  }

  const premio = d.reduce((s, r) => s + r.premio, 0), com = d.reduce((s, r) => s + r.com, 0);
  const cliSet = new Set(d.map(r => r.cli)), withP = d.filter(r => r.premio > 0);
  const ticket = withP.length ? withP.reduce((s, r) => s + r.premio, 0) / withP.length : 0;
  const cancel = d.filter(r => r.sit === 'Cancelada'), churn = d.length ? cancel.length / d.length : 0;
  const todayStr = fmtD(today()), d30 = fmtD(addDays(today(), 30));
  const venc30 = d.filter(r => r.fim && fmtD(r.fim) >= todayStr && fmtD(r.fim) <= d30).length;
  const renov = d.filter(r => r.tipo === 'R').length;

  const ctxLabelPolices = filtersEmpty ? fN(d.length) + ' apólices este ano' : fN(d.length) + ' apólices';
  const ctxLabel = filtersEmpty ? 'neste ano' : 'na seleção atual';

  document.getElementById('kpi-grid').innerHTML = [
    { l: 'Prêmio total', v: fBRL(premio), s: ctxLabelPolices, c: 'k-blue' },
    { l: 'Comissão total', v: fBRL(com), s: premio ? fP(com / premio) + ' do prêmio' : '—', c: 'k-green' },
    { l: 'Ticket médio: Prêmio', v: fBRL(ticket), s: fN(withP.length) + ' c/ prêmio', c: 'k-purple' },
    { l: 'Ticket médio: Comissão', v: fBRL(withP.length ? com / withP.length : 0), s: 'por apólice', c: 'k-green' },
    { l: 'Clientes únicos', v: fN(cliSet.size), s: ctxLabel, c: 'k-teal' },
    { l: 'Vencendo em 30d', v: fN(venc30), s: 'renovações pendentes', c: 'k-amber' },
  ].map(k => `<div class="kpi ${k.c}"><div class="kpi-label">${k.l}</div><div class="kpi-value">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('');
}

function renderEvolucao() {
  const field = getMetric('mt-evol') === 'comissao' ? 'com' : 'premio';
  const curYear = today().getFullYear(), prevYear = curYear - 1;
  const cur = {}, prev = {};
  FD.forEach(r => {
    if (!r.vig) return; const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return;
    const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0');
    if (y === curYear) cur[m] = (cur[m] || 0) + r[field]; else if (y === prevYear) prev[m] = (prev[m] || 0) + r[field];
  });
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const mLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  document.getElementById('leg-cur').textContent = String(curYear);
  document.getElementById('leg-prev').textContent = String(prevYear);
  const ac = axisClr(), gc = gridClr();
  mkChart('ch-evolucao', {
    type: 'line', data: {
      labels: mLabels, datasets: [
        { label: String(curYear), data: months.map(m => cur[m] || 0), borderColor: '#639922', backgroundColor: 'rgba(99,153,34,0.08)', fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#639922', borderWidth: 2 },
        { label: String(prevYear), data: months.map(m => prev[m] || 0), borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.06)', fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#E24B4A', borderWidth: 2, borderDash: [5, 3] }
      ]
    }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fBRL(ctx.raw) } } }, scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 }, callback: fShort }, grid: { color: gc } } } }
  });
  document.getElementById('var-bar').innerHTML = months.map((m, i) => {
    const c = cur[m] || 0, p = prev[m] || 0; let cls = 'var-neu', txt = '—';
    if (p > 0) { const pct = ((c - p) / p) * 100; cls = pct >= 0 ? 'var-pos' : 'var-neg'; txt = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'; }
    else if (c > 0) { cls = 'var-pos'; txt = 'novo'; }
    return `<div class="var-item ${cls}" title="${mLabels[i]}: ${txt}">${txt}</div>`;
  }).join('');
}

function renderCancelamentos() {
  const canceladas = FD.filter(r => r.sit === 'Cancelada');
  buildCancelFilter(canceladas);
  const filtered = activeCancelMotivos ? canceladas.filter(r => activeCancelMotivos.has(r.motivo || 'Não informado')) : canceladas;
  document.getElementById('cancel-badge').textContent = fN(filtered.length) + ' cancelamentos';
  const mot = {}; filtered.forEach(r => { const m = r.motivo || 'Não informado'; mot[m] = (mot[m] || 0) + 1; });
  const sorted = Object.entries(mot).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) { if (charts['ch-cancel']) charts['ch-cancel'].destroy(); document.getElementById('cancel-wrap').style.height = '60px'; return; }
  document.getElementById('cancel-wrap').style.height = Math.max(220, sorted.length * 38 + 60) + 'px';
  const ac = axisClr(), lc = labelClr(), gc = gridClr();
  mkChart('ch-cancel', { type: 'bar', data: { labels: sorted.map(m => m[0].length > 40 ? m[0].slice(0, 37) + '...' : m[0]), datasets: [{ data: sorted.map(m => m[1]), backgroundColor: sorted.map((_, i) => i === 0 ? 'rgba(226,75,74,.85)' : i <= 2 ? 'rgba(226,75,74,.6)' : 'rgba(226,75,74,.4)'), borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + ' apólices' } } }, scales: { x: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } } } });
}

function renderSeguradora() {
  const field = getMetric('mt-seg') === 'comissao' ? 'com' : 'premio';
  const bySeg = {}; FD.forEach(r => { if (r.seg) bySeg[r.seg] = (bySeg[r.seg] || 0) + r[field]; });
  const sorted = Object.entries(bySeg).sort((a, b) => b[1] - a[1]);
  const top8 = sorted.slice(0, 8), outros = sorted.slice(8).reduce((s, e) => s + e[1], 0);
  const items = outros > 0 ? [...top8, ['Outros', outros]] : top8;
  const total = items.reduce((s, e) => s + e[1], 0);
  const short = n => n.replace(' CIA DE SEGUROS GERAIS S/A', '').replace(' CIA NAC DE SEGUROS S/A', '').replace(' SEGUROS S/A', '').replace(' SEGURADORA S/A', '').replace(' SEGURADORA', '').replace(' SEGS CORPORATIVOS SA', '').trim();
  const labels = items.map(e => short(e[0])), colors = PALETA.slice(0, items.length);
  document.getElementById('seg-legend').innerHTML = labels.map((l, i) => `<span><span class="leg-dot" style="background:${colors[i]}"></span>${l} ${fP(total ? items[i][1] / total : 0)}</span>`).join('');
  mkChart('ch-seg', { type: 'doughnut', data: { labels, datasets: [{ data: items.map(e => e[1]), backgroundColor: colors, borderWidth: 2, borderColor: borderClr() }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + fBRL(ctx.raw) + ' (' + fP(total ? ctx.raw / total : 0) + ')'; } } } } } });
}

function renderRamo() {
  const field = getMetric('mt-ramo') === 'comissao' ? 'com' : 'premio';
  const byR = {}; FD.forEach(r => { if (r.ramo) byR[r.ramo] = (byR[r.ramo] || 0) + r[field]; });
  const sorted = Object.entries(byR).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const short = n => n.replace('AUTOMÓVEL - CASCO', 'Auto — casco').replace('COMPREENSIVO RESIDENCIAL', 'Comp. residencial').replace('COMPREENSIVO EMPRESARIAL', 'Comp. empresarial').replace('COMPREENSIVO CONDOMÍNIO', 'Comp. condomínio').replace('RC PROFISSIONAL', 'RC profissional').replace('VIDA INDIVIDUAL', 'Vida individual').replace('VIDA EM GRUPO', 'Vida em grupo').replace('TRANSPORTE NACIONAL', 'Transporte nac.').replace('RISCOS DIVERSOS', 'Riscos diversos').replace('RISCOS DE ENGENHARIA', 'Riscos engenharia').replace('OUTROS RAMOS', 'Outros ramos').toLowerCase().replace(/^\w/, c => c.toUpperCase());
  const ac = axisClr(), lc = labelClr(), gc = gridClr();
  mkChart('ch-ramo', { type: 'bar', data: { labels: sorted.map(e => short(e[0])), datasets: [{ data: sorted.map(e => e[1]), backgroundColor: PALETA.slice(0, sorted.length), borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fBRL(ctx.raw) } } }, scales: { x: { ticks: { color: ac, font: { size: 10 }, callback: fShort }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } } } });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PRODUÇÃO TAB ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function getViewKey() { return getMetric('vt') === 'grp' ? 'grp' : 'colab'; }
function getViewLabel() { return getMetric('vt') === 'grp' ? 'Grupo de produção' : 'Colaborador'; }
function buildProdData(data) {
  const key = getViewKey(); const map = {};
  data.forEach(r => {
    const k = r[key] || 'Sem identificação';
    if (!map[k]) map[k] = { nome: k, premio: 0, com: 0, qtd: 0, clis: new Set() };
    map[k].premio += r.premio; map[k].com += r.com; map[k].qtd++;
    if (r.cli) map[k].clis.add(r.cli);
  });
  const totalPremio = Object.values(map).reduce((s, v) => s + v.premio, 0);
  const totalCom = Object.values(map).reduce((s, v) => s + v.com, 0);
  const metric = getMetric('mt-tbl');
  const totalEscolhido = metric === 'comissao' ? totalCom : totalPremio;
  return Object.values(map).map(v => ({ ...v, ticket: v.qtd ? v.premio / v.qtd : 0, pctCom: v.premio ? v.com / v.premio : 0, pctTotal: totalEscolhido ? (metric === 'comissao' ? v.com : v.premio) / totalEscolhido : 0, cliCount: v.clis.size }));
}
function calcDestaque(rows, mpv, mcv, mpcv, mqv) {
  const scored = rows.map(r => ({ nome: r.nome, ticket: r.ticket, score: (r.premio === mpv ? .30 : 0) + (r.com === mcv ? .40 : 0) + (r.pctCom === mpcv ? .10 : 0) + (r.qtd === mqv ? .20 : 0) }));
  if (!scored.length) return null;
  return scored.reduce((a, b) => b.score > a.score ? b : b.score === a.score && b.ticket > a.ticket ? b : a);
}
function renderProdTab() {
  renderProdKPIs(); if (sectionState.chart) renderProdChart(); renderProdTable();
  document.getElementById('prod-view-label').textContent = fN(FD.length) + ' registros · ' + getViewLabel();
}
function renderProdKPIs() {
  const d = FD, premio = d.reduce((s, r) => s + r.premio, 0), com = d.reduce((s, r) => s + r.com, 0);
  const withP = d.filter(r => r.premio > 0), ticket = withP.length ? withP.reduce((s, r) => s + r.premio, 0) / withP.length : 0;
  const rows = buildProdData(d), avgCom = premio ? com / premio : 0;
  const mpv = Math.max(...rows.map(r => r.premio)), mcv = Math.max(...rows.map(r => r.com)), mpcv = Math.max(...rows.map(r => r.pctCom)), mqv = Math.max(...rows.map(r => r.qtd));
  const topRow = rows.length ? rows.reduce((a, b) => b.premio > a.premio ? b : a, rows[0]) : { nome: '—', premio: 0 };
  const topName = topRow.nome.split(' - ')[0].split('|')[0].trim().split(' ').slice(0, 2).join(' ');
  const label = getViewLabel();
  const destaque = calcDestaque(rows, mpv, mcv, mpcv, mqv);
  document.getElementById('prod-kpi-badge').textContent = label;
  document.getElementById('prod-kpi-grid').innerHTML = [
    { l: 'Prêmio total', v: fBRL(premio), s: fN(d.length) + ' apólices', c: 'k-blue' },
    { l: 'Comissão total', v: fBRL(com), s: fP(avgCom) + ' do prêmio', c: 'k-green' },
    { l: 'Ticket médio', v: fBRL(ticket), s: fN(withP.length) + ' c/ prêmio', c: 'k-purple' },
    { l: label + 's ativos', v: fN(rows.length), s: 'na seleção atual', c: 'k-teal' },
    { l: 'Destaque', v: destaque?.nome?.split(' - ')[0]?.trim()?.split(' ')?.slice(0, 2)?.join(' ') || '—', s: destaque ? (destaque.score * 100).toFixed(0) + ' pontos' : '—', c: 'k-amber' },
    { l: 'Com. média %', v: fP(avgCom), s: 'comissão / prêmio', c: 'k-green' },
  ].map(k => `<div class="kpi ${k.c}"><div class="kpi-label">${k.l}</div><div class="kpi-value" style="font-size:${k.v.length > 10 ? '15px' : '20px'}">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('');
}
function addPeriod() {
  const s = document.getElementById('period-start').value, e = document.getElementById('period-end').value;
  if (!s || !e) { alert('Selecione data de início e fim.'); return; }
  if (s > e) { alert('Início deve ser anterior ao fim.'); return; }
  if (periods.length >= 7) { alert('Máximo 7 períodos.'); return; }
  const fmt = d => { const [y, m] = d.split('-'); return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][+m - 1] + '/' + y.slice(2); };
  periods.push({ start: s, end: e, label: `${fmt(s)} → ${fmt(e)}`, color: PERIOD_COLORS[periods.length % PERIOD_COLORS.length] });
  document.getElementById('period-start').value = ''; document.getElementById('period-end').value = '';
  renderPeriodTags(); renderProdChart();
}
function removePeriod(i) { periods.splice(i, 1); periods.forEach((p, idx) => p.color = PERIOD_COLORS[idx % PERIOD_COLORS.length]); renderPeriodTags(); renderProdChart(); }
function clearPeriods() { periods = []; renderPeriodTags(); renderProdChart(); }
function renderPeriodTags() {
  document.getElementById('period-tags').innerHTML = periods.map((p, i) =>
    `<div class="period-tag"><span class="pt-dot" style="background:${p.color}"></span><span class="pt-label">${p.label}</span><span class="pt-remove" onclick="removePeriod(${i})">×</span></div>`
  ).join('');
}
function renderProdChart() {
  const field = getMetric('mt-prod') === 'comissao' ? 'com' : 'premio';
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const mLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const ac = axisClr(), gc = gridClr();
  let datasets, legendHtml;
  if (!periods.length) {
    const curYear = today().getFullYear(), prevYear = curYear - 1; const cur = {}, prev = {};
    FD.forEach(r => { if (!r.vig) return; const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return; const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'); if (y === curYear) cur[m] = (cur[m] || 0) + r[field]; else if (y === prevYear) prev[m] = (prev[m] || 0) + r[field]; });
    datasets = [{ label: String(curYear), data: months.map(m => cur[m] || 0), borderColor: '#639922', backgroundColor: 'rgba(99,153,34,0.07)', fill: true, tension: .35, pointRadius: 3, borderWidth: 2.5 }, { label: String(prevYear), data: months.map(m => prev[m] || 0), borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.04)', fill: true, tension: .35, pointRadius: 3, borderWidth: 2, borderDash: [6, 3] }];
    legendHtml = `<span><span class="leg-dot" style="background:#639922;display:inline-block"></span>${curYear} — atual</span><span><span class="leg-dot" style="background:#E24B4A;display:inline-block"></span>${prevYear} — anterior</span><span style="font-size:10px;opacity:.5">· Adicione períodos para comparar janelas específicas</span>`;
  } else {
    datasets = periods.map(p => { const byMonth = {}; ALL.filter(r => r.vig && fmtD(r.vig) >= p.start && fmtD(r.vig) <= p.end).forEach(r => { const dt = toDate(r.vig); if (!dt) return; const m = String(dt.getMonth() + 1).padStart(2, '0'); byMonth[m] = (byMonth[m] || 0) + r[field]; }); return { label: p.label, data: months.map(m => byMonth[m] || 0), borderColor: p.color, backgroundColor: p.color + '15', fill: false, tension: .35, pointRadius: 3, borderWidth: 2.5 }; });
    legendHtml = periods.map(p => `<span><span class="leg-dot" style="background:${p.color};display:inline-block"></span>${p.label}</span>`).join('');
  }
  document.getElementById('period-legend').innerHTML = legendHtml;
  mkChart('ch-prod-line', { type: 'line', data: { labels: mLabels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fBRL(ctx.raw) } } }, scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 }, callback: fShort }, grid: { color: gc } } } } });
}
function renderProdTable() {
  const label = getViewLabel(); let rows = buildProdData(FD);
  const maxPremio = rows.length ? Math.max(...rows.map(r => r.premio), 1) : 1;
  rows.sort((a, b) => { const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0; if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); return sortDir === 'asc' ? va - vb : vb - va; });
  const totPremio = rows.reduce((s, r) => s + r.premio, 0), totCom = rows.reduce((s, r) => s + r.com, 0), totQtd = rows.reduce((s, r) => s + r.qtd, 0);
  const mpv = Math.max(...rows.map(r => r.premio)), mcv = Math.max(...rows.map(r => r.com)), mpcv = Math.max(...rows.map(r => r.pctCom)), mtv = Math.max(...rows.map(r => r.ticket)), mqv = Math.max(...rows.map(r => r.qtd));
  document.getElementById('prod-table-badge').textContent = rows.length + ' ' + label.toLowerCase() + 's';
  const thCls = k => k === sortKey ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
  const th = (k, lbl, align = 'left') => `<th class="${thCls(k)}" style="text-align:${align}" onclick="setSort('${k}')">${lbl}<span class="sort-icon"></span></th>`;
  const trophy = (val, max) => val === max ? ' 🏆' : '';
  const rankBadge = i => `<span class="rank-badge ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}">${i + 1}</span>`;
  const tbody = rows.map((r, i) => {
    const pct = maxPremio ? r.premio / maxPremio : 0; const shortName = r.nome.split(' - ')[0].split('|')[0].trim();
    return `<tr><td style="text-align:center;width:36px">${rankBadge(i)}</td><td class="name-cell" title="${r.nome}">${shortName}</td><td class="num">${fBRL(r.premio) + trophy(r.premio, mpv)}<div class="bar-bg"><div class="bar-fg" style="width:${(pct * 100).toFixed(1)}%;background:#378ADD40"></div></div></td><td class="num">${fBRL(r.com) + trophy(r.com, mcv)}</td><td class="num">${fPct(r.pctCom) + trophy(r.pctCom, mpcv)}</td><td class="num">${fBRL(r.ticket) + trophy(r.ticket, mtv)}</td><td class="num">${fN(r.qtd) + trophy(r.qtd, mqv)}</td><td class="num"><span style="display:inline-flex;align-items:center;gap:5px">${fPct(r.pctTotal)}<span style="display:inline-block;width:${Math.round(r.pctTotal * 60)}px;height:6px;background:#378ADD;border-radius:3px;min-width:2px"></span></span></td></tr>`;
  }).join('');
  document.getElementById('prod-table-wrap').innerHTML = `<table class="prod-table"><thead><tr><th style="width:36px;text-align:center">#</th>${th('nome', label)}${th('premio', 'Prêmio líquido', 'right')}${th('com', 'Comissão', 'right')}${th('pctCom', 'Com. média %', 'right')}${th('ticket', 'Ticket médio', 'right')}${th('qtd', 'Qtd. apólices', 'right')}${th('pctTotal', '% participação', 'right')}</tr></thead><tbody>${tbody}</tbody><tfoot><tr><td colspan="2">Total geral</td><td class="num">${fBRL(totPremio)}</td><td class="num">${fBRL(totCom)}</td><td class="num">${fPct(totPremio ? totCom / totPremio : 0)}</td><td class="num">${fBRL(totQtd ? totPremio / totQtd : 0)}</td><td class="num">${fN(totQtd)}</td><td class="num">100%</td></tr></tfoot></table>`;
}
function setSort(key) { if (sortKey === key) sortDir = sortDir === 'desc' ? 'asc' : 'desc'; else { sortKey = key; sortDir = 'desc'; } renderProdTable(); }

// ══════════════════════════════════════════════════════════════════════════════
// ── RETENÇÃO & CHURN TAB ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function renderRetTab() {
  if (!ALL.length) return;
  renderRetKPIs();
  if (sectionState['ret-charts']) renderRetCharts();
  if (sectionState['ret-cohort']) renderCohorts();
  if (sectionState['ret-risco']) renderRiskWarning();
  renderRetProdTable();
  renderRetDetailTable();
}

// ── KPIs retenção ──────────────────────────────────────────────────────────────
function renderRetKPIs() {
  const data = getRetData();
  // Base (denominador): tipos R, N, ER, EN com situação Ativa
  const TIPOS_BASE = ['R', 'N', 'ER', 'EN'];
  const base = data.filter(r => TIPOS_BASE.includes(r.tipo) && r.sit === 'Ativa');
  const qtdBase = base.length;
  const premioBase = base.reduce((s, r) => s + r.premio, 0);
  const comBase = base.reduce((s, r) => s + r.com, 0);
  // Churn (numerador): tipos CR e CN
  const cancelEndossos = data.filter(r => r.tipo === 'CR' || r.tipo === 'CN');
  const qtdCancel = cancelEndossos.length;
  const premioCancel = Math.abs(cancelEndossos.reduce((s, r) => s + r.premio, 0));
  const comEstorno = Math.abs(cancelEndossos.reduce((s, r) => s + r.com, 0));
  // Vencidas
  const vencidas = data.filter(r => r.sit === 'Vencida');
  const premioVencido = vencidas.reduce((s, r) => s + r.premio, 0);
  // % churn
  const pctChurnQtd = qtdBase > 0 ? qtdCancel / qtdBase : 0;
  const pctChurnPremio = premioBase > 0 ? premioCancel / premioBase : 0;
  const pctChurnCom = comBase > 0 ? comEstorno / comBase : 0;

  document.getElementById('ret-kpi-grid').innerHTML = [
    { l: 'Apólices ativas (base)', v: fN(qtdBase), s: 'tipos R, N, ER, EN', c: 'k-blue' },
    { l: 'Prêmio ativo (base)', v: fBRL(premioBase), s: 'tipos R, N, ER, EN', c: 'k-blue' },
    { l: 'Comissão ativa (base)', v: fBRL(comBase), s: 'tipos R, N, ER, EN', c: 'k-blue' },
    { l: 'Churn — Itens', v: fP(pctChurnQtd), s: fN(qtdCancel) + ' endossos CR+CN', c: 'k-red' },
    { l: 'Churn — Prêmio', v: fP(pctChurnPremio), s: fBRL(premioCancel) + ' em CR+CN', c: 'k-red' },
    { l: 'Churn — Comissão', v: fP(pctChurnCom), s: fBRL(comEstorno) + ' a estornar', c: 'k-red' },
    { l: 'Apólices não renovadas', v: fN(vencidas.length), s: 'situação = Vencida', c: 'k-amber' },
    { l: 'Prêmio em risco', v: fBRL(premioVencido), s: 'apólices vencidas', c: 'k-amber' },
  ].map(k => `<div class="kpi ${k.c}"><div class="kpi-label">${k.l}</div><div class="kpi-value" style="font-size:${k.v.length > 9 ? '16px' : '20px'}">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('');
}

// ── Gráficos retenção ──────────────────────────────────────────────────────────
function renderRetCharts() {
  const data = getRetData();
  const canceladas = data.filter(r => r.sit === 'Cancelada');
  const vencidas = data.filter(r => r.sit === 'Vencida');

  // Gráfico 1: motivos cancelamento
  const mot = {}; canceladas.forEach(r => { const m = r.motivo || 'Não informado'; mot[m] = (mot[m] || 0) + 1; });
  const motSorted = Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 10);
  document.getElementById('ret-cancel-badge').textContent = fN(canceladas.length) + ' cancelamentos';
  const h1 = Math.max(180, motSorted.length * 36 + 50);
  document.getElementById('ret-cancel-wrap').style.height = h1 + 'px';
  const ac = axisClr(), lc = labelClr(), gc = gridClr();
  if (motSorted.length) {
    mkChart('ch-ret-cancel', { type: 'bar', data: { labels: motSorted.map(m => m[0].length > 35 ? m[0].slice(0, 32) + '...' : m[0]), datasets: [{ data: motSorted.map(m => m[1]), backgroundColor: motSorted.map((_, i) => i === 0 ? 'rgba(226,75,74,.85)' : i <= 2 ? 'rgba(226,75,74,.6)' : 'rgba(226,75,74,.4)'), borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + ' apólices' } } }, scales: { x: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } } } });
  }

  // Gráfico 2: evolução mensal cancelamentos vs vencimentos
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const mLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const byCan = {}, byVen = {};
  canceladas.forEach(r => { if (!r.vig) return; const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return; const m = String(dt.getMonth() + 1).padStart(2, '0'); byCan[m] = (byCan[m] || 0) + 1; });
  vencidas.forEach(r => { if (!r.vig) return; const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return; const m = String(dt.getMonth() + 1).padStart(2, '0'); byVen[m] = (byVen[m] || 0) + 1; });
  mkChart('ch-ret-evolucao', {
    type: 'line', data: {
      labels: mLabels, datasets: [
        { label: 'Canceladas', data: months.map(m => byCan[m] || 0), borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.08)', fill: true, tension: .35, pointRadius: 4, borderWidth: 2 },
        { label: 'Vencidas', data: months.map(m => byVen[m] || 0), borderColor: '#BA7517', backgroundColor: 'rgba(186,117,23,0.06)', fill: true, tension: .35, pointRadius: 4, borderWidth: 2, borderDash: [5, 3] }
      ]
    }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw + ' apólices' } } }, scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } } } }
  });
}


// ── Análise de Coortes ──────────────────────────────────────────────────────────
function renderCohorts() {
  const data = getRetData();
  const TIPOS_BASE_P = ['R', 'N', 'ER', 'EN'];
  const cohorts = {};
  data.forEach(r => {
    if (!r.em) return;
    if (!TIPOS_BASE_P.includes(r.tipo)) return;
    const emDate = r.em instanceof Date ? r.em : toDate(r.em);
    if (!emDate) return;
    const y = emDate.getFullYear();
    const m = String(emDate.getMonth() + 1).padStart(2, '0');
    const cKey = `${y}-${m}`;
    if (!cohorts[cKey]) cohorts[cKey] = { label: `${m}/${y}`, emitidas: 0, drops: {} };
    cohorts[cKey].emitidas++;
    if (r.sit === 'Cancelada' && r.cancel) {
      const cDate = r.cancel instanceof Date ? r.cancel : toDate(r.cancel);
      if (cDate) {
        const diffMonths = (cDate.getFullYear() - emDate.getFullYear()) * 12 + (cDate.getMonth() - emDate.getMonth());
        if (diffMonths >= 0 && diffMonths <= 12) {
          cohorts[cKey].drops[diffMonths] = (cohorts[cKey].drops[diffMonths] || 0) + 1;
        }
      }
    }
  });

  const keys = Object.keys(cohorts).sort();
  if (!keys.length) {
    document.getElementById('ret-cohort-wrap').innerHTML = '<div style="font-size:12px;color:#666">Sem dados de coorte na seleção</div>';
    return;
  }
  let html = `<table class="ret-table" style="text-align:center"><thead><tr>
        <th style="text-align:left">Emissão</th><th style="text-align:center;width:60px">Base</th>`;
  for (let i = 0; i <= 12; i++) html += `<th style="text-align:center;width:55px">M${i}</th>`;
  html += `</tr></thead><tbody>`;
  keys.forEach(k => {
    const c = cohorts[k];
    html += `<tr><td style="text-align:left;font-weight:600">${c.label}</td><td style="font-weight:600">${c.emitidas}</td>`;
    let remaining = c.emitidas;
    for (let i = 0; i <= 12; i++) {
      if (c.drops[i]) remaining -= c.drops[i];
      const pct = c.emitidas > 0 ? (remaining / c.emitidas) : 0;
      let bg = '';
      let color = '';
      if (c.emitidas > 0) {
        const hue = Math.max(0, (pct - 0.7) * 3.33) * 120;
        bg = `hsla(${hue}, 70%, 50%, ${dark() ? 0.25 : 0.15})`;
        if (dark()) color = '#c9d1d9';
      }
      html += `<td style="background:${bg};color:${color};font-size:11px">${c.emitidas > 0 ? (pct * 100).toFixed(0) + '%' : '-'}</td>`;
    }
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('ret-cohort-wrap').innerHTML = html;
}

// ── Score de Risco de Churn ────────────────────────────────────────────────────
function calcRiskRates() {
  const TIPOS_BASE_P = ['R', 'N', 'ER', 'EN'];
  const metrics = { seg: {}, ram: {}, col: {} };
  ALL.forEach(r => {
    if (!TIPOS_BASE_P.includes(r.tipo) && r.tipo !== 'CR' && r.tipo !== 'CN') return;
    ['seg', 'ramo', 'colab'].forEach(ft => {
      const k = r[ft] || 'N/A';
      const t = ft === 'ramo' ? 'ram' : ft === 'colab' ? 'col' : 'seg';
      if (!metrics[t][k]) metrics[t][k] = { base: 0, churn: 0 };
      if (TIPOS_BASE_P.includes(r.tipo) && r.sit === 'Ativa') metrics[t][k].base++;
      if (r.tipo === 'CR' || r.tipo === 'CN') { metrics[t][k].churn++; metrics[t][k].base++; }
    });
  });
  const calcP = dict => {
    const res = {};
    for (let k in dict) res[k] = dict[k].base > 10 ? dict[k].churn / dict[k].base : 0;
    return res;
  };
  return { seg: calcP(metrics.seg), ram: calcP(metrics.ram), col: calcP(metrics.col) };
}

function renderRiskWarning() {
  const rates = calcRiskRates();
  const todayStr = fmtD(today());
  const d90Str = fmtD(addDays(today(), 90));

  const inRisk = ALL.filter(r => r.sit === 'Ativa' && r.fim && fmtD(r.fim) >= todayStr && fmtD(r.fim) <= d90Str).map(r => {
    const pSeg = rates.seg[r.seg || 'N/A'] || 0;
    const pRam = rates.ram[r.ramo || 'N/A'] || 0;
    const pCol = rates.col[r.colab || 'N/A'] || 0;
    const score = (pSeg * 0.3) + (pRam * 0.3) + (pCol * 0.4);
    let rank = 'Baixo';
    if (score >= 0.15) rank = 'Alto';
    else if (score >= 0.05) rank = 'Médio';
    return { ...r, score, rank };
  });

  const hRisk = inRisk.filter(r => r.rank === 'Alto' || r.rank === 'Médio').sort((a, b) => b.score - a.score);
  document.getElementById('ret-risco-badge').textContent = hRisk.length + ' alertas';

  if (!hRisk.length) {
    document.getElementById('ret-risco-wrap').innerHTML = '<div style="padding:16px;font-size:12px;color:#666">Nenhuma apólice em risco alto/médio nos próximos 90 dias.</div>';
    return;
  }

  const riskBadge = {
    'Alto': `<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;background:#fef2f2;color:#dc2626;border:0.5px solid #fca5a5">Alto</span>`,
    'Médio': `<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;background:#fffbeb;color:#d97706;border:0.5px solid #fcd34d">Médio</span>`
  };

  const tbody = hRisk.map(r => `<tr>
        <td>${r.fim ? fmtD(r.fim) : '-'}</td>
        <td class="name-cell" title="${r.cli}">${r.cli}</td>
        <td>${r.ramo.toLowerCase().replace(/^\w/, c => c.toUpperCase())}</td>
        <td>${r.colab.split(' - ')[0].trim()}</td>
        <td class="num">${fBRL(r.premio)}</td>
        <td style="text-align:center">${riskBadge[r.rank] || '-'}</td>
      </tr>`).join('');

  document.getElementById('ret-risco-wrap').innerHTML = `<table class="ret-table">
        <thead><tr>
          <th>Vence em</th>
          <th>Cliente</th>
          <th>Ramo</th>
          <th>Colaborador</th>
          <th style="text-align:right">Prêmio</th>
          <th style="text-align:center">Risco</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
}

// ── Tabela churn por produtor ──────────────────────────────────────────────────

function renderRetProdTable() {
  const data = getRetData();
  const viewKey = getMetric('vt-ret') === 'grp' ? 'grp' : 'colab';
  const label = getMetric('vt-ret') === 'grp' ? 'Grupo' : 'Colaborador';

  // Agregar por produtor
  const TIPOS_BASE_P = ['R', 'N', 'ER', 'EN'];
  const map = {};
  data.forEach(r => {
    const k = r[viewKey] || 'Sem identificação';
    if (!map[k]) map[k] = { nome: k, qtdBase: 0, premioBase: 0, comBase: 0, qtdCancel: 0, premioCancel: 0, comEstorno: 0, vencidas: 0 };
    // Base: R, N, ER, EN ativos
    if (TIPOS_BASE_P.includes(r.tipo) && r.sit === 'Ativa') { map[k].qtdBase++; map[k].premioBase += r.premio; map[k].comBase += r.com; }
    // Churn: CR e CN
    if (r.tipo === 'CR' || r.tipo === 'CN') { map[k].qtdCancel++; map[k].premioCancel += Math.abs(r.premio); map[k].comEstorno += Math.abs(r.com); }
    if (r.sit === 'Vencida') map[k].vencidas++;
  });

  let rows = Object.values(map).map(v => ({
    ...v,
    pctQtd: v.qtdBase > 0 ? v.qtdCancel / v.qtdBase : 0,
    pctPremio: v.premioBase > 0 ? v.premioCancel / v.premioBase : 0,
    pctCom: v.comBase > 0 ? v.comEstorno / v.comBase : 0
  }));

  // Sort
  rows.sort((a, b) => {
    const va = a[retSortKey] ?? 0, vb = b[retSortKey] ?? 0;
    if (typeof va === 'string') return retSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return retSortDir === 'asc' ? va - vb : vb - va;
  });

  document.getElementById('ret-prod-badge').textContent = rows.length + ' ' + label.toLowerCase() + 's';

  const thCls = k => k === retSortKey ? (retSortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
  const th = (k, lbl, align = 'right') => `<th class="ret-sortable ${thCls(k)}" style="text-align:${align}" onclick="setRetSort('${k}')">${lbl}<span class="sort-icon"></span></th>`;

  const totQtdBase = rows.reduce((s, r) => s + r.qtdBase, 0);
  const totQtdCancel = rows.reduce((s, r) => s + r.qtdCancel, 0);
  const totPremioBase = rows.reduce((s, r) => s + r.premioBase, 0);
  const totPremioCancel = rows.reduce((s, r) => s + r.premioCancel, 0);
  const totComBase = rows.reduce((s, r) => s + r.comBase, 0);
  const totComEstorno = rows.reduce((s, r) => s + r.comEstorno, 0);
  const totVenc = rows.reduce((s, r) => s + r.vencidas, 0);

  const tbody = rows.map(r => {
    const shortName = r.nome.split(' - ')[0].split('|')[0].trim();
    return `<tr>
      <td class="name-cell" title="${r.nome}">${shortName}</td>
      <td class="num">${fN(r.qtdBase)}</td>
      <td class="num">${fN(r.qtdCancel)}</td>
      <td class="num">${churnBadge(r.pctQtd)}</td>
      <td class="num">${fBRL(r.premioBase)}</td>
      <td class="num">${fBRL(r.premioCancel)}</td>
      <td class="num">${churnBadge(r.pctPremio)}</td>
      <td class="num">${fBRL(r.comEstorno)}</td>
      <td class="num">${churnBadge(r.pctCom)}</td>
      <td class="num" style="color:#BA7517">${fN(r.vencidas)}</td>
    </tr>`;
  }).join('');

  document.getElementById('ret-prod-table-wrap').innerHTML = `
    <table class="ret-table">
      <thead><tr>
        ${th('nome', label, 'left')}
        ${th('qtdBase', 'Ativas (base)')}
        ${th('qtdCancel', 'CR+CN (qtd)')}
        ${th('pctQtd', '% Churn itens')}
        ${th('premioBase', 'Prêmio base', 'right')}
        ${th('premioCancel', 'Prêmio CR+CN', 'right')}
        ${th('pctPremio', '% Churn prêmio')}
        ${th('comEstorno', 'Comissão estorno', 'right')}
        ${th('pctCom', '% Churn comissão')}
        ${th('vencidas', 'Vencidas')}
      </tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot><tr>
        <td>Total</td>
        <td class="num">${fN(totQtdBase)}</td>
        <td class="num">${fN(totQtdCancel)}</td>
        <td class="num">${churnBadge(totQtdBase > 0 ? totQtdCancel / totQtdBase : 0)}</td>
        <td class="num">${fBRL(totPremioBase)}</td>
        <td class="num">${fBRL(totPremioCancel)}</td>
        <td class="num">${churnBadge(totPremioBase > 0 ? totPremioCancel / totPremioBase : 0)}</td>
        <td class="num">${fBRL(totComEstorno)}</td>
        <td class="num">${churnBadge(totComBase > 0 ? totComEstorno / totComBase : 0)}</td>
        <td class="num">${fN(totVenc)}</td>
      </tr></tfoot>
    </table>`;
}

function setRetSort(key) {
  if (retSortKey === key) retSortDir = retSortDir === 'desc' ? 'asc' : 'desc'; else { retSortKey = key; retSortDir = 'desc'; }
  renderRetProdTable();
}

// ── Tabela detalhe apólice a apólice ──────────────────────────────────────────
function toggleRetDetailFilter(sit) {
  retDetailFilter = sit;
  const map = { '': 'ret-filter-all-btn', 'CNCR': 'ret-filter-cncr-btn', 'Vencida': 'ret-filter-venc-btn' };
  Object.values(map).forEach(id => { const b = document.getElementById(id); if (b) { b.style.borderColor = ''; b.style.fontWeight = ''; } });
  const active = document.getElementById(map[sit]);
  if (active) { active.style.borderColor = '#378ADD'; active.style.fontWeight = '600'; }
  renderRetDetailTable();
}

function renderRetDetailTable() {
  const data = getRetData();
  const rows = data.filter(r => {
    if (retDetailFilter === 'CNCR') return r.tipo === 'CN' || r.tipo === 'CR';
    if (retDetailFilter === 'Vencida') return r.sit === 'Vencida';
    // Todas: CN/CR + Vencidas
    return r.tipo === 'CN' || r.tipo === 'CR' || r.sit === 'Vencida';
  }).sort((a, b) => Math.abs(b.premio || 0) - Math.abs(a.premio || 0));

  document.getElementById('ret-detail-badge').textContent = fN(rows.length) + ' registros';

  const shortSeg = n => n.replace(' CIA DE SEGUROS GERAIS S/A', '').replace(' CIA NAC DE SEGUROS S/A', '').replace(' SEGUROS S/A', '').replace(' SEGURADORA S/A', '').replace(' SEGURADORA', '').replace(' SEGS CORPORATIVOS SA', '').trim();
  const TIPO_LABELS_D = { R: 'Renovação', N: 'Novo', ER: 'End. renov.', EN: 'End. novo', CR: 'Cancel. renov.', CN: 'Cancel. novo' };

  const tipoBadge = tipo => {
    const isCxNx = tipo === 'CR' || tipo === 'CN';
    const bg = isCxNx ? '#fef2f2' : '#f0fdf4';
    const col = isCxNx ? '#dc2626' : '#16a34a';
    return `<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;background:${bg};color:${col}">${TIPO_LABELS_D[tipo] || tipo}</span>`;
  };
  const sitBadge = sit => {
    if (sit === 'Cancelada') return `<span class="sit-badge sit-badge-cancelada">${sit}</span>`;
    if (sit === 'Vencida') return `<span class="sit-badge sit-badge-vencida">${sit}</span>`;
    return `<span style="font-size:11px;color:#555">${sit}</span>`;
  };

  const tbody = rows.map(r => {
    const shortColab = r.colab.split(' - ')[0].trim();
    const premioVal = r.tipo === 'CR' || r.tipo === 'CN' ? `<span style="color:#dc2626">${fBRL(r.premio)}</span>` : fBRL(r.premio);
    const comVal = r.tipo === 'CR' || r.tipo === 'CN' ? `<span style="color:#dc2626">${fBRL(r.com)}</span>` : fBRL(r.com);
    return `<tr>
      <td>${tipoBadge(r.tipo)}</td>
      <td class="name-cell" style="max-width:180px" title="${r.cli}">${r.cli}</td>
      <td>${r.ramo.toLowerCase().replace(/^\w/, c => c.toUpperCase())}</td>
      <td>${shortSeg(r.seg)}</td>
      <td>${shortColab}</td>
      <td>${sitBadge(r.sit)}</td>
      <td>${r.motivo || '—'}</td>
      <td class="num">${premioVal}</td>
      <td class="num">${comVal}</td>
      <td>${r.vig ? fmtD(r.vig) : '—'}</td>
      <td>${r.cancel ? fmtD(r.cancel) : '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('ret-detail-wrap').innerHTML = `
    <table class="ret-table detail-table">
      <thead><tr>
        <th>Tipo</th>
        <th style="min-width:150px">Cliente</th>
        <th>Ramo</th>
        <th>Seguradora</th>
        <th>Colaborador</th>
        <th>Situação</th>
        <th>Motivo</th>
        <th style="text-align:right">Prêmio</th>
        <th style="text-align:right">Comissão</th>
        <th>Vigência</th>
        <th>Dt. cancelamento</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
}

// ── Exportação ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// ── CROSS-SELL ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Campanha SANTOLIN 360 — meta de 3 fases para o 3º trimestre de 2026.
// Conta apólices (não endosso/fatura) com CAMPANHA = "SANTOLIN 360" e início de
// vigência dentro do trimestre, independente dos filtros de PF/PJ/ramo/colaborador
// da aba (é uma meta única da empresa, não recorta por segmento).
const CAMPANHA_360_NOME = 'SANTOLIN 360';
const CAMPANHA_360_INICIO = '2026-07-01';
const CAMPANHA_360_FIM = '2026-09-30';
const CAMPANHA_360_FASES_QTD = [120, 150, 180];
const CAMPANHA_360_FASES_COM = [77000, 97000, 115000];

function getCampanha360Rows() {
  const alvo = normRamo(CAMPANHA_360_NOME);
  return ALL.filter(r =>
    r.tipoDoc === 'APÓLICE' &&
    normRamo(r.campanha) === alvo &&
    r.vig && fmtD(r.vig) >= CAMPANHA_360_INICIO && fmtD(r.vig) <= CAMPANHA_360_FIM
  );
}

function renderTierGoal(label, valor, fases, formatador) {
  const metaFinal = fases[fases.length - 1];
  const pct = metaFinal > 0 ? Math.min(1, valor / metaFinal) : 0;
  const faseAtual = fases.filter(f => valor >= f).length;
  const marcadores = fases.map((f, i) => {
    const pos = metaFinal > 0 ? Math.min(100, (f / metaFinal) * 100) : 0;
    const atingida = valor >= f;
    return `<div class="tier-marker ${atingida ? 'reached' : ''}" style="left:${pos}%"><span>Fase ${i + 1}<br>${formatador(f)}</span></div>`;
  }).join('');
  return `
    <div class="tier-goal">
      <div class="tier-goal-header">
        <span class="tier-goal-title">${label}</span>
        <span class="tier-goal-value">${formatador(valor)} <span class="tier-goal-meta">/ ${formatador(metaFinal)}</span></span>
      </div>
      <div class="tier-goal-track">
        <div class="tier-goal-fill" style="width:${(pct * 100).toFixed(2)}%"></div>
        ${marcadores}
      </div>
      <div class="tier-goal-badge">${faseAtual > 0 ? 'Fase ' + faseAtual + ' de ' + fases.length + ' concluída' : 'Nenhuma fase concluída ainda'}</div>
    </div>`;
}

// Top 3 colaboradores por apólices vendidas ou por comissão, dentro da campanha.
function getCampanha360Ranking(rows, metric) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.colab || 'Sem identificação';
    if (!map.has(k)) map.set(k, { colab: k, qtd: 0, comissao: 0 });
    const c = map.get(k);
    c.qtd++;
    c.comissao += r.com;
  });
  return [...map.values()].sort((a, b) => b[metric] - a[metric]).slice(0, 3);
}

// Só os nomes (sem valores), em formato de pódio — 2º à esquerda, 1º no centro, 3º à direita.
function renderPodium(top3) {
  const nome = i => top3[i] ? top3[i].colab : '—';
  return `
    <div class="podium">
      <div class="podium-step podium-p2">
        <div class="podium-name" title="${nome(1)}">${nome(1)}</div>
        <div class="podium-block"><span class="rank-badge r2">2</span></div>
      </div>
      <div class="podium-step podium-p1">
        <div class="podium-name" title="${nome(0)}">${nome(0)}</div>
        <div class="podium-block"><span class="rank-badge r1">1</span></div>
      </div>
      <div class="podium-step podium-p3">
        <div class="podium-name" title="${nome(2)}">${nome(2)}</div>
        <div class="podium-block"><span class="rank-badge r3">3</span></div>
      </div>
    </div>`;
}

function renderCrossCampanha360() {
  const wrap = document.getElementById('cross-campanha-wrap');
  if (!wrap) return;
  const rows = getCampanha360Rows();
  const qtd = rows.length;
  const comissao = rows.reduce((s, r) => s + r.com, 0);
  const rankQtd = getCampanha360Ranking(rows, 'qtd');
  const rankCom = getCampanha360Ranking(rows, 'comissao');
  wrap.innerHTML = `
    <div class="tier-goal-grid">
      ${renderTierGoal('Apólices vendidas', qtd, CAMPANHA_360_FASES_QTD, fN)}
      ${renderTierGoal('Comissão gerada', comissao, CAMPANHA_360_FASES_COM, fBRL)}
    </div>
    <div class="podium-grid">
      <div class="podium-col">
        <div class="podium-title">Top 3 — Apólices vendidas</div>
        ${renderPodium(rankQtd)}
      </div>
      <div class="podium-col">
        <div class="podium-title">Top 3 — Comissão gerada</div>
        ${renderPodium(rankCom)}
      </div>
    </div>`;
}

// Ramos principais da corretora, pré-ativados por padrão no filtro de ramo do
// Cross-sell (match por trecho normalizado, mesmo critério de classifyRamo).
// Demais ramos ficam disponíveis no filtro para o usuário ativar manualmente.
const CROSS_MAIN_RAMOS = {
  PF: ['VIDA INDIVIDUAL', 'RC PROFISSIONAL', 'AUTOMOVEL', 'RESIDENCIAL'],
  PJ: ['SAUDE', 'VIDA EM GRUPO', 'EMPRESARIAL', 'RC PROFISSIONAL'],
};
function isCrossMainRamo(ramo, pessoa) {
  const n = normRamo(ramo);
  return CROSS_MAIN_RAMOS[pessoa].some(k => n.includes(k));
}

function buildCrossFilters() {
  const ramoOptions = getCrossRamoUniverse(CROSS.pessoa);
  if (CROSS.ram.size === 0) ramoOptions.filter(r => isCrossMainRamo(r, CROSS.pessoa)).forEach(r => CROSS.ram.add(r));
  buildMultiSelect('ms-cross-ram', CROSS, 'ram', ramoOptions, 'Todos');
  const colabOptions = [...new Set(ALL.filter(r => r.docDigits && r.tipoPessoa === CROSS.pessoa).map(r => r.colab).filter(Boolean))].sort();
  buildMultiSelect('ms-cross-col', CROSS, 'col', colabOptions, 'Todos');
}

function getCrossRamoUniverse(pessoa) {
  return [...new Set(ALL.filter(r => r.docDigits && r.tipoPessoa === pessoa && r.sit === 'Ativa' && r.ramo).map(r => r.ramo))].sort();
}

function getCrossRamoList() {
  const universe = getCrossRamoUniverse(CROSS.pessoa);
  return CROSS.ram.size > 0 ? universe.filter(r => CROSS.ram.has(r)) : universe;
}

// Agrupa apólices por CPF/CNPJ. LTV = comissão líquida total (já contempla estornos
// CR/CN, que chegam com valor negativo) / anos desde a 1ª vigência histórica do cliente.
function buildCrossMap(pessoa) {
  const map = new Map();
  ALL.forEach(r => {
    if (!r.docDigits || r.tipoPessoa !== pessoa) return;
    let c = map.get(r.docDigits);
    if (!c) {
      c = { doc: r.docDigits, tipoPessoa: pessoa, nome: r.cli, ramosAtivos: new Set(), apolicesAtivas: 0, comissaoTotal: 0, primeiraVig: null, colabs: new Set() };
      map.set(r.docDigits, c);
    }
    if (r.cli) c.nome = r.cli;
    c.comissaoTotal += r.com;
    if (r.colab) c.colabs.add(r.colab);
    if (r.sit === 'Ativa') {
      if (r.tipoDoc === 'APÓLICE') c.apolicesAtivas++; // exclui endossos/faturas, que são alterações da apólice, não novos contratos
      if (r.ramo) c.ramosAtivos.add(r.ramo);
    }
    if (r.vig && (!c.primeiraVig || r.vig < c.primeiraVig)) c.primeiraVig = r.vig;
  });
  return map;
}

function getCrossClients() {
  let clients = [...buildCrossMap(CROSS.pessoa).values()];
  if (CROSS.col.size > 0) clients = clients.filter(c => [...c.colabs].some(cl => CROSS.col.has(cl)));
  if (crossSearch) {
    const s = crossSearch.toLowerCase().trim();
    const sDigits = s.replace(/\D/g, '');
    clients = clients.filter(c => c.nome.toLowerCase().includes(s) || (sDigits && c.doc.includes(sDigits)));
  }
  clients.forEach(c => {
    const anos = c.primeiraVig ? (Date.now() - c.primeiraVig.getTime()) / (365.25 * 86400000) : 0;
    c.anos = anos;
    c.ltv = anos > 1 ? c.comissaoTotal / anos : null;
  });
  return clients;
}

function setCrossPessoa(p) {
  CROSS.pessoa = p;
  CROSS.ram.clear(); CROSS.col.clear();
  crossPage = 1;
  buildCrossFilters();
  renderCrossTab();
}

function setCrossPage(page) { crossPage = page; renderCrossTable(getCrossClients(), getCrossRamoList()); }

function onCrossSearch(v) { crossSearch = v; crossPage = 1; renderCrossTable(getCrossClients(), getCrossRamoList()); }

function resetCrossFilters() {
  CROSS.ram.clear(); CROSS.col.clear();
  const s = document.getElementById('cross-search'); if (s) s.value = '';
  crossSearch = ''; crossPage = 1;
  [...document.querySelectorAll('.ms-wrap')].forEach(w => { if (w._msObj === CROSS && w._key) { renderMsListGeneric(w._list, w._vals, CROSS, w._key); updateMsTriggerGeneric(w, CROSS, w._key, w._placeholder); } });
  renderCrossTab();
}

function setCrossSort(key) {
  if (crossSortKey === key) crossSortDir = crossSortDir === 'desc' ? 'asc' : 'desc'; else { crossSortKey = key; crossSortDir = key === 'nome' ? 'asc' : 'desc'; }
  renderCrossTable(getCrossClients(), getCrossRamoList());
}

function renderCrossTab() {
  const clients = getCrossClients();
  const ramoList = getCrossRamoList();
  renderCrossCampanha360();
  renderCrossKPIs(clients, ramoList);
  renderCrossPenetracao(clients, ramoList);
  renderCrossNivel(clients);
  renderCrossTable(clients, ramoList);
}

// Nível de relacionamento por quantidade de apólices ativas do cliente.
const CROSS_NIVEIS = [
  { label: 'Nível 1 — Essencial' },
  { label: 'Nível 2 — Ampliada' },
  { label: 'Nível 3 — Plena' },
  { label: 'Nível 4 — Master' },
];
function renderCrossNivel(clients) {
  const counts = [0, 0, 0, 0];
  clients.forEach(c => {
    const n = c.apolicesAtivas;
    if (n <= 0) return;
    counts[Math.min(n, 4) - 1]++;
  });
  const total = counts.reduce((s, v) => s + v, 0);
  document.getElementById('cross-nivel-badge').textContent = fN(total) + ' clientes';
  const ac = axisClr(), lc = labelClr(), gc = gridClr();
  mkChart('ch-cross-nivel', {
    type: 'bar',
    data: {
      labels: CROSS_NIVEIS.map(n => n.label),
      datasets: [{ data: counts, backgroundColor: PALETA.slice(0, 4), borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.7 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fN(ctx.raw) + ' clientes (' + fP(total ? ctx.raw / total : 0) + ')' } }
      },
      scales: {
        x: { ticks: { color: lc, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: ac, font: { size: 10 }, precision: 0 }, grid: { color: gc } }
      }
    }
  });
}

// Ticket médio de comissão por ramo: só conta apólices (não endosso/fatura) ativas
// dos clientes filtrados atualmente — mesma base usada no resto da aba.
function getCrossRamoStats(clients, ramoList) {
  const docSet = new Set(clients.map(c => c.doc));
  const stats = {};
  ramoList.forEach(r => { stats[r] = { comSum: 0, count: 0 }; });
  ALL.forEach(r => {
    if (!docSet.has(r.docDigits) || r.sit !== 'Ativa' || r.tipoDoc !== 'APÓLICE') return;
    const s = stats[r.ramo];
    if (!s) return;
    s.comSum += r.com; s.count++;
  });
  Object.values(stats).forEach(s => { s.ticketMedio = s.count ? s.comSum / s.count : 0; });
  return stats;
}

function renderCrossKPIs(clients, ramoList) {
  const totalDocsAll = new Set(ALL.filter(r => r.docDigits).map(r => r.docDigits)).size;
  const comissaoTotal = clients.reduce((s, c) => s + c.comissaoTotal, 0);
  const withLtv = clients.filter(c => c.ltv != null);
  const ltvMedio = withLtv.length ? withLtv.reduce((s, c) => s + c.ltv, 0) / withLtv.length : 0;

  let maisPopular = { ramo: '—', pct: 0 }, maiorOportunidade = { ramo: '—', valor: 0 };
  let maiorLtvRamo = { ramo: '—', valor: 0 };
  if (clients.length && ramoList.length) {
    const stats = getCrossRamoStats(clients, ramoList);
    ramoList.forEach(ramo => {
      const has = clients.filter(c => c.ramosAtivos.has(ramo)).length;
      const pct = has / clients.length;
      if (pct > maisPopular.pct) maisPopular = { ramo, pct };
      // Oportunidade de comissão = clientes sem o ramo × ticket médio de comissão do ramo.
      const valor = (clients.length - has) * stats[ramo].ticketMedio;
      if (valor > maiorOportunidade.valor) maiorOportunidade = { ramo, valor };
      // LTV médio dos clientes que possuem este ramo (só quem tem LTV calculável, >1 ano).
      const clientesRamoComLtv = withLtv.filter(c => c.ramosAtivos.has(ramo));
      if (clientesRamoComLtv.length) {
        const ltvMedioRamo = clientesRamoComLtv.reduce((s, c) => s + c.ltv, 0) / clientesRamoComLtv.length;
        if (ltvMedioRamo > maiorLtvRamo.valor) maiorLtvRamo = { ramo, valor: ltvMedioRamo };
      }
    });
  }

  // Tempo médio de permanência: só entra quem tem 1ª vigência registrada (não distorce com fallback de dado ausente).
  const withVig = clients.filter(c => c.primeiraVig);
  const tempoMedio = withVig.length ? withVig.reduce((s, c) => s + c.anos, 0) / withVig.length : 0;

  document.getElementById('cross-kpi-grid').innerHTML = [
    { l: 'Total de clientes', v: fN(clients.length), s: fN(totalDocsAll) + ' no total (PF+PJ)', c: 'k-teal' },
    { l: 'Comissão total (LTV)', v: fBRL(comissaoTotal), s: fN(ramoList.length) + ' ramos mapeados', c: 'k-green' },
    { l: 'LTV médio por cliente', v: fBRL(ltvMedio), s: fN(withLtv.length) + ' c/ histórico >1 ano', c: 'k-purple' },
    { l: 'Ramo mais popular', v: maisPopular.ramo, s: fP(maisPopular.pct) + ' dos clientes', c: 'k-blue' },
    { l: 'Maior oportunidade', v: maiorOportunidade.ramo, s: fBRL(maiorOportunidade.valor) + ' em comissão potencial', c: 'k-red' },
    { l: 'Ramo com maior LTV', v: fBRL(maiorLtvRamo.valor), s: maiorLtvRamo.ramo, c: 'k-amber' },
    { l: 'Tempo médio de permanência', v: tempoMedio.toFixed(1).replace('.', ',') + ' anos', s: fN(withVig.length) + ' clientes na base', c: 'k-teal' },
  ].map(k => `<div class="kpi ${k.c}"><div class="kpi-label">${k.l}</div><div class="kpi-value">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('');
}

function setCrossPenMode(mode) {
  crossPenMode = mode;
  renderCrossPenetracao(getCrossClients(), getCrossRamoList());
}

function renderCrossPenetracao(clients, ramoList) {
  const total = clients.length;
  const wrap = document.getElementById('cross-pen-wrap');
  const titleEl = document.getElementById('cross-pen-title');
  const isOpp = crossPenMode === 'oportunidade';
  if (titleEl) titleEl.textContent = isOpp ? 'Oportunidade de comissão por ramo' : 'Penetração por ramo';

  if (!ramoList.length || !total) {
    wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">Nenhum dado para o filtro atual.</div>';
    return;
  }

  const base = ramoList.map(ramo => {
    const has = clients.filter(c => c.ramosAtivos.has(ramo)).length;
    return { ramo, has, not: total - has, pctHas: has / total };
  });

  if (isOpp) {
    const stats = getCrossRamoStats(clients, ramoList);
    const rows = base.map(r => {
      const ticketMedio = stats[r.ramo].ticketMedio;
      return { ...r, ticketMedio, oportunidade: r.not * ticketMedio };
    }).sort((a, b) => b.oportunidade - a.oportunidade);
    const maxOp = rows.length ? rows[0].oportunidade : 0;

    wrap.innerHTML = rows.map(r => `
      <div class="pen-row">
        <div class="pen-label" title="${r.ramo}">${r.ramo}</div>
        <div class="pen-bar">
          <div class="pen-seg-opp" style="width:${maxOp > 0 ? (r.oportunidade / maxOp * 100).toFixed(2) : 0}%">
            <span>${fBRL(r.oportunidade)} · ${fN(r.not)} sem × ${fBRL(r.ticketMedio)}</span>
          </div>
        </div>
      </div>`).join('');
    return;
  }

  const rows = base.sort((a, b) => b.pctHas - a.pctHas);
  wrap.innerHTML = rows.map(r => `
    <div class="pen-row">
      <div class="pen-label" title="${r.ramo}">${r.ramo}</div>
      <div class="pen-bar">
        <div class="pen-seg-yes" style="width:${(r.pctHas * 100).toFixed(2)}%"><span>✅ ${fN(r.has)} (${fP(r.pctHas)})</span></div>
        <div class="pen-seg-no"><span>❌ ${fN(r.not)} (${fP(1 - r.pctHas)})</span></div>
      </div>
    </div>`).join('');
}

function renderCrossTable(clients, ramoList) {
  let rows = [...clients];
  rows.sort((a, b) => {
    let va, vb;
    if (crossSortKey === 'ltv') { va = a.ltv ?? -Infinity; vb = b.ltv ?? -Infinity; }
    else if (crossSortKey === 'nome') { va = a.nome; vb = b.nome; }
    else { va = a[crossSortKey]; vb = b[crossSortKey]; }
    if (typeof va === 'string') return crossSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return crossSortDir === 'asc' ? va - vb : vb - va;
  });

  const thCls = k => k === crossSortKey ? (crossSortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
  const th = (k, lbl, align = 'left') => `<th class="ret-sortable ${thCls(k)}" style="text-align:${align}" onclick="setCrossSort('${k}')">${lbl}<span class="sort-icon"></span></th>`;
  const ramoTh = ramoList.map(r => `<th style="text-align:center" title="${r}">${r}</th>`).join('');

  const totalRows = rows.length;
  const { pageRows, totalPages, start } = paginateCrossRows(rows);
  renderCrossPagination(totalRows, totalPages, start, pageRows.length);

  const tbody = pageRows.map(c => {
    const ramoTds = ramoList.map(r => c.ramosAtivos.has(r)
      ? '<td style="text-align:center;color:var(--pos-text)">✅</td>'
      : '<td style="text-align:center;color:var(--text-tertiary)">—</td>').join('');
    return `<tr>
      <td class="name-cell" title="${c.nome}">${c.nome}</td>
      <td class="num" style="font-family:var(--font-mono)">${formatDoc(c.doc, c.tipoPessoa)}</td>
      ${ramoTds}
      <td class="num">${fN(c.apolicesAtivas)}</td>
      <td class="num">${c.ltv == null ? '—' : fBRL(c.ltv)}</td>
    </tr>`;
  }).join('');

  const badge = document.getElementById('cross-table-badge');
  if (badge) badge.textContent = fN(rows.length) + ' clientes';

  document.getElementById('cross-table-wrap').innerHTML = `
    <table class="ret-table">
      <thead><tr>
        ${th('nome', 'Nome')}
        <th>CPF/CNPJ</th>
        ${ramoTh}
        ${th('apolicesAtivas', 'Apólices ativas', 'right')}
        ${th('ltv', 'LTV', 'right')}
      </tr></thead>
      <tbody>${tbody || `<tr><td colspan="${3 + ramoList.length}" style="text-align:center;color:var(--text-tertiary)">Nenhum cliente encontrado</td></tr>`}</tbody>
    </table>`;
}

function paginateCrossRows(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / CROSS_PAGE_SIZE));
  if (crossPage > totalPages) crossPage = totalPages;
  if (crossPage < 1) crossPage = 1;
  const start = (crossPage - 1) * CROSS_PAGE_SIZE;
  return { pageRows: rows.slice(start, start + CROSS_PAGE_SIZE), totalPages, start };
}

function renderCrossPagination(total, totalPages, start, pageCount) {
  const el = document.getElementById('cross-table-pagination');
  if (!el) return;
  if (total === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <span style="font-size:11px;color:var(--text-secondary)">${fN(start + 1)}–${fN(start + pageCount)} de ${fN(total)}</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn-sm" style="font-size:11px;padding:3px 9px" ${crossPage <= 1 ? 'disabled' : ''} onclick="setCrossPage(${crossPage - 1})">&larr; Anterior</button>
      <span style="font-size:11px;color:var(--text-secondary)">Página ${crossPage} de ${totalPages}</span>
      <button class="btn-sm" style="font-size:11px;padding:3px 9px" ${crossPage >= totalPages ? 'disabled' : ''} onclick="setCrossPage(${crossPage + 1})">Próxima &rarr;</button>
    </div>`;
}

function exportData(type) {
  if (type === 'producao') {
    const data = buildProdData(FD).map(r => ({
      'Nome': r.nome,
      'Prêmio': r.premio,
      'Comissão': r.com,
      'Com. Média %': r.pctCom,
      'Ticket Médio': r.ticket,
      'Qtd. Apólices': r.qtd
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Producao");
    XLSX.writeFile(workbook, "Export_Producao.xlsx");
  } else if (type === 'churn') {
    const rawData = getRetData();
    const viewKey = getMetric('vt-ret') === 'grp' ? 'grp' : 'colab';
    const TIPOS_BASE_P = ['R', 'N', 'ER', 'EN'];
    const map = {};
    rawData.forEach(r => {
      const k = r[viewKey] || 'Sem identificação';
      if (!map[k]) map[k] = { nome: k, qtdBase: 0, premioBase: 0, comBase: 0, qtdCancel: 0, premioCancel: 0, comEstorno: 0, vencidas: 0 };
      if (TIPOS_BASE_P.includes(r.tipo) && r.sit === 'Ativa') { map[k].qtdBase++; map[k].premioBase += r.premio; map[k].comBase += r.com; }
      if (r.tipo === 'CR' || r.tipo === 'CN') { map[k].qtdCancel++; map[k].premioCancel += Math.abs(r.premio); map[k].comEstorno += Math.abs(r.com); }
      if (r.sit === 'Vencida') map[k].vencidas++;
    });
    const rows = Object.values(map).map(v => ({
      'Nome': v.nome,
      'Ativas (base)': v.qtdBase,
      'CR+CN (qtd)': v.qtdCancel,
      '% Churn itens': v.qtdBase > 0 ? (v.qtdCancel / v.qtdBase) : 0,
      'Prêmio base': v.premioBase,
      'Prêmio CR+CN': v.premioCancel,
      '% Churn prêmio': v.premioBase > 0 ? (v.premioCancel / v.premioBase) : 0,
      'Comissão estorno': v.comEstorno,
      '% Churn comissão': v.comBase > 0 ? (v.comEstorno / v.comBase) : 0,
      'Vencidas': v.vencidas
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Churn");
    XLSX.writeFile(workbook, "Export_Churn.xlsx");
  } else if (type === 'detalhe') {
    const rawData = getRetData().filter(r => {
      if (retDetailFilter === 'CNCR') return r.tipo === 'CN' || r.tipo === 'CR';
      if (retDetailFilter === 'Vencida') return r.sit === 'Vencida';
      return r.tipo === 'CN' || r.tipo === 'CR' || r.sit === 'Vencida';
    });
    const tLabel = { R: 'Renovação', N: 'Novo', ER: 'End. renov.', EN: 'End. novo', CR: 'Cancel. renov.', CN: 'Cancel. novo' };
    const rows = rawData.map(r => ({
      'Tipo': tLabel[r.tipo] || r.tipo,
      'Cliente': r.cli,
      'Ramo': r.ramo,
      'Seguradora': r.seg,
      'Colaborador': r.colab,
      'Situação': r.sit,
      'Motivo': r.motivo || '-',
      'Prêmio': r.premio,
      'Comissão': r.com,
      'Vigência': r.vig ? fmtD(r.vig) : '-',
      'Dt. Cancelamento': r.cancel ? fmtD(r.cancel) : '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Detalhe");
    XLSX.writeFile(workbook, "Export_Detalhe.xlsx");
  } else if (type === 'crosssell') {
    const clients = getCrossClients();
    const ramoList = getCrossRamoList();
    const rows = clients.map(c => {
      const row = { 'Nome': c.nome, 'CPF/CNPJ': formatDoc(c.doc, c.tipoPessoa) };
      ramoList.forEach(r => { row[r] = c.ramosAtivos.has(r) ? 'Sim' : 'Não'; });
      row['Apólices ativas'] = c.apolicesAtivas;
      row['LTV'] = c.ltv == null ? '' : c.ltv;
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CrossSell");
    XLSX.writeFile(workbook, "Export_CrossSell.xlsx");
  }
}

function exportExecutiveSummary() {
  if (!hasProducaoData()) { alert('Sem dados de produção para exportar.'); return; }
  const wb = XLSX.utils.book_new();
  const fData = FD.map(r => ({ ...r, vig: r.vig ? fmtD(r.vig) : '', em: r.em ? fmtD(r.em) : '', fim: r.fim ? fmtD(r.fim) : '', cancel: r.cancel ? fmtD(r.cancel) : '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fData), "Base_Filtrada");
  const pData = buildProdData(FD).map(r => ({ 'Nome': r.nome, 'Prêmio': r.premio, 'Comissão': r.com, 'Ticket': r.ticket, 'Qtd': r.qtd }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pData), "Producao_Por_Agente");
  XLSX.writeFile(wb, "Resumo_Executivo.xlsx");
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SINISTROS & RENTABILIDADE TAB ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const COL_SIN = {
  id: 'Nº AVISO',
  sinNum: 'Nº SINISTRO',
  abertura: 'DATA SINISTRO',
  aviso: 'DATA AVISO',
  encerra: 'DATA LIQUIDADO',
  status: 'SITUAÇÃO DO SINISTRO',
  seg: 'SEGURADORA',
  ramo: 'RAMO',
  cli: 'SEGURADO',
  valor: 'APURADO',
  pago: 'INDENIZADO',
  impSeg: 'IMP. SEG.',
  franquia: 'FRANQUIA',
  prejEst: 'PREJ. ESTIMADO',
  premioPago: 'PRÊMIO PAGO',
  motivo: 'MOTIVO DO SINISTRO',
  tipoSin: 'TIPO DE SINISTRO',
  colab: 'COLABORADOR',
  grp: 'GRUPO ECONÔMICO'
};

function handleClaimsFile(file) {
  if (!file) return;
  handleClaimsFilesManual([file]);
}

function handleClaimsFilesManual(fileList) {
  if (!fileList || !fileList.length) return;
  const files = [...fileList];
  let done = 0;
  const merged = [];
  const counts = { sinistrosAvisados: 0, sinistrosPagamentos: 0 };

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rows = parseClaimsArrayBuffer(e.target.result);
        const name = (file.name || '').toLowerCase();
        if (name.includes('pagamento') || name.includes('pago')) counts.sinistrosPagamentos += rows.length;
        else counts.sinistrosAvisados += rows.length;
        mergeClaimsRows(merged, rows);
      } catch (err) {
        console.error(err);
        alert('Erro ao processar ' + file.name + ': ' + err.message);
      }
      done++;
      if (done === files.length) {
        CLAIMS = merged;
        claimsSourceCounts.sinistrosAvisados = counts.sinistrosAvisados;
        claimsSourceCounts.sinistrosPagamentos = counts.sinistrosPagamentos;
        if (document.getElementById('dash').style.display === 'none') {
          initDashboard({ preferredTab: 'sinistros' });
        } else {
          updateDashHeader();
          recomputeFdClaims();
          const sinBtn = document.querySelector('.tab-btn[onclick*="sinistros"]');
          if (sinBtn) showTab('sinistros', sinBtn);
          else renderSinistrosTab();
        }
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function renderSinistrosTab() {
  if (!hasSinistrosData()) return;
  let badge = fN(FD_CLAIMS.length) + ' / ' + fN(CLAIMS.length) + ' sinistros';
  const av = claimsSourceCounts.sinistrosAvisados;
  const pg = claimsSourceCounts.sinistrosPagamentos;
  if (av || pg) badge += ' · avisados ' + fN(av) + ' · pagos ' + fN(pg);
  document.getElementById('sin-file-badge').textContent = badge;
  if (sectionState['sin-kpis']) renderSinistrosKPIs();
  if (sectionState['sin-charts']) renderSinistrosCharts();
  if (sectionState['sin-sinistralidade']) renderSinistralidade();
  if (sectionState['sin-rentabilidade']) renderRentabilidade();
}

function normStatus(s) { return (s || '').toUpperCase().trim(); }

// Real status values in tabelas/sinistros-24-26.XLSX:
// PENDENTE = open/in-progress, LIQUIDADO = settled/paid
const STATUS_LIQUIDADO = ['LIQUIDADO', 'ENCERRADO', 'PENDENTE (LIQUIDADO SEGURADO)'];
const STATUS_SEM_COB = ['ENCERRADO SEM INDENIZAÇÃO', '(I)ENCERRA POR NAO HAVER COB'];
const STATUS_RECUSADO = ['PROCESSO NEGADO'];

function renderSinistrosKPIs() {
  const pendentes = FD_CLAIMS.filter(r => normStatus(r.status) === 'PENDENTE');
  const liquidados = FD_CLAIMS.filter(r => STATUS_LIQUIDADO.includes(normStatus(r.status)));
  const semCob = FD_CLAIMS.filter(r => STATUS_SEM_COB.includes(normStatus(r.status)));
  const recusados = FD_CLAIMS.filter(r => STATUS_RECUSADO.includes(normStatus(r.status)));
  const valorPendente = pendentes.reduce((s, r) => s + r.pago, 0);
  const valorPago = liquidados.reduce((s, r) => s + r.pago, 0);
  const totalValor = FD_CLAIMS.reduce((s, r) => s + r.pago, 0);
  const totalPremio = FD.reduce((s, r) => s + r.premio, 0);
  const sinistralidade = totalPremio > 0 ? totalValor / totalPremio : 0;
  const sinColor = sinistralidade >= 0.6 ? 'k-red' : sinistralidade >= 0.3 ? 'k-amber' : 'k-green';
  document.getElementById('sin-kpi-grid').innerHTML = [
    { l: 'Pendentes', v: fN(pendentes.length), s: fBRL(valorPendente), c: 'k-red' },
    { l: 'Liquidados', v: fN(liquidados.length), s: fBRL(valorPago), c: 'k-green' },
    { l: 'Sem cobertura', v: fN(semCob.length), s: fBRL(semCob.reduce((s, r) => s + r.pago, 0)), c: 'k-amber' },
    { l: 'Recusados', v: fN(recusados.length), s: fBRL(recusados.reduce((s, r) => s + r.pago, 0)), c: 'k-red' },
    { l: 'Total sinistros', v: fN(FD_CLAIMS.length), s: fBRL(totalValor), c: 'k-blue' },
    { l: 'Valor em aberto', v: fBRL(valorPendente), s: `${pendentes.length} pendentes`, c: 'k-red' },
    { l: 'Sinistralidade', v: fP(sinistralidade), s: 'sinistros / prêmio (produção)', c: sinColor },
  ].map(k => `<div class="kpi ${k.c}"><div class="kpi-label">${k.l}</div><div class="kpi-value" style="font-size:${k.v.length > 9 ? '16px' : '20px'}">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('');
}

function renderSinistrosCharts() {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const mLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const bySinM = {}, byPremM = {};
  FD_CLAIMS.forEach(r => {
    if (!r.aviso) return;
    const dt = r.aviso instanceof Date ? r.aviso : toDate(r.aviso); if (!dt) return;
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    bySinM[m] = (bySinM[m] || 0) + r.pago;
  });
  FD.forEach(r => {
    if (!r.vig) return;
    const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return;
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    byPremM[m] = (byPremM[m] || 0) + r.premio;
  });
  const ac = axisClr(), gc = gridClr(), lc = labelClr();
  mkChart('ch-sin-evolucao', {
    type: 'line',
    data: {
      labels: mLabels, datasets: [
        { label: 'Prêmio', data: months.map(m => byPremM[m] || 0), borderColor: '#639922', backgroundColor: 'rgba(99,153,34,0.08)', fill: true, tension: .35, pointRadius: 3, borderWidth: 2 },
        { label: 'Sinistros', data: months.map(m => bySinM[m] || 0), borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.08)', fill: true, tension: .35, pointRadius: 3, borderWidth: 2 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fBRL(ctx.raw) } } }, scales: { x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } }, y: { ticks: { color: ac, font: { size: 10 }, callback: fShort }, grid: { color: gc } } } }
  });
  const byRamo = {};
  FD_CLAIMS.forEach(r => { if (r.ramo) byRamo[r.ramo] = (byRamo[r.ramo] || 0) + 1; });
  const sorted = Object.entries(byRamo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  document.getElementById('sin-ramo-badge').textContent = fN(FD_CLAIMS.length) + ' sinistros';
  const h = Math.max(200, sorted.length * 36 + 50);
  document.getElementById('sin-ramo-wrap').style.height = h + 'px';
  if (sorted.length) {
    mkChart('ch-sin-ramo', {
      type: 'bar',
      data: { labels: sorted.map(e => e[0].length > 35 ? e[0].slice(0, 32) + '...' : e[0]), datasets: [{ data: sorted.map(e => e[1]), backgroundColor: PALETA.slice(0, sorted.length), borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + ' sinistros' } } }, scales: { x: { ticks: { color: ac, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: lc, font: { size: 11 } }, grid: { display: false } } } }
    });
  }
}

function setSinistralView(v) {
  sinistralView = v;
  document.getElementById('sinistral-btn-seg').classList.toggle('active', v === 'seg');
  document.getElementById('sinistral-btn-ramo').classList.toggle('active', v === 'ramo');
  document.getElementById('sin-sinistral-title').textContent = v === 'seg' ? 'Sinistralidade por seguradora' : 'Sinistralidade por ramo';
  renderSinistralidade();
}

function renderSinistralidade() {
  const byKey = v => v === 'seg' ? 'seg' : 'ramo';
  const dim = byKey(sinistralView);
  const premioMap = {}, sinMap = {}, qtdMap = {};
  FD.forEach(r => { if (r[dim]) premioMap[r[dim]] = (premioMap[r[dim]] || 0) + r.premio; });
  FD_CLAIMS.forEach(r => {
    if (r[dim]) { sinMap[r[dim]] = (sinMap[r[dim]] || 0) + r.pago; qtdMap[r[dim]] = (qtdMap[r[dim]] || 0) + 1; }
  });
  const keys = new Set([...Object.keys(premioMap), ...Object.keys(sinMap)]);
  const rows = [...keys].map(k => ({
    k, premio: premioMap[k] || 0, sin: sinMap[k] || 0, qtd: qtdMap[k] || 0,
    pct: premioMap[k] > 0 ? (sinMap[k] || 0) / premioMap[k] : null
  })).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const shortSeg = n => n.replace(/ CIA DE SEGUROS GERAIS S\/A/g, '').replace(/ CIA NAC DE SEGUROS S\/A/g, '').replace(/ SEGUROS S\/A/g, '').replace(/ SEGURADORA S\/A/g, '').replace(/ SEGURADORA/g, '').replace(/ SEGS CORPORATIVOS SA/g, '').trim();
  const label = sinistralView === 'seg' ? 'Seguradora' : 'Ramo';
  const fmt = n => sinistralView === 'seg' ? shortSeg(n) : n;
  const sinBadge = pct => {
    if (pct === null) return '<span style="color:var(--text-tertiary)">—</span>';
    const cls = pct >= 0.6 ? 'churn-badge-red' : pct >= 0.3 ? 'churn-badge-amber' : 'churn-badge-green';
    return `<span class="churn-badge ${cls}">${fP(pct)}</span>`;
  };
  const totPremio = rows.reduce((s, r) => s + r.premio, 0), totSin = rows.reduce((s, r) => s + r.sin, 0), totQtd = rows.reduce((s, r) => s + r.qtd, 0);
  document.getElementById('sin-sinistralidade-wrap').innerHTML = `<table class="ret-table">
    <thead><tr>
      <th style="text-align:left">${label}</th>
      <th style="text-align:right">Prêmio (produção)</th>
      <th style="text-align:right">Qtd sinistros</th>
      <th style="text-align:right">Valor sinistros</th>
      <th style="text-align:right">Sinistralidade</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="name-cell" title="${r.k}">${fmt(r.k)}</td>
      <td class="num">${fBRL(r.premio)}</td>
      <td class="num">${fN(r.qtd)}</td>
      <td class="num">${fBRL(r.sin)}</td>
      <td class="num">${sinBadge(r.pct)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td class="num">${fBRL(totPremio)}</td>
      <td class="num">${fN(totQtd)}</td>
      <td class="num">${fBRL(totSin)}</td>
      <td class="num">${sinBadge(totPremio > 0 ? totSin / totPremio : null)}</td>
    </tr></tfoot>
  </table>`;
}

function setRentabilView(v) {
  rentabilView = v;
  document.getElementById('rentabil-btn-seg').classList.toggle('active', v === 'seg');
  document.getElementById('rentabil-btn-ramo').classList.toggle('active', v === 'ramo');
  document.getElementById('sin-rentabil-title').textContent = v === 'seg' ? 'Rentabilidade por seguradora' : 'Rentabilidade por ramo';
  renderRentabilidade();
}

function renderRentabilidade() {
  const TIPOS_PROD = ['N', 'R', 'ER', 'EN'];
  const dim = rentabilView === 'seg' ? 'seg' : 'ramo';
  const premioMap = {}, comMap = {}, sinMap = {}, qtdMap = {};
  FD.filter(r => TIPOS_PROD.includes(r.tipo)).forEach(r => {
    if (!r[dim]) return;
    premioMap[r[dim]] = (premioMap[r[dim]] || 0) + r.premio;
    comMap[r[dim]] = (comMap[r[dim]] || 0) + r.com;
  });
  FD_CLAIMS.forEach(r => {
    if (!r[dim]) return;
    sinMap[r[dim]] = (sinMap[r[dim]] || 0) + r.pago;
    qtdMap[r[dim]] = (qtdMap[r[dim]] || 0) + 1;
  });
  const keys = new Set([...Object.keys(premioMap), ...Object.keys(sinMap)]);
  const rows = [...keys].map(k => {
    const premio = premioMap[k] || 0, com = comMap[k] || 0, sin = sinMap[k] || 0, qtd = qtdMap[k] || 0;
    return { k, premio, com, sin, qtd, rent: premio > 0 ? (premio - sin - com) / premio : null };
  }).sort((a, b) => (b.premio || 0) - (a.premio || 0));
  const shortSeg = n => n.replace(/ CIA DE SEGUROS GERAIS S\/A/g, '').replace(/ CIA NAC DE SEGUROS S\/A/g, '').replace(/ SEGUROS S\/A/g, '').replace(/ SEGURADORA S\/A/g, '').replace(/ SEGURADORA/g, '').replace(/ SEGS CORPORATIVOS SA/g, '').trim();
  const shortRamo = n => n.replace('AUTOMÓVEL - CASCO', 'Auto — casco').replace('COMPREENSIVO RESIDENCIAL', 'Comp. residencial').replace('COMPREENSIVO EMPRESARIAL', 'Comp. empresarial').replace('COMPREENSIVO CONDOMÍNIO', 'Comp. condomínio').toLowerCase().replace(/^\w/, c => c.toUpperCase());
  const label = rentabilView === 'seg' ? 'Seguradora' : 'Ramo';
  const fmt = n => rentabilView === 'seg' ? shortSeg(n) : shortRamo(n);
  const rentBadge = pct => {
    if (pct === null) return '<span style="color:var(--text-tertiary)">—</span>';
    const cls = pct >= 0.4 ? 'churn-badge-green' : pct >= 0 ? 'churn-badge-amber' : 'churn-badge-red';
    return `<span class="churn-badge ${cls}">${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%</span>`;
  };
  document.getElementById('sin-rentabilidade-wrap').innerHTML = `<table class="ret-table">
    <thead><tr>
      <th style="text-align:left">${label}</th>
      <th style="text-align:right">Prêmio</th>
      <th style="text-align:right">Comissão</th>
      <th style="text-align:right">Qtd sinistros</th>
      <th style="text-align:right">Valor sinistros</th>
      <th style="text-align:right">Rentabilidade</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td class="name-cell" title="${r.k}">${fmt(r.k)}</td>
      <td class="num">${fBRL(r.premio)}</td>
      <td class="num">${fBRL(r.com)}</td>
      <td class="num">${fN(r.qtd)}</td>
      <td class="num">${fBRL(r.sin)}</td>
      <td class="num">${rentBadge(r.rent)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPARATIVO DE PERÍODOS TAB ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function prevYearDates(start, end) {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00');
  s.setFullYear(s.getFullYear() - 1);
  e.setFullYear(e.getFullYear() - 1);
  return { start: fmtD(s), end: fmtD(e) };
}

function getCompData(start, end) {
  return ALL.filter(r => {
    if (start && r.vig && fmtD(r.vig) < start) return false;
    if (end && r.vig && fmtD(r.vig) > end) return false;
    if (MS.col.size > 0 && !MS.col.has(r.colab)) return false;
    if (MS.grp.size > 0 && !MS.grp.has(r.grp)) return false;
    if (MS.ram.size > 0 && !MS.ram.has(r.ramo)) return false;
    if (MS.seg.size > 0 && !MS.seg.has(r.seg)) return false;
    return true;
  });
}

function getMonthsInRange(start, end) {
  const months = [];
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00');
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const ML = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  while (cur <= e) {
    months.push({
      key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      label: ML[cur.getMonth()] + '/' + String(cur.getFullYear()).slice(2)
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function compAggByMonth(data, metric) {
  const TIPOS_PROD = ['N', 'R', 'ER', 'EN'];
  let filtered, isCount = false, field = 'premio';
  if (metric === 'premio_novo') { filtered = data.filter(r => r.tipo === 'N'); field = 'premio'; }
  else if (metric === 'premio_total') { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); field = 'premio'; }
  else if (metric === 'com_nova') { filtered = data.filter(r => r.tipo === 'N'); field = 'com'; }
  else if (metric === 'com_total') { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); field = 'com'; }
  else if (metric === 'qtd_nova') { filtered = data.filter(r => r.tipo === 'N'); isCount = true; }
  else { filtered = data.filter(r => TIPOS_PROD.includes(r.tipo)); isCount = true; }
  const byMonth = {};
  filtered.forEach(r => {
    if (!r.vig) return;
    const dt = r.vig instanceof Date ? r.vig : toDate(r.vig); if (!dt) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + (isCount ? 1 : r[field]);
  });
  return byMonth;
}

function applyCompFilter() {
  const s = document.getElementById('comp-start').value;
  const e = document.getElementById('comp-end').value;
  if (!s || !e) return;
  compStartDate = s; compEndDate = e;
  renderCompTab();
}

function onCompMetricChange(val) {
  compMetric = val;
  renderCompTab();
}

function renderCompTab() {
  if (!ALL.length) return;
  let start = compStartDate, end = compEndDate;
  if (!start || !end) {
    const t = today();
    start = `${t.getFullYear()}-01-01`;
    end = fmtD(t);
  }
  const prev = prevYearDates(start, end);
  const dataAtual = getCompData(start, end);
  const dataPrev = getCompData(prev.start, prev.end);

  const fmtLabel = d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
  document.getElementById('comp-periodo-atual-tag').textContent =
    `Atual: ${fmtLabel(start)} → ${fmtLabel(end)}`;
  document.getElementById('comp-periodo-prev-tag').textContent =
    `Anterior: ${fmtLabel(prev.start)} → ${fmtLabel(prev.end)}`;

  if (sectionState['comp-chart']) renderCompChart(dataAtual, dataPrev, start, end, prev.start, prev.end);
  if (sectionState['comp-kpis']) renderCompKPIs(dataAtual, dataPrev);
}

function renderCompChart(dataAtual, dataPrev, startA, endA, startP, endP) {
  const monthsA = getMonthsInRange(startA, endA);
  const monthsP = getMonthsInRange(startP, endP);
  const byMonthA = compAggByMonth(dataAtual, compMetric);
  const byMonthP = compAggByMonth(dataPrev, compMetric);
  const valA = monthsA.map(m => byMonthA[m.key] || 0);
  const valP = monthsP.map(m => byMonthP[m.key] || 0);
  const len = Math.max(valA.length, valP.length);
  while (valA.length < len) valA.push(0);
  while (valP.length < len) valP.push(0);
  const labels = monthsA.map(m => m.label);
  while (labels.length < len) labels.push('?');

  const varPct = valA.map((a, i) => {
    const p = valP[i] || 0;
    if (p === 0) return a > 0 ? 100 : 0;
    return ((a - p) / p) * 100;
  });

  const isMoney = ['premio_novo', 'premio_total', 'com_nova', 'com_total'].includes(compMetric);
  const metricLabels = {
    premio_novo: 'Prêmio Novo', premio_total: 'Prêmio Total',
    com_nova: 'Comissão Nova', com_total: 'Comissão Total',
    qtd_nova: 'Qtd Nova', qtd_total: 'Qtd Total'
  };
  const ac = axisClr(), gc = gridClr();

  mkChart('ch-comp-main', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: `Atual — ${metricLabels[compMetric]}`, data: valA, backgroundColor: 'rgba(78,128,255,0.72)', borderRadius: 4, yAxisID: 'y' },
        { type: 'bar', label: `Anterior — ${metricLabels[compMetric]}`, data: valP, backgroundColor: 'rgba(120,136,168,0.38)', borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: 'Variação %', data: varPct, borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.08)', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#F5A623', tension: 0.35, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 2
              ? `Variação: ${ctx.raw.toFixed(1)}%`
              : ctx.dataset.label + ': ' + (isMoney ? fBRL(ctx.raw) : fN(ctx.raw))
          }
        }
      },
      scales: {
        x: { ticks: { color: ac, font: { size: 11 } }, grid: { color: gc } },
        y: { position: 'left', ticks: { color: ac, font: { size: 10 }, callback: isMoney ? fShort : v => fN(v) }, grid: { color: gc } },
        y1: { position: 'right', ticks: { color: '#F5A623', font: { size: 10 }, callback: v => v.toFixed(0) + '%' }, grid: { display: false } }
      }
    }
  });
}

function renderCompKPIs(dataAtual, dataPrev) {
  const TIPOS_PROD = ['N', 'R', 'ER', 'EN'];
  function calcKPIs(data) {
    const cancelQtd = data.filter(r => r.tipo === 'CN' || r.tipo === 'CR').length;
    const endossosQtd = data.filter(r => r.tipo === 'EN' || r.tipo === 'ER').length;
    const cliUnicos = new Set(data.map(r => r.cli).filter(Boolean)).size;
    const prod = data.filter(r => TIPOS_PROD.includes(r.tipo));
    const premioTot = prod.reduce((s, r) => s + r.premio, 0);
    const comTot = prod.reduce((s, r) => s + r.com, 0);
    const ticket = prod.length ? premioTot / prod.length : 0;
    const pctCom = premioTot ? comTot / premioTot : 0;
    const taxaChurn = prod.length ? cancelQtd / prod.length : 0;
    const premioRisco = data.filter(r => r.sit === 'Cancelada').reduce((s, r) => s + Math.abs(r.premio), 0);
    const renovQtd = data.filter(r => r.tipo === 'R').length;
    const prodAtivos = new Set(data.filter(r => r.tipo === 'N').map(r => r.colab).filter(Boolean)).size;
    return { cancelQtd, endossosQtd, cliUnicos, ticket, pctCom, taxaChurn, premioRisco, renovQtd, prodAtivos };
  }

  const sA = calcKPIs(dataAtual), sP = calcKPIs(dataPrev);

  function compCard(label, vA, vP, fmt, lowerIsBetter) {
    const refZero = vP === 0 && vA === 0;
    const diff = vP !== 0 ? ((vA - vP) / Math.abs(vP)) * 100 : (vA > 0 ? 100 : 0);
    const isUp = !refZero && diff > 0.1;
    const isDown = !refZero && diff < -0.1;
    const isGood = lowerIsBetter ? isDown : isUp;
    const isBad = lowerIsBetter ? isUp : isDown;
    const tCls = refZero ? 'trend-neutral' : isGood ? 'trend-up' : isBad ? 'trend-down' : 'trend-neutral';
    const arrow = isUp ? '▲ ' : isDown ? '▼ ' : '';
    const diffTxt = !refZero && (isUp || isDown) ? Math.abs(diff).toFixed(1) + '%' : '—';
    return `<div class="kpi-comp-card">
          <div class="kpi-comp-label">${label}</div>
          <div class="kpi-comp-row">
            <div class="kpi-comp-period">
              <span class="kpi-comp-period-label">Atual</span>
              <span class="kpi-comp-period-value">${fmt(vA)}</span>
            </div>
            <div class="kpi-comp-period">
              <span class="kpi-comp-period-label">Anterior</span>
              <span class="kpi-comp-period-value kpi-comp-prev">${fmt(vP)}</span>
            </div>
            <div class="kpi-comp-trend ${tCls}">${arrow}${diffTxt}</div>
          </div>
        </div>`;
  }

  const fPct2 = v => (v * 100).toFixed(2) + '%';

  document.getElementById('comp-kpis-grid').innerHTML = [
    compCard('Cancelamentos (CN + CR)', sA.cancelQtd, sP.cancelQtd, fN, true),
    compCard('Endossos (EN + ER)', sA.endossosQtd, sP.endossosQtd, fN),
    compCard('Clientes únicos', sA.cliUnicos, sP.cliUnicos, fN),
    compCard('Ticket médio', sA.ticket, sP.ticket, fBRL),
    compCard('Comissão média (%)', sA.pctCom, sP.pctCom, fPct2),
    compCard('Taxa de churn', sA.taxaChurn, sP.taxaChurn, fPct2, true),
    compCard('Prêmio em risco (canceladas)', sA.premioRisco, sP.premioRisco, fBRL, true),
    compCard('Renovações (tipo R)', sA.renovQtd, sP.renovQtd, fN),
    compCard('Novos produtores ativos (tipo N)', sA.prodAtivos, sP.prodAtivos, fN),
  ].join('');
}

window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
  if (FD.length) {
    render();
    if (document.getElementById('tab-producao').classList.contains('active')) renderProdTab();
    if (document.getElementById('tab-retencao').classList.contains('active')) renderRetTab();
    if (document.getElementById('tab-comparativo').classList.contains('active')) renderCompTab();
    if (document.getElementById('tab-metas').classList.contains('active')) renderMetasTab();
    if (document.getElementById('tab-sinistros').classList.contains('active')) renderSinistrosTab();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── METAS TAB ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function getMetasBasePeriod() {
  const vs = document.getElementById('f-vig-s').value;
  const ve = document.getElementById('f-vig-e').value;
  if (vs && ve) {
    // desloca 1 ano para trás mantendo a comparação por string (igual à aba Produção, sem fuso)
    const startStr = (parseInt(vs.slice(0, 4), 10) - 1) + vs.slice(4);
    const endStr = (parseInt(ve.slice(0, 4), 10) - 1) + ve.slice(4);
    return { startStr, endStr, start: new Date(startStr + 'T00:00:00'), end: new Date(endStr + 'T00:00:00') };
  }
  const year = today().getFullYear() - 1;
  const startStr = `${year}-01-01`, endStr = `${year}-12-31`;
  return { startStr, endStr, start: new Date(startStr + 'T00:00:00'), end: new Date(endStr + 'T00:00:00') };
}

function filterMetasData(opts) {
  opts = opts || {};
  const { startStr, endStr } = getMetasBasePeriod();
  // Honra os botões N / R do filtro "Tipo de documento"; mapeia endossos para o lado correspondente.
  const sideSel = new Set();
  activeTipos.forEach(t => { const s = metaTipoSide(t); if (s) sideSel.add(s); });
  return ALL.filter(r => {
    const side = metaTipoSide(r.tipo);
    if (!side) return false; // só N, R, EN, ER
    if (sideSel.size && !sideSel.has(side)) return false;
    // comparação por string YYYY-MM-DD, idêntica à aba Produção (evita erro de fuso horário)
    const ds = fmtD(r.vig);
    if (!ds) return false;
    if (ds < startStr || ds > endStr) return false;
    if (MS.col.size && !MS.col.has(r.colab)) return false;
    if (MS.grp.size && !MS.grp.has(r.grp)) return false;
    if (MS.ram.size && !MS.ram.has(r.ramo)) return false;
    if (MS.seg.size && !MS.seg.has(r.seg)) return false;
    if (!opts.includeExcluded && classifyRamo(r.ramo) === 'excluded') return false;
    return true;
  });
}

function getMetaPcts() {
  const mn = (parseFloat(document.getElementById('meta-novos-pct').value) || 0) / 100;
  const mr = (parseFloat(document.getElementById('meta-renov-pct').value) || 0) / 100;
  return { mn, mr };
}

function buildMetasGroupData(data) {
  const { mn, mr } = getMetaPcts();
  const map = {};
  data.forEach(r => {
    const k = r.colab || '—';
    if (!map[k]) map[k] = { nome: k, np: 0, nc: 0, rp: 0, rc: 0 };
    if (metaTipoSide(r.tipo) === 'N') { map[k].np += r.premio; map[k].nc += r.com; }
    else { map[k].rp += r.premio; map[k].rc += r.com; }
  });
  return Object.values(map).map(v => {
    const totalAnt = v.np + v.rp, totalComAnt = v.nc + v.rc;
    const metaNProd = v.np * (1 + mn), metaNCom = v.nc * (1 + mn);
    const metaRProd = v.rp * (1 + mr), metaRCom = v.rc * (1 + mr);
    const metaTotalProd = metaNProd + metaRProd, metaTotalCom = metaNCom + metaRCom;
    const pctComAnt = totalAnt ? totalComAnt / totalAnt : 0;
    const pctMetaCom = metaTotalProd ? metaTotalCom / metaTotalProd : 0;
    return { ...v, totalAnt, totalComAnt, metaNProd, metaNCom, metaRProd, metaRCom, metaTotalProd, metaTotalCom, pctComAnt, pctMetaCom };
  });
}

function setMetasSort(key) {
  if (metaSortKey === key) metaSortDir = metaSortDir === 'desc' ? 'asc' : 'desc';
  else { metaSortKey = key; metaSortDir = 'desc'; }
  renderMetasColabTable();
}

function renderMetasTab() {
  if (!ALL.length) return;
  const { start, end } = getMetasBasePeriod();
  const ML = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${ML[d.getMonth()]}/${d.getFullYear()}`;
  document.getElementById('metas-base-label').textContent = `Base: ${fmt(start)} – ${fmt(end)}`;
  renderMetasEquipeCards();
  if (sectionState['metas-semanal']) renderMetasSemanal();
  if (sectionState['metas-colab']) renderMetasColabTable();
}

// ── Acompanhamento semanal x meta ──────────────────────────────────────────────
// Produção realizada no período selecionado (ano corrente), mesmo escopo da meta:
// tipos N/R/EN/ER, ramos que contam, e honrando os filtros globais + botões N/R.
function getMetasRealizadoData() {
  const vs = document.getElementById('f-vig-s').value;
  const ve = document.getElementById('f-vig-e').value;
  const sideSel = new Set();
  activeTipos.forEach(t => { const s = metaTipoSide(t); if (s) sideSel.add(s); });
  return ALL.filter(r => {
    const side = metaTipoSide(r.tipo);
    if (!side) return false;
    if (sideSel.size && !sideSel.has(side)) return false;
    const ds = fmtD(r.vig);
    if (!ds) return false;
    if (vs && ds < vs) return false;
    if (ve && ds > ve) return false;
    if (MS.col.size && !MS.col.has(r.colab)) return false;
    if (MS.grp.size && !MS.grp.has(r.grp)) return false;
    if (MS.ram.size && !MS.ram.has(r.ramo)) return false;
    if (MS.seg.size && !MS.seg.has(r.seg)) return false;
    if (classifyRamo(r.ramo) === 'excluded') return false;
    return true;
  });
}

// Divide o período em semanas de calendário (domingo→sábado); a semana 1 começa no dia 1 e a última pode ser parcial.
function computeMetaWeeks(vs, ve) {
  const pad = n => String(n).padStart(2, '0');
  const toLocal = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const ddmm = dt => `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}`;
  const start = toLocal(vs), end = toLocal(ve);
  const buckets = new Map();
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const ws = new Date(cur); ws.setDate(ws.getDate() - ws.getDay()); // domingo da semana
    const key = iso(ws);
    if (!buckets.has(key)) buckets.set(key, { first: new Date(cur), last: new Date(cur), days: 0 });
    const b = buckets.get(key); b.last = new Date(cur); b.days++;
  }
  const arr = [...buckets.values()];
  // Começo do mês: se o fragmento inicial for muito curto (≤3 dias), ele é
  // incorporado à semana de calendário seguinte (ex.: mês que começa numa sexta
  // → semana 1 = sexta/sábado + semana seguinte). Fragmentos de 4+ dias ficam
  // como Semana 1 por conta própria. A última semana nunca é fundida — pode
  // terminar com poucos dias (a reunião é sempre na segunda).
  if (arr.length > 1 && arr[0].days <= 3) {
    arr[1].first = arr[0].first; arr[1].days += arr[0].days;
    arr.shift();
  }
  let i = 0;
  return arr.map(b => {
    i++;
    return { idx: i, label: 'Semana ' + i, startStr: iso(b.first), endStr: iso(b.last), days: b.days, periodoLabel: ddmm(b.first) + '–' + ddmm(b.last) };
  });
}

function buildMetasSemanal() {
  const vs = document.getElementById('f-vig-s').value;
  const ve = document.getElementById('f-vig-e').value;
  if (!vs || !ve) return { hasPeriod: false };
  const weeks = computeMetaWeeks(vs, ve);
  const totalDays = weeks.reduce((s, w) => s + w.days, 0) || 1;
  const cards = buildMetasEquipeCards();
  const teamMeta = {
    geral: { premio: cards.geral.metaProd, com: cards.geral.metaCom },
    pessoais: { premio: cards.pessoais.metaProd, com: cards.pessoais.metaCom },
    patrimoniais: { premio: cards.patrimoniais.metaProd, com: cards.patrimoniais.metaCom },
  };
  const TEAMS = ['geral', 'pessoais', 'patrimoniais'];
  weeks.forEach(w => {
    w.byTeam = {};
    TEAMS.forEach(t => {
      w.byTeam[t] = {
        realPremio: 0, realCom: 0,
        metaPremio: teamMeta[t].premio * (w.days / totalDays),
        metaCom: teamMeta[t].com * (w.days / totalDays),
      };
    });
  });
  getMetasRealizadoData().forEach(r => {
    const team = classifyRamo(r.ramo); // pessoais | patrimoniais (excluídos já fora)
    const ds = fmtD(r.vig);
    const w = weeks.find(w => ds >= w.startStr && ds <= w.endStr);
    if (!w || !w.byTeam[team]) return;
    w.byTeam[team].realPremio += r.premio; w.byTeam[team].realCom += r.com;
    w.byTeam.geral.realPremio += r.premio; w.byTeam.geral.realCom += r.com;
  });
  const totals = {};
  TEAMS.forEach(t => {
    totals[t] = {
      realPremio: weeks.reduce((s, w) => s + w.byTeam[t].realPremio, 0),
      realCom: weeks.reduce((s, w) => s + w.byTeam[t].realCom, 0),
      metaPremio: teamMeta[t].premio,
      metaCom: teamMeta[t].com,
    };
  });
  return { hasPeriod: true, weeks, totals };
}

const METAS_SEM_TEAM_LBL = { geral: 'Geral', pessoais: 'Pessoais', patrimoniais: 'Patrimoniais' };
const METAS_SEM_TEAM_COLOR = { geral: '#4E80FF', pessoais: '#22D3EE', patrimoniais: '#F5A623' };

// Clique num dos 6 cards: foca a equipe e a métrica daquele card no gráfico/tabela.
function setMetaWeekCard(t, m) {
  metaWeekTeam = t; metaWeekMetric = m;
  renderMetasSemanal();
}

function renderMetasSemanal() {
  if (!ALL.length) return;
  const mtdEl = document.getElementById('metas-sem-mtd');
  const tableEl = document.getElementById('metas-sem-table-wrap');
  const badge = document.getElementById('metas-semanal-badge');
  if (!mtdEl || !tableEl) return;

  const data = buildMetasSemanal();
  if (!data.hasPeriod) {
    if (badge) badge.textContent = '';
    mtdEl.innerHTML = '<div class="metas-sem-hint">Selecione um período de vigência (ex.: o mês atual) para ver o acompanhamento semanal.</div>';
    tableEl.innerHTML = '';
    if (charts['ch-metas-semanal']) { charts['ch-metas-semanal'].destroy(); delete charts['ch-metas-semanal']; }
    return;
  }

  const metric = metaWeekMetric;
  const realKey = metric === 'comissao' ? 'realCom' : 'realPremio';
  const metaKey = metric === 'comissao' ? 'metaCom' : 'metaPremio';
  const metricLbl = metric === 'comissao' ? 'Comissão' : 'Prêmio';
  if (badge) badge.textContent = data.weeks.length + ' semanas · ' + metricLbl;

  const pctCls = p => p >= 1 ? 'msem-ok' : p >= 0.8 ? 'msem-warn' : 'msem-bad';
  const TEAMS = ['geral', 'pessoais', 'patrimoniais'];

  // Cartões resumo (mês até agora): linha de Prêmio em cima, Comissão embaixo.
  // Cada card é clicável e foca o gráfico/tabela naquela equipe + métrica.
  const teamCard = (t, m) => {
    const tt = data.totals[t];
    const real = tt[m === 'comissao' ? 'realCom' : 'realPremio'];
    const meta = tt[m === 'comissao' ? 'metaCom' : 'metaPremio'];
    const pct = meta ? real / meta : 0, gap = real - meta;
    const pctClamp = Math.max(0, Math.min(1, pct));
    const active = t === metaWeekTeam && m === metaWeekMetric;
    return `<div class="msem-card${active ? ' active' : ''}" style="--tc:${METAS_SEM_TEAM_COLOR[t]}" onclick="setMetaWeekCard('${t}','${m}')">
      <div class="msem-card-head"><span class="msem-dot"></span>${METAS_SEM_TEAM_LBL[t]}</div>
      <div class="msem-pct ${pctCls(pct)}">${fP(pct)}</div>
      <div class="msem-bar"><div class="msem-bar-fg" style="width:${(pctClamp * 100).toFixed(1)}%"></div></div>
      <div class="msem-nums">${fBRL(real)} <span class="msem-meta">/ ${fBRL(meta)}</span></div>
      <div class="msem-gap ${gap >= 0 ? 'pos' : 'neg'}">${gap >= 0 ? '+' : ''}${fBRL(gap)}</div>
    </div>`;
  };
  const metricRow = (m, lbl) => `<div class="msem-row">
    <div class="msem-row-lbl">${lbl}</div>
    ${TEAMS.map(t => teamCard(t, m)).join('')}
  </div>`;
  mtdEl.innerHTML = metricRow('premio', 'Prêmio') + metricRow('comissao', 'Comissão');

  // Gráfico de barras: realizado x meta por semana, para a equipe selecionada.
  const team = metaWeekTeam, tc = METAS_SEM_TEAM_COLOR[team];
  const labels = data.weeks.map(w => w.label);
  const realData = data.weeks.map(w => w.byTeam[team][realKey]);
  const metaData = data.weeks.map(w => w.byTeam[team][metaKey]);
  const ac = axisClr(), gc = gridClr();
  mkChart('ch-metas-semanal', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Realizado', data: realData, backgroundColor: tc, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.62 },
        { label: 'Meta', data: metaData, backgroundColor: tc + '2e', borderColor: tc, borderWidth: 1.5, borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.62 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: ac, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ' + fBRL(ctx.raw),
            afterBody: items => {
              const w = data.weeks[items[0].dataIndex];
              const r = w.byTeam[team][realKey], m = w.byTeam[team][metaKey];
              return '% meta: ' + fP(m ? r / m : 0) + '  ·  ' + w.periodoLabel + ' (' + w.days + 'd)';
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: ac, font: { size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: ac, font: { size: 10 }, callback: fShort }, grid: { color: gc } },
      },
    },
  });

  // Tabela detalhada (equipe selecionada) com acumulado.
  let acReal = 0, acMeta = 0;
  const rowsHtml = data.weeks.map(w => {
    const r = w.byTeam[team][realKey], m = w.byTeam[team][metaKey];
    acReal += r; acMeta += m;
    const pct = m ? r / m : 0, pctAc = acMeta ? acReal / acMeta : 0;
    return `<tr><td>${w.label}</td><td style="color:var(--text-tertiary)">${w.periodoLabel}</td><td class="num">${w.days}</td><td class="num">${fBRL(r)}</td><td class="num">${fBRL(m)}</td><td class="num ${pctCls(pct)}">${fP(pct)}</td><td class="num">${fBRL(acReal)}</td><td class="num">${fBRL(acMeta)}</td><td class="num ${pctCls(pctAc)}">${fP(pctAc)}</td></tr>`;
  }).join('');
  const tt = data.totals[team];
  const totReal = tt[realKey], totMeta = tt[metaKey], totPct = totMeta ? totReal / totMeta : 0;
  const totDays = data.weeks.reduce((s, w) => s + w.days, 0);
  tableEl.innerHTML = `<table class="prod-table msem-table"><thead><tr><th>Semana</th><th>Período</th><th class="num">Dias</th><th class="num">Realizado</th><th class="num">Meta</th><th class="num">% meta</th><th class="num">Acum. real.</th><th class="num">Acum. meta</th><th class="num">% acum.</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="2">Total ${METAS_SEM_TEAM_LBL[team]}</td><td class="num">${totDays}</td><td class="num">${fBRL(totReal)}</td><td class="num">${fBRL(totMeta)}</td><td class="num ${pctCls(totPct)}">${fP(totPct)}</td><td class="num">${fBRL(totReal)}</td><td class="num">${fBRL(totMeta)}</td><td class="num ${pctCls(totPct)}">${fP(totPct)}</td></tr></tfoot></table>`;
}

/* ===================== Modo apresentação (kickoff semanal) =====================
   Layout inspirado no deck de kickoff: cada equipe ganha um slide com gráfico de
   barras horizontais Meta (dourado) x Realizado (verde), separados em Prêmio e
   Comissão. Capas e divisórias usam a identidade visual (vinho). */
let kickoffSlides = [], kickoffIdx = 0, kickoffKeyHandler = null, kickoffMode = 'chooser';
const KICKOFF_TEAMS = ['pessoais', 'patrimoniais', 'geral'];
const KF_GOLD = '#D9A520', KF_GREEN = '#1A7A4C';
const KF_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Plugin: escreve o valor (R$) na ponta de cada barra.
const kfBarLabelPlugin = {
  id: 'kfBarLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v == null) return;
        const txt = fBRL(v);
        const tw = ctx.measureText(txt).width;
        const barLen = Math.abs(el.x - el.base);
        if (barLen > tw + 20) {
          ctx.textAlign = 'right';
          ctx.fillStyle = di === 0 ? '#3a2c05' : '#ffffff';
          ctx.fillText(txt, el.x - 10, el.y);
        } else {
          ctx.textAlign = 'left';
          ctx.fillStyle = '#2B2733';
          ctx.fillText(txt, el.x + 10, el.y);
        }
      });
    });
    ctx.restore();
  }
};

// Período do mês anterior ao informado (vs = 'YYYY-MM-01' do filtro).
function kfPrevMonthPeriod(vs) {
  const pad = n => String(n).padStart(2, '0');
  const [y, m] = vs.split('-').map(Number); // m: 1-indexado
  const d0 = new Date(y, m - 2, 1);          // 1º dia do mês anterior
  const py = d0.getFullYear(), pm = d0.getMonth(); // pm: 0-indexado
  const last = new Date(py, pm + 1, 0).getDate();
  return { vs: `${py}-${pad(pm + 1)}-01`, ve: `${py}-${pad(pm + 1)}-${pad(last)}`, mesNome: KF_MESES[pm], ano: String(py) };
}

// Executa fn() com o filtro de vigência temporariamente trocado, depois restaura.
// Reaproveita exatamente os cálculos de meta/realizado já existentes para outro mês.
function withKfPeriod(vs, ve, fn) {
  const sEl = document.getElementById('f-vig-s'), eEl = document.getElementById('f-vig-e');
  const oS = sEl.value, oE = eEl.value;
  sEl.value = vs; eEl.value = ve;
  try { return fn(); } finally { sEl.value = oS; eEl.value = oE; }
}

// Descritor de slide de equipe para uma semana específica.
function kfWeekTeamSlide(week, team, sub) {
  const b = week.byTeam[team];
  return {
    type: 'team', team, sub, period: week.label, caption: week.periodoLabel,
    premio: { meta: b.metaPremio, real: b.realPremio },
    comissao: { meta: b.metaCom, real: b.realCom }, ref: null
  };
}

// Descritor de slide de equipe para o acumulado de um mês (com base do ano anterior).
function kfMonthTeamSlide(semData, cardsData, team, opts) {
  const tt = semData.totals[team], c = cardsData[team];
  return {
    type: 'team', team, sub: opts.sub, period: opts.period, caption: opts.caption,
    premio: { meta: tt.metaPremio, real: tt.realPremio },
    comissao: { meta: tt.metaCom, real: tt.realCom },
    ref: { p25: c.baseProd, c25: c.baseCom, pct: c.baseProd ? c.baseCom / c.baseProd : 0, ano: opts.refAno }
  };
}

// Descritor do gráfico de evolução semanal de uma equipe (prêmio + comissão).
function kfWeeksChartSlide(semData, team, mesNome) {
  return {
    type: 'weekschart', team, mes: mesNome,
    weeks: semData.weeks.map(w => ({
      label: w.label, periodo: w.periodoLabel,
      pMeta: w.byTeam[team].metaPremio, pReal: w.byTeam[team].realPremio,
      cMeta: w.byTeam[team].metaCom, cReal: w.byTeam[team].realCom,
    }))
  };
}

// mode: 'semana' (weekIdx 1-based) | 'fechamento'.
function buildKickoffSlides(mode, weekIdx) {
  const vs = document.getElementById('f-vig-s').value;
  if (!vs) return [];
  const mesNome = KF_MESES[(+vs.split('-')[1]) - 1];
  const ano = vs.split('-')[0];
  const refAno = (+ano - 1) % 100;
  const slides = [];

  if (mode === 'fechamento') {
    const pp = kfPrevMonthPeriod(vs);
    const cur = { sem: buildMetasSemanal(), cards: buildMetasEquipeCards() };
    const prev = withKfPeriod(pp.vs, pp.ve, () => ({ sem: buildMetasSemanal(), cards: buildMetasEquipeCards() }));
    if (!prev.sem.hasPeriod || !prev.sem.weeks.length) return [];

    slides.push({ type: 'cover', mes: `${mesNome} ${ano}` });

    // Fechamento do mês anterior — acumulado por equipe
    slides.push({ type: 'divider', l1: 'Fechamento', l2: 'de', l3: pp.mesNome });
    KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(prev.sem, prev.cards, t, {
      sub: 'Fechamento do mês', period: pp.mesNome, caption: `${pp.mesNome} de ${pp.ano}`,
      refAno: (+pp.ano - 1) % 100
    })));

    // Evolução semana a semana do mês anterior — um gráfico por equipe
    slides.push({ type: 'divider', l1: 'Evolução', l2: 'por', l3: 'Semana' });
    KICKOFF_TEAMS.forEach(t => slides.push(kfWeeksChartSlide(prev.sem, t, pp.mesNome)));

    // Meta do mês atual — estrutura padrão
    slides.push({ type: 'divider', l1: 'Metas', l2: 'de', l3: mesNome });
    KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(cur.sem, cur.cards, t, {
      sub: 'Meta do mês', period: mesNome, caption: `${mesNome} de ${ano}`, refAno
    })));

    slides.push({ type: 'closing', text: 'BORA TIME!' });
    return slides;
  }

  // mode === 'semana'
  const sem = buildMetasSemanal();
  if (!sem.hasPeriod || !sem.weeks.length) return [];
  const cards = buildMetasEquipeCards();
  let idx = (weekIdx != null) ? weekIdx - 1 : -1;
  if (idx < 0) {
    const todayStr = fmtD(today());
    idx = sem.weeks.findIndex(w => todayStr >= w.startStr && todayStr <= w.endStr);
    if (idx < 0) idx = sem.weeks.length - 1;
  }
  idx = Math.max(0, Math.min(sem.weeks.length - 1, idx));
  const rw = sem.weeks[idx];

  slides.push({ type: 'cover', mes: `${mesNome} ${ano}` });

  slides.push({ type: 'divider', l1: 'Resultados', l2: 'da', l3: rw.label });
  KICKOFF_TEAMS.forEach(t => slides.push(kfWeekTeamSlide(rw, t, 'Produção da semana')));

  slides.push({ type: 'divider', l1: 'Resultados', l2: 'do', l3: 'Mês' });
  KICKOFF_TEAMS.forEach(t => slides.push(kfMonthTeamSlide(sem, cards, t, {
    sub: 'Acumulado do mês', period: mesNome, caption: `${mesNome} de ${ano}`, refAno
  })));

  slides.push({ type: 'closing', text: 'BORA TIME!' });
  return slides;
}

function kfTeamSlideHtml(s) {
  const refBox = s.ref ? `<div class="kf-ts-ref">
      <div><b>Prêmio/${s.ref.ano}:</b> ${fBRL(s.ref.p25)}</div>
      <div><b>Comissão/${s.ref.ano}:</b> ${fBRL(s.ref.c25)}</div>
      <div><b>% Médio:</b> ${fP(s.ref.pct)}</div>
    </div>` : '<div class="kf-ts-ref"></div>';
  return `<div class="kf-page kf-page--light kf-teamslide">
    <div class="kf-ts-head">
      <div class="kf-ts-left">
        <div class="kf-ts-obj"><span class="kf-ts-objbar"></span>Nossos<br><strong>objetivos</strong></div>
        <div class="kf-ts-team">${METAS_SEM_TEAM_LBL[s.team]}</div>
      </div>
      <div class="kf-ts-center">
        <div class="kf-ts-sub">${s.sub}</div>
        <div class="kf-ts-period">${s.period}</div>
        <div class="kf-ts-cap">${s.caption}</div>
      </div>
      ${refBox}
    </div>
    <div class="kf-chart-wrap"><canvas id="ch-kickoff"></canvas></div>
  </div>`;
}

function kfRenderTeamChart(s) {
  mkChart('ch-kickoff', {
    type: 'bar',
    data: {
      labels: ['Prêmio', 'Comissão'],
      datasets: [
        { label: 'Meta', data: [s.premio.meta, s.comissao.meta], backgroundColor: KF_GOLD, borderRadius: 3, categoryPercentage: 0.78, barPercentage: 0.94 },
        { label: 'Realizado', data: [s.premio.real, s.comissao.real], backgroundColor: KF_GREEN, borderRadius: 3, categoryPercentage: 0.78, barPercentage: 0.94 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 80, left: 4 } },
      plugins: {
        legend: { position: 'top', align: 'center', labels: { color: '#2B2733', font: { size: 14, weight: '600' }, boxWidth: 12, usePointStyle: true, pointStyle: 'circle', padding: 18 } },
        tooltip: { enabled: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: '#6a6680', font: { size: 12 }, callback: fShort }, grid: { color: '#E4E2EE' } },
        y: { ticks: { color: '#2B2733', font: { size: 17, weight: '600' } }, grid: { display: false } },
      },
    },
    plugins: [kfBarLabelPlugin],
  });
}

// Plugin: valor (R$ curto) acima de cada barra vertical do gráfico semanal.
const kfWeeksLabelPlugin = {
  id: 'kfWeeksLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2B2733';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v == null || v === 0) return;
        ctx.fillText(fShort(v), el.x, el.y - 3);
      });
    });
    ctx.restore();
  }
};

function kfWeeksSlideHtml(s) {
  return `<div class="kf-page kf-page--light kf-weekslide">
    <div class="kf-ts-head">
      <div class="kf-ts-left">
        <div class="kf-ts-obj"><span class="kf-ts-objbar"></span>Nossa<br><strong>evolução</strong></div>
        <div class="kf-ts-team">${METAS_SEM_TEAM_LBL[s.team]}</div>
      </div>
      <div class="kf-ts-center">
        <div class="kf-ts-sub">Evolução semanal</div>
        <div class="kf-ts-period">${s.mes}</div>
        <div class="kf-ts-cap">Realizado vs. esperado</div>
      </div>
      <div class="kf-ts-ref"></div>
    </div>
    <div class="kf-weeks-charts">
      <div class="kf-weeks-col"><div class="kf-weeks-title">Prêmio</div><div class="kf-weeks-cv"><canvas id="ch-kfw-p"></canvas></div></div>
      <div class="kf-weeks-col"><div class="kf-weeks-title">Comissão</div><div class="kf-weeks-cv"><canvas id="ch-kfw-c"></canvas></div></div>
    </div>
  </div>`;
}

function kfRenderWeeksChart(s) {
  const labels = s.weeks.map(w => w.label.replace('Semana ', 'S'));
  const mk = (id, metaArr, realArr) => mkChart(id, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Esperado', data: metaArr, backgroundColor: KF_GOLD, borderRadius: 3, categoryPercentage: 0.72, barPercentage: 0.92 },
        { label: 'Realizado', data: realArr, backgroundColor: KF_GREEN, borderRadius: 3, categoryPercentage: 0.72, barPercentage: 0.92 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      plugins: {
        legend: { position: 'top', labels: { color: '#2B2733', font: { size: 12, weight: '600' }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 12 } },
        tooltip: { enabled: false },
      },
      scales: {
        x: { ticks: { color: '#2B2733', font: { size: 13, weight: '600' } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#6a6680', font: { size: 11 }, callback: fShort }, grid: { color: '#E4E2EE' } },
      },
    },
    plugins: [kfWeeksLabelPlugin],
  });
  mk('ch-kfw-p', s.weeks.map(w => w.pMeta), s.weeks.map(w => w.pReal));
  mk('ch-kfw-c', s.weeks.map(w => w.cMeta), s.weeks.map(w => w.cReal));
}

function kfSlideHtml(s) {
  if (s.type === 'weekschart') return kfWeeksSlideHtml(s);
  if (s.type === 'cover') {
    return `<div class="kf-page kf-page--brand kf-cover2">
      <div class="kf-brand-mark"></div>
      <div class="kf-cover2-eyebrow">Reunião de</div>
      <div class="kf-cover2-title">Kick-off</div>
      <div class="kf-cover2-mes">${s.mes}</div>
    </div>`;
  }
  if (s.type === 'divider') {
    return `<div class="kf-page kf-page--brand kf-divider">
      <div class="kf-div-1">${s.l1}</div>
      <div class="kf-div-2">${s.l2}</div>
      <div class="kf-div-3">${s.l3}</div>
    </div>`;
  }
  if (s.type === 'closing') {
    return `<div class="kf-page kf-page--brand kf-closing">
      <div class="kf-brand-mark"></div>
      <div class="kf-closing-bar"></div>
      <div class="kf-closing-txt">${s.text}</div>
    </div>`;
  }
  return kfTeamSlideHtml(s);
}

function kfDestroyCharts() {
  ['ch-kickoff', 'ch-kfw-p', 'ch-kfw-c'].forEach(id => {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  });
}

function openKickoff() {
  if (!ALL.length) { alert('Carregue os dados antes de gerar a apresentação.'); return; }
  let ov = document.getElementById('kickoff-mode');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'kickoff-mode';
    ov.innerHTML = `
      <button class="kf-exit" onclick="closeKickoff()" title="Sair (Esc)">Sair ✕</button>
      <button class="kf-back" onclick="kfShowChooser()" title="Voltar às opções">↩ Opções</button>
      <div class="kf-stage" id="kf-stage"></div>
      <div class="kf-controls">
        <button class="kf-nav" onclick="kickoffNav(-1)">‹ Anterior</button>
        <div class="kf-dots" id="kf-dots"></div>
        <button class="kf-nav" onclick="kickoffNav(1)">Próximo ›</button>
        <button class="kf-nav kf-pdf-btn" id="kf-pdf-btn" onclick="exportKickoffPdf()" title="Baixar a apresentação em PDF">↓ Exportar PDF</button>
      </div>`;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  kickoffKeyHandler = e => {
    if (e.key === 'Escape') closeKickoff();
    else if (kickoffMode === 'show' && (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')) { e.preventDefault(); kickoffNav(1); }
    else if (kickoffMode === 'show' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) { e.preventDefault(); kickoffNav(-1); }
  };
  document.addEventListener('keydown', kickoffKeyHandler);
  kfShowChooser();
}

// Tela inicial: escolher entre Fechamento de mês ou uma semana específica.
function kfShowChooser() {
  kickoffMode = 'chooser';
  kfDestroyCharts();
  const stage = document.getElementById('kf-stage');
  if (!stage) return;
  const ctrls = document.querySelector('#kickoff-mode .kf-controls');
  const back = document.querySelector('#kickoff-mode .kf-back');
  if (ctrls) ctrls.style.display = 'none';
  if (back) back.style.display = 'none';

  const vs = document.getElementById('f-vig-s').value, ve = document.getElementById('f-vig-e').value;
  if (!vs || !ve) {
    stage.innerHTML = '<div class="kf-choose"><div class="kf-choose-title">Selecione um período de vigência na aba Metas para gerar a apresentação.</div></div>';
    return;
  }
  const weeks = computeMetaWeeks(vs, ve);
  const mesNome = KF_MESES[(+vs.split('-')[1]) - 1], ano = vs.split('-')[0];
  const pp = kfPrevMonthPeriod(vs);
  const weekBtns = weeks.map(w =>
    `<button class="kf-wk-btn" onclick="kfStart('semana',${w.idx})"><b>${w.label}</b><span>${w.periodoLabel}</span></button>`).join('');

  stage.innerHTML = `
    <div class="kf-choose">
      <div class="kf-choose-eyebrow">Modo apresentação</div>
      <div class="kf-choose-title">${mesNome} de ${ano}</div>
      <div class="kf-choose-grid">
        <button class="kf-choose-card kf-choose-main" onclick="kfStart('fechamento')">
          <div class="kf-choose-h">Fechamento de mês</div>
          <div class="kf-choose-d">Consolida os resultados de <b>${pp.mesNome}</b>, mostra a evolução semana a semana vs. o esperado e apresenta a meta de ${mesNome}.</div>
          <div class="kf-choose-go">Gerar ›</div>
        </button>
        <div class="kf-choose-card">
          <div class="kf-choose-h">Resultado por semana</div>
          <div class="kf-choose-d">Escolha uma semana de ${mesNome}:</div>
          <div class="kf-wk-grid">${weekBtns}</div>
        </div>
      </div>
    </div>`;
}

function kfStart(mode, weekIdx) {
  const slides = buildKickoffSlides(mode, weekIdx);
  if (!slides.length) {
    alert('Não há dados suficientes para gerar a apresentação neste período.');
    return;
  }
  kickoffSlides = slides;
  kickoffIdx = 0;
  kickoffMode = 'show';
  const ctrls = document.querySelector('#kickoff-mode .kf-controls');
  const back = document.querySelector('#kickoff-mode .kf-back');
  if (ctrls) ctrls.style.display = '';
  if (back) back.style.display = '';
  renderKickoffSlide();
}

function kickoffNav(d) {
  kickoffIdx = Math.max(0, Math.min(kickoffSlides.length - 1, kickoffIdx + d));
  renderKickoffSlide();
}

function renderKickoffSlide() {
  const stage = document.getElementById('kf-stage');
  if (!stage) return;
  const s = kickoffSlides[kickoffIdx];
  kfDestroyCharts();
  stage.innerHTML = kfSlideHtml(s);
  if (s.type === 'team') kfRenderTeamChart(s);
  else if (s.type === 'weekschart') kfRenderWeeksChart(s);
  const dots = document.getElementById('kf-dots');
  if (dots) dots.innerHTML = kickoffSlides.map((_, i) =>
    `<span class="kf-pgdot${i === kickoffIdx ? ' on' : ''}" onclick="kickoffGo(${i})"></span>`).join('');
}

function kickoffGo(i) { kickoffIdx = i; renderKickoffSlide(); }

function closeKickoff() {
  const ov = document.getElementById('kickoff-mode');
  if (ov) ov.style.display = 'none';
  kfDestroyCharts();
  if (kickoffKeyHandler) { document.removeEventListener('keydown', kickoffKeyHandler); kickoffKeyHandler = null; }
}

// Gera um PDF (paisagem 16:9, um slide por página) da apresentação atual.
// Captura cada slide renderizado com html2canvas e empilha no jsPDF.
async function exportKickoffPdf() {
  if (kickoffMode !== 'show' || !kickoffSlides.length) return;
  if (!window.jspdf || !window.html2canvas) {
    alert('Bibliotecas de PDF não carregaram (verifique a conexão). Tente recarregar a página.');
    return;
  }
  const btn = document.getElementById('kf-pdf-btn');
  const label = btn ? btn.textContent : '';
  const savedIdx = kickoffIdx;
  // Desliga a animação dos gráficos para capturá-los já completos.
  const prevAnim = Chart.defaults.animation;
  Chart.defaults.animation = false;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
  try {
    const { jsPDF } = window.jspdf;
    const W = 1280, H = 720; // página 16:9
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
    for (let i = 0; i < kickoffSlides.length; i++) {
      kickoffIdx = i;
      renderKickoffSlide();
      if (btn) btn.textContent = `Gerando... ${i + 1}/${kickoffSlides.length}`;
      // Espera o fade do slide (kf-in .35s) e o gráfico desenhar.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 450));
      const page = document.querySelector('#kf-stage .kf-page');
      if (!page) continue;
      const canvas = await window.html2canvas(page, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        onclone: (doc) => {
          // No clone, a animação de entrada (kf-in) recomeça e o html2canvas
          // capturaria o slide em opacity:0 / deslocado. Fixa no estado final.
          doc.querySelectorAll('.kf-page').forEach(el => {
            el.style.animation = 'none';
            el.style.opacity = '1';
            el.style.transform = 'none';
          });
        }
      });
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage([W, H], 'landscape');
      pdf.addImage(img, 'JPEG', 0, 0, W, H);
    }
    const cover = kickoffSlides.find(s => s.type === 'cover');
    const nome = (cover && cover.mes ? cover.mes : 'apresentacao').toString().toLowerCase().replace(/\s+/g, '-');
    pdf.save(`kickoff-${nome}.pdf`);
  } catch (e) {
    console.error('[kickoff PDF]', e);
    alert('Não foi possível gerar o PDF: ' + (e.message || e));
  } finally {
    Chart.defaults.animation = prevAnim;
    kickoffIdx = savedIdx;
    renderKickoffSlide();
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

function renderMetasColabTable() {
  const view = document.querySelector('input[name="vt-metas"]:checked')?.value || 'total';
  const data = filterMetasData();
  const { mn, mr } = getMetaPcts();
  let rows = buildMetasGroupData(data);

  rows.sort((a, b) => {
    const va = a[metaSortKey] ?? 0, vb = b[metaSortKey] ?? 0;
    if (typeof va === 'string') return metaSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return metaSortDir === 'asc' ? va - vb : vb - va;
  });

  document.getElementById('metas-colab-badge').textContent = rows.length + ' colaboradores';

  if (!rows.length) {
    document.getElementById('metas-colab-wrap').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">Nenhum dado encontrado no período base com os filtros atuais.</div>';
    return;
  }

  const thC = k => `class="${k === metaSortKey ? (metaSortDir === 'asc' ? 'sort-asc' : 'sort-desc') : ''} meta-cell"`;
  const thCn = k => `class="${k === metaSortKey ? (metaSortDir === 'asc' ? 'sort-asc' : 'sort-desc') : ''}"`;
  const th = (k, lbl, isMeta) => `<th ${isMeta ? thC(k) : thCn(k)} style="text-align:right" onclick="setMetasSort('${k}')">${lbl}<span class="sort-icon"></span></th>`;
  const thL = k => `<th ${thCn(k)} onclick="setMetasSort('${k}')">Colaborador<span class="sort-icon"></span></th>`;

  const totNP = rows.reduce((s, r) => s + r.np, 0), totNC = rows.reduce((s, r) => s + r.nc, 0);
  const totRP = rows.reduce((s, r) => s + r.rp, 0), totRC = rows.reduce((s, r) => s + r.rc, 0);
  const totAnt = rows.reduce((s, r) => s + r.totalAnt, 0), totComAnt = rows.reduce((s, r) => s + r.totalComAnt, 0);
  const totMeta = rows.reduce((s, r) => s + r.metaTotalProd, 0), totMetaCom = rows.reduce((s, r) => s + r.metaTotalCom, 0);
  const mc = 'meta-cell';

  let html;

  if (view === 'total') {
    const thead = `<thead><tr>${thL('nome')}${th('totalAnt','Prod. Anterior',false)}${th('totalComAnt','Com. Anterior',false)}${th('pctComAnt','% Com. Ant.',false)}${th('metaTotalProd','Meta Prod.',true)}${th('metaTotalCom','Meta Com.',true)}${th('pctMetaCom','% Com. Meta',true)}</tr></thead>`;
    const tbody = rows.map(r => {
      const sn = r.nome.split(' - ')[0].split('|')[0].trim();
      return `<tr><td class="name-cell" title="${r.nome}">${sn}</td><td class="num">${fBRL(r.totalAnt)}</td><td class="num">${fBRL(r.totalComAnt)}</td><td class="num">${fP(r.pctComAnt)}</td><td class="num ${mc}">${fBRL(r.metaTotalProd)}</td><td class="num ${mc}">${fBRL(r.metaTotalCom)}</td><td class="num ${mc}">${fP(r.pctMetaCom)}</td></tr>`;
    }).join('');
    const pA = totAnt ? totComAnt / totAnt : 0, pM = totMeta ? totMetaCom / totMeta : 0;
    const tfoot = `<tfoot><tr><td>Total geral</td><td class="num">${fBRL(totAnt)}</td><td class="num">${fBRL(totComAnt)}</td><td class="num">${fP(pA)}</td><td class="num ${mc}">${fBRL(totMeta)}</td><td class="num ${mc}">${fBRL(totMetaCom)}</td><td class="num ${mc}">${fP(pM)}</td></tr></tfoot>`;
    html = `<table class="prod-table">${thead}<tbody>${tbody}</tbody>${tfoot}</table>`;

  } else {
    const pctN = ((mn) * 100).toFixed(1), pctR = ((mr) * 100).toFixed(1);
    const thead = `<thead>
      <tr class="meta-group-header-row">
        <th rowspan="2" style="text-align:left;vertical-align:bottom;min-width:160px" onclick="setMetasSort('nome')">Colaborador<span class="sort-icon"></span></th>
        <th colspan="3" style="text-align:center;border-left:1px solid var(--border-subtle)">Novos — base</th>
        <th colspan="2" class="${mc}" style="text-align:center">↗ Meta Novos (${pctN}%)</th>
        <th colspan="3" style="text-align:center;border-left:1px solid var(--border-subtle)">Renovações — base</th>
        <th colspan="2" class="${mc}" style="text-align:center">↗ Meta Renov. (${pctR}%)</th>
        <th colspan="3" style="text-align:center;border-left:1px solid var(--border-subtle)">Total</th>
        <th colspan="2" class="${mc}" style="text-align:center">↗ Meta Total</th>
      </tr>
      <tr>
        <th class="num" style="border-left:1px solid var(--border-subtle)">Prêmio</th><th class="num">Comissão</th><th class="num">% Com.</th>
        <th class="num ${mc}">Prêmio</th><th class="num ${mc}">Comissão</th>
        <th class="num" style="border-left:1px solid var(--border-subtle)">Prêmio</th><th class="num">Comissão</th><th class="num">% Com.</th>
        <th class="num ${mc}">Prêmio</th><th class="num ${mc}">Comissão</th>
        <th class="num" style="border-left:1px solid var(--border-subtle)">Prêmio</th><th class="num">Comissão</th><th class="num">% Com.</th>
        <th class="num ${mc}">Prêmio</th><th class="num ${mc}">Comissão</th>
      </tr></thead>`;
    const tbody = rows.map(r => {
      const sn = r.nome.split(' - ')[0].split('|')[0].trim();
      const pN = r.np ? r.nc / r.np : 0, pR = r.rp ? r.rc / r.rp : 0;
      return `<tr>
        <td class="name-cell" title="${r.nome}">${sn}</td>
        <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(r.np)}</td><td class="num">${fBRL(r.nc)}</td><td class="num">${fP(pN)}</td>
        <td class="num ${mc}">${fBRL(r.metaNProd)}</td><td class="num ${mc}">${fBRL(r.metaNCom)}</td>
        <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(r.rp)}</td><td class="num">${fBRL(r.rc)}</td><td class="num">${fP(pR)}</td>
        <td class="num ${mc}">${fBRL(r.metaRProd)}</td><td class="num ${mc}">${fBRL(r.metaRCom)}</td>
        <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(r.totalAnt)}</td><td class="num">${fBRL(r.totalComAnt)}</td><td class="num">${fP(r.pctComAnt)}</td>
        <td class="num ${mc}">${fBRL(r.metaTotalProd)}</td><td class="num ${mc}">${fBRL(r.metaTotalCom)}</td>
      </tr>`;
    }).join('');
    const pTN = totNP ? totNC / totNP : 0, pTR = totRP ? totRC / totRP : 0;
    const pTA = totAnt ? totComAnt / totAnt : 0, pTM = totMeta ? totMetaCom / totMeta : 0;
    const totMNP = rows.reduce((s, r) => s + r.metaNProd, 0), totMNC = rows.reduce((s, r) => s + r.metaNCom, 0);
    const totMRP = rows.reduce((s, r) => s + r.metaRProd, 0), totMRC = rows.reduce((s, r) => s + r.metaRCom, 0);
    const tfoot = `<tfoot><tr>
      <td>Total geral</td>
      <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(totNP)}</td><td class="num">${fBRL(totNC)}</td><td class="num">${fP(pTN)}</td>
      <td class="num ${mc}">${fBRL(totMNP)}</td><td class="num ${mc}">${fBRL(totMNC)}</td>
      <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(totRP)}</td><td class="num">${fBRL(totRC)}</td><td class="num">${fP(pTR)}</td>
      <td class="num ${mc}">${fBRL(totMRP)}</td><td class="num ${mc}">${fBRL(totMRC)}</td>
      <td class="num" style="border-left:1px solid var(--border-subtle)">${fBRL(totAnt)}</td><td class="num">${fBRL(totComAnt)}</td><td class="num">${fP(pTA)}</td>
      <td class="num ${mc}">${fBRL(totMeta)}</td><td class="num ${mc}">${fBRL(totMetaCom)}</td>
    </tr></tfoot>`;
    html = `<table class="prod-table metas-table-det">${thead}<tbody>${tbody}</tbody>${tfoot}</table>`;
  }

  document.getElementById('metas-colab-wrap').innerHTML = html;
}

function buildMetasEquipeCards() {
  const { mn, mr } = getMetaPcts();
  const data = filterMetasData(); // já remove ramos fora da meta
  const blank = () => ({ np: 0, nc: 0, rp: 0, rc: 0, ramos: new Set() });
  const acc = { pessoais: blank(), patrimoniais: blank() };

  data.forEach(r => {
    const t = acc[classifyRamo(r.ramo)];
    if (!t) return;
    if (metaTipoSide(r.tipo) === 'N') { t.np += r.premio; t.nc += r.com; }
    else { t.rp += r.premio; t.rc += r.com; }
    if (r.ramo) t.ramos.add(r.ramo);
  });

  const summarize = a => {
    const baseProd = a.np + a.rp, baseCom = a.nc + a.rc;
    const metaProd = a.np * (1 + mn) + a.rp * (1 + mr);
    const metaCom = a.nc * (1 + mn) + a.rc * (1 + mr);
    return {
      baseProd, baseCom, metaProd, metaCom,
      pctMetaCom: metaProd ? metaCom / metaProd : 0,
      ramos: [...a.ramos].sort()
    };
  };

  const pessoais = summarize(acc.pessoais), patrimoniais = summarize(acc.patrimoniais);
  const geral = {
    baseProd: pessoais.baseProd + patrimoniais.baseProd,
    baseCom: pessoais.baseCom + patrimoniais.baseCom,
    metaProd: pessoais.metaProd + patrimoniais.metaProd,
    metaCom: pessoais.metaCom + patrimoniais.metaCom,
    ramos: [...pessoais.ramos, ...patrimoniais.ramos]
  };
  geral.pctMetaCom = geral.metaProd ? geral.metaCom / geral.metaProd : 0;

  // Ramos excluídos detectados no período base (para conferência).
  const excl = new Set();
  filterMetasData({ includeExcluded: true }).forEach(r => {
    if (r.ramo && classifyRamo(r.ramo) === 'excluded') excl.add(r.ramo);
  });

  return { pessoais, patrimoniais, geral, excluded: [...excl].sort() };
}

function renderMetasEquipeCards() {
  const wrap = document.getElementById('metas-equipe-cards');
  if (!wrap) return;
  const note = document.getElementById('metas-excluidos-note');

  if (!ALL.length) { wrap.innerHTML = ''; if (note) note.innerHTML = ''; return; }

  const { pessoais, patrimoniais, geral, excluded } = buildMetasEquipeCards();

  const ramosBadge = ramos => ramos.length
    ? `<span class="meta-card-ramos" title="${ramos.join(', ')}">${ramos.length} ramo${ramos.length > 1 ? 's' : ''}</span>`
    : '';

  const card = (cls, label, c) => `
    <div class="meta-team-card ${cls}">
      <div class="meta-team-head">
        <span class="meta-team-name">${label}</span>
        ${ramosBadge(c.ramos)}
      </div>
      <div class="meta-team-rows">
        <div class="mt-row mt-row-meta"><span class="mt-lbl">Meta Prêmio</span><span class="mt-val">${fBRL(c.metaProd)}</span></div>
        <div class="mt-row mt-row-meta"><span class="mt-lbl">Meta Comissão</span><span class="mt-val">${fBRL(c.metaCom)}</span></div>
        <div class="mt-divider"></div>
        <div class="mt-row mt-row-base"><span class="mt-lbl">Base Prêmio</span><span class="mt-val">${fBRL(c.baseProd)}</span></div>
        <div class="mt-row mt-row-base"><span class="mt-lbl">Base Comissão</span><span class="mt-val">${fBRL(c.baseCom)}</span></div>
        <div class="mt-row mt-row-base"><span class="mt-lbl">% Comissão</span><span class="mt-val">${fP(c.pctMetaCom)}</span></div>
      </div>
    </div>`;

  wrap.innerHTML =
    card('mt-pessoais', 'Pessoais', pessoais) +
    card('mt-patrimoniais', 'Patrimoniais', patrimoniais) +
    card('mt-geral', 'Geral', geral);

  if (note) {
    note.innerHTML = excluded.length
      ? `<strong>Fora da contagem da meta</strong> (${excluded.length}): ${excluded.join(' · ')}`
      : 'Nenhum ramo fora da meta no período base.';
  }
}

function exportMetasData(type) {
  if (!ALL.length) return;
  const data = filterMetasData();
  const { mn, mr } = getMetaPcts();
  const wb = XLSX.utils.book_new();
  if (type === 'colab') {
    const rows = buildMetasGroupData(data).map(r => ({
      'Colaborador': r.nome,
      'Prod. Novos (base)': r.np, 'Com. Novos (base)': r.nc, '% Com. Novos': r.np ? r.nc / r.np : 0,
      'Meta Prod. Novos': r.metaNProd, 'Meta Com. Novos': r.metaNCom,
      'Prod. Renov. (base)': r.rp, 'Com. Renov. (base)': r.rc, '% Com. Renov.': r.rp ? r.rc / r.rp : 0,
      'Meta Prod. Renov.': r.metaRProd, 'Meta Com. Renov.': r.metaRCom,
      'Total Prod. Ant.': r.totalAnt, 'Total Com. Ant.': r.totalComAnt, '% Com. Total Ant.': r.pctComAnt,
      'Meta Prod. Total': r.metaTotalProd, 'Meta Com. Total': r.metaTotalCom, '% Com. Meta Total': r.pctMetaCom,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Metas_Colaboradores');
    XLSX.writeFile(wb, 'Metas_Colaboradores.xlsx');
  } else {
    const byRamo = {};
    data.forEach(r => {
      const k = r.ramo || '—';
      if (!byRamo[k]) byRamo[k] = { np: 0, nc: 0, rp: 0, rc: 0 };
      if (metaTipoSide(r.tipo) === 'N') { byRamo[k].np += r.premio; byRamo[k].nc += r.com; }
      else { byRamo[k].rp += r.premio; byRamo[k].rc += r.com; }
    });
    const rows = Object.entries(byRamo).map(([ramo, v]) => {
      const tAnt = v.np + v.rp, tCom = v.nc + v.rc;
      const mProd = v.np * (1 + mn) + v.rp * (1 + mr), mCom = v.nc * (1 + mn) + v.rc * (1 + mr);
      return { 'Equipe': classifyRamo(ramo) === 'pessoais' ? 'Pessoal' : 'Patrimonial', 'Ramo': ramo, 'Prod. N (base)': v.np, 'Prod. R (base)': v.rp, 'Total Prod. Ant.': tAnt, 'Meta Prod.': mProd, 'Com. Ant.': tCom, 'Meta Com.': mCom, '% Com. Ant.': tAnt ? tCom / tAnt : 0, '% Com. Meta': mProd ? mCom / mProd : 0 };
    }).sort((a, b) => a['Equipe'].localeCompare(b['Equipe']) || b['Total Prod. Ant.'] - a['Total Prod. Ant.']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Metas_Equipe');
    XLSX.writeFile(wb, 'Metas_Equipe.xlsx');
  }
}
