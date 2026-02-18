/**
 * Finance Impact Agent
 * Translates risk findings into financial impact for payer leadership.
 *
 * Inputs: Risk Agent output, plan mix, base rate, member months, claims cost
 * Core: Revenue Uplift = RAF × Base Rate × Member Months
 *       Adjusted MLR = Claims / (Premium + Risk Revenue)
 */

import { BASE_RATE_PMPM } from './risk-adjustment.js';

const PLAN_IMPACT_THRESHOLDS = {
  High: 5000,
  Medium: 2000,
  Low: 0,
};

/**
 * Compute financial impact from Risk Agent output
 */
export function runFinanceAgent(riskOutput, context = {}) {
  const {
    plan_type = 'Silver',
    member_months = 12,
    claims_cost = 0,
    premium = 15000,
    current_raf = 1.0,
  } = context;

  const baseRate = context.base_rate ?? BASE_RATE_PMPM;

  const totalRafUplift = (riskOutput.suspect_hccs || []).reduce((s, h) => s + (h.raf_uplift || 0), 0);
  const estimated_revenue_uplift = (riskOutput.suspect_hccs || []).reduce(
    (s, h) => s + (h.revenue_uplift_estimate || h.raf_uplift * baseRate * member_months),
    0
  );

  const adjustedPremium = premium + estimated_revenue_uplift;
  const rawMLR = premium > 0 ? claims_cost / premium : 0;
  const adjustedMLR = adjustedPremium > 0 ? claims_cost / adjustedPremium : rawMLR;
  const mlr_improvement_bps = Math.round((adjustedMLR - rawMLR) * 10000);

  let plan_level_impact = 'Low';
  if (estimated_revenue_uplift >= PLAN_IMPACT_THRESHOLDS.High) plan_level_impact = 'High';
  else if (estimated_revenue_uplift >= PLAN_IMPACT_THRESHOLDS.Medium) plan_level_impact = 'Medium';

  return {
    member_id: riskOutput.member_id,
    financial_impact: {
      estimated_revenue_uplift: Math.round(estimated_revenue_uplift * 100) / 100,
      total_raf_uplift: Math.round(totalRafUplift * 1000) / 1000,
      mlr_improvement_bps,
      adjusted_mlr: Math.round(adjustedMLR * 1000) / 1000,
      raw_mlr: Math.round(rawMLR * 1000) / 1000,
      plan_level_impact,
    },
  };
}
