import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getRiskExplorer } from '../api';
import type { RiskExplorerData, Member } from '../api';

const HCC_LABELS: Record<string, string> = {
  HCC_18: 'Diabetes',
  HCC_85: 'CHF',
  HCC_96: 'COPD',
  HCC_108: 'CKD',
  HCC_19: 'Hypertension',
};
const US_STATES = ['NY', 'CA', 'TX', 'FL', 'NJ', 'IL', 'PA', 'GA', 'OH', 'NC', 'MI', 'AZ', 'WA', 'MA'];
const PLAN_TYPES = ['Bronze', 'Silver', 'Gold'];

export default function RiskAdjustmentExplorer() {
  const [data, setData] = useState<RiskExplorerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    state: '',
    plan_type: '',
    raf_min: '',
    raf_max: '',
    hcc: '',
  });
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    getRiskExplorer({
      ...filters,
      raf_min: filters.raf_min || undefined,
      raf_max: filters.raf_max || undefined,
      page,
      limit: 50,
    })
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, filters.state, filters.plan_type, filters.raf_min, filters.raf_max, filters.hcc]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Risk Adjustment Explorer</h2>
      <p className="text-sm text-slate-600">
        Explore RAF distribution, HCC prevalence, and revenue concentration. See where RAF is coming from and what we're missing.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
            <select
              value={filters.state}
              onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Plan</label>
            <select
              value={filters.plan_type}
              onChange={(e) => setFilters((f) => ({ ...f, plan_type: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {PLAN_TYPES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">RAF Min</label>
            <input
              type="number"
              min={0.3}
              max={3}
              step={0.1}
              value={filters.raf_min}
              onChange={(e) => setFilters((f) => ({ ...f, raf_min: e.target.value }))}
              placeholder="0.3"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">RAF Max</label>
            <input
              type="number"
              min={0.3}
              max={3}
              step={0.1}
              value={filters.raf_max}
              onChange={(e) => setFilters((f) => ({ ...f, raf_max: e.target.value }))}
              placeholder="3.0"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">HCC Category</label>
            <select
              value={filters.hcc}
              onChange={(e) => setFilters((f) => ({ ...f, hcc: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {Object.entries(HCC_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{code} ({label})</option>
              ))}
            </select>
          </div>
          <button
            onClick={load}
            className="px-4 py-1.5 rounded bg-[#e91e8c] text-white text-sm font-medium hover:bg-[#c41a77]"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Members</p>
            <p className="text-xl font-bold text-slate-900">{data.total.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Total Risk Revenue</p>
            <p className="text-xl font-bold text-[#14b8a6]">${(data.totalRiskRevenue / 1e6).toFixed(2)}M</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Top 10% RAF Revenue</p>
            <p className="text-xl font-bold text-slate-900">${(data.top10PctRevenue / 1e6).toFixed(2)}M</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Top 10% Share</p>
            <p className="text-xl font-bold text-slate-900">{data.top10PctShare}%</p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data && (
          <>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-4">RAF Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.rafDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#e91e8c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-700 mb-4">HCC Prevalence</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.hccPrevalence.map((d) => ({
                      ...d,
                      label: HCC_LABELS[d.hcc_code] || d.hcc_code,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" />
                    <Tooltip formatter={(v: number) => [v, 'Members']} />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {data.revenueConcentrationCurve && data.revenueConcentrationCurve.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm lg:col-span-2">
                <h3 className="text-sm font-medium text-slate-700 mb-4">Revenue Concentration Curve (Top 10% RAF Members)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.revenueConcentrationCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="percentile" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} />
                      <Tooltip formatter={(v: number) => [`$${(v / 1e6).toFixed(2)}M`, 'Cumulative Revenue']} />
                      <Line type="monotone" dataKey="cumulativeRevenue" stroke="#e91e8c" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Members table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
          {data?.total.toLocaleString() ?? 0} members
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Member ID</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Plan</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">State</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">RAF</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Suspects</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Risk Revenue</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : (
                (data?.members ?? []).map((m: Member & { raf?: number; suspectCount?: number; riskAdjRevenue?: number }) => (
                  <tr key={m.member_id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{m.member_id}</td>
                    <td className="px-4 py-2">{m.plan_type}</td>
                    <td className="px-4 py-2">{m.state}</td>
                    <td className="px-4 py-2">{(m.raf ?? 0).toFixed(3)}</td>
                    <td className="px-4 py-2">{m.suspectCount ?? 0}</td>
                    <td className="px-4 py-2 text-right">${(m.riskAdjRevenue ?? 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 py-2 border-t border-slate-200 flex justify-between">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-sm text-slate-600 disabled:opacity-50 hover:text-slate-900"
            >
              ← Prev
            </button>
            <span className="text-sm text-slate-500">Page {page}</span>
            <button
              disabled={page * 50 >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="text-sm text-slate-600 disabled:opacity-50 hover:text-slate-900"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
