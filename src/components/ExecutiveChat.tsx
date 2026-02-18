import { useState, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { postChatQuery } from '../api';
import type { ChatResponse } from '../api';

const SUGGESTED_QUESTIONS = [
  'Why is Texas Bronze leaking RAF?',
  'Where are we missing risk adjustment revenue?',
  'What happens if we close 30% of suspect HCCs?',
  'Which plans have the worst adjusted MLR?',
];

export default function ExecutiveChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; response?: ChatResponse }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (question: string) => {
    if (!question.trim()) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const response = await postChatQuery(question);
      setMessages((m) => [...m, { role: 'assistant', content: response.shortAnswer, response }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[700px]">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Executive Risk Intelligence</h2>
        <p className="text-sm text-slate-500">Agentic query layer over real calculations. Ask about RAF leakage, revenue at risk, or what-if scenarios.</p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="mb-4">Try one of these questions:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-3 py-2 rounded-lg border border-slate-200 hover:border-[#e91e8c] hover:bg-[#e91e8c]/5 text-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-[#e91e8c]/10 rounded-lg px-4 py-2' : ''}`}>
                <p className="text-sm font-medium text-slate-700">{msg.role === 'user' ? 'You' : 'Intelligence'}</p>
                <p className="text-slate-800">{msg.content}</p>
                {msg.role === 'assistant' && msg.response && (
                  <ChatResponseBlock response={msg.response} id={`r-${i}`} expanded={expandedId === `r-${i}`} onToggle={() => setExpandedId(expandedId === `r-${i}` ? null : `r-${i}`)} onFollowUp={send} />
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-slate-500">
              <span className="animate-pulse">●</span> Analyzing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about RAF leakage, revenue at risk..."
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e91e8c]/50"
              disabled={loading}
            />
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-[#e91e8c] text-white text-sm font-medium disabled:opacity-50">
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ChatResponseBlock({
  response,
  id,
  expanded,
  onToggle,
  onFollowUp,
}: {
  response: ChatResponse;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  onFollowUp: (q: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <button onClick={onToggle} className="text-xs font-medium text-[#14b8a6] hover:underline">
        {expanded ? 'Hide evidence' : 'Show evidence'}
      </button>
      {expanded && (
        <div className="space-y-3 text-sm border-l-2 border-slate-200 pl-3">
          <div>
            <p className="font-medium text-slate-600 mb-1">What we&apos;re seeing</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">
              {response.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-600 mb-1">Why it matters</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600">
              {response.whyItMatters.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-[#14b8a6] mb-1">Recommended action</p>
            <p className="text-slate-600">{response.recommendedAction}</p>
          </div>
          {response.charts?.rafDistribution && response.charts.rafDistribution.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-slate-600 mb-1">RAF distribution by condition</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={response.charts.rafDistribution}>
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#e91e8c" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {response.charts?.revenueByHcc && response.charts.revenueByHcc.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-slate-600 mb-1">Revenue at risk by HCC</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={response.charts.revenueByHcc}>
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(1)}k`, '']} />
                    <Bar dataKey="value" fill="#14b8a6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {response.charts?.planMlr && response.charts.planMlr.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-slate-600 mb-1">MLR by plan</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={response.charts.planMlr}>
                    <XAxis dataKey="plan" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, '']} />
                    <Bar dataKey="adjustedMLR" fill="#14b8a6" radius={[2, 2, 0, 0]} name="Adj. MLR" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-2">
            <span className="text-xs text-slate-500">{response.confidenceNote}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{response.complianceNote}</span>
          </div>
          <div className="pt-2">
            <p className="text-xs font-medium text-slate-500 mb-1">Follow-up</p>
            <div className="flex flex-wrap gap-2">
              {response.followUpSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUp(s)}
                  className="text-xs px-2 py-1 rounded border border-slate-200 hover:border-[#e91e8c] hover:bg-[#e91e8c]/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
