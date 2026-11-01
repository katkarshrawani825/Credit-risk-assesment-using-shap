const $ = (id) => document.getElementById(id);

const FIELDS = [
  { g: 'applicant', k: 'person_age', l: 'Age', min: 18, max: 100, step: 1, ph: '28' },
  { g: 'applicant', k: 'person_income', l: 'Annual income', min: 1, step: 1000, ph: '60000' },
  { g: 'applicant', k: 'person_home_ownership', l: 'Home ownership', o: { RENT: 'Rent', OWN: 'Own', MORTGAGE: 'Mortgage', OTHER: 'Other' } },
  { g: 'applicant', k: 'person_emp_length', l: 'Years employed', min: 0, step: 0.5, ph: '4' },
  { g: 'loan', k: 'loan_intent', l: 'Loan purpose', o: { PERSONAL: 'Personal', EDUCATION: 'Education', MEDICAL: 'Medical', VENTURE: 'Business venture', HOMEIMPROVEMENT: 'Home improvement', DEBTCONSOLIDATION: 'Debt consolidation' } },
  { g: 'loan', k: 'loan_grade', l: 'Loan grade', o: Object.fromEntries('ABCDEFG'.split('').map((x) => [x, x])) },
  { g: 'loan', k: 'loan_amnt', l: 'Loan amount', min: 1, step: 500, ph: '10000' },
  { g: 'loan', k: 'loan_int_rate', l: 'Interest rate (%)', min: 0, step: 0.1, ph: '11.5' },
  { g: 'loan', k: 'loan_percent_income', l: 'Loan as share of income', auto: true },
  { g: 'credit', k: 'cb_person_default_on_file', l: 'Past default on file', o: { N: 'No', Y: 'Yes' } },
  { g: 'credit', k: 'cb_person_cred_hist_length', l: 'Credit history (years)', min: 0, step: 1, ph: '5' },
];

const PRESETS = {
  low: { person_age: 42, person_income: 95000, person_home_ownership: 'MORTGAGE', person_emp_length: 12, loan_intent: 'HOMEIMPROVEMENT', loan_grade: 'A', loan_amnt: 8000, loan_int_rate: 7.5, cb_person_default_on_file: 'N', cb_person_cred_hist_length: 16 },
  high: { person_age: 23, person_income: 22000, person_home_ownership: 'RENT', person_emp_length: 1, loan_intent: 'MEDICAL', loan_grade: 'F', loan_amnt: 14000, loan_int_rate: 19.8, cb_person_default_on_file: 'Y', cb_person_cred_hist_length: 2 },
};

// Build the form
FIELDS.forEach((f) => {
  const wrap = document.createElement('div');
  const opts = f.o ? Object.entries(f.o).map(([v, t]) => `<option value="${v}">${t}</option>`).join('') : '';
  wrap.innerHTML = `<label for="${f.k}">${f.l}</label>` + (f.o
    ? `<select id="${f.k}" name="${f.k}">${opts}</select>`
    : `<input id="${f.k}" name="${f.k}" type="number" inputmode="decimal" ${f.auto ? 'readonly tabindex="-1" placeholder="Calculated"' : `min="${f.min ?? ''}" ${f.max ? `max="${f.max}"` : ''} step="${f.step}" placeholder="${f.ph ?? ''}"`}>`);
  $('g-' + f.g).appendChild(wrap);
});

// Loan share of income is derived, so the person never has to work it out
const syncShare = () => {
  const inc = parseFloat($('person_income').value), amt = parseFloat($('loan_amnt').value);
  $('loan_percent_income').value = inc > 0 && amt >= 0 ? (amt / inc).toFixed(2) : '';
};
['person_income', 'loan_amnt'].forEach((id) => $(id).addEventListener('input', syncShare));

document.querySelectorAll('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    Object.entries(PRESETS[b.dataset.preset]).forEach(([k, v]) => ($(k).value = v));
    document.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
    syncShare();
  })
);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const result = $('result');

function setState(cls) { result.className = 'panel result ' + cls; }

function countUp(to) {
  if (reduce) { $('pct').textContent = to.toFixed(1) + '%'; return; }
  const t0 = performance.now(), dur = 1100;
  const step = (t) => {
    const p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
    $('pct').textContent = (to * e).toFixed(1) + '%';
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function show(data) {
  const p = data.default_probability, thr = data.threshold;
  const high = data.default_prediction === 1;
  $('fill').style.strokeDashoffset = 100 - p * 100;
  $('tick').style.transform = `rotate(${thr * 180}deg)`;
  $('tick').classList.add('show');
  countUp(p * 100);
  setState((high ? 'high' : 'low') + ' pop');
  $('verdict').textContent = high ? 'High risk' : 'Low risk';
  const gap = Math.abs(p - thr) * 100;
  $('note').textContent = `The model flags applications above ${(thr * 100).toFixed(1)}%. This one sits ${gap.toFixed(1)} points ${high ? 'above' : 'below'} that line.`;
}

function showError(msg) {
  setState('error');
  $('fill').style.strokeDashoffset = 100;
  $('tick').classList.remove('show');
  $('pct').textContent = '–';
  $('verdict').textContent = 'Couldn’t get a result';
  $('note').textContent = msg;
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  syncShare();
  const payload = {};
  let bad = null;
  FIELDS.forEach((f) => {
    const el = $(f.k);
    el.classList.remove('invalid');
    if (f.o) { payload[f.k] = el.value; return; }
    const n = parseFloat(el.value);
    if (Number.isNaN(n) || n < 0) { el.classList.add('invalid'); bad = bad || el; return; }
    payload[f.k] = n;
  });
  if (bad) { bad.focus(); showError('Fill in the highlighted fields with valid numbers.'); return; }
  payload.person_age = Math.round(payload.person_age);
  payload.cb_person_cred_hist_length = Math.round(payload.cb_person_cred_hist_length);

  const btn = $('go');
  btn.classList.add('loading');
  try {
    const res = await fetch('/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`The server returned ${res.status}. Check the values and try again.`);
    show(await res.json());
  } catch (err) {
    showError(err.message.startsWith('The server') ? err.message : 'The server didn’t respond. Wait a moment and try again.');
  } finally {
    btn.classList.remove('loading');
  }
});
