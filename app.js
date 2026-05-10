// ============================================================
//  Glass N Glass — Quotation & Invoice Dashboard
// ============================================================

// ---------- Static lookup data (from Input sheet) ----------
const THICKNESS_OPTIONS = ['4mm', '5mm', '6mm', '8mm', '10mm', '12mm', '5+5mm', '6+6mm', '8+8mm'];

// driver: 1 = round to next 6", 2 = round to next 12"
const GLASS_TYPES = [
  { name: 'Toughned glass',  driver: 1 },
  { name: 'Clear Glass',     driver: 1 },
  { name: 'Mirror Glass',    driver: 2 },
  { name: 'Tinted Glass',    driver: 2 },
  { name: 'Tinted mirror',   driver: 2 },
  { name: 'Fluted glass',    driver: 2 },
  { name: 'Frosted Glass',   driver: 2 },
];

const PROCESS_OPTIONS = ['-', 'Cutting', 'High polish', 'Tapper', 'Bevelled', 'Half round polish', 'Full round polish'];
const DESIGN_OPTIONS = [
  '-',
  'Sand Blasting Frosted', 'Chemical Frosted', 'Chemical Texture', 'Chemical Colour texture',
  'Colour etching', 'Deep Etching', 'Deep Colour Etching', 'Deep Chemical Etching',
  'Deep Colour Chemical Etching', 'Lacquered', 'Back painted', 'Mirror Frame', 'LED Mirror'
];

// Company info — fixed
const COMPANY = {
  name: 'GLASS N GLASS',
  addressLines: ['B R PHOOKAN ROAD, KUMARPARA', 'GUWAHATI, ASSAM - 781009'],
  email: 'glassnglassghy@gmail.com',
  phone: '9435728292 / 9435511046',
  bank: {
    name: 'GLASS N GLASS',
    bank: 'HDFC BANK',
    branch: 'FANCY BAZAR BRANCH',
    account: '50200007457881',
    ifsc: 'HDFC0000399',
  },
};

const DEFAULT_FOOTER = [
  '****75% ADVANCE AGAINST CONFIRMATION.',
  '****LIFTING AND TRANSPORTATION EXTRA.',
  '****SCAFFOLDING TO BE PROVIDED BY THE PARTY',
  '****THE RATES ARE SUBJECT TO GUWAHATI JURISDICTION.',
  '****TRAVEL EXPENSES / ACCOMODATION EXTRA IF REQUIRED',
].join('\n');

// ---------- State ----------
const state = {
  gstRate: 0.18,
  meta: { client: '', address: '', project: '', date: todayISO() },
  titles: { glass: 'Glass', hardware: 'Hardware', others: 'Others' },
  glass: [],
  hardware: [],
  others: [],
  customSections: [],  // [{ id, title, rows: [{particulars, qty, rate}] }]
  invoice: {
    no: '', customerNo: '', date: todayISO(), po: '', salesperson: '',
    billTo: '', remarks: '',
    shipping: 0, other: 0, paid: 0,
    footer: DEFAULT_FOOTER,
    format: 'per-row',
  },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function blankGlass() {
  return { thickness: '12mm', particulars: 'Toughned glass', process: '-', design: '-',
           h: 0, w: 0, qty: 1, rate: 178, remarks: '' };
}
function blankHardware() {
  return { particulars: '', qty: 1, rate: 0, discount: 0 };
}
function blankOthers() {
  return { particulars: '', qty: 1, rate: 0 };
}

let _nextSectionId = 1;
function blankCustomSection() {
  return {
    id: 'cs-' + (_nextSectionId++),
    title: 'New Section',
    rows: [blankOthers()],
  };
}

// Seed one row in each table so the UI isn't empty on first load
state.glass.push(blankGlass());
state.hardware.push(blankHardware());
state.others.push(blankOthers());

// ---------- Calculations ----------
function getDriver(particulars) {
  const g = GLASS_TYPES.find(x => x.name === particulars);
  return g ? g.driver : 1;
}

function ceilTo(value, multiple) {
  if (!multiple) return value;
  return Math.ceil(value / multiple) * multiple;
}

function calcGlass(row, gstRate) {
  const h = Math.max(0, +row.h || 0);
  const w = Math.max(0, +row.w || 0);
  const qty = Math.max(0, +row.qty || 0);
  const rate = Math.max(0, +row.rate || 0);
  const driver = getDriver(row.particulars);
  const grid = 6 * driver; // 6" or 12"

  const actualSqft = (h / 25.4) * (w / 25.4) / 144 * qty;
  const chargeableSqft = ceilTo(h / 25.4, grid) * ceilTo(w / 25.4, grid) / 144 * qty;
  const pretax = chargeableSqft * rate;
  const gst = pretax * gstRate;
  const total = pretax + gst;
  return { actualSqft, chargeableSqft, pretax, gst, total };
}

function calcHardware(row, gstRate) {
  const qty = Math.max(0, +row.qty || 0);
  const rate = Math.max(0, +row.rate || 0);
  const discount = Math.min(1, Math.max(0, (+row.discount || 0) / 100));
  const amount = (rate - rate * discount) * qty;
  const gst = amount * gstRate;
  const total = amount + gst;
  return { amount, gst, total };
}

function calcOthers(row, gstRate) {
  const qty = Math.max(0, +row.qty || 0);
  const rate = Math.max(0, +row.rate || 0);
  const amount = qty * rate;
  const gst = amount * gstRate;
  const total = amount + gst;
  return { amount, gst, total };
}

// Parser that prevents negatives in numeric inputs.
const nonNeg = (v) => Math.max(0, Number(v) || 0);
const pct0to100 = (v) => Math.min(100, Math.max(0, Number(v) || 0));

// ---------- Formatters ----------
const fmtNum = (n, dp = 2) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtCur = (n) => '₹ ' + fmtNum(n, 2);
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
};

