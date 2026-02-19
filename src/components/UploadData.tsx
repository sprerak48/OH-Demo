import { useState, useRef } from 'react';
import { postUploadAnalyze } from '../api';
import type { DashboardData } from '../api';

const MEMBERS_CSV_HINT = 'member_id,age,gender,state,plan_type,risk_score,chronic_condition_flag,hcc_codes,member_months';
const CLAIMS_CSV_HINT = 'claim_id,member_id,service_date,claim_type,allowed_amount';

type UploadMode = 'csv' | 'json';

interface UploadDataProps {
  onApplyToDashboard: (data: DashboardData) => void;
}

export default function UploadData({ onApplyToDashboard }: UploadDataProps) {
  const [mode, setMode] = useState<UploadMode>('csv');
  const [membersCsv, setMembersCsv] = useState('');
  const [claimsCsv, setClaimsCsv] = useState('');
  const [membersJson, setMembersJson] = useState<unknown[]>([]);
  const [claimsJson, setClaimsJson] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DashboardData | null>(null);
  const membersFileRef = useRef<HTMLInputElement>(null);
  const claimsFileRef = useRef<HTMLInputElement>(null);
  const membersJsonRef = useRef<HTMLInputElement>(null);
  const claimsJsonRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(new Error('Failed to read file'));
      r.readAsText(file, 'utf-8');
    });

  const handleMembersFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      if (mode === 'csv') setMembersCsv(text);
      else setMembersJson(JSON.parse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid file');
    }
    e.target.value = '';
  };

  const handleClaimsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      if (mode === 'csv') setClaimsCsv(text);
      else setClaimsJson(JSON.parse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid file');
    }
    e.target.value = '';
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const payload =
        mode === 'csv'
          ? { format: 'csv' as const, membersCsv, claimsCsv }
          : { members: membersJson, claims: claimsJson };
      const data = await postUploadAnalyze(payload);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    mode === 'csv'
      ? membersCsv.trim().length > 0 && claimsCsv.trim().length > 0
      : Array.isArray(membersJson) && membersJson.length > 0 && Array.isArray(claimsJson) && claimsJson.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Upload Data</h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload members and claims in CSV or JSON (same format as generated data). After analysis, apply to the dashboard to refresh it with the new data.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('csv')}
          className={`px-3 py-2 rounded-lg text-sm font-medium ${mode === 'csv' ? 'bg-[#e91e8c]/10 text-[#e91e8c]' : 'bg-slate-100 text-slate-600'}`}
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => setMode('json')}
          className={`px-3 py-2 rounded-lg text-sm font-medium ${mode === 'json' ? 'bg-[#e91e8c]/10 text-[#e91e8c]' : 'bg-slate-100 text-slate-600'}`}
        >
          JSON
        </button>
      </div>

      {mode === 'csv' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Members CSV</label>
            <p className="text-xs text-slate-500 mb-2">Columns: {MEMBERS_CSV_HINT}</p>
            <input type="file" accept=".csv,.txt" ref={membersFileRef} onChange={handleMembersFile} className="hidden" />
            <button
              type="button"
              onClick={() => membersFileRef.current?.click()}
              className="mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
            >
              Choose file
            </button>
            <textarea
              placeholder="Or paste CSV here (header row required)"
              value={membersCsv}
              onChange={(e) => setMembersCsv(e.target.value)}
              className="w-full h-32 rounded border border-slate-200 p-2 text-sm font-mono"
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Claims CSV</label>
            <p className="text-xs text-slate-500 mb-2">Columns: {CLAIMS_CSV_HINT}</p>
            <input type="file" accept=".csv,.txt" ref={claimsFileRef} onChange={handleClaimsFile} className="hidden" />
            <button
              type="button"
              onClick={() => claimsFileRef.current?.click()}
              className="mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
            >
              Choose file
            </button>
            <textarea
              placeholder="Or paste CSV here (header row required)"
              value={claimsCsv}
              onChange={(e) => setClaimsCsv(e.target.value)}
              className="w-full h-32 rounded border border-slate-200 p-2 text-sm font-mono"
            />
          </div>
        </div>
      )}

      {mode === 'json' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Members JSON</label>
            <input type="file" accept=".json" ref={membersJsonRef} onChange={handleMembersFile} className="hidden" />
            <button
              type="button"
              onClick={() => membersJsonRef.current?.click()}
              className="mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
            >
              Choose members.json
            </button>
            <p className="text-xs text-slate-500">
              {Array.isArray(membersJson) && membersJson.length > 0 ? `${membersJson.length} members loaded` : 'No file selected'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Claims JSON</label>
            <input type="file" accept=".json" ref={claimsJsonRef} onChange={handleClaimsFile} className="hidden" />
            <button
              type="button"
              onClick={() => claimsJsonRef.current?.click()}
              className="mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
            >
              Choose claims.json
            </button>
            <p className="text-xs text-slate-500">
              {Array.isArray(claimsJson) && claimsJson.length > 0 ? `${claimsJson.length} claims loaded` : 'No file selected'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit || loading}
        onClick={submit}
        className="px-4 py-2 rounded-lg bg-[#e91e8c] text-white font-medium disabled:opacity-50"
      >
        {loading ? 'Analyzing…' : 'Analyze upload'}
      </button>

      {result && (
        <div className="rounded-xl border border-[#14b8a6]/30 bg-[#14b8a6]/5 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Analysis complete</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-slate-500">Members</span>
              <p className="font-semibold">{result.kpis.totalMembers.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-slate-500">Claims</span>
              <p className="font-semibold">{result.kpis.activeClaims != null ? result.kpis.activeClaims.toLocaleString() : '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Avg RAF</span>
              <p className="font-semibold">{result.kpis.avgRAF != null ? result.kpis.avgRAF.toFixed(3) : '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Risk Adj. Revenue</span>
              <p className="font-semibold">
                {result.kpis.riskAdjRevenue != null ? `$${(result.kpis.riskAdjRevenue / 1e6).toFixed(1)}M` : '—'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onApplyToDashboard(result)}
            className="px-4 py-2 rounded-lg bg-[#14b8a6] text-white font-medium hover:bg-[#0d9488]"
          >
            Use this data on Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
