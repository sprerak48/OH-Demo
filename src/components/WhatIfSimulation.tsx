import { useEffect, useState } from 'react';
import { runSimulation } from '../api';
import type { SimulationResult } from '../api';

export default function WhatIfSimulation() {
  const [riskThreshold, setRiskThreshold] = useState(0.7);
  const [bronzePct, setBronzePct] = useState(40);
  const [silverPct, setSilverPct] = useState(35);
  const [goldPct, setGoldPct] = useState(25);
  const [closeSuspectPct, setCloseSuspectPct] = useState(0);
  const [codingImprovementPct, setCodingImprovementPct] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const totalPct = bronzePct + silverPct + goldPct;
  const normalized = totalPct > 0
    ? { bronze: bronzePct / totalPct, silver: silverPct / totalPct, gold: goldPct / totalPct }
    : { bronze: 0.4, silver: 0.35, gold: 0.25 };

  const run = () => {
    runSimulation({
      risk_threshold: riskThreshold,
      bronze_pct: normalized.bronze,
      silver_pct: normalized.silver,
      gold_pct: normalized.gold,
      close_suspect_pct: closeSuspectPct,
      coding_improvement_pct: codingImprovementPct,
    }).then(setResult);
  };

  useEffect(run, [riskThreshold, bronzePct, silverPct, goldPct, closeSuspectPct, codingImprovementPct]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">What-If Simulation</h2>
      <p className="text-sm text-slate-600">
        Adjust inputs below. See how closing suspect HCCs and improving coding moves RAF and MLR.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-semibold text-slate-700">Inputs</h3>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Risk Score Threshold: {(riskThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={riskThreshold}
              onChange={(e) => setRiskThreshold(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">Plan Mix (%)</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 text-sm">Bronze</span>
                <input type="number" min={0} max={100} value={bronzePct} onChange={(e) => setBronzePct(Number(e.target.value) || 0)} className="border border-slate-300 rounded px-2 py-1 text-sm w-20" />
                <span className="text-slate-500">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-sm">Silver</span>
                <input type="number" min={0} max={100} value={silverPct} onChange={(e) => setSilverPct(Number(e.target.value) || 0)} className="border border-slate-300 rounded px-2 py-1 text-sm w-20" />
                <span className="text-slate-500">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-sm">Gold</span>
                <input type="number" min={0} max={100} value={goldPct} onChange={(e) => setGoldPct(Number(e.target.value) || 0)} className="border border-slate-300 rounded px-2 py-1 text-sm w-20" />
                <span className="text-slate-500">%</span>
              </div>
            </div>
          </div>

          {/* Risk Adjustment toggles */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Coding & Suspect HCC</h4>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Close Suspect HCCs (% of members)</label>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={closeSuspectPct}
                onChange={(e) => setCloseSuspectPct(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-slate-500">{closeSuspectPct}% — e.g. &quot;Close 30% of Suspect HCCs&quot;</p>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-slate-600 mb-1">Coding Completeness Improvement (%)</label>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={codingImprovementPct}
                onChange={(e) => setCodingImprovementPct(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-slate-500">+{codingImprovementPct}%</p>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Computed Results</h3>
          {result ? (
            <>
              <div>
                <p className="text-xs font-medium text-slate-500">High-Risk Members</p>
                <p className="text-2xl font-bold text-slate-900">{result.high_risk_count.toLocaleString()}</p>
                <p className="text-sm text-slate-500">{result.high_risk_pct}% of membership</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Expected MLR (Raw)</p>
                <p className="text-2xl font-bold text-[#e91e8c]">{(result.expected_mlr * 100).toFixed(1)}%</p>
              </div>
              {result.risk_adjusted_mlr != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500">Risk-Adjusted MLR</p>
                  <p className="text-2xl font-bold text-[#14b8a6]">{(result.risk_adjusted_mlr * 100).toFixed(1)}%</p>
                  {result.mlr_improvement_bps != null && (
                    <p className="text-xs text-slate-600 mt-1">
                      Δ {result.mlr_improvement_bps > 0 ? '+' : ''}{result.mlr_improvement_bps} bps vs raw
                    </p>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500">Total Projected Cost</p>
                <p className="text-xl font-bold text-slate-900">${result.total_projected_cost.toLocaleString()}</p>
              </div>
              {result.total_risk_revenue != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500">Total Risk Adj. Revenue</p>
                  <p className="text-xl font-bold text-[#14b8a6]">${result.total_risk_revenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">$ impact from RAF + suspect closure</p>
                </div>
              )}
              {result.avgRAF != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500">Avg RAF (simulated)</p>
                  <p className="text-lg font-bold">{result.avgRAF.toFixed(3)}</p>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                Plan mix: B {((result.plan_mix.bronze || 0) * 100).toFixed(0)}% S {((result.plan_mix.silver || 0) * 100).toFixed(0)}% G {((result.plan_mix.gold || 0) * 100).toFixed(0)}%
                {result.close_suspect_pct != null && result.close_suspect_pct > 0 && ` · Close ${result.close_suspect_pct}% suspect HCCs`}
                {result.coding_improvement_pct != null && result.coding_improvement_pct > 0 && ` · +${result.coding_improvement_pct}% coding`}
              </div>
            </>
          ) : (
            <p className="text-slate-500">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}