// ---------- Render: Glass row ----------
function renderGlassRow(row, idx) {
  const calc = calcGlass(row, state.gstRate);
  const tr = el('tr');

  // Inputs trigger lightweight recompute (preserves focus/caret).
  // Dropdowns trigger full render (driver mapping changes label/order, no focus issue).
  const onInput = (field, parse) => (e) => {
    row[field] = parse ? parse(e.target.value) : e.target.value;
    recompute();
  };
  const onSelect = (field) => (e) => {
    row[field] = e.target.value;
    recompute();
  };

  const select = (field, options) => {
    const s = el('select', { class: 'cell-input', onchange: onSelect(field) });
    for (const opt of options) {
      const o = el('option', { value: opt }, opt);
      if (row[field] === opt) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };

  tr.append(
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(idx + 1)),
    el('td', { class: 'px-2 py-1' }, select('thickness', THICKNESS_OPTIONS)),
    el('td', { class: 'px-2 py-1' }, select('particulars', GLASS_TYPES.map(g => g.name))),
    el('td', { class: 'px-2 py-1' }, select('process', PROCESS_OPTIONS)),
    el('td', { class: 'px-2 py-1' }, select('design', DESIGN_OPTIONS)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.h, oninput: onInput('h', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.w, oninput: onInput('w', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'actualSqft' }, fmtNum(calc.actualSqft)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'chargeableSqft' }, fmtNum(calc.chargeableSqft)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'pretax' }, fmtNum(calc.pretax)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(calc.gst)),
    el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(calc.total)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.remarks, oninput: onInput('remarks') })),
    el('td', { class: 'px-2 py-1 text-center' },
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { state.glass.splice(idx, 1); render(); } }, '✕'))
  );
  return tr;
}

// ---------- Render: Hardware row ----------
function renderHardwareRow(row, idx) {
  const calc = calcHardware(row, state.gstRate);
  const tr = el('tr');
  const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };

  tr.append(
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(idx + 1)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.particulars, oninput: onInput('particulars') })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, max: 100, class: 'cell-input text-right', value: row.discount, oninput: onInput('discount', pct0to100) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'amount' }, fmtNum(calc.amount)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(calc.gst)),
    el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(calc.total)),
    el('td', { class: 'px-2 py-1 text-center' },
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { state.hardware.splice(idx, 1); render(); } }, '✕'))
  );
  return tr;
}

// ---------- Render: Others row ----------
function renderOthersRow(row, idx) {
  const calc = calcOthers(row, state.gstRate);
  const tr = el('tr');
  const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };

  tr.append(
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(idx + 1)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.particulars, oninput: onInput('particulars') })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'amount' }, fmtNum(calc.amount)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(calc.gst)),
    el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(calc.total)),
    el('td', { class: 'px-2 py-1 text-center' },
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { state.others.splice(idx, 1); render(); } }, '✕'))
  );
  return tr;
}

