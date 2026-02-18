/**
 * Runs dashboard-style analysis on uploaded members + claims.
 * Same calculations as main app; no persistence.
 */

import {
  computeRAF,
  computeSuspectHCCs,
  computeRiskAdjRevenue,
  BASE_RATE_PMPM,
} from './risk-adjustment.js';
import { runAgentBatch } from './risk-adjustment-agent.js';
import { runOrchestrator } from './orchestrator.js';

function buildClaimByMember(claims) {
  const out = {};
  claims.forEach((c) => {
    if (!out[c.member_id]) out[c.member_id] = [];
    out[c.member_id].push(c);
  });
  return out;
}

function getClaimsOverTime(claimsList) {
  const byMonth = {};
  claimsList.forEach((c) => {
    const m = (c.service_date || '').toString().slice(0, 7);
    if (m.length === 7) byMonth[m] = (byMonth[m] || 0) + 1;
  });
  return Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
}

function getCostByPlanType(membersList, claimsList) {
  const planCost = {};
  const memberPlan = {};
  membersList.forEach((m) => (memberPlan[m.member_id] = m.plan_type || 'Unknown'));
  claimsList.forEach((c) => {
    const plan = memberPlan[c.member_id] || 'Unknown';
    planCost[plan] = (planCost[plan] || 0) + (c.allowed_amount || 0);
  });
  return Object.entries(planCost).map(([plan_type, total]) => ({
    plan_type,
    total: Math.round(total * 100) / 100,
  }));
}

