/**
 * Oscar Health Demo API
 * All metrics computed server-side. Risk adjustment logic in risk-adjustment.js.
 */
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  computeRAF,
  computeSuspectHCCs,
  computeRiskAdjRevenue,
  HCC_WEIGHTS,
  BASE_RATE_PMPM,
  getDemographicRAF,
} from './risk-adjustment.js';
import { runAgent, runAgentBatch } from './risk-adjustment-agent.js';
import { runOrchestrator } from './orchestrator.js';
import { runChatQuery } from './chat-orchestrator.js';
import { buildDataContextSummary, runChatWithLLM } from './chat-llm.js';
import { validateUpload, runUploadAnalysis } from './upload-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Vercel serverless runs with cwd = project root; local runs with server/ as __dirname parent
const DATA_DIR = process.env.VERCEL ? join(process.cwd(), 'data') : join(__dirname, '..', 'data');

function loadData() {
  const dirsToTry = process.env.VERCEL
    ? [join(process.cwd(), 'data'), join(__dirname, '..', 'data')]
    : [DATA_DIR];
  for (const dir of dirsToTry) {
    const membersPath = join(dir, 'members.json');
    const claimsPath = join(dir, 'claims.json');
    if (existsSync(membersPath) && existsSync(claimsPath)) {
      return {
        members: JSON.parse(readFileSync(membersPath, 'utf-8')),
        claims: JSON.parse(readFileSync(claimsPath, 'utf-8')),
      };
    }
  }
  if (process.env.VERCEL) {
    console.warn('Missing data on Vercel. Ensure buildCommand includes: npm run generate-data');
    return { members: [], claims: [] };
  }
  console.error('Missing data files. Run: npm run generate-data');
  process.exit(1);
}

const { members, claims } = loadData();
const claimByMember = {};
claims.forEach((c) => {
  if (!claimByMember[c.member_id]) claimByMember[c.member_id] = [];
  claimByMember[c.member_id].push(c);
});

const memberRAF = {};
const memberSuspects = {};
members.forEach((m) => {
  memberRAF[m.member_id] = computeRAF(m, claimByMember);
  memberSuspects[m.member_id] = computeSuspectHCCs(m, claimByMember);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Vercel: ensure /api prefix so routes match (serverless may pass path without /api)
if (process.env.VERCEL) {
  app.use((req, res, next) => {
    const p = (req.url || '').split('?')[0];
    if (p && !p.startsWith('/api')) {
      try {
        Object.defineProperty(req, 'url', {
          value: '/api' + (p.startsWith('/') ? p : '/' + p) + (req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : ''),
          configurable: true,
        });
      } catch (_) {}
    }
    next();
  });
}

// --- HEALTH (for Vercel / deployment checks) ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, dataLoaded: members.length > 0, members: members.length, claims: claims.length });
});

// --- DASHBOARD ---

function getExecutiveSummary() {
  const results = members.map((m) => {
    const claimsForMember = claimByMember[m.member_id] || [];
    return runOrchestrator(m, claimByMember, claimsForMember);
  });
  const withSuspects = results.filter((r) => r.suspect_hccs.length > 0);
  const totalRafLeakage = withSuspects.reduce((s, r) => s + r.suspect_hccs.reduce((u, h) => u + (h.raf_uplift || 0), 0), 0);
  const revenueAtRisk = withSuspects.reduce((s, r) => s + (r.financial_impact?.estimated_revenue_uplift ?? 0), 0);
  const complianceApproved = results.filter((r) => r.compliance?.compliance_status === 'APPROVED').length;
  const byState = {};
  withSuspects.forEach((r) => {
    const member = members.find((m) => m.member_id === r.member_id);
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
    complianceClearedPct: members.length > 0 ? Math.round((complianceApproved / members.length) * 1000) / 10 : 0,
    top10RiskLeakageStates: top10States,
    membersWithSuspects: withSuspects.length,
  };
}

function getRiskRevenueByPlan(membersList) {
  const byPlan = {};
  membersList.forEach((m) => {
    const plan = m.plan_type || 'Unknown';
    const rev = computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12);
    byPlan[plan] = (byPlan[plan] || 0) + rev;
  });
  return Object.entries(byPlan).map(([plan_type, total]) => ({ plan_type, total: Math.round(total * 100) / 100 }));
}