// ---------- Render: Custom sections (Others-shaped) ----------
function renderCustomSections() {
  const container = $('#custom-sections');
  container.innerHTML = '';
  state.customSections.forEach((section, sIdx) => {
    container.appendChild(renderCustomSection(section, sIdx));
  });
}

function renderCustomSection(section, sIdx) {
  const card = el('div', { class: 'bg-white rounded-xl border border-slate-200 overflow-hidden', 'data-section-id': section.id });

  // Header: editable title + Add Row + Delete Section
  const header = el('div', { class: 'px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50' });
  const titleInput = el('input', {
    class: 'section-title-input',
    value: section.title,
    oninput: (e) => { section.title = e.target.value; renderInvoice(); }
  });
  const actions = el('div', { class: 'flex gap-2' }, [
    el('button', {
      class: 'text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 border border-brand-600 rounded-md',
      onclick: () => { section.rows.push(blankOthers()); render(); }
    }, '+ Add Row'),
    el('button', {
      class: 'text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-300 rounded-md',
      onclick: () => {
        if (confirm('Delete section "' + section.title + '"?')) {
          state.customSections.splice(sIdx, 1);
          render();
        }
      }
    }, 'Delete Section'),
  ]);
  header.append(titleInput, actions);
  card.appendChild(header);

  // Table (Others schema)
  const wrap = el('div', { class: 'overflow-x-auto' });
  const tbl = el('table', { class: 'w-full text-sm' });
  tbl.appendChild(el('thead', { class: 'bg-slate-100 text-xs text-slate-600 uppercase' }, el('tr', {}, [
    el('th', { class: 'px-2 py-2 text-left w-10' }, '#'),
    el('th', { class: 'px-2 py-2 text-left' }, 'Particulars'),
    el('th', { class: 'px-2 py-2 text-right w-16' }, 'Qty'),
    el('th', { class: 'px-2 py-2 text-right w-24' }, 'Rate'),
    el('th', { class: 'px-2 py-2 text-right w-28' }, 'Amount'),
    el('th', { class: 'px-2 py-2 text-right w-24' }, 'GST'),
    el('th', { class: 'px-2 py-2 text-right w-28' }, 'Final Amount'),
    el('th', { class: 'px-2 py-2 w-8' }),
  ])));

  const tbody = el('tbody', { 'data-custom-tbody': section.id });
  section.rows.forEach((row, rIdx) => {
    const c = calcOthers(row, state.gstRate);
    const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };
    const tr = el('tr', {}, [
      el('td', { class: 'px-2 py-1 text-slate-500' }, String(rIdx + 1)),
      el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.particulars, oninput: onInput('particulars') })),
      el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
      el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
      el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'amount' }, fmtNum(c.amount)),
      el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(c.gst)),
      el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(c.total)),
      el('td', { class: 'px-2 py-1 text-center' },
        el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { section.rows.splice(rIdx, 1); render(); } }, '✕')),
    ]);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);

  // Footer
  tbl.appendChild(el('tfoot', { class: 'bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700' }, el('tr', {}, [
    el('td', { class: 'px-2 py-2 text-right', colspan: 4 }, 'TOTAL'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': section.id + '-pretax' }, '0.00'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': section.id + '-gst' }, '0.00'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': section.id + '-amount' }, '0.00'),
    el('td'),
  ])));

  wrap.appendChild(tbl);
  card.appendChild(wrap);
  return card;
}

// ---------- Aggregate totals ----------
function totals() {
  let gQty = 0, gSqft = 0, gPretax = 0, gGst = 0, gTotal = 0;
  for (const r of state.glass) {
    const c = calcGlass(r, state.gstRate);
    gQty += +r.qty || 0;
    gSqft += c.chargeableSqft;
    gPretax += c.pretax;
    gGst += c.gst;
    gTotal += c.total;
  }
  let hPretax = 0, hGst = 0, hTotal = 0;
  for (const r of state.hardware) {
    const c = calcHardware(r, state.gstRate);
    hPretax += c.amount; hGst += c.gst; hTotal += c.total;
  }
  let oPretax = 0, oGst = 0, oTotal = 0;
  for (const r of state.others) {
    const c = calcOthers(r, state.gstRate);
    oPretax += c.amount; oGst += c.gst; oTotal += c.total;
  }
  // Custom sections
  const customTotals = {};
  let csTotal = 0, csPretax = 0;
  for (const sec of state.customSections) {
    let p = 0, g = 0, t = 0;
    for (const r of sec.rows) {
      const c = calcOthers(r, state.gstRate);
      p += c.amount; g += c.gst; t += c.total;
    }
    customTotals[sec.id] = { pretax: p, gst: g, total: t };
    csTotal += t; csPretax += p;
  }
  return {
    glass: { qty: gQty, sqft: gSqft, pretax: gPretax, gst: gGst, total: gTotal },
    hardware: { pretax: hPretax, gst: hGst, total: hTotal },
    others: { pretax: oPretax, gst: oGst, total: oTotal },
    custom: customTotals,
    customPretaxSum: csPretax,
    customTotalSum: csTotal,
    grand: gTotal + hTotal + oTotal + csTotal,
  };
}

