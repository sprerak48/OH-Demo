/**
 * Risk Adjustment Agent
 * Surfaces evidence-backed suspect HCCs for human review.
 * Does NOT assign diagnoses. Compliance-safe language only.
 *
 * Hard constraints:
 * - At least 2 independent signals to flag an HCC
 * - Confidence ∈ [0.0, 1.0), never 1.0
 * - Evidence-based inference only
 */

import { HCC_WEIGHTS, BASE_RATE_PMPM } from './risk-adjustment.js';

const HCC_CONDITIONS = {
  HCC_18: 'Diabetes',
  HCC_85: 'CHF',
  HCC_96: 'COPD',
  HCC_108: 'CKD',
  HCC_19: 'Hypertension',
};

/**
 * Derives claims summary from claims array
 */
function getClaimsSummary(claims) {
  const rxClaims = claims.filter((c) => c.claim_type === 'RX');
  const ipClaims = claims.filter((c) => c.claim_type === 'IP');
  const opClaims = claims.filter((c) => c.claim_type === 'OP');
  const rxSpend = rxClaims.reduce((s, c) => s + c.allowed_amount, 0);
  const ipSpend = ipClaims.reduce((s, c) => s + c.allowed_amount, 0);
  const highCostProcedure = ipSpend > 15000 || claims.some((c) => c.allowed_amount > 10000);
  const chronicMeds = rxClaims.length >= 6;
  const multipleRx = rxClaims.length >= 8;

  return {
    rxSpend12m: rxSpend,
    ipAdmissions: ipClaims.length,
    ipSpend: ipSpend,
    opVisits: opClaims.length,
    chronicMeds,
    multipleRx,
    highCostProcedure,
    rxCount: rxClaims.length,
  };
}

/**
 * Evaluates Diabetes (HCC_18) suspect logic
 * Signals: High RX spend + chronic meds OR elevated risk_score
 */
function evalDiabetes(member, summary, hasHCC) {
  if (hasHCC('HCC_18')) return null;
  const signals = [];
  if (summary.rxSpend12m > 2000) signals.push('High chronic RX spend (12m)');
  if (summary.chronicMeds) signals.push('Multiple chronic medication fills');
  if (member.risk_score >= 0.65) signals.push('Elevated risk score');
  if (signals.length < 2) return null;

  const strength = signals.length === 2 ? 0.65 : 0.78;
  const dataCompleteness = summary.rxCount > 3 ? 0.95 : 0.85;
  const confidence = Math.min(0.99, strength * dataCompleteness);

  return {
    hcc_code: 'HCC_18',
    condition: HCC_CONDITIONS.HCC_18,
    confidence: Math.round(confidence * 100) / 100,
    evidence: signals,
    raf_uplift: HCC_WEIGHTS.HCC_18,
    revenue_uplift_estimate: Math.round(HCC_WEIGHTS.HCC_18 * BASE_RATE_PMPM * (member.member_months || 12)),
  };
}

/**
 * Evaluates CHF (HCC_85) suspect logic
 * Signals: IP admission + high-cost procedure (proxy for cardiology)
 */
function evalCHF(member, summary, hasHCC) {
  if (hasHCC('HCC_85')) return null;
  const signals = [];
  if (summary.ipAdmissions >= 1) signals.push('Inpatient admission(s) in 12m');
  if (summary.highCostProcedure) signals.push('High-cost procedure flag');
  if (summary.ipSpend > 10000) signals.push('Significant inpatient utilization');
  if (signals.length < 2) return null;

  const strength = signals.length >= 3 ? 0.72 : 0.62;
  const confidence = Math.min(0.99, strength * 0.92);
  return {
    hcc_code: 'HCC_85',
    condition: HCC_CONDITIONS.HCC_85,
    confidence: Math.round(confidence * 100) / 100,
    evidence: signals,
    raf_uplift: HCC_WEIGHTS.HCC_85,
    revenue_uplift_estimate: Math.round(HCC_WEIGHTS.HCC_85 * BASE_RATE_PMPM * (member.member_months || 12)),
  };
}

/**
 * Evaluates COPD (HCC_96) suspect logic
 * Signals: Chronic flag + high RX count OR frequent OP visits
 */
