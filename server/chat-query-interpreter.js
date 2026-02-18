/**
 * Query Interpreter
 * Converts natural language questions into structured agent queries.
 * Deterministic pattern matching — no LLM.
 */

const STATES = ['TX', 'TX', 'TX', 'NY', 'CA', 'FL', 'NJ', 'IL', 'PA', 'GA', 'OH', 'NC', 'MI', 'AZ'];
const PLANS = ['Bronze', 'Silver', 'Gold'];

function extractState(text) {
  const t = text.toUpperCase();
  const stateMap = { TEXAS: 'TX', NY: 'NY', CALIFORNIA: 'CA', CA: 'CA', FLORIDA: 'FL', FL: 'FL', NEWYORK: 'NY', 'NEW YORK': 'NY' };
  for (const [key, val] of Object.entries(stateMap)) {
    if (t.includes(key.replace(' ', '')) || t.includes(key)) return val;
  }
  const m = t.match(/\b([A-Z]{2})\b/);
  return m ? m[1] : null;
}

function extractPlan(text) {
  const t = text.toLowerCase();
  for (const p of PLANS) if (t.includes(p.toLowerCase())) return p;
  return null;
}

function extractPercent(text) {
  const m = text.match(/(\d+)\s*%|percent|percentage/);
  return m ? parseInt(m[1], 10) : null;
}

export function interpretQuery(userQuestion) {
  const q = (userQuestion || '').trim().toLowerCase();
  const intent = {
    state: extractState(userQuestion),
    plan_type: extractPlan(userQuestion),
    analysis_type: null,
    close_suspect_pct: extractPercent(userQuestion),
    time_window: 'Last 12 months',
  };

  if (q.includes('leak') || q.includes('leaking') || q.includes('leakage')) intent.analysis_type = 'RAF Leakage';
  else if (q.includes('missing') || q.includes('revenue at risk') || q.includes('where are we')) intent.analysis_type = 'Revenue at Risk';
  else if (q.includes('close') || q.includes('what happens if') || q.includes('suspect')) intent.analysis_type = 'What-If Closure';
  else if (q.includes('worst') || q.includes('adjusted mlr') || q.includes('plans')) intent.analysis_type = 'Plan MLR';
  else if (q.includes('hcc') && (q.includes('driv') || q.includes('domin'))) intent.analysis_type = 'HCC Drivers';
  else if (q.includes('unique') || q.includes('texas')) intent.analysis_type = 'State Comparison';
  else intent.analysis_type = 'General';

  return intent;
}