// ---------- Render: tables + grand total ----------
function renderQuotation() {
  const gTbody = $('#glass-tbody');
  gTbody.innerHTML = '';
  state.glass.forEach((row, idx) => gTbody.appendChild(renderGlassRow(row, idx)));

  const hTbody = $('#hardware-tbody');
  hTbody.innerHTML = '';
  state.hardware.forEach((row, idx) => hTbody.appendChild(renderHardwareRow(row, idx)));

  const oTbody = $('#others-tbody');
  oTbody.innerHTML = '';
  state.others.forEach((row, idx) => oTbody.appendChild(renderOthersRow(row, idx)));

  renderCustomSections();

  const t = totals();
  $('#glass-total-qty').textContent = String(t.glass.qty);
  $('#glass-total-sqft').textContent = fmtNum(t.glass.sqft);
  $('#glass-total-pretax').textContent = fmtNum(t.glass.pretax);
  $('#glass-total-gst').textContent = fmtNum(t.glass.gst);
  $('#glass-total-amount').textContent = fmtNum(t.glass.total);

  $('#hardware-total-pretax').textContent = fmtNum(t.hardware.pretax);
  $('#hardware-total-gst').textContent = fmtNum(t.hardware.gst);
  $('#hardware-total-amount').textContent = fmtNum(t.hardware.total);

  $('#others-total-pretax').textContent = fmtNum(t.others.pretax);
  $('#others-total-gst').textContent = fmtNum(t.others.gst);
  $('#others-total-amount').textContent = fmtNum(t.others.total);

  $('#grand-total').textContent = fmtCur(t.grand);
}

// ---------- Invoice rendering ----------
function glassParticularsLabel(row) {
  return [row.thickness, row.particulars, row.process, row.design]
    .filter(s => s && s !== '-').join(' ');
}

