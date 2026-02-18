import { useState } from 'react';
import Dashboard from './components/Dashboard';
import MemberExplorer from './components/MemberExplorer';
import ClaimsAnalyzer from './components/ClaimsAnalyzer';
import RiskAdjustmentExplorer from './components/RiskAdjustmentExplorer';
import WhatIfSimulation from './components/WhatIfSimulation';
import ExecutiveChat from './components/ExecutiveChat';
import Glossary from './components/Glossary';

type Tab = 'dashboard' | 'members' | 'claims' | 'risk' | 'simulation' | 'chat' | 'glossary';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'members', label: 'Member Explorer' },
  { id: 'claims', label: 'Claims Analyzer' },
  { id: 'risk', label: 'Risk Adjustment' },
  { id: 'simulation', label: 'What-If Simulation' },
  { id: 'chat', label: 'Executive Chat' },
  { id: 'glossary', label: 'Glossary' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-semibold text-slate-900">Oscar Health Demo</h1>
            <nav className="flex gap-1">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    tab === id
                      ? 'bg-[#e91e8c]/10 text-[#e91e8c]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'members' && <MemberExplorer />}
        {tab === 'claims' && <ClaimsAnalyzer />}
        {tab === 'risk' && <RiskAdjustmentExplorer />}
        {tab === 'simulation' && <WhatIfSimulation />}
        {tab === 'chat' && <ExecutiveChat />}
        {tab === 'glossary' && <Glossary />}
      </main>
    </div>
  );
}
