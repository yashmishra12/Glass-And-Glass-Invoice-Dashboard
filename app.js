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
  // Sections are grouped by Room (Living Room / Bedroom / etc).
  // Every section is uniform: { id, type, title, rows, [unit] }.
  // Every room is uniform: { id, name, collapsed, sections: [...] }.
  rooms: [],
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
const SECTION_DEFAULTS = {
  glass:    { title: 'Glass',    blankRow: blankGlass },
  hardware: { title: 'Hardware', blankRow: blankHardware },
  others:   { title: 'Others',   blankRow: blankOthers },
};
function newSection(type, title) {
  const def = SECTION_DEFAULTS[type];
  const sec = {
    id: 's-' + (_nextSectionId++),
    type,
    title: title != null ? title : def.title,
    rows: [def.blankRow()],
  };
  if (type === 'glass') sec.unit = 'mm';
  return sec;
}

let _nextRoomId = 1;
function newRoom(name) {
  const n = _nextRoomId++;
  return {
    id: 'r-' + n,
    name: name || 'Room ' + n,
    collapsed: false,
    sections: [],
  };
}

// Seed: one room with the original three section types so the default layout
// matches the workbook.
const _firstRoom = newRoom('Room 1');
_firstRoom.sections.push(newSection('glass'));
_firstRoom.sections.push(newSection('hardware'));
_firstRoom.sections.push(newSection('others'));
state.rooms.push(_firstRoom);

// ---------- Calculations ----------
function getDriver(particulars) {
  const g = GLASS_TYPES.find(x => x.name === particulars);
  return g ? g.driver : 1;
}

function ceilTo(value, multiple) {
  if (!multiple) return value;
  return Math.ceil(value / multiple) * multiple;
}