function getRAFByPlanType(membersList) {
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

function getRAFByState(membersList) {
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
  membersList.forEach((m) => (memberPlan[m.member_id] = m.plan_type));
  claimsList.forEach((c) => {
    const plan = memberPlan[c.member_id] || 'Unknown';
    planCost[plan] = (planCost[plan] || 0) + c.allowed_amount;
  });
  return Object.entries(planCost).map(([plan_type, total]) => ({ plan_type, total: Math.round(total * 100) / 100 }));
}

function getRiskDistribution(membersList) {
  const buckets = { '0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1': 0 };
  membersList.forEach((m) => {
    const r = m.risk_score;
    if (r < 0.2) buckets['0-0.2']++;
    else if (r < 0.4) buckets['0.2-0.4']++;
    else if (r < 0.6) buckets['0.4-0.6']++;
    else if (r < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1']++;
  });
  return Object.entries(buckets).map(([range, count]) => ({ range, count }));
}

app.get('/api/dashboard', (req, res) => {
  const totalMembers = members.length;
  const activeClaims = claims.filter(
    (c) => new Date(c.service_date) >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  ).length;
  const totalAllowed = claims.reduce((s, c) => s + c.allowed_amount, 0);
  const totalPremium = totalMembers * 15000;
  const rawMLR = totalPremium > 0 ? totalAllowed / totalPremium : 0;
  const highRiskThreshold = 0.7;
  const highRiskCount = members.filter((m) => m.risk_score >= highRiskThreshold).length;
  const avgCostPerMember = totalMembers > 0 ? totalAllowed / totalMembers : 0;
  const rafValues = members.map((m) => memberRAF[m.member_id] ?? 0.5);
  const avgRAF = rafValues.reduce((a, b) => a + b, 0) / totalMembers;
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
  const agentResults = runAgentBatch(members, claimByMember, members.length);
  const agentSuspectCount = agentResults.reduce((s, r) => s + r.suspect_hccs.length, 0);
  let agentRafUplift = 0;
  let agentRevenueUplift = 0;
  agentResults.forEach((r) => {
    r.suspect_hccs.forEach((h) => {
      agentRafUplift += h.raf_uplift;
      agentRevenueUplift += h.revenue_uplift_estimate;
    });
  });
  const adjustedPremium = totalPremium + totalRiskAdjRevenue;
  const riskAdjustedMLR = adjustedPremium > 0 ? totalAllowed / adjustedPremium : rawMLR;
  const mlrImprovementBps = Math.round((riskAdjustedMLR - rawMLR) * 10000);

  res.json({
    kpis: {
      totalMembers,
      activeClaims,
      mlr: Math.round(rawMLR * 1000) / 1000,
      highRiskPct: ((highRiskCount / totalMembers) * 100).toFixed(1),
      avgCostPerMember: Math.round(avgCostPerMember * 100) / 100,
      avgRAF: Math.round(avgRAF * 1000) / 1000,
      highRAFPct: ((highRAFCount / totalMembers) * 100).toFixed(1),
      riskAdjRevenue: Math.round(totalRiskAdjRevenue * 100) / 100,
      suspectRAFUplift: Math.round(totalSuspectUplift * 100) / 100,
      suspectHCCCount,
      agentSuspectHCCCount: agentSuspectCount,
      agentPotentialRafUplift: Math.round(agentRafUplift * 1000) / 1000,
      agentPotentialRevenueUplift: Math.round(agentRevenueUplift * 100) / 100,
      riskAdjustedMLR: Math.round(riskAdjustedMLR * 1000) / 1000,
      mlrImprovementBps,
    },
    claimsOverTime: getClaimsOverTime(claims),
    costByPlanType: getCostByPlanType(members, claims),
    riskDistribution: getRiskDistribution(members),
    rafByPlanType: getRAFByPlanType(members),
    rafByState: getRAFByState(members),
    riskRevenueByPlan: getRiskRevenueByPlan(members),
    executive: getExecutiveSummary(),
  });
});

// --- MEMBER EXPLORER ---

app.get('/api/members', (req, res) => {
  let result = [...members];
  const { state, plan_type, risk_min, risk_max, chronic } = req.query;
  if (state) result = result.filter((m) => m.state === state);
  if (plan_type) result = result.filter((m) => m.plan_type === plan_type);
  if (risk_min != null) result = result.filter((m) => m.risk_score >= parseFloat(risk_min));
  if (risk_max != null) result = result.filter((m) => m.risk_score <= parseFloat(risk_max));
  if (chronic === 'true') result = result.filter((m) => m.chronic_condition_flag === true);
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const start = (page - 1) * limit;
  const paginated = result.slice(start, start + limit);
  res.json({ members: paginated, total: result.length, page, limit });
});

app.get('/api/members/:id', (req, res) => {
  if (process.env.VERCEL && members.length === 0) {
    return res.status(503).json({ error: 'Data not loaded', code: 'DATA_NOT_LOADED' });
  }
  const member = members.find((m) => m.member_id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const memberClaims = (claimByMember[member.member_id] || [])
    .sort((a, b) => new Date(b.service_date) - new Date(a.service_date))
    .slice(0, 20);
  const totalCost = memberClaims.reduce((s, c) => s + c.allowed_amount, 0);
  const raf = memberRAF[member.member_id] ?? computeRAF(member, claimByMember);
  const demographicRAF = getDemographicRAF(member.age, member.gender);
  const hccRAF = (member.hcc_codes || []).reduce((s, code) => s + (HCC_WEIGHTS[code] || 0), 0);
  const hccList = (member.hcc_codes || []).map((code) => ({ code, weight: HCC_WEIGHTS[code] || 0 }));
  const suspects = memberSuspects[member.member_id] || [];
  const memberMonths = member.member_months || 12;
  const riskAdjRevenueMember = computeRiskAdjRevenue(raf, memberMonths);
  const agentOutput = runAgent(member, claimByMember);
  const allMemberClaims = claimByMember[member.member_id] || [];
  const orchestrated = runOrchestrator(member, claimByMember, allMemberClaims);

  res.json({
    ...member,
    recent_claims: memberClaims,
    total_claim_cost: Math.round(totalCost * 100) / 100,
    raf,
    rafBreakdown: { demographic: demographicRAF, hcc: hccRAF, total: raf },
    hccList,
    suspectedHCCs: suspects,
    agent_output: agentOutput,
    orchestrated_output: orchestrated,
    risk_adj_revenue: Math.round(riskAdjRevenueMember * 100) / 100,
  });
});

app.get('/api/orchestrator/member/:id', (req, res) => {
  const member = members.find((m) => m.member_id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const memberClaims = claimByMember[member.member_id] || [];
  const output = runOrchestrator(member, claimByMember, memberClaims);
  res.json(output);
});

app.get('/api/orchestrator/summary', (req, res) => {
  const results = members.map((m) => {
    const claimsForMember = claimByMember[m.member_id] || [];
    return runOrchestrator(m, claimByMember, claimsForMember);
  });
  const withSuspects = results.filter((r) => r.suspect_hccs.length > 0);
  const totalRafLeakage = withSuspects.reduce((s, r) => s + r.suspect_hccs.reduce((u, h) => u + (h.raf_uplift || 0), 0), 0);
  const revenueAtRisk = withSuspects.reduce((s, r) => s + (r.financial_impact?.estimated_revenue_uplift ?? 0), 0);
  const complianceApproved = results.filter((r) => r.compliance?.compliance_status === 'APPROVED').length;
  const complianceClearedPct = results.length > 0 ? (complianceApproved / results.length) * 100 : 0;
  const byState = {};
  withSuspects.forEach((r) => {
    const member = members.find((m) => m.member_id === r.member_id);
    const state = member?.state || 'Unknown';
    const rev = r.financial_impact?.estimated_revenue_uplift ?? 0;
    byState[state] = (byState[state] || 0) + rev;
  });
  const top10States = Object.entries(byState)
    .map(([state, rev]) => ({ state, revenue_at_risk: Math.round(rev * 100) / 100 }))
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)
    .slice(0, 10);
  res.json({
    totalSuspectRafLeakage: Math.round(totalRafLeakage * 1000) / 1000,
    revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
    complianceClearedPct: Math.round(complianceClearedPct * 10) / 10,
    top10RiskLeakageStates: top10States,
    membersWithSuspects: withSuspects.length,
  });
});

// --- CLAIMS ---

app.get('/api/claims', (req, res) => {
  let result = [...claims];
  const { date_from, date_to, claim_type, cost_min, state } = req.query;
  if (date_from) result = result.filter((c) => c.service_date >= date_from);
  if (date_to) result = result.filter((c) => c.service_date <= date_to);
  if (claim_type) result = result.filter((c) => c.claim_type === claim_type);
  if (cost_min != null) result = result.filter((c) => c.allowed_amount >= parseFloat(cost_min));
  if (state) {
    const memberIds = new Set(members.filter((m) => m.state === state).map((m) => m.member_id));
    result = result.filter((c) => memberIds.has(c.member_id));
  }
  const totalAllowed = result.reduce((s, c) => s + c.allowed_amount, 0);
  const memberCount = new Set(result.map((c) => c.member_id)).size;
  const pmpm = memberCount > 0 ? totalAllowed / memberCount : 0;
  const amounts = result.map((c) => c.allowed_amount).sort((a, b) => a - b);
  const p95 = amounts.length > 0 ? amounts[Math.floor(amounts.length * 0.95)] : 0;
  const outliers = result.filter((c) => c.allowed_amount >= p95);
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const start = (page - 1) * limit;
  const paginated = result.slice(start, start + limit);
  res.json({
    claims: paginated,
    total: result.length,
    page,
    limit,
    metrics: {
      totalAllowed: Math.round(totalAllowed * 100) / 100,
      pmpm: Math.round(pmpm * 100) / 100,
      outlierCount: outliers.length,
      p95Threshold: Math.round(p95 * 100) / 100,
    },
  });
});

// --- AGENT ---

app.get('/api/agent/member/:id', (req, res) => {
  const member = members.find((m) => m.member_id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const output = runAgent(member, claimByMember);
  res.json(output);
});

app.get('/api/agent/batch', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
  const sortBy = req.query.sort || 'risk';
  let results = runAgentBatch(members, claimByMember, limit);
  if (sortBy === 'leakage') {
    results = results
      .map((r) => ({ ...r, leakage_risk: r.suspect_hccs.reduce((s, h) => s + h.revenue_uplift_estimate, 0) }))
      .sort((a, b) => b.leakage_risk - a.leakage_risk);
  }
  res.json({ results, count: results.length });
});

app.get('/api/agent/summary', (req, res) => {
  const results = runAgentBatch(members, claimByMember, members.length);
  const totalSuspectHCCs = results.reduce((s, r) => s + r.suspect_hccs.length, 0);
  let potentialRafUplift = 0;
  let potentialRevenueUplift = 0;
  results.forEach((r) => {
    r.suspect_hccs.forEach((h) => {
      potentialRafUplift += h.raf_uplift;
      potentialRevenueUplift += h.revenue_uplift_estimate;
    });
  });
  const byLeakage = [...results]
    .map((r) => ({
      member_id: r.member_id,
      leakage_risk: r.suspect_hccs.reduce((s, h) => s + h.revenue_uplift_estimate, 0),
      suspect_count: r.suspect_hccs.length,
    }))
    .filter((r) => r.leakage_risk > 0)
    .sort((a, b) => b.leakage_risk - a.leakage_risk)
    .slice(0, 20);
  res.json({
    totalSuspectHCCs,
    potentialRafUplift: Math.round(potentialRafUplift * 1000) / 1000,
    potentialRevenueUplift: Math.round(potentialRevenueUplift * 100) / 100,
    membersWithSuspects: results.filter((r) => r.suspect_hccs.length > 0).length,
    topLeakageRisk: byLeakage,
  });
});

// --- UPLOAD & ANALYZE ---

app.post('/api/upload/analyze', (req, res) => {
  const { members: rawMembers, claims: rawClaims } = req.body || {};
  const uploadMembers = Array.isArray(rawMembers) ? rawMembers : [];
  const uploadClaims = Array.isArray(rawClaims) ? rawClaims : [];
  const validation = validateUpload(uploadMembers, uploadClaims);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid upload', details: validation.errors });
  }
  try {
    const result = runUploadAnalysis(uploadMembers, uploadClaims);
    res.json(result);
  } catch (err) {
    console.error('Upload analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
});

// --- CHAT ---

app.post('/api/chat/query', async (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing question' });
  }
  const runSim = (body) => {
    const { close_suspect_pct = 0 } = body || {};
    const agentResults = runAgentBatch(members, claimByMember, members.length);
    let uplift = 0;
    agentResults.forEach((r) => {
      r.suspect_hccs.forEach((h) => {
        uplift += (h.revenue_uplift_estimate || 0) * (close_suspect_pct / 100);
      });
    });
    const totalPremium = members.length * 15000;
    const totalAllowed = claims.reduce((s, c) => s + c.allowed_amount, 0);
    const baseRev = members.reduce((s, m) => s + computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12), 0);
    const newRev = baseRev + uplift;
    return {
      total_risk_revenue: newRev,
      risk_adjusted_mlr: totalAllowed / (totalPremium + newRev),
      mlr_improvement_bps: Math.round((totalAllowed / (totalPremium + baseRev) - totalAllowed / (totalPremium + newRev)) * 10000),
    };
  };
  const structuredResponse = runChatQuery(question, members, claimByMember, memberRAF, runSim);
  const dataSummary = buildDataContextSummary(members, claims, claimByMember, memberRAF);

  if (process.env.OPENAI_API_KEY) {
    try {
      const llmResponse = await runChatWithLLM(question, dataSummary, structuredResponse);
      return res.json({
        ...structuredResponse,
        shortAnswer: llmResponse.shortAnswer,
        evidence: llmResponse.evidence,
        whyItMatters: llmResponse.whyItMatters,
        recommendedAction: llmResponse.recommendedAction,
        followUpSuggestions: llmResponse.followUpSuggestions.length ? llmResponse.followUpSuggestions : structuredResponse.followUpSuggestions,
      });
    } catch (err) {
      console.error('Chat LLM error:', err.message);
      // Fall through to structured-only response
    }
  }
  res.json(structuredResponse);
});

// --- RISK EXPLORER ---

app.get('/api/risk-explorer', (req, res) => {
  let result = members.map((m) => ({
    ...m,
    raf: memberRAF[m.member_id] ?? 0.5,
    suspectCount: (memberSuspects[m.member_id] || []).length,
    riskAdjRevenue: computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12),
  }));
  const { state, plan_type, raf_min, raf_max, hcc } = req.query;
  if (state) result = result.filter((m) => m.state === state);
  if (plan_type) result = result.filter((m) => m.plan_type === plan_type);
  if (raf_min != null) result = result.filter((m) => m.raf >= parseFloat(raf_min));
  if (raf_max != null) result = result.filter((m) => m.raf <= parseFloat(raf_max));
  if (hcc) result = result.filter((m) => (m.hcc_codes || []).includes(hcc));
  const rafBuckets = { '0.3-0.6': 0, '0.6-0.9': 0, '0.9-1.2': 0, '1.2-1.5': 0, '1.5-3.0': 0 };
  result.forEach((m) => {
    const r = m.raf;
    if (r < 0.6) rafBuckets['0.3-0.6']++;
    else if (r < 0.9) rafBuckets['0.6-0.9']++;
    else if (r < 1.2) rafBuckets['0.9-1.2']++;
    else if (r < 1.5) rafBuckets['1.2-1.5']++;
    else rafBuckets['1.5-3.0']++;
  });
  const hccPrevalence = {};
  ['HCC_18', 'HCC_85', 'HCC_96', 'HCC_108', 'HCC_19'].forEach((code) => {
    hccPrevalence[code] = result.filter((m) => (m.hcc_codes || []).includes(code)).length;
  });
  const sortedByRAF = [...result].sort((a, b) => b.raf - a.raf);
  const top10PctCount = Math.ceil(result.length * 0.1);
  const top10PctRevenue = sortedByRAF.slice(0, top10PctCount).reduce((s, m) => s + m.riskAdjRevenue, 0);
  const totalRevenue = result.reduce((s, m) => s + m.riskAdjRevenue, 0);
  const revenueConcentrationCurve = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((pct) => {
    const n = Math.ceil((result.length * pct) / 100);
    const cumRev = sortedByRAF.slice(0, n).reduce((s, m) => s + m.riskAdjRevenue, 0);
    return { percentile: `Top ${pct}%`, pct, cumulativeRevenue: Math.round(cumRev * 100) / 100 };
  });
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const start = (page - 1) * limit;
  const paginated = result.slice(start, start + limit);
  res.json({
    members: paginated,
    total: result.length,
    page,
    limit,
    rafDistribution: Object.entries(rafBuckets).map(([range, count]) => ({ range, count })),
    hccPrevalence: Object.entries(hccPrevalence).map(([hcc_code, count]) => ({ hcc_code, count })),
    top10PctRevenue: Math.round(top10PctRevenue * 100) / 100,
    totalRiskRevenue: Math.round(totalRevenue * 100) / 100,
    top10PctShare: totalRevenue > 0 ? ((top10PctRevenue / totalRevenue) * 100).toFixed(1) : 0,
    revenueConcentrationCurve,
  });
});

// --- SIMULATION ---

app.post('/api/simulation', (req, res) => {
  const {
    risk_threshold = 0.7,
    bronze_pct = 0.4,
    silver_pct = 0.35,
    gold_pct = 0.25,
    close_suspect_pct = 0,
    coding_improvement_pct = 0,
  } = req.body || {};
  const total = bronze_pct + silver_pct + gold_pct;
  const b = bronze_pct / total;
  const s = silver_pct / total;
  const g = gold_pct / total;
  const baseCostByPlan = { Bronze: 1, Silver: 1.4, Gold: 2 };
  let projectedCost = 0;
  let highRiskCount = 0;
  members.forEach((m) => {
    highRiskCount += m.risk_score >= risk_threshold ? 1 : 0;
    const planCost = baseCostByPlan[m.plan_type] || 1;
    const riskMultiplier = m.risk_score >= risk_threshold ? 2 : 1;
    projectedCost += 1200 * planCost * riskMultiplier * (0.9 + m.risk_score * 0.2);
  });
  const baseAvgRAF = members.reduce((s, m) => s + (memberRAF[m.member_id] ?? 0.5), 0) / members.length;
  let simulatedRiskRevenue = members.reduce(
    (s, m) => s + computeRiskAdjRevenue(memberRAF[m.member_id] ?? 0.5, m.member_months || 12),
    0
  );
  if (close_suspect_pct > 0 || coding_improvement_pct > 0) {
    const upliftPerMember = members.reduce((s, m) => {
      const suspects = memberSuspects[m.member_id] || [];
      const uplift = suspects.reduce((u, x) => u + x.weight, 0);
      const closedUplift = uplift * (close_suspect_pct / 100);
      const codingUplift = (m.hcc_codes || []).length > 0 ? 0.05 * (coding_improvement_pct / 100) : 0;
      return s + (closedUplift + codingUplift) * BASE_RATE_PMPM * (m.member_months || 12);
    }, 0);
    simulatedRiskRevenue += upliftPerMember;
  }
  const totalPremium = members.length * 15000;
  const expectedMLR = totalPremium > 0 ? projectedCost / totalPremium : 0.82;
  const adjustedMLR =
    totalPremium + simulatedRiskRevenue > 0
      ? projectedCost / (totalPremium + simulatedRiskRevenue)
      : expectedMLR;
  res.json({
    risk_threshold,
    high_risk_count: highRiskCount,
    high_risk_pct: ((highRiskCount / members.length) * 100).toFixed(1),
    expected_mlr: Math.min(0.95, Math.round(expectedMLR * 1000) / 1000),
    total_projected_cost: Math.round(projectedCost * 100) / 100,
    plan_mix: { bronze: b, silver: s, gold: g },
    avgRAF: Math.round(baseAvgRAF * 1000) / 1000,
    total_risk_revenue: Math.round(simulatedRiskRevenue * 100) / 100,
    risk_adjusted_mlr: Math.round(Math.min(0.95, adjustedMLR) * 1000) / 1000,
    mlr_improvement_bps: Math.round((adjustedMLR - expectedMLR) * 10000),
    close_suspect_pct,
    coding_improvement_pct,
  });
});

// --- STATIC & CATCH-ALL ---

const PORT = process.env.PORT || 3001;
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(join(distPath, 'index.html'));
  });
}

// On Vercel, export app for serverless; do not listen.
if (typeof process.env.VERCEL === 'undefined' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Oscar Health Demo running at http://localhost:${PORT}`);
  });
}

export default app;
