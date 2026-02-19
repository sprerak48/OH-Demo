/**
 * LLM integration for Executive Chat.
 * Answers natural-language questions about members and claims using an OpenAI-compatible API.
 * Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL, OPENAI_MODEL) in environment.
 */

const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Build a text summary of the dataset for the LLM context.
 */
export function buildDataContextSummary(members, claims, claimByMember, memberRAF = {}) {
  const totalMembers = members.length;
  const totalClaims = claims.length;
  const totalAllowed = claims.reduce((s, c) => s + (c.allowed_amount || 0), 0);
  const byState = {};
  const byPlan = {};
  const claimTypes = { IP: 0, OP: 0, RX: 0 };
  members.forEach((m) => {
    byState[m.state || 'Unknown'] = (byState[m.state || 'Unknown'] || 0) + 1;
    byPlan[m.plan_type || 'Unknown'] = (byPlan[m.plan_type || 'Unknown'] || 0) + 1;
  });
  claims.forEach((c) => {
    claimTypes[c.claim_type] = (claimTypes[c.claim_type] || 0) + 1;
  });
  const rafValues = members.map((m) => memberRAF[m.member_id] ?? 0.5);
  const avgRAF = rafValues.length ? rafValues.reduce((a, b) => a + b, 0) / rafValues.length : 0;
  const highRAF = members.filter((m) => (memberRAF[m.member_id] ?? 0) > 1.2).length;
  const highRisk = members.filter((m) => (m.risk_score || 0) >= 0.7).length;
  const withChronic = members.filter((m) => m.chronic_condition_flag).length;
  const hccCounts = {};
  members.forEach((m) => {
    (m.hcc_codes || []).forEach((c) => { hccCounts[c] = (hccCounts[c] || 0) + 1; });
  });

  return {
    totalMembers,
    totalClaims,
    totalAllowed: Math.round(totalAllowed * 100) / 100,
    avgCostPerMember: totalMembers ? Math.round((totalAllowed / totalMembers) * 100) / 100 : 0,
    byState: Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 15),
    byPlan: Object.entries(byPlan),
    claimTypes,
    avgRAF: Math.round(avgRAF * 1000) / 1000,
    highRAFCount: highRAF,
    highRiskCount: highRisk,
    withChronicCount: withChronic,
    hccPrevalence: Object.entries(hccCounts).sort((a, b) => b[1] - a[1]),
  };
}

function formatContextForPrompt(summary, structuredResult) {
  let text = `## Dataset summary\n- Total members: ${summary.totalMembers}\n- Total claims: ${summary.totalClaims}\n- Total allowed amount: $${summary.totalAllowed.toLocaleString()}\n- Avg cost per member: $${summary.avgCostPerMember?.toLocaleString() ?? 0}\n- Avg RAF: ${summary.avgRAF}\n- Members with RAF > 1.2: ${summary.highRAFCount}\n- High-risk members (risk_score ≥ 0.7): ${summary.highRiskCount}\n- Members with chronic condition flag: ${summary.withChronicCount}\n\n`;
  text += `Members by state (top 15): ${summary.byState?.map(([s, n]) => `${s}: ${n}`).join(', ') || 'N/A'}\n`;
  text += `Members by plan: ${summary.byPlan?.map(([p, n]) => `${p}: ${n}`).join(', ') || 'N/A'}\n`;
  text += `Claims by type: IP=${summary.claimTypes?.IP ?? 0}, OP=${summary.claimTypes?.OP ?? 0}, RX=${summary.claimTypes?.RX ?? 0}\n`;
  text += `HCC prevalence (coded): ${(summary.hccPrevalence || []).map(([c, n]) => `${c}: ${n}`).join(', ') || 'None'}\n`;
  if (structuredResult?.shortAnswer) {
    text += `\n## Pre-computed analysis (use these numbers if relevant)\n- Short answer: ${structuredResult.shortAnswer}\n- Evidence: ${(structuredResult.evidence || []).join('; ')}\n- Why it matters: ${(structuredResult.whyItMatters || []).join('; ')}\n`;
  }
  return text;
}

const SYSTEM_PROMPT = `You are an Executive Risk Intelligence assistant for a health insurer (Oscar Health–style). You answer questions about members, claims, risk adjustment (RAF), and revenue in natural language. You have been given a summary of the current dataset (members and claims). Use only the provided data to answer. Be concise and evidence-based. Do not diagnose or make coding assertions. If the data does not support an answer, say so. Respond with a JSON object only, no markdown, with exactly these keys:
- shortAnswer: one or two sentences, executive summary
- evidence: array of 3–5 short bullet strings with numbers where possible
- whyItMatters: array of 1–3 short strings (business impact)
- recommendedAction: one short sentence
- followUpSuggestions: array of 2–4 suggested follow-up questions the user might ask`;

/**
 * Call OpenAI-compatible API and return structured chat response.
 * @param {string} question - User question
 * @param {object} dataSummary - Result of buildDataContextSummary
 * @param {object} [structuredResult] - Optional pre-computed runChatQuery result to include in context
 * @returns {Promise<{ shortAnswer, evidence, whyItMatters, recommendedAction, followUpSuggestions }>}
 */
export async function runChatWithLLM(question, dataSummary, structuredResult = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const contextText = formatContextForPrompt(dataSummary, structuredResult);
  const userContent = `${contextText}\n\n## User question\n${question}`;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty LLM response');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error('LLM did not return valid JSON');
  }

  return {
    shortAnswer: parsed.shortAnswer || 'I couldn’t generate a clear answer from the data.',
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [String(parsed.evidence || '')],
    whyItMatters: Array.isArray(parsed.whyItMatters) ? parsed.whyItMatters : [String(parsed.whyItMatters || '')],
    recommendedAction: parsed.recommendedAction || 'Review the data in the Dashboard or Member Explorer for more detail.',
    followUpSuggestions: Array.isArray(parsed.followUpSuggestions) ? parsed.followUpSuggestions : [],
  };
}