function evalCOPD(member, summary, hasHCC) {
  if (hasHCC('HCC_96')) return null;
  const signals = [];
  if (member.chronic_condition_flag) signals.push('Chronic condition flag on file');
  if (summary.rxCount >= 8) signals.push('High prescription count (suggests ongoing management)');
  if (summary.opVisits >= 6) signals.push('Frequent outpatient visits');
  if (signals.length < 2) return null;

  const strength = 0.58 + (signals.length - 2) * 0.08;
  const confidence = Math.min(0.99, strength * 0.9);
  return {
    hcc_code: 'HCC_96',
    condition: HCC_CONDITIONS.HCC_96,
    confidence: Math.round(confidence * 100) / 100,
    evidence: signals,
    raf_uplift: HCC_WEIGHTS.HCC_96,
    revenue_uplift_estimate: Math.round(HCC_WEIGHTS.HCC_96 * BASE_RATE_PMPM * (member.member_months || 12)),
  };
}

/**
 * Evaluates CKD (HCC_108) suspect logic
 * Signals: High risk_score + chronic meds OR high RX spend
 */
function evalCKD(member, summary, hasHCC) {
  if (hasHCC('HCC_108')) return null;
  const signals = [];
  if (member.risk_score >= 0.75) signals.push('Elevated risk score');
  if (summary.chronicMeds) signals.push('Chronic medication utilization pattern');
  if (summary.rxSpend12m > 1500) signals.push('Above-average RX spend');
  if (signals.length < 2) return null;

  const strength = 0.6 + (signals.length - 2) * 0.07;
  const confidence = Math.min(0.99, strength * 0.88);
  return {
    hcc_code: 'HCC_108',
    condition: HCC_CONDITIONS.HCC_108,
    confidence: Math.round(confidence * 100) / 100,
    evidence: signals,
    raf_uplift: HCC_WEIGHTS.HCC_108,
    revenue_uplift_estimate: Math.round(HCC_WEIGHTS.HCC_108 * BASE_RATE_PMPM * (member.member_months || 12)),
  };
}

/**
 * Evaluates Hypertension (HCC_19) suspect logic
 * Signals: Chronic meds + repeated OP visits
 */
function evalHypertension(member, summary, hasHCC) {
  if (hasHCC('HCC_19')) return null;
  const signals = [];
  if (summary.multipleRx) signals.push('Multiple prescription fills');
  if (summary.opVisits >= 4) signals.push('Repeated outpatient visits');
  if (summary.chronicMeds) signals.push('Chronic medication pattern');
  if (signals.length < 2) return null;

  const strength = 0.55 + (signals.length - 2) * 0.1;
  const confidence = Math.min(0.99, strength * 0.9);
  return {
    hcc_code: 'HCC_19',
    condition: HCC_CONDITIONS.HCC_19,
    confidence: Math.round(confidence * 100) / 100,
    evidence: signals,
    raf_uplift: HCC_WEIGHTS.HCC_19,
    revenue_uplift_estimate: Math.round(HCC_WEIGHTS.HCC_19 * BASE_RATE_PMPM * (member.member_months || 12)),
  };
}

/**
 * Main agent invocation. Returns structured output per member.
 * Never assigns diagnoses; surfaces evidence-backed suspicions for human review.
 */
export function runAgent(member, claimsByMember = {}) {
  const claims = claimsByMember[member.member_id] || [];
  const summary = getClaimsSummary(claims);
  const hasHCC = (code) => (member.hcc_codes || []).includes(code);

  const evaluators = [evalDiabetes, evalCHF, evalCOPD, evalCKD, evalHypertension];
  const suspect_hccs = [];
  for (const fn of evaluators) {
    const result = fn(member, summary, hasHCC);
    if (result) suspect_hccs.push(result);
  }

  let overall_commentary = null;
  if (suspect_hccs.length > 0) {
    overall_commentary =
      'Member shows utilization patterns consistent with unmanaged chronic disease. Recommend coding review.';
  } else if (member.risk_score > 0.7 && claims.length > 5) {
    overall_commentary =
      'Elevated risk score with moderate utilization. No sufficient evidence for suspect conditions at this time.';
  }

  return {
    member_id: member.member_id,
    suspect_hccs,
    overall_commentary,
  };
}

/**
 * Batch mode: run agent on top N high-risk members
 */
export function runAgentBatch(members, claimsByMember, limit = 1000) {
  const sorted = [...members]
    .map((m) => ({ member: m, risk: m.risk_score }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, limit);
  return sorted.map(({ member }) => runAgent(member, claimsByMember));
}