function renderInvoice() {
  const inv = state.invoice;
  const t = totals();
  const isPerRow = inv.format === 'per-row';

  // Subtotal — includes custom sections
  const subtotal = isPerRow
    ? (t.glass.total + t.hardware.total + t.others.total + t.customTotalSum)
    : (t.glass.pretax + t.hardware.pretax + t.others.pretax + t.customPretaxSum);

  // Final total
  const shipping = +inv.shipping || 0;
  const otherCharge = +inv.other || 0;
  const paid = +inv.paid || 0;

  const gstOnSubtotal = isPerRow ? 0 : subtotal * state.gstRate;
  const finalTotal = subtotal + shipping + otherCharge + gstOnSubtotal;
  const due = finalTotal - paid;

  // Build markup
  const root = $('#invoice-preview');
  root.innerHTML = '';

  // ----- Header
  const header = el('div', { class: 'flex justify-between items-start mb-6 pb-4 border-b-2 border-slate-800' });
  header.append(
    el('div', {}, [
      el('img', { src: 'logo.png', alt: 'Glass N Glass', style: 'height: 44px; width: auto; display: block; margin-bottom: 8px;' }),
      el('h1', {}, 'PROFORMA INVOICE'),
      el('div', { class: 'mt-2 text-sm leading-tight' }, [
        ...COMPANY.addressLines.map(line => el('div', { style: 'white-space: nowrap;' }, line)),
        el('div', {}, 'Email: ' + COMPANY.email),
        el('div', {}, 'Contact: ' + COMPANY.phone),
      ])
    ]),
    el('table', { style: 'width:auto;' }, [
      el('tbody', {}, [
        rowKV('DATE', fmtDate(inv.date)),
        rowKV('INVOICE NO.', inv.no),
        rowKV('CUSTOMER NO.', inv.customerNo),
      ])
    ])
  );
  root.appendChild(header);

  // ----- Bill To
  const billto = el('div', { class: 'mb-4' });
  billto.append(
    el('div', { class: 'text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1' }, 'Bill To'),
    el('div', { style: 'white-space: pre-line; font-size: 12px;' }, inv.billTo || '—')
  );
  root.appendChild(billto);

  // ----- P.O. + Salesperson
  const meta = el('table', { class: 'mb-4' }, [
    el('thead', {}, el('tr', {}, [
      el('th', {}, 'P.O. NO.'),
      el('th', {}, 'SALESPERSON'),
    ])),
    el('tbody', {}, el('tr', {}, [
      el('td', {}, inv.po || ''),
      el('td', {}, inv.salesperson || ''),
    ]))
  ]);
  root.appendChild(meta);

  // ----- GLASS table
  if (state.glass.length) {
    root.appendChild(el('div', { class: 'font-semibold mt-4 mb-1', style: 'text-transform: uppercase;' }, state.titles.glass));
    root.appendChild(buildGlassInvoiceTable(isPerRow, t.glass));
  }

  // ----- HARDWARE table
  if (state.hardware.length) {
    root.appendChild(el('div', { class: 'font-semibold mt-4 mb-1', style: 'text-transform: uppercase;' }, state.titles.hardware));
    root.appendChild(buildHardwareInvoiceTable(isPerRow, t.hardware));
  }

  // ----- OTHERS table
  if (state.others.length) {
    root.appendChild(el('div', { class: 'font-semibold mt-4 mb-1', style: 'text-transform: uppercase;' }, state.titles.others));
    root.appendChild(buildOthersInvoiceTable(isPerRow, t.others));
  }

  // ----- CUSTOM SECTIONS (each rendered Others-shaped)
  state.customSections.forEach((sec) => {
    if (!sec.rows.length) return;
    root.appendChild(el('div', { class: 'font-semibold mt-4 mb-1', style: 'text-transform: uppercase;' }, sec.title));
    root.appendChild(buildCustomSectionInvoiceTable(isPerRow, sec, t.custom[sec.id]));
  });

  // ----- Bottom: remarks (left) + totals (right)
  const bottom = el('div', { class: 'flex gap-6 mt-6' });
  const remarks = el('div', { class: 'flex-1' }, [
    el('div', { class: 'text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1' }, 'Remarks / Instructions'),
    el('div', { style: 'white-space: pre-line; min-height: 80px; padding: 8px; border: 1px solid #d1d5db; font-size: 11px;' }, inv.remarks || '')
  ]);

  const totalsTable = el('table', { style: 'width: 320px;' });
  const tbody = el('tbody');
  tbody.appendChild(rowKV('SUBTOTAL', fmtCur(subtotal), true));
  tbody.appendChild(rowKV('SHIPPING / HANDLING', fmtCur(shipping), true));
  tbody.appendChild(rowKV('OTHER', fmtCur(otherCharge), true));
  if (!isPerRow) {
    tbody.appendChild(rowKV(`GST (${(state.gstRate * 100).toFixed(0)}%)`, fmtCur(gstOnSubtotal), true));
  }
  const totalRow = el('tr', { class: 'grand-row' }, [
    el('td', {}, 'TOTAL'),
    el('td', { class: 'num' }, fmtCur(finalTotal)),
  ]);
  tbody.appendChild(totalRow);
  tbody.appendChild(rowKV('AMOUNT PAID', fmtCur(paid), true));
  tbody.appendChild(rowKV('TOTAL DUE', fmtCur(due), true));
  totalsTable.appendChild(tbody);

  bottom.append(remarks, totalsTable);
  root.appendChild(bottom);

  // ----- Bank + footer
  const footerWrap = el('div', { class: 'flex gap-6 mt-8 pt-4 border-t border-slate-300' });
  const notes = el('div', { class: 'flex-1', style: 'white-space: pre-line; font-size: 11px;' }, inv.footer || '');
  const bank = el('div', { style: 'width: 320px; font-size: 11px;' }, [
    el('div', { class: 'font-semibold mb-1' }, 'BANK / NEFT DETAILS'),
    el('div', {}, COMPANY.bank.name),
    el('div', {}, COMPANY.bank.bank),
    el('div', {}, COMPANY.bank.branch),
    el('div', {}, 'A/C NO. ' + COMPANY.bank.account),
    el('div', {}, 'IFSC: ' + COMPANY.bank.ifsc),
  ]);
  footerWrap.append(notes, bank);
  root.appendChild(footerWrap);

  root.appendChild(el('div', { class: 'text-center mt-8 text-sm font-semibold tracking-wider' }, 'THANK YOU'));
}