function calcGlass(row, gstRate, unit = 'mm') {
  const h = Math.max(0, +row.h || 0);
  const w = Math.max(0, +row.w || 0);
  const qty = Math.max(0, +row.qty || 0);
  const rate = Math.max(0, +row.rate || 0);
  // Convert dimensions to inches for the rest of the formula.
  const hIn = unit === 'mm' ? h / 25.4 : h;
  const wIn = unit === 'mm' ? w / 25.4 : w;
  const driver = getDriver(row.particulars);
  const grid = 6 * driver; // 6" or 12"

  const actualSqft = (hIn * wIn) / 144 * qty;
  const chargeableSqft = ceilTo(hIn, grid) * ceilTo(wIn, grid) / 144 * qty;
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

// ---------- Calc dispatch by section type ----------
// Takes the section so glass can read its `unit`.
function calcRow(section, row, gstRate) {
  if (section.type === 'glass') return calcGlass(row, gstRate, section.unit || 'mm');
  if (section.type === 'hardware') return calcHardware(row, gstRate);
  return calcOthers(row, gstRate);
}

// ---------- Render: a single section card ----------
function renderSection(section, sIdx, room) {
  const card = el('div', {
    class: 'bg-white rounded-xl border border-slate-200 overflow-hidden',
    'data-section-id': section.id,
    'data-section-type': section.type,
  });

  // Header: editable title + (glass only) unit toggle + Add Row + Delete Section
  const header = el('div', { class: 'px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 gap-3' });
  const titleInput = el('input', {
    class: 'section-title-input',
    value: section.title,
    oninput: (e) => { section.title = e.target.value; renderInvoice(); }
  });
  const actions = el('div', { class: 'flex gap-2 items-center' });

  if (section.type === 'glass') {
    actions.appendChild(renderUnitToggle(section));
  }

  actions.append(
    el('button', {
      class: 'text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 border border-brand-600 rounded-md',
      onclick: () => { section.rows.push(SECTION_DEFAULTS[section.type].blankRow()); render(); }
    }, '+ Add Row'),
    el('button', {
      class: 'text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-300 rounded-md',
      onclick: () => {
        if (confirm('Delete section "' + section.title + '"?')) {
          room.sections.splice(sIdx, 1);
          render();
        }
      }
    }, 'Delete Section'),
  );
  header.append(titleInput, actions);
  card.appendChild(header);

  // Table per type
  const wrap = el('div', { class: 'overflow-x-auto' });
  const tbl = el('table', { class: 'w-full text-sm' });
  tbl.appendChild(buildSectionThead(section));

  const tbody = el('tbody', { 'data-section-tbody': section.id });
  section.rows.forEach((row, rIdx) => {
    tbody.appendChild(buildSectionRow(section, rIdx, row));
  });
  tbl.appendChild(tbody);
  tbl.appendChild(buildSectionTfoot(section));

  wrap.appendChild(tbl);
  card.appendChild(wrap);
  return card;
}

function buildSectionThead(section) {
  const u = section.type === 'glass' ? unitLabel(section.unit) : '';
  const heads = {
    glass: ['#', 'Thickness', 'Particulars', 'Process', 'Design', 'H (' + u + ')', 'W (' + u + ')', 'Qty', 'Actual Sqft', 'Sqft', 'Rate', 'Pretax', 'GST', 'Total', 'Remarks', ''],
    hardware: ['#', 'Particulars', 'Qty', 'Rate', 'Discount %', 'Amount', 'GST', 'Final Amount', ''],
    others: ['#', 'Particulars', 'Qty', 'Rate', 'Amount', 'GST', 'Final Amount', ''],
  }[section.type];
  return el('thead', { class: 'bg-slate-100 text-xs text-slate-600 uppercase' },
    el('tr', {}, heads.map(h => el('th', { class: 'px-2 py-2 text-left' }, h))));
}

function unitLabel(unit) {
  return unit === 'inch' ? 'in' : 'mm';
}

// Compact unit toggle: [MM | INCH]. Switching converts existing values so the
// physical size stays the same.
function renderUnitToggle(section) {
  const wrap = el('div', { class: 'flex items-center gap-0 bg-slate-100 rounded-md p-0.5' });
  const make = (unit, label) => el('button', {
    class: 'px-2 py-1 text-xs font-medium rounded ' + (section.unit === unit ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'),
    onclick: () => switchUnit(section, unit),
  }, label);
  wrap.append(make('mm', 'MM'), make('inch', 'INCH'));
  return wrap;
}

function switchUnit(section, newUnit) {
  if (section.unit === newUnit) return;
  // Convert h/w in every row so the size doesn't change.
  // mm → inch divides by 25.4; inch → mm multiplies.
  const factor = newUnit === 'inch' ? (1 / 25.4) : 25.4;
  for (const row of section.rows) {
    row.h = +(((+row.h) || 0) * factor).toFixed(2);
    row.w = +(((+row.w) || 0) * factor).toFixed(2);
  }
  section.unit = newUnit;
  render();
}

function buildSectionRow(section, rIdx, row) {
  if (section.type === 'glass') return buildGlassRow(section, rIdx, row);
  if (section.type === 'hardware') return buildHardwareRow(section, rIdx, row);
  return buildOthersRow(section, rIdx, row);
}

function buildGlassRow(section, rIdx, row) {
  const calc = calcGlass(row, state.gstRate, section.unit || 'mm');
  const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };
  const onSelect = (field) => (e) => { row[field] = e.target.value; recompute(); };
  const select = (field, options) => {
    const s = el('select', { class: 'cell-input', onchange: onSelect(field) });
    for (const opt of options) {
      const o = el('option', { value: opt }, opt);
      if (row[field] === opt) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };

  return el('tr', {}, [
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(rIdx + 1)),
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
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { section.rows.splice(rIdx, 1); render(); } }, '✕')),
  ]);
}

function buildHardwareRow(section, rIdx, row) {
  const calc = calcHardware(row, state.gstRate);
  const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };
  return el('tr', {}, [
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(rIdx + 1)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.particulars, oninput: onInput('particulars') })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, max: 100, class: 'cell-input text-right', value: row.discount, oninput: onInput('discount', pct0to100) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'amount' }, fmtNum(calc.amount)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(calc.gst)),
    el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(calc.total)),
    el('td', { class: 'px-2 py-1 text-center' },
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { section.rows.splice(rIdx, 1); render(); } }, '✕')),
  ]);
}

function buildOthersRow(section, rIdx, row) {
  const calc = calcOthers(row, state.gstRate);
  const onInput = (field, parse) => (e) => { row[field] = parse ? parse(e.target.value) : e.target.value; recompute(); };
  return el('tr', {}, [
    el('td', { class: 'px-2 py-1 text-slate-500' }, String(rIdx + 1)),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'text', class: 'cell-input', value: row.particulars, oninput: onInput('particulars') })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.qty, oninput: onInput('qty', nonNeg) })),
    el('td', { class: 'px-2 py-1' }, el('input', { type: 'number', min: 0, class: 'cell-input text-right', value: row.rate, oninput: onInput('rate', nonNeg) })),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'amount' }, fmtNum(calc.amount)),
    el('td', { class: 'px-2 py-1 text-right computed', 'data-cell': 'gst' }, fmtNum(calc.gst)),
    el('td', { class: 'px-2 py-1 text-right computed font-medium text-slate-800', 'data-cell': 'total' }, fmtNum(calc.total)),
    el('td', { class: 'px-2 py-1 text-center' },
      el('span', { class: 'row-delete', title: 'Delete row', onclick: () => { section.rows.splice(rIdx, 1); render(); } }, '✕')),
  ]);
}