function getRiskDistribution(membersList) {
  const buckets = { '0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1': 0 };
  membersList.forEach((m) => {
    const r = Number(m.risk_score);
    if (r < 0.2) buckets['0-0.2']++;
    else if (r < 0.4) buckets['0.2-0.4']++;
    else if (r < 0.6) buckets['0.4-0.6']++;
    else if (r < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1']++;
  });
  return Object.entries(buckets).map(([range, count]) => ({ range, count }));
}

function getRAFByPlanType(membersList, memberRAF) {
  const byPlan = {};
  membersList.forEach((m) => {
    const plan = m.plan_type || 'Unknown';
    if (!byPlan[plan]) byPlan[plan] = { sum: 0, count: 0 };
    byPlan[plan].sum += memberRAF[m.member_id] ?? 0.5;
    byPlan[plan].count += 1;
  });
  return Object.entries(byPlan).map(([plan_type, { sum, count }]) => ({
    plan_type,
    avgRAF: Math.round((sum / count) * 1000) / 1000,
    count,
  }));
}

function getRAFByState(membersList, memberRAF) {
  const byState = {};
  membersList.forEach((m) => {
    const state = m.state || 'Unknown';
    if (!byState[state]) byState[state] = { sum: 0, count: 0 };
    byState[state].sum += memberRAF[m.member_id] ?? 0.5;
    byState[state].count += 1;
  });
  return Object.entries(byState)
    .map(([state, { sum, count }]) => ({ state, avgRAF: Math.round((sum / count) * 1000) / 1000, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getRiskRevenueByPlan(membersList, memberRAF) {
  const byPlan = {};
  membersList.forEach((m) => {
    const plan = m.plan_type || 'Unknown';
    const rev = computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12);
    byPlan[plan] = (byPlan[plan] || 0) + rev;
  });
  return Object.entries(byPlan).map(([plan_type, total]) => ({
    plan_type,
    total: Math.round(total * 100) / 100,
  }));
}

function getExecutiveSummary(membersList, claimByMember) {
  const results = membersList.map((m) => {
    const claimsForMember = claimByMember[m.member_id] || [];
    return runOrchestrator(m, claimByMember, claimsForMember);
  });
  const withSuspects = results.filter((r) => r.suspect_hccs.length > 0);
  const totalRafLeakage = withSuspects.reduce(
    (s, r) => s + r.suspect_hccs.reduce((u, h) => u + (h.raf_uplift || 0), 0),
    0
  );
  const revenueAtRisk = withSuspects.reduce(
    (s, r) => s + (r.financial_impact?.estimated_revenue_uplift ?? 0),
    0
  );
  const complianceApproved = results.filter((r) => r.compliance?.compliance_status === 'APPROVED').length;
  const byState = {};
  withSuspects.forEach((r) => {
    const member = membersList.find((m) => m.member_id === r.member_id);
    const state = member?.state || 'Unknown';
    const rev = r.financial_impact?.estimated_revenue_uplift ?? 0;
    byState[state] = (byState[state] || 0) + rev;
  });
  const top10States = Object.entries(byState)
    .map(([state, rev]) => ({ state, revenue_at_risk: Math.round(rev * 100) / 100 }))
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)
    .slice(0, 10);
  return {
    totalSuspectRafLeakage: Math.round(totalRafLeakage * 1000) / 1000,
    revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
    complianceClearedPct: membersList.length > 0 ? Math.round((complianceApproved / membersList.length) * 1000) / 10 : 0,
    top10RiskLeakageStates: top10States,
    membersWithSuspects: withSuspects.length,
  };
}

export function validateUpload(members, claims) {
  const errors = [];
  if (!Array.isArray(members)) errors.push('members must be an array');
  if (!Array.isArray(claims)) errors.push('claims must be an array');
  if (errors.length) return { valid: false, errors };

  const requiredMember = ['member_id', 'age', 'gender', 'state', 'plan_type', 'risk_score'];
  const requiredClaim = ['claim_id', 'member_id', 'service_date', 'claim_type', 'allowed_amount'];
  const sampleMember = members[0];
  const sampleClaim = claims[0];

  if (members.length === 0) errors.push('members array is empty');
  else {
    for (const key of requiredMember) {
      if (sampleMember[key] === undefined) errors.push(`members[].${key} is required`);
    }
  }
  if (claims.length === 0) errors.push('claims array is empty');
  else {
    for (const key of requiredClaim) {
      if (sampleClaim[key] === undefined) errors.push(`claims[].${key} is required`);
    }
  }

  const memberIds = new Set((members || []).map((m) => m.member_id));
  const orphanCount = (claims || []).filter((c) => !memberIds.has(c.member_id)).length;
  const warnings = orphanCount > 0 ? [`${orphanCount} claim(s) reference member_id not in members (ignored for analysis)`] : [];

  return { valid: errors.length === 0, errors, warnings };
}

export function runUploadAnalysis(members, claims) {
  const memberIds = new Set(members.map((m) => m.member_id));
  const claimsForAnalysis = claims.filter((c) => memberIds.has(c.member_id));
  const claimByMember = buildClaimByMember(claimsForAnalysis);
  const memberRAF = {};
  const memberSuspects = {};
  members.forEach((m) => {
    memberRAF[m.member_id] = computeRAF(m, claimByMember);
    memberSuspects[m.member_id] = computeSuspectHCCs(m, claimByMember);
  });

  const totalMembers = members.length;
  const totalAllowed = claimsForAnalysis.reduce((s, c) => s + (c.allowed_amount || 0), 0);
  const totalPremium = totalMembers * 15000;
  const rawMLR = totalPremium > 0 ? totalAllowed / totalPremium : 0;
  const highRiskThreshold = 0.7;
  const highRiskCount = members.filter((m) => Number(m.risk_score) >= highRiskThreshold).length;
  const avgCostPerMember = totalMembers > 0 ? totalAllowed / totalMembers : 0;
  const activeClaims = claimsForAnalysis.filter(
    (c) => new Date(c.service_date) >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  ).length;

  const rafValues = members.map((m) => memberRAF[m.member_id] ?? 0.5);
  const avgRAF = rafValues.length > 0 ? rafValues.reduce((a, b) => a + b, 0) / totalMembers : 0;
  const highRAFCount = members.filter((m) => (memberRAF[m.member_id] ?? 0) > 1.2).length;
  const totalRiskAdjRevenue = members.reduce(
    (s, m) => s + computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12),
    0
  );
  const totalSuspectUplift = members.reduce((s, m) => {
    const suspects = memberSuspects[m.member_id] || [];
    const uplift = suspects.reduce((u, x) => u + x.weight, 0);
    return s + uplift * BASE_RATE_PMPM * (m.member_months || 12);
  }, 0);
  const suspectHCCCount = members.reduce((s, m) => s + (memberSuspects[m.member_id] || []).length, 0);

  const agentResults = runAgentBatch(members, claimByMember, Math.min(members.length, 2000));
  let agentSuspectCount = 0;
  let agentRafUplift = 0;
  let agentRevenueUplift = 0;
  agentResults.forEach((r) => {
    agentSuspectCount += r.suspect_hccs.length;
    r.suspect_hccs.forEach((h) => {
      agentRafUplift += h.raf_uplift;
      agentRevenueUplift += h.revenue_uplift_estimate;
    });
  });

  const adjustedPremium = totalPremium + totalRiskAdjRevenue;
  const riskAdjustedMLR = adjustedPremium > 0 ? totalAllowed / adjustedPremium : rawMLR;
  const mlrImprovementBps = Math.round((riskAdjustedMLR - rawMLR) * 10000);

  const executive = getExecutiveSummary(members, claimByMember);

  const claimsOverTime = getClaimsOverTime(claimsForAnalysis);
  const costByPlanType = getCostByPlanType(members, claimsForAnalysis);

  return {
    kpis: {
      totalMembers,
      activeClaims,
      mlr: Math.round(rawMLR * 1000) / 1000,
      highRiskPct: totalMembers > 0 ? ((highRiskCount / totalMembers) * 100).toFixed(1) : '0',
      avgCostPerMember: Math.round(avgCostPerMember * 100) / 100,
      avgRAF: Math.round(avgRAF * 1000) / 1000,
      highRAFPct: totalMembers > 0 ? ((highRAFCount / totalMembers) * 100).toFixed(1) : '0',
      riskAdjRevenue: Math.round(totalRiskAdjRevenue * 100) / 100,
      suspectRAFUplift: Math.round(totalSuspectUplift * 100) / 100,
      suspectHCCCount,
      agentSuspectHCCCount: agentSuspectCount,
      agentPotentialRafUplift: Math.round(agentRafUplift * 1000) / 1000,
      agentPotentialRevenueUplift: Math.round(agentRevenueUplift * 100) / 100,
      riskAdjustedMLR: Math.round(riskAdjustedMLR * 1000) / 1000,
      mlrImprovementBps,
    },
    claimsOverTime,
    costByPlanType,
    riskDistribution: getRiskDistribution(members),
    rafByPlanType: getRAFByPlanType(members, memberRAF),
    rafByState: getRAFByState(members, memberRAF),
    riskRevenueByPlan: getRiskRevenueByPlan(members, memberRAF),
    executive,
  };
}
