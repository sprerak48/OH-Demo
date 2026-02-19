import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { getDashboard } from '../api';
import type { DashboardData } from '../api';

interface DashboardProps {
  overrideData?: DashboardData | null;
  onClearOverride?: () => void;
}

export default function Dashboard({ overrideData, onClearOverride }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(!overrideData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (overrideData) {
      setData(overrideData);
      setLoading(false);
      return;
    }
    setLoading(true);
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [overrideData]);

  const effectiveData = overrideData ?? data;
  if (loading && !overrideData) return <div className="text-slate-500">Loading dashboard...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!effectiveData) return null;

  const { kpis, claimsOverTime, costByPlanType, riskDistribution, rafByPlanType, rafByState, riskRevenueByPlan, executive } = effectiveData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
        {overrideData && onClearOverride && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>Showing uploaded data</span>
            <button
              type="button"
              onClick={onClearOverride}
              className="font-medium text-amber-700 hover:underline"
            >
              Clear & use server data
            </button>
          </div>
        )}
      </div>

      {/* Core KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Members" value={kpis.totalMembers.toLocaleString()} />
        <KpiCard label="Active Claims (90d)" value={kpis.activeClaims.toLocaleString()} />
        <KpiCard label="Raw MLR" value={`${(kpis.mlr * 100).toFixed(1)}%`} />
        <KpiCard label="High-Risk Members (%)" value={`${kpis.highRiskPct}%`} />
        <KpiCard label="Avg Cost per Member" value={`$${kpis.avgCostPerMember.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>

      {/* Risk Adjustment KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-slate-600">Risk Adjustment Metrics</h3>
          <span className="text-xs text-slate-400" title="Surfacing suspect but uncoded conditions helps capture accurate RAF and improves margin visibility. The agent surfaces evidence for human review only—no autonomous coding.">
            ℹ️
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Avg RAF" value={kpis.avgRAF != null ? kpis.avgRAF.toFixed(3) : '—'} highlight />
          <KpiCard label="% RAF &gt; 1.2" value={kpis.highRAFPct != null ? `${kpis.highRAFPct}%` : '—'} />
          <KpiCard label="Risk Adj. Revenue" value={kpis.riskAdjRevenue != null ? `$${(kpis.riskAdjRevenue / 1e6).toFixed(1)}M` : '—'} highlight />
          <KpiCard label="Revenue at Risk (Suspect)" value={kpis.suspectRAFUplift != null ? `$${(kpis.suspectRAFUplift / 1e6).toFixed(1)}M` : '—'} />
          <KpiCard label="Suspect HCC Count" value={kpis.suspectHCCCount != null ? kpis.suspectHCCCount.toLocaleString() : '—'} />
          <KpiCard label="Risk-Adj. MLR" value={kpis.riskAdjustedMLR != null ? `${(kpis.riskAdjustedMLR * 100).toFixed(1)}%` : '—'} highlight />
        </div>
        {kpis.mlrImprovementBps != null && kpis.mlrImprovementBps !== 0 && (
          <p className="text-xs text-slate-500 mt-1">
            MLR improvement: {kpis.mlrImprovementBps > 0 ? '+' : ''}{kpis.mlrImprovementBps} bps (risk adj. vs raw)
          </p>
        )}
        {kpis.agentSuspectHCCCount != null && (
          <p className="text-xs text-slate-500 mt-1">
            Agent: {kpis.agentSuspectHCCCount} suspect HCCs across population · Potential RAF uplift: {kpis.agentPotentialRafUplift?.toFixed(1) ?? '—'} · Revenue at risk (est.): ${kpis.agentPotentialRevenueUplift != null ? (kpis.agentPotentialRevenueUplift / 1e6).toFixed(2) : '—'}M
          </p>
        )}
      </div>

      {/* Executive Dashboard (Multi-Agent) */}
      {executive && (
        <div className="rounded-xl border border-[#14b8a6]/30 bg-[#14b8a6]/5 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Executive Dashboard — Multi-Agent Intelligence</h3>
          <p className="text-xs text-slate-500 mb-3">Three specialists: Risk · Finance · Compliance</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <KpiCard label="Total Suspect RAF Leakage" value={executive.totalSuspectRafLeakage?.toFixed(2) ?? '—'} highlight />
            <KpiCard label="Revenue at Risk ($)" value={executive.revenueAtRisk != null ? `$${(executive.revenueAtRisk / 1e6).toFixed(2)}M` : '—'} highlight />
            <KpiCard label="Compliance-Cleared (%)" value={`${executive.complianceClearedPct ?? 0}%`} />
            <KpiCard label="Members w/ Suspects" value={executive.membersWithSuspects?.toLocaleString() ?? '—'} />
          </div>
          {executive.top10RiskLeakageStates && executive.top10RiskLeakageStates.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-600 mb-2">Top 10 Risk Leakage States</h4>
              <div className="flex flex-wrap gap-2">
                {executive.top10RiskLeakageStates.map(({ state, revenue_at_risk }) => (
                  <span key={state} className="inline-flex items-center px-2 py-1 rounded bg-white border border-slate-200 text-xs">
                    {state}: <strong className="ml-1 text-[#14b8a6]">${(revenue_at_risk / 1000).toFixed(0)}K</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700 mb-4">Claims Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={claimsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#e91e8c" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700 mb-4">Cost by Plan Type</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByPlanType} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                <YAxis type="category" dataKey="plan_type" width={60} stroke="#64748b" />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Total']} />
                <Bar dataKey="total" fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {riskRevenueByPlan && riskRevenueByPlan.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Risk Adj. Revenue by Plan</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskRevenueByPlan} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="plan_type" width={60} stroke="#64748b" />
                  <Tooltip formatter={(v: number) => [`$${v?.toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="total" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {rafByPlanType && rafByPlanType.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <h3 className="text-sm font-medium text-slate-700 mb-4">RAF by Plan Type</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rafByPlanType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="plan_type" stroke="#64748b" />
                  <YAxis stroke="#64748b" domain={[0, 'auto']} />
                  <Tooltip />
                  <Bar dataKey="avgRAF" fill="#e91e8c" radius={[4, 4, 0, 0]} name="Avg RAF" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {rafByState && rafByState.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <h3 className="text-sm font-medium text-slate-700 mb-4">RAF by State (Top 10)</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rafByState}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="state" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" domain={[0, 'auto']} />
                  <Tooltip />
                  <Bar dataKey="avgRAF" fill="#6366f1" radius={[4, 4, 0, 0]} name="Avg RAF" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-700 mb-4">Risk Score Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${highlight ? 'border-[#14b8a6]/50 bg-[#14b8a6]/5' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${highlight ? 'text-[#0d9488]' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