function buildSectionTfoot(section) {
  const id = section.id;
  // Glass tfoot has Qty + Sqft + Pretax + GST + Amount; Hardware/Others just Pretax + GST + Amount
  if (section.type === 'glass') {
    return el('tfoot', { class: 'bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700' }, el('tr', {}, [
      el('td', { class: 'px-2 py-2 text-right', colspan: 7 }, 'TOTAL'),
      el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-qty' }, '0'),
      el('td', { class: 'px-2 py-2' }),
      el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-sqft' }, '0.00'),
      el('td', { class: 'px-2 py-2' }),
      el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-pretax' }, '0.00'),
      el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-gst' }, '0.00'),
      el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-amount' }, '0.00'),
      el('td', { colspan: 2 }),
    ]));
  }
  // Hardware: TOTAL spans 5 cols then Pretax/GST/Amount
  // Others:   TOTAL spans 4 cols then Pretax/GST/Amount
  const totalSpan = section.type === 'hardware' ? 5 : 4;
  return el('tfoot', { class: 'bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-700' }, el('tr', {}, [
    el('td', { class: 'px-2 py-2 text-right', colspan: totalSpan }, 'TOTAL'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-pretax' }, '0.00'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-gst' }, '0.00'),
    el('td', { class: 'px-2 py-2 text-right', 'data-foot': id + '-amount' }, '0.00'),
    el('td'),
  ]));
}

// ---------- Aggregate totals ----------
function totals() {
  const sectionTotals = {};   // id → { pretax, gst, total, qty?, sqft? }
  const roomTotals = {};      // id → { pretax, gst, total }
  let grand = 0, pretaxSum = 0, totalSum = 0;

  for (const room of state.rooms) {
    let rPretax = 0, rGst = 0, rTotal = 0;
    for (const sec of room.sections) {
      let p = 0, g = 0, t = 0, qty = 0, sqft = 0;
      for (const r of sec.rows) {
        const c = calcRow(sec, r, state.gstRate);
        if (sec.type === 'glass') {
          qty += +r.qty || 0;
          sqft += c.chargeableSqft;
          p += c.pretax;
        } else {
          p += c.amount;
        }
        g += c.gst;
        t += c.total;
      }
      sectionTotals[sec.id] = { pretax: p, gst: g, total: t, qty, sqft };
      rPretax += p; rGst += g; rTotal += t;
    }
    roomTotals[room.id] = { pretax: rPretax, gst: rGst, total: rTotal };
    grand += rTotal;
    pretaxSum += rPretax;
    totalSum += rTotal;
  }
  return { sections: sectionTotals, rooms: roomTotals, pretaxSum, totalSum, grand };
}

// ---------- Render: rooms → sections + grand total ----------
function renderQuotation() {
  const container = $('#sections');
  container.innerHTML = '';

  if (state.rooms.length === 0) {
    container.appendChild(renderEmptyRoomsState());
  } else {
    state.rooms.forEach((room, rIdx) => {
      container.appendChild(renderRoom(room, rIdx));
    });
  }

  // "+ Add Room" button after all rooms
  container.appendChild(renderAddRoomButton());

  const t = totals();
  applyFootValues(t);
  $('#grand-total').textContent = fmtCur(t.grand);
}

