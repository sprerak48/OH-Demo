import { useEffect, useState } from 'react';
import { getClaims } from '../api';
import type { Claim } from '../api';

const CLAIM_TYPES = ['IP', 'OP', 'RX'];
const US_STATES = ['NY', 'CA', 'TX', 'FL', 'NJ', 'IL', 'PA', 'GA', 'OH', 'NC', 'MI', 'AZ', 'WA', 'MA'];

export default function ClaimsAnalyzer() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<{
    totalAllowed: number;
    pmpm: number;
    outlierCount: number;
    p95Threshold: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    claim_type: '',
    cost_min: '',
    state: '',
  });

  const loadClaims = () => {
    setLoading(true);
    getClaims({
      ...filters,
      cost_min: filters.cost_min || undefined,
      page,
      limit: 50,
    })
      .then((res) => {
        setClaims(res.claims);
        setTotal(res.total);
        setMetrics(res.metrics);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadClaims, [page, filters.date_from, filters.date_to, filters.claim_type, filters.cost_min, filters.state]);

  const applyFilters = () => loadClaims();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Claims Analyzer</h2>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date From</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date To</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Claim Type</label>
            <select
              value={filters.claim_type}
              onChange={(e) => setFilters((f) => ({ ...f, claim_type: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {CLAIM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Cost Min ($)</label>
            <input
              type="number"
              min={0}
              value={filters.cost_min}
              onChange={(e) => setFilters((f) => ({ ...f, cost_min: e.target.value }))}
              placeholder="0"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-24"
            />
          </div>
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
          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded bg-[#e91e8c] text-white text-sm font-medium hover:bg-[#c41a77]"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Computed metrics */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Total Allowed Amount</p>
            <p className="text-lg font-bold text-slate-900">${metrics.totalAllowed.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">PMPM</p>
            <p className="text-lg font-bold text-slate-900">${metrics.pmpm.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Outliers (≥P95)</p>
            <p className="text-lg font-bold text-slate-900">{metrics.outlierCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">P95 Threshold</p>
            <p className="text-lg font-bold text-slate-900">${metrics.p95Threshold.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Claims table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
          {total.toLocaleString()} claims
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Claim ID</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Member ID</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Date</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Allowed</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.claim_id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{c.claim_id}</td>
                    <td className="px-4 py-2 font-mono">{c.member_id}</td>
                    <td className="px-4 py-2">{c.service_date}</td>
                    <td className="px-4 py-2">{c.claim_type}</td>
                    <td className="px-4 py-2 text-right">${c.allowed_amount.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="text-sm text-slate-600 disabled:opacity-50 hover:text-slate-900"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
