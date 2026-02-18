/**
 * Compliance & Governance Agent
 * Ensures outputs are regulator-safe, audit-ready, and non-diagnostic.
 *
 * Validation rules:
 * - No diagnostic language
 * - No ICD-10 references
 * - No definitive claims
 * - Clear uncertainty statements
 */

const DIAGNOSTIC_PATTERNS = [
  /\bdiagnos(ed|is|ing)\b/i,
  /\bhas\s+(diabetes|chf|copd|ckd|hypertension)\b/i,
  /\bconfirmed\b/i,
  /\bdefinitively\b/i,
  /\bICD-?10\b/i,
  /\b[A-Z][0-9]{2}\.[0-9X]+/,
];

const APPROVED_UNCERTAINTY = [
  'suggests',
  'patterns consistent with',
  'review recommended',
  'evidence',
  'suspect',
  'potential',
  'estimated',
];

function hasDiagnosticLanguage(text) {
  if (!text || typeof text !== 'string') return false;
  return DIAGNOSTIC_PATTERNS.some((p) => p.test(text));
}

function checkEvidence(riskOutput) {
  const issues = [];
  for (const h of riskOutput.suspect_hccs || []) {
    if (!h.evidence || h.evidence.length < 2) {
      issues.push(`Insufficient evidence for ${h.condition || h.hcc_code}`);
    }
    const combined = (h.evidence || []).concat([h.condition]).join(' ');
    if (hasDiagnosticLanguage(combined)) {
      issues.push(`Diagnostic language detected for ${h.condition || h.hcc_code}`);
    }
  }
  if (riskOutput.overall_commentary && hasDiagnosticLanguage(riskOutput.overall_commentary)) {
    issues.push('Diagnostic language in commentary');
  }
  return issues;
}

export function runComplianceAgent(riskOutput, financeOutput) {
  const notes = [];
  let compliance_status = 'APPROVED';
  let risk_level = 'LOW';

  const evidenceIssues = checkEvidence(riskOutput);
  if (evidenceIssues.length > 0) {
    compliance_status = 'REVIEW_REQUIRED';
    risk_level = 'MEDIUM';
    notes.push(...evidenceIssues);
  } else {
    notes.push('Language compliant');
    notes.push('Evidence thresholds met');
    notes.push('No diagnostic claims detected');
  }

  const hasSuspects = (riskOutput.suspect_hccs || []).length > 0;
  const revenueUplift = financeOutput?.financial_impact?.estimated_revenue_uplift ?? 0;
  if (hasSuspects && revenueUplift > 10000) risk_level = 'MEDIUM';
  if (hasSuspects && revenueUplift > 25000) risk_level = 'HIGH';

  return {
    member_id: riskOutput.member_id,
    compliance_status,
    notes,
    risk_level,
  };
}
