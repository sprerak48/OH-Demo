/**
 * API client for Health Insights backend.
 * In dev: uses /api (Vite proxy). In production: same origin /api (Vercel serverless) or VITE_API_URL if set.
 */
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

export interface HealthResponse {
  ok: boolean;
  dataLoaded: boolean;
  members: number;
  claims: number;
  llmEnabled?: boolean;
}

export const getHealth = () => fetchApi<HealthResponse>('/health');

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface DashboardData {
  kpis: {
    totalMembers: number;
    activeClaims: number;
    mlr: number;
    highRiskPct: string;
    avgCostPerMember: number;
    avgRAF?: number;
    highRAFPct?: string;
    riskAdjRevenue?: number;
    suspectRAFUplift?: number;
    suspectHCCCount?: number;
    agentSuspectHCCCount?: number;
    agentPotentialRafUplift?: number;
    agentPotentialRevenueUplift?: number;
    riskAdjustedMLR?: number;
    mlrImprovementBps?: number;
  };
  claimsOverTime: { month: string; count: number }[];
  costByPlanType: { plan_type: string; total: number }[];
  riskDistribution: { range: string; count: number }[];
  rafByPlanType?: { plan_type: string; avgRAF: number; count: number }[];
  rafByState?: { state: string; avgRAF: number; count: number }[];
  riskRevenueByPlan?: { plan_type: string; total: number }[];
  executive?: {
    totalSuspectRafLeakage: number;
    revenueAtRisk: number;
    complianceClearedPct: number;
    top10RiskLeakageStates: { state: string; revenue_at_risk: number }[];
    membersWithSuspects: number;
  };
}

export const getDashboard = () => fetchApi<DashboardData>('/dashboard');

export interface Member {
  member_id: string;
  age: number;
  gender: string;
  state: string;
  plan_type: string;
  risk_score: number;
  chronic_condition_flag: boolean;
  hcc_codes?: string[];
  member_months?: number;
}

export interface OrchestratedOutput {
  member_id: string;
  suspect_hccs: { hcc: string; condition: string; confidence: number; evidence: string[]; raf_uplift: number; revenue_uplift_estimate?: number }[];
  financial_impact: {
    estimated_revenue_uplift: number;
    mlr_improvement_bps: number;
    plan_level_impact: string;
    total_raf_uplift?: number;
    adjusted_mlr?: number;
    raw_mlr?: number;
  } | null;
  compliance: { compliance_status: string; notes: string[]; risk_level: string };
  executive_summary: string | null;
}

export const getMembers = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && v !== '' && q.set(k, String(v)));
  return fetchApi<{ members: Member[]; total: number; page: number; limit: number }>(`/members?${q}`);
};

export const getMember = (id: string) =>
  fetchApi<
    Member & {
      recent_claims: Claim[];
      total_claim_cost: number;
      raf?: number;
      rafBreakdown?: { demographic: number; hcc: number; total: number };
      hccList?: { code: string; weight: number }[];
      suspectedHCCs?: { code: string; weight: number; reason: string }[];
      agent_output?: unknown;
      orchestrated_output?: OrchestratedOutput;
      risk_adj_revenue?: number;
    }
  >(`/members/${encodeURIComponent(id)}`);

export const getOrchestratorMember = (id: string) => fetchApi<OrchestratedOutput>(`/orchestrator/member/${encodeURIComponent(id)}`);

export interface ChatResponse {
  intent: { state?: string; plan_type?: string; analysis_type: string; close_suspect_pct?: number };
  shortAnswer: string;
  evidence: string[];
  whyItMatters: string[];
  recommendedAction: string;
  followUpSuggestions: string[];
  charts?: {
    rafDistribution?: { name: string; count: number }[];
    revenueByHcc?: { name: string; value: number }[];
    planMlr?: { plan: string; rawMLR: number; adjustedMLR: number }[];
    whatIfClosure?: { closePct: number; estimatedUplift: number };
  };
  confidenceNote: string;
  complianceNote: string;
}

export const postChatQuery = (question: string) =>
  fetchApi<ChatResponse>('/chat/query', { method: 'POST', body: JSON.stringify({ question }) });

export interface Claim {
  claim_id: string;
  member_id: string;
  service_date: string;
  claim_type: string;
  allowed_amount: number;
}

export const getClaims = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && v !== '' && q.set(k, String(v)));
  return fetchApi<{
    claims: Claim[];
    total: number;
    page: number;
    limit: number;
    metrics: {
      totalAllowed: number;
      pmpm: number;
      outlierCount: number;
      p95Threshold: number;
    };
  }>(`/claims?${q}`);
};

export interface SimulationResult {
  risk_threshold: number;
  high_risk_count: number;
  high_risk_pct: string;
  expected_mlr: number;
  total_projected_cost: number;
  plan_mix: { bronze: number; silver: number; gold: number };
  avgRAF?: number;
  total_risk_revenue?: number;
  risk_adjusted_mlr?: number;
  mlr_improvement_bps?: number;
  close_suspect_pct?: number;
  coding_improvement_pct?: number;
}

export const runSimulation = (body: {
  risk_threshold?: number;
  bronze_pct?: number;
  silver_pct?: number;
  gold_pct?: number;
  close_suspect_pct?: number;
  coding_improvement_pct?: number;
}) => fetchApi<SimulationResult>('/simulation', { method: 'POST', body: JSON.stringify(body) });

export interface RiskExplorerData {
  members: Member[];
  total: number;
  page: number;
  limit: number;
  rafDistribution: { range: string; count: number }[];
  hccPrevalence: { hcc_code: string; count: number }[];
  top10PctRevenue: number;
  totalRiskRevenue: number;
  top10PctShare: string;
  revenueConcentrationCurve?: { percentile: string; pct: number; cumulativeRevenue: number }[];
}

export const getRiskExplorer = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && v !== '' && q.set(k, String(v)));
  return fetchApi<RiskExplorerData>(`/risk-explorer?${q}`);
};

/** Upload members + claims (JSON arrays) or CSV strings. Returns dashboard-style analysis. */
export function postUploadAnalyze(payload: { members?: unknown[]; claims?: unknown[] } | { format: 'csv'; membersCsv: string; claimsCsv: string }) {
  return fetchApi<DashboardData>('/upload/analyze', { method: 'POST', body: JSON.stringify(payload) });
}
