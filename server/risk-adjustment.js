/**
 * Risk Adjustment Logic (Simplified, Explainable)
 * Inspired by CMS-HCC and Oscar Health margin drivers.
 * NOT real CMS logic — deterministic demo math only.
 * All assumptions documented in comments.
 *
 * Narrative goal: "I can see where our RAF is coming from,
 * what we're missing, and how closing gaps moves MLR."
 */

// Base rate for risk adjustment revenue (configurable, $ PMPM)
// Assumption: $900 PMPM aligns with typical MA/ACA risk adj. base rates
export const BASE_RATE_PMPM = 900;

/**
 * HCC Weights (simplified, illustrative only)
 * Not from actual CMS model. Used for demo math.
 */
export const HCC_WEIGHTS = {
  HCC_18: 0.32,  // Diabetes
  HCC_85: 0.45,  // CHF
  HCC_96: 0.29,  // COPD
  HCC_108: 0.38, // CKD
  HCC_19: 0.14,  // Hypertension
};

/**
 * Suspect HCC mapping: claims pattern → suspected HCC if not coded
 * e.g. High RX spend without Diabetes HCC → suspect Diabetes
 */
export const SUSPECT_RULES = {
  HCC_18: { pattern: 'high_rx_no_diabetes', weight: 0.32 },
  HCC_85: { pattern: 'high_ip_no_chf', weight: 0.45 },
  HCC_96: { pattern: 'respiratory_claims_no_copd', weight: 0.29 },
  HCC_108: { pattern: 'lab_pattern_no_ckd', weight: 0.38 },
  HCC_19: { pattern: 'multiple_rx_no_htn', weight: 0.14 },
};

/**
 * Demographic RAF factors by age band and gender
 * Assumption: Simplified 5 bands; real CMS uses finer lookup.
 * Values illustrative for demo.
 */
const DEMO_RAF_BY_AGE_GENDER = {
  '18-34': { M: 0.35, F: 0.42 },
  '35-44': { M: 0.45, F: 0.52 },
  '45-54': { M: 0.62, F: 0.68 },
  '55-64': { M: 0.88, F: 0.92 },
  '65+': { M: 1.15, F: 1.22 },
};

export function getAgeBand(age) {
  if (age < 35) return '18-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

export function getDemographicRAF(age, gender) {
  const band = getAgeBand(age);
  const row = DEMO_RAF_BY_AGE_GENDER[band];
  return row ? row[gender] ?? 0.5 : 0.5;
}

/**
 * RAF = demographic_factor + Σ(HCC_weights)
 * Normalized to [0.3, 3.0]
 */
export function computeRAF(member, claimsByMember = {}) {
  const ageBand = getAgeBand(member.age);
  const demo = DEMO_RAF_BY_AGE_GENDER[ageBand]?.[member.gender] ?? 0.5;
  const hccSum = (member.hcc_codes || []).reduce((s, code) => s + (HCC_WEIGHTS[code] || 0), 0);
  let raf = demo + hccSum;
  raf = Math.max(0.3, Math.min(3.0, raf));
  return Math.round(raf * 1000) / 1000;
}

/**
 * Suspected HCCs: based on claims patterns when HCC not coded
 */
export function computeSuspectHCCs(member, claimsByMember = {}) {
  const claims = claimsByMember[member.member_id] || [];
  const hasHCC = (code) => (member.hcc_codes || []).includes(code);
  const rxTotal = claims.filter((c) => c.claim_type === 'RX').reduce((s, c) => s + c.allowed_amount, 0);
  const ipTotal = claims.filter((c) => c.claim_type === 'IP').reduce((s, c) => s + c.allowed_amount, 0);
  const rxCount = claims.filter((c) => c.claim_type === 'RX').length;

  const suspects = [];
  if (rxTotal > 2000 && !hasHCC('HCC_18')) suspects.push({ code: 'HCC_18', weight: 0.32, reason: 'High RX spend' });
  if (ipTotal > 15000 && !hasHCC('HCC_85')) suspects.push({ code: 'HCC_85', weight: 0.45, reason: 'High IP utilization' });
  if (rxCount >= 8 && !hasHCC('HCC_19')) suspects.push({ code: 'HCC_19', weight: 0.14, reason: 'Multiple RX scripts' });
  if (member.risk_score > 0.75 && !hasHCC('HCC_108')) suspects.push({ code: 'HCC_108', weight: 0.38, reason: 'Elevated risk score' });
  if (member.chronic_condition_flag && !hasHCC('HCC_96')) suspects.push({ code: 'HCC_96', weight: 0.29, reason: 'Chronic flag, no COPD' });
  return suspects;
}

/**
 * Risk Adjustment Revenue = RAF × Base Rate × Member Months
 */
export function computeRiskAdjRevenue(raf, memberMonths = 12) {
  return raf * BASE_RATE_PMPM * memberMonths;
}