function renderRoom(room, rIdx) {
  const card = el('div', {
    class: 'bg-slate-100/60 border border-slate-200 rounded-xl mb-6 overflow-hidden',
    'data-room-id': room.id,
  });

  // Room header: chevron + name + total + delete
  const header = el('div', { class: 'flex items-center gap-3 px-4 py-3 bg-slate-100' });
  const chevron = el('button', {
    class: 'text-slate-500 hover:text-slate-700 text-sm w-6 text-center',
    title: room.collapsed ? 'Expand' : 'Collapse',
    onclick: () => { room.collapsed = !room.collapsed; render(); }
  }, room.collapsed ? '▶' : '▼');

  const nameInput = el('input', {
    class: 'room-name-input flex-1',
    value: room.name,
    placeholder: 'Room name',
    oninput: (e) => { room.name = e.target.value; renderInvoice(); },
  });

  const totalSpan = el('span', {
    class: 'text-xs font-medium text-slate-500',
    'data-room-total': room.id,
  }, '');

  const deleteBtn = el('button', {
    class: 'text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 border border-red-300 rounded-md',
    onclick: () => {
      if (confirm('Delete room "' + room.name + '" and all its sections?')) {
        state.rooms.splice(rIdx, 1);
        render();
      }
    }
  }, 'Delete Room');

  header.append(chevron, nameInput, totalSpan, deleteBtn);
  card.appendChild(header);

  // Body — sections + per-section Add buttons. Hidden when collapsed.
  if (!room.collapsed) {
    const body = el('div', { class: 'p-4 space-y-0' });
    if (room.sections.length === 0) {
      body.appendChild(renderEmptySectionsState(room));
    } else {
      room.sections.forEach((sec, sIdx) => {
        const wrap = el('div', { class: 'mb-4' });
        wrap.appendChild(renderSection(sec, sIdx, room));
        wrap.appendChild(renderInlineAddButton(sec.type, sIdx, room));
        body.appendChild(wrap);
      });
    }
    card.appendChild(body);
  }

  return card;
}

function renderInlineAddButton(type, afterIdx, room) {
  return el('div', { class: 'flex justify-center mt-2' }, [
    el('button', {
      class: 'px-4 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 border border-dashed border-brand-600 hover:border-solid rounded-md',
      title: 'Add another ' + type + ' section to this room',
      onclick: () => {
        room.sections.splice(afterIdx + 1, 0, newSection(type));
        render();
      }
    }, '+ Add'),
  ]);
}

function renderEmptySectionsState(room) {
  return el('div', { class: 'flex flex-col items-center gap-3 py-8 text-slate-500' }, [
    el('div', { class: 'text-sm' }, 'No sections in this room — pick a type:'),
    el('div', { class: 'flex gap-3 flex-wrap justify-center' }, ['glass', 'hardware', 'others'].map(type =>
      el('button', {
        class: 'px-4 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 border border-dashed border-brand-600 hover:border-solid rounded-md capitalize',
        onclick: () => { room.sections.push(newSection(type)); render(); }
      }, '+ Add ' + type)
    )),
  ]);
}

function renderEmptyRoomsState() {
  return el('div', { class: 'flex flex-col items-center gap-3 py-12 text-slate-500' }, [
    el('div', { class: 'text-sm' }, 'No rooms yet.'),
  ]);
}

function renderAddRoomButton() {
  return el('div', { class: 'flex justify-center mb-6' }, [
    el('button', {
      class: 'px-5 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 border border-dashed border-brand-600 hover:border-solid rounded-md',
      onclick: () => { state.rooms.push(newRoom()); render(); }
    }, '+ Add Room'),
  ]);
}

function applyFootValues(t) {
  for (const room of state.rooms) {
    for (const sec of room.sections) {
      const st = t.sections[sec.id];
      setFoot(sec.id + '-pretax', fmtNum(st.pretax));
      setFoot(sec.id + '-gst', fmtNum(st.gst));
      setFoot(sec.id + '-amount', fmtNum(st.total));
      if (sec.type === 'glass') {
        setFoot(sec.id + '-qty', String(st.qty));
        setFoot(sec.id + '-sqft', fmtNum(st.sqft));
      }
    }
    // Room total label in the header
    const roomTotalEl = document.querySelector('[data-room-total="' + room.id + '"]');
    if (roomTotalEl) roomTotalEl.textContent = fmtCur(t.rooms[room.id].total);
  }
}

