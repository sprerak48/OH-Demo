import { useEffect, useState } from 'react';
import { getMembers, getMember } from '../api';
import type { Member, OrchestratedOutput } from '../api';

type ProfileTab = 'overview' | 'risk' | 'finance' | 'compliance';

const US_STATES = ['NY', 'CA', 'TX', 'FL', 'NJ', 'IL', 'PA', 'GA', 'OH', 'NC', 'MI', 'AZ', 'WA', 'MA', 'CO', 'VA', 'TN', 'IN', 'MO', 'MD'];
const PLAN_TYPES = ['Bronze', 'Silver', 'Gold'];

export default function MemberExplorer() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Member | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMember>> | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [filters, setFilters] = useState({
    state: '',
    plan_type: '',
    risk_min: '',
    risk_max: '',
    chronic: '',
  });

  const loadMembers = () => {
    setLoading(true);
    getMembers({
      ...filters,
      risk_min: filters.risk_min || undefined,
      risk_max: filters.risk_max || undefined,
      chronic: filters.chronic === 'true' ? 'true' : undefined,
      page,
      limit: 25,
    })
      .then((res) => {
        setMembers(res.members);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadMembers, [page, filters.state, filters.plan_type, filters.risk_min, filters.risk_max, filters.chronic]);

  const onSelectMember = (m: Member) => {
    setSelected(m);
    setProfile(null);
    setProfileTab('overview');
    getMember(m.member_id).then(setProfile);
  };
  const orch = profile?.orchestrated_output;

  const applyFilters = () => loadMembers();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Member Explorer</h2>

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
            <label className="block text-xs font-medium text-slate-500 mb-1">Plan Type</label>
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
            <label className="block text-xs font-medium text-slate-500 mb-1">Risk Score Min</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={filters.risk_min}
              onChange={(e) => setFilters((f) => ({ ...f, risk_min: e.target.value }))}
              placeholder="0"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Risk Score Max</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={filters.risk_max}
              onChange={(e) => setFilters((f) => ({ ...f, risk_max: e.target.value }))}
              placeholder="1"
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Chronic Condition</label>
            <select
              value={filters.chronic}
              onChange={(e) => setFilters((f) => ({ ...f, chronic: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="true">Yes</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm text-slate-600">
            {total.toLocaleString()} members
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">ID</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Plan</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">State</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Risk</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
                ) : (
                  members.map((m) => (
                    <tr
                      key={m.member_id}
                      onClick={() => onSelectMember(m)}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${
                        selected?.member_id === m.member_id ? 'bg-[#e91e8c]/5' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-mono">{m.member_id}</td>
                      <td className="px-4 py-2">{m.plan_type}</td>
                      <td className="px-4 py-2">{m.state}</td>
                      <td className="px-4 py-2">{(m.risk_score * 100).toFixed(0)}%</td>
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
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="text-sm text-slate-600 disabled:opacity-50 hover:text-slate-900"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Member profile */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Member Profile</h3>
            {profile?.orchestrated_output && (
              <div className="flex gap-1">
                {(['overview', 'risk', 'finance', 'compliance'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setProfileTab(tab)}
                    className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                      profileTab === tab ? 'bg-[#e91e8c]/10 text-[#e91e8c]' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {tab === 'overview' ? 'Overview' : tab === 'risk' ? 'Risk' : tab === 'finance' ? 'Finance' : 'Compliance'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!selected ? (
            <p className="text-slate-500 text-sm">Select a member to view profile</p>
          ) : profile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">ID</span> {profile.member_id}</div>
                <div><span className="text-slate-500">Age</span> {profile.age}</div>
                <div><span className="text-slate-500">Gender</span> {profile.gender}</div>
                <div><span className="text-slate-500">State</span> {profile.state}</div>
                <div><span className="text-slate-500">Plan</span> {profile.plan_type}</div>
                <div><span className="text-slate-500">Risk Score</span> {(profile.risk_score * 100).toFixed(0)}%</div>
                <div><span className="text-slate-500">Chronic</span> {profile.chronic_condition_flag ? 'Yes' : 'No'}</div>
                <div><span className="text-slate-500">Total Claim Cost</span> ${profile.total_claim_cost?.toLocaleString()}</div>
              </div>

              {/* RAF Breakdown */}
              {profile.raf != null && (
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">RAF Breakdown</h4>
                  <div className="text-sm space-y-1">
                    <div><span className="text-slate-500">Demographic RAF</span> {profile.rafBreakdown?.demographic?.toFixed(3) ?? '—'}</div>
                    <div><span className="text-slate-500">HCC RAF</span> {profile.rafBreakdown?.hcc?.toFixed(3) ?? '0'}</div>
                    <div><span className="font-medium text-[#0d9488]">Total RAF</span> {profile.raf.toFixed(3)}</div>
                  </div>
                  {profile.hccList && profile.hccList.length > 0 && (
                    <div className="mt-2 text-xs">
                      <span className="text-slate-500">HCCs:</span>{' '}
                      {profile.hccList.map((h) => `${h.code} (${h.weight})`).join(', ')}
                    </div>
                  )}
                  {profile.risk_adj_revenue != null && (
                    <div className="mt-1 text-xs text-slate-600">
                      Risk Adj. Revenue: <strong>${profile.risk_adj_revenue.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              )}

              {profileTab === 'risk' && orch ? (
                <MemberRiskTab orch={orch} />
              ) : profileTab === 'finance' && orch ? (
                <MemberFinanceTab orch={orch} />
              ) : profileTab === 'compliance' && orch ? (
                <MemberComplianceTab orch={orch} />
              ) : (
              <>
              {orch ? (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-600 italic">{orch.executive_summary ?? 'No executive summary.'}</p>
                </div>
              ) : profile.agent_output ? (
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Suspected Conditions</h4>
                  {profile.agent_output.suspect_hccs.length === 0 ? (
                    <p className="text-sm text-slate-500">No suspect conditions identified.</p>
                  ) : (
                    <p className="text-sm text-slate-600">{profile.agent_output.overall_commentary ?? '—'}</p>
                  )}
                </div>
              ) : null}

              <div>
                <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Recent Claims (up to 20)</h4>
                <div className="max-h-48 overflow-y-auto text-xs">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left py-1">Date</th>
                        <th className="text-left py-1">Type</th>
                        <th className="text-right py-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recent_claims?.map((c) => (
                        <tr key={c.claim_id} className="border-t border-slate-100">
                          <td className="py-1">{c.service_date}</td>
                          <td className="py-1">{c.claim_type}</td>
                          <td className="text-right py-1">${c.allowed_amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Loading profile...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberRiskTab({ orch }: { orch: OrchestratedOutput }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-slate-500 uppercase">Risk Signals</h4>
      <p className="text-xs text-slate-500 italic">Evidence-backed suggestions for human review. Does not assign diagnoses.</p>
      {orch.suspect_hccs.length === 0 ? (
        <p className="text-sm text-slate-500">No suspect conditions identified. Insufficient evidence.</p>
      ) : (
        orch.suspect_hccs.map((s) => (
          <div key={s.hcc} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-medium text-slate-800">{s.condition}</span>
              <span className="text-xs text-amber-700">{s.hcc}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-slate-500">Confidence</span>
              <div className="flex-1 h-1.5 bg-slate-200 rounded overflow-hidden">
                <div className="h-full bg-amber-500 rounded" style={{ width: `${s.confidence * 100}%` }} />
              </div>
              <span className="text-xs font-medium">{(s.confidence * 100).toFixed(0)}%</span>
            </div>
            <ul className="mt-2 text-xs text-slate-600 list-disc list-inside space-y-0.5">
              {s.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs">
              RAF uplift: <strong>{s.raf_uplift.toFixed(2)}</strong>
              {s.revenue_uplift_estimate != null && (
                <> · Revenue uplift (est.): <strong>${s.revenue_uplift_estimate.toLocaleString()}</strong></>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MemberFinanceTab({ orch }: { orch: OrchestratedOutput }) {
  const fi = orch.financial_impact;
  if (!fi) {
    return <p className="text-sm text-slate-500">No financial impact — no suspect conditions identified.</p>;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-slate-500 uppercase">Financial Impact</h4>
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2 text-sm">
        <div><span className="text-slate-500">Estimated revenue uplift</span> <strong className="text-[#14b8a6]">${fi.estimated_revenue_uplift?.toLocaleString() ?? '—'}</strong></div>
        <div><span className="text-slate-500">MLR improvement</span> <strong>{fi.mlr_improvement_bps ?? '—'} bps</strong></div>
        <div><span className="text-slate-500">Plan-level impact</span> <strong>{fi.plan_level_impact ?? '—'}</strong></div>
        {fi.adjusted_mlr != null && <div><span className="text-slate-500">Adjusted MLR</span> {(fi.adjusted_mlr * 100).toFixed(1)}%</div>}
      </div>
    </div>
  );
}

function MemberComplianceTab({ orch }: { orch: OrchestratedOutput }) {
  const c = orch.compliance;
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-slate-500 uppercase">Compliance Notes</h4>
      <div className="rounded-lg border border-slate-200 p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Status</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            c.compliance_status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {c.compliance_status}
          </span>
        </div>
        <div><span className="text-slate-500">Risk level</span> <strong>{c.risk_level}</strong></div>
        <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
          {c.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
