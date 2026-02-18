/**
 * Orchestrator Agent
 * Coordinates Risk, Finance, and Compliance agents.
 * Synthesizes final output for UI.
 */

import { runAgent } from './risk-adjustment-agent.js';
import { runFinanceAgent } from './finance-impact-agent.js';
import { runComplianceAgent } from './compliance-agent.js';
import { computeRAF } from './risk-adjustment.js';

/**
 * Normalize Risk Agent output to use "hcc" (per spec)
 */
function normalizeSuspectHCCs(suspect_hccs) {
  return (suspect_hccs || []).map((h) => ({
    hcc: h.hcc_code || h.hcc,
    condition: h.condition,
    confidence: h.confidence,
    evidence: h.evidence,
    raf_uplift: h.raf_uplift,
    revenue_uplift_estimate: h.revenue_uplift_estimate,
  }));
}

/**
 * Main orchestration: Risk → Finance (if suspects) → Compliance → synthesize
 */
export function runOrchestrator(member, claimsByMember = {}, claims = []) {
  const riskOutput = runAgent(member, claimsByMember);

  let financeOutput = null;
  if (riskOutput.suspect_hccs.length > 0) {
    const currentRaf = computeRAF(member, claimsByMember);
    const claimsCost = claims.reduce((s, c) => s + c.allowed_amount, 0);
    financeOutput = runFinanceAgent(riskOutput, {
      plan_type: member.plan_type,
      member_months: member.member_months || 12,
      claims_cost: claimsCost,
      premium: 15000,
      current_raf: currentRaf,
    });
  }

  const complianceOutput = runComplianceAgent(riskOutput, financeOutput || {});

  if (complianceOutput.compliance_status === 'REVIEW_REQUIRED' && riskOutput.suspect_hccs.length > 0) {
    riskOutput.suspect_hccs = riskOutput.suspect_hccs.map((h) => ({
      ...h,
      confidence: Math.min(h.confidence, 0.85),
    }));
  }

  let executive_summary = null;
  if (riskOutput.suspect_hccs.length > 0 && financeOutput) {
    const revenue = financeOutput.financial_impact.estimated_revenue_uplift;
    executive_summary = `Member shows high likelihood of undocumented chronic condition with material revenue impact (est. $${revenue.toLocaleString()} uplift). Recommend coding review.`;
  } else if (riskOutput.overall_commentary) {
    executive_summary = riskOutput.overall_commentary;
  }

  return {
    member_id: member.member_id,
    suspect_hccs: normalizeSuspectHCCs(riskOutput.suspect_hccs),
    financial_impact: financeOutput?.financial_impact ?? null,
    compliance: complianceOutput,
    executive_summary,
  };
}