function setFoot(name, value) {
  const c = document.querySelector('[data-foot="' + name + '"]');
  if (c) c.textContent = value;
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

  // Subtotal across all sections, in either format
  const subtotal = isPerRow ? t.totalSum : t.pretaxSum;

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

  // ----- Rooms → sections. Each room becomes a heading; each section a sub-heading + table.
  state.rooms.forEach((room) => {
    if (!room.sections.length) return;
    // Skip rooms whose every section is empty
    const hasContent = room.sections.some(s => s.rows.length > 0);
    if (!hasContent) return;

    // Room name as a larger heading
    root.appendChild(el('div', {
      class: 'font-bold mt-6 mb-2 pb-1 border-b border-slate-300',
      style: 'text-transform: uppercase; font-size: 13px; letter-spacing: 0.5px;',
    }, room.name || 'Room'));

    room.sections.forEach((sec) => {
      if (!sec.rows.length) return;
      root.appendChild(el('div', { class: 'font-semibold mt-3 mb-1', style: 'text-transform: uppercase; font-size: 11px;' }, sec.title));
      const st = t.sections[sec.id];
      if (sec.type === 'glass') root.appendChild(buildGlassInvoiceTable(isPerRow, sec, st));
      else if (sec.type === 'hardware') root.appendChild(buildHardwareInvoiceTable(isPerRow, sec.rows, st));
      else root.appendChild(buildOthersInvoiceTable(isPerRow, sec.rows, st));
    });
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

function gstHeader() {
  return `GST (${(state.gstRate * 100).toFixed(state.gstRate * 100 % 1 ? 2 : 0)}%)`;
}

function buildGlassInvoiceTable(isPerRow, section, totalsRow) {
  const u = unitLabel(section.unit);
  const dpDim = section.unit === 'inch' ? 2 : 0;
  const head = isPerRow
    ? ['Sl', 'Particulars', 'H (' + u + ')', 'W (' + u + ')', 'Qty', 'Sqft', 'Rate', 'Pretax', gstHeader(), 'Total']
    : ['Sl', 'Particulars', 'H (' + u + ')', 'W (' + u + ')', 'Qty', 'Sqft', 'Rate', 'Amount'];
  const tbl = el('table');
  tbl.appendChild(el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i >= 2 ? 'num' : '' }, h)))));
  const tbody = el('tbody');
  section.rows.forEach((r, i) => {
    const c = calcGlass(r, state.gstRate, section.unit || 'mm');
    const cells = isPerRow
      ? [String(i + 1), glassParticularsLabel(r), fmtNum(r.h, dpDim), fmtNum(r.w, dpDim), String(r.qty), fmtNum(c.chargeableSqft), fmtNum(r.rate), fmtNum(c.pretax), fmtNum(c.gst), fmtNum(c.total)]
      : [String(i + 1), glassParticularsLabel(r), fmtNum(r.h, dpDim), fmtNum(r.w, dpDim), String(r.qty), fmtNum(c.chargeableSqft), fmtNum(r.rate), fmtNum(c.pretax)];
    tbody.appendChild(el('tr', {}, cells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  });
  const totalCells = isPerRow
    ? ['', 'TOTAL', '', '', String(totalsRow.qty), fmtNum(totalsRow.sqft), '', fmtNum(totalsRow.pretax), fmtNum(totalsRow.gst), fmtNum(totalsRow.total)]
    : ['', 'TOTAL', '', '', String(totalsRow.qty), fmtNum(totalsRow.sqft), '', fmtNum(totalsRow.pretax)];
  tbody.appendChild(el('tr', { class: 'totals-row' }, totalCells.map((v, idx) => el('td', { class: idx >= 2 ? 'num' : '' }, v))));
  tbl.appendChild(tbody);
  return tbl;
}

function buildHardwareInvoiceTable(isPerRow, rows, totalsRow) {
  const head = isPerRow
    ? ['Sl', 'Particulars', 'Qty', 'Rate', 'Discount %', 'Amount', gstHeader(), 'Total']
    : ['Sl', 'Particulars', 'Qty', 'Rate', 'Discount %', 'Amount'];
  const tbl = el('table');
  tbl.appendChild(el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i >= 2 ? 'num' : '' }, h)))));
  const tbody = el('tbody');
  rows.forEach((r, i) => {
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

function buildOthersInvoiceTable(isPerRow, rows, totalsRow) {
  const head = isPerRow
    ? ['Sl', 'Particulars', 'Qty', 'Rate', 'Amount', gstHeader(), 'Total']
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

  for (const room of state.rooms) {
    for (const sec of room.sections) {
      const tbody = document.querySelector('[data-section-tbody="' + sec.id + '"]');
      if (!tbody) continue;
      const rows = tbody.querySelectorAll('tr');
      sec.rows.forEach((row, idx) => {
        const tr = rows[idx]; if (!tr) return;
        const c = calcRow(sec, row, state.gstRate);
        if (sec.type === 'glass') {
          setCell(tr, 'actualSqft', fmtNum(c.actualSqft));
          setCell(tr, 'chargeableSqft', fmtNum(c.chargeableSqft));
          setCell(tr, 'pretax', fmtNum(c.pretax));
        } else {
          setCell(tr, 'amount', fmtNum(c.amount));
        }
        setCell(tr, 'gst', fmtNum(c.gst));
        setCell(tr, 'total', fmtNum(c.total));
      });
    }
  }

  applyFootValues(t);
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
  // GST rate (recompute, not full render — user is typing in the input)
  $('#gst-rate').addEventListener('input', (e) => {
    state.gstRate = (Number(e.target.value) || 0) / 100;
    recompute();
  });

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