function rowKV(label, value, totals = false) {
  const tr = el('tr', { class: totals ? 'totals-row' : '' }, [
    el('td', { style: 'font-weight:600;' }, label),
    el('td', { class: 'num' }, value || ''),
  ]);
  return tr;
}

function buildGlassInvoiceTable(isPerRow, totalsRow) {
  const head = isPerRow
    ? ['Sl', 'Particulars', 'H (mm)', 'W (mm)', 'Qty', 'Sqft', 'Rate', 'Pretax', `GST (${(state.gstRate * 100).toFixed(state.gstRate * 100 % 1 ? 2 : 0)}%)`, 'Total']
    : ['Sl', 'Particulars', 'H (mm)', 'W (mm)', 'Qty', 'Sqft', 'Rate', 'Amount'];

  const tbl = el('table');
  const thead = el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i >= 2 ? 'num' : '' }, h))));
  tbl.appendChild(thead);
  const tbody = el('tbody');

  state.glass.forEach((r, i) => {
    const c = calcGlass(r, state.gstRate);
    const cells = isPerRow
      ? [String(i + 1), glassParticularsLabel(r), fmtNum(r.h, 0), fmtNum(r.w, 0), String(r.qty), fmtNum(c.chargeableSqft), fmtNum(r.rate), fmtNum(c.pretax), fmtNum(c.gst), fmtNum(c.total)]
      : [String(i + 1), glassParticularsLabel(r), fmtNum(r.h, 0), fmtNum(r.w, 0), String(r.qty), fmtNum(c.chargeableSqft), fmtNum(r.rate), fmtNum(c.pretax)];
    tbody.appendChild(el('tr', {}, cells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  });

  // Total row
  const totalCells = isPerRow
    ? ['', 'TOTAL', '', '', String(totalsRow.qty), fmtNum(totalsRow.sqft), '', fmtNum(totalsRow.pretax), fmtNum(totalsRow.gst), fmtNum(totalsRow.total)]
    : ['', 'TOTAL', '', '', String(totalsRow.qty), fmtNum(totalsRow.sqft), '', fmtNum(totalsRow.pretax)];
  tbody.appendChild(el('tr', { class: 'totals-row' }, totalCells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));

  tbl.appendChild(tbody);
  return tbl;
}

function buildHardwareInvoiceTable(isPerRow, totalsRow) {
  const head = isPerRow
    ? ['Sl', 'Particulars', 'Qty', 'Rate', 'Discount %', 'Amount', `GST (${(state.gstRate * 100).toFixed(state.gstRate * 100 % 1 ? 2 : 0)}%)`, 'Total']
    : ['Sl', 'Particulars', 'Qty', 'Rate', 'Discount %', 'Amount'];
  const tbl = el('table');
  tbl.appendChild(el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i >= 2 ? 'num' : '' }, h)))));
  const tbody = el('tbody');
  state.hardware.forEach((r, i) => {
    const c = calcHardware(r, state.gstRate);
    const cells = isPerRow
      ? [String(i + 1), r.particulars || '', String(r.qty), fmtNum(r.rate), fmtNum(r.discount, 0) + '%', fmtNum(c.amount), fmtNum(c.gst), fmtNum(c.total)]
      : [String(i + 1), r.particulars || '', String(r.qty), fmtNum(r.rate), fmtNum(r.discount, 0) + '%', fmtNum(c.amount)];
    tbody.appendChild(el('tr', {}, cells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  });
  const tot = isPerRow
    ? ['', 'TOTAL', '', '', '', fmtNum(totalsRow.pretax), fmtNum(totalsRow.gst), fmtNum(totalsRow.total)]
    : ['', 'TOTAL', '', '', '', fmtNum(totalsRow.pretax)];
  tbody.appendChild(el('tr', { class: 'totals-row' }, tot.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  tbl.appendChild(tbody);
  return tbl;
}

function buildOthersInvoiceTable(isPerRow, totalsRow) {
  return buildOthersShapedTable(isPerRow, state.others, totalsRow);
}

function buildCustomSectionInvoiceTable(isPerRow, section, totalsRow) {
  return buildOthersShapedTable(isPerRow, section.rows, totalsRow);
}

function buildOthersShapedTable(isPerRow, rows, totalsRow) {
  const head = isPerRow
    ? ['Sl', 'Particulars', 'Qty', 'Rate', 'Amount', `GST (${(state.gstRate * 100).toFixed(state.gstRate * 100 % 1 ? 2 : 0)}%)`, 'Total']
    : ['Sl', 'Particulars', 'Qty', 'Rate', 'Amount'];
  const tbl = el('table');
  tbl.appendChild(el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i >= 2 ? 'num' : '' }, h)))));
  const tbody = el('tbody');
  rows.forEach((r, i) => {
    const c = calcOthers(r, state.gstRate);
    const cells = isPerRow
      ? [String(i + 1), r.particulars || '', String(r.qty), fmtNum(r.rate), fmtNum(c.amount), fmtNum(c.gst), fmtNum(c.total)]
      : [String(i + 1), r.particulars || '', String(r.qty), fmtNum(r.rate), fmtNum(c.amount)];
    tbody.appendChild(el('tr', {}, cells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  });
  const tot = isPerRow
    ? ['', 'TOTAL', '', '', fmtNum(totalsRow.pretax), fmtNum(totalsRow.gst), fmtNum(totalsRow.total)]
    : ['', 'TOTAL', '', '', fmtNum(totalsRow.pretax)];
  tbody.appendChild(el('tr', { class: 'totals-row' }, tot.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  tbl.appendChild(tbody);
  return tbl;
}

// ---------- Master render ----------
// Full rebuild — used only for structural changes (add/delete row).
function render() {
  renderQuotation();
  renderInvoice();
}

// Lightweight update — recomputes computed cells, footers, grand total,
// and invoice preview WITHOUT touching any input/select element. This is
// what every keystroke in a row input triggers, so focus and caret are
// never disturbed.
function recompute() {
  const t = totals();

  // Glass row computed cells
  const gRows = document.querySelectorAll('#glass-tbody tr');
  state.glass.forEach((row, idx) => {
    const tr = gRows[idx]; if (!tr) return;
    const c = calcGlass(row, state.gstRate);
    setCell(tr, 'actualSqft', fmtNum(c.actualSqft));
    setCell(tr, 'chargeableSqft', fmtNum(c.chargeableSqft));
    setCell(tr, 'pretax', fmtNum(c.pretax));
    setCell(tr, 'gst', fmtNum(c.gst));
    setCell(tr, 'total', fmtNum(c.total));
  });

  // Hardware row computed cells
  const hRows = document.querySelectorAll('#hardware-tbody tr');
  state.hardware.forEach((row, idx) => {
    const tr = hRows[idx]; if (!tr) return;
    const c = calcHardware(row, state.gstRate);
    setCell(tr, 'amount', fmtNum(c.amount));
    setCell(tr, 'gst', fmtNum(c.gst));
    setCell(tr, 'total', fmtNum(c.total));
  });

  // Others row computed cells
  const oRows = document.querySelectorAll('#others-tbody tr');
  state.others.forEach((row, idx) => {
    const tr = oRows[idx]; if (!tr) return;
    const c = calcOthers(row, state.gstRate);
    setCell(tr, 'amount', fmtNum(c.amount));
    setCell(tr, 'gst', fmtNum(c.gst));
    setCell(tr, 'total', fmtNum(c.total));
  });

  // Custom sections: row cells + footer
  state.customSections.forEach((sec) => {
    const tbody = document.querySelector('[data-custom-tbody="' + sec.id + '"]');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    sec.rows.forEach((row, idx) => {
      const tr = rows[idx]; if (!tr) return;
      const c = calcOthers(row, state.gstRate);
      setCell(tr, 'amount', fmtNum(c.amount));
      setCell(tr, 'gst', fmtNum(c.gst));
      setCell(tr, 'total', fmtNum(c.total));
    });
    // Section footer
    const footPretax = document.querySelector('[data-foot="' + sec.id + '-pretax"]');
    const footGst = document.querySelector('[data-foot="' + sec.id + '-gst"]');
    const footAmt = document.querySelector('[data-foot="' + sec.id + '-amount"]');
    const ct = t.custom[sec.id] || { pretax: 0, gst: 0, total: 0 };
    if (footPretax) footPretax.textContent = fmtNum(ct.pretax);
    if (footGst) footGst.textContent = fmtNum(ct.gst);
    if (footAmt) footAmt.textContent = fmtNum(ct.total);
  });

  // Footer totals
  $('#glass-total-qty').textContent = String(t.glass.qty);
  $('#glass-total-sqft').textContent = fmtNum(t.glass.sqft);
  $('#glass-total-pretax').textContent = fmtNum(t.glass.pretax);
  $('#glass-total-gst').textContent = fmtNum(t.glass.gst);
  $('#glass-total-amount').textContent = fmtNum(t.glass.total);
  $('#hardware-total-pretax').textContent = fmtNum(t.hardware.pretax);
  $('#hardware-total-gst').textContent = fmtNum(t.hardware.gst);
  $('#hardware-total-amount').textContent = fmtNum(t.hardware.total);
  $('#others-total-pretax').textContent = fmtNum(t.others.pretax);
  $('#others-total-gst').textContent = fmtNum(t.others.gst);
  $('#others-total-amount').textContent = fmtNum(t.others.total);
  $('#grand-total').textContent = fmtCur(t.grand);

  // Invoice preview reflects new totals too. It rebuilds its own DOM but
  // the invoice tab is not where the user is typing, so no focus to lose.
  renderInvoice();
}

function setCell(tr, name, value) {
  const cell = tr.querySelector('[data-cell="' + name + '"]');
  if (cell) cell.textContent = value;
}

// ---------- Tab + button wiring ----------
function setTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
}

function setFormat(name) {
  state.invoice.format = name;
  document.querySelectorAll('.format-btn').forEach(b => b.classList.toggle('active', b.dataset.format === name));
  renderInvoice();
}

function bindUI() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // Format toggle
  document.querySelectorAll('.format-btn').forEach(b => b.addEventListener('click', () => setFormat(b.dataset.format)));
  // Add row
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const which = b.dataset.add;
    if (which === 'glass') state.glass.push(blankGlass());
    if (which === 'hardware') state.hardware.push(blankHardware());
    if (which === 'others') state.others.push(blankOthers());
    render();
  }));
  // Add custom section
  $('#add-section-btn').addEventListener('click', () => {
    state.customSections.push(blankCustomSection());
    render();
  });
  // GST rate (recompute, not full render — user is typing in the input)
  $('#gst-rate').addEventListener('input', (e) => {
    state.gstRate = (Number(e.target.value) || 0) / 100;
    // Headers like "GST (18%)" are part of the invoice DOM which renderInvoice rebuilds;
    // recompute calls renderInvoice internally so labels update too.
    recompute();
  });
  // Section titles (recompute, not full render — user is typing here)
  $('#glass-title').addEventListener('input', e => { state.titles.glass = e.target.value; renderInvoice(); });
  $('#hardware-title').addEventListener('input', e => { state.titles.hardware = e.target.value; renderInvoice(); });
  $('#others-title').addEventListener('input', e => { state.titles.others = e.target.value; renderInvoice(); });
  $('#glass-title').value = state.titles.glass;
  $('#hardware-title').value = state.titles.hardware;
  $('#others-title').value = state.titles.others;

  // Project meta
  $('#meta-client').addEventListener('input', e => state.meta.client = e.target.value);
  $('#meta-address').addEventListener('input', e => state.meta.address = e.target.value);
  $('#meta-project').addEventListener('input', e => state.meta.project = e.target.value);
  $('#meta-date').addEventListener('input', e => { state.meta.date = e.target.value; renderInvoice(); });
  $('#meta-date').value = state.meta.date;

  // Invoice fields
  const inv = state.invoice;
  const bind = (id, field, parse) => {
    const node = $(id);
    node.value = inv[field] ?? '';
    node.addEventListener('input', e => { inv[field] = parse ? parse(e.target.value) : e.target.value; renderInvoice(); });
  };
  bind('#inv-no', 'no');
  bind('#inv-customer-no', 'customerNo');
  bind('#inv-date', 'date');
  bind('#inv-po', 'po');
  bind('#inv-salesperson', 'salesperson');
  bind('#inv-billto', 'billTo');
  bind('#inv-remarks', 'remarks');
  bind('#inv-footer', 'footer');
  bind('#inv-shipping', 'shipping', Number);
  bind('#inv-other', 'other', Number);
  bind('#inv-paid', 'paid', Number);

  // Print
  $('#print-btn').addEventListener('click', () => {
    setTab('invoice'); // make sure preview is visible
    setTimeout(() => window.print(), 50);
  });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  bindUI();
  setTab('quotation');
  setFormat('per-row');
  render();
});
