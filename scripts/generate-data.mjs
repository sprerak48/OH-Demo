#!/usr/bin/env node
/**
 * Synthetic Healthcare Payer Data Generator
 * Generates ~10K members and ~100K claims with HCC/RAF attributes.
 * No PHI, no real identifiers. Deterministic seeding.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const US_STATES = [
  'NY', 'CA', 'TX', 'FL', 'NJ', 'IL', 'PA', 'GA', 'OH', 'NC',
  'MI', 'AZ', 'WA', 'MA', 'CO', 'VA', 'TN', 'IN', 'MO', 'MD',
];

const PLAN_TYPES = ['Bronze', 'Silver', 'Gold'];
const CLAIM_TYPES = ['IP', 'OP', 'RX'];

// Simplified HCC codes for demo (not real CMS)
const HCC_CODES = ['HCC_18', 'HCC_85', 'HCC_96', 'HCC_108', 'HCC_19'];
const PLAN_WEIGHTS = [0.4, 0.35, 0.25];

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pickWeighted(seed, weights) {
  const r = seededRandom(seed);
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r < cum) return i;
  }
  return weights.length - 1;
}

console.log('Generating synthetic members with HCC codes...');
const members = [];
for (let i = 1; i <= 10_000; i++) {
  const seed = i * 7919;
  const planIdx = pickWeighted(seed, PLAN_WEIGHTS);
  const stateIdx = Math.floor(seededRandom(seed + 1) * US_STATES.length);
  const riskRaw = seededRandom(seed + 2);
  const risk_score = Math.round((1 - Math.sqrt(1 - riskRaw)) * 1000) / 1000;
  const chronic_condition_flag = risk_score > 0.6 ? true : seededRandom(seed + 3) < 0.15;
  const age = Math.floor(18 + seededRandom(seed + 4) * 67);

  // Assign HCCs: higher risk = more likely to have HCCs; no double-counting
  const hcc_codes = [];
  if (risk_score > 0.5 && seededRandom(seed + 10) < 0.35) hcc_codes.push('HCC_19'); // Hypertension
  if (risk_score > 0.6 && seededRandom(seed + 11) < 0.2) hcc_codes.push('HCC_18');  // Diabetes
  if (risk_score > 0.7 && seededRandom(seed + 12) < 0.12) hcc_codes.push('HCC_85'); // CHF
  if (chronic_condition_flag && seededRandom(seed + 13) < 0.15) hcc_codes.push('HCC_96'); // COPD
  if (risk_score > 0.75 && seededRandom(seed + 14) < 0.1) hcc_codes.push('HCC_108'); // CKD

  members.push({
    member_id: `M${String(i).padStart(6, '0')}`,
    age,
    gender: seededRandom(seed + 5) < 0.5 ? 'F' : 'M',
    state: US_STATES[stateIdx],
    plan_type: PLAN_TYPES[planIdx],
    risk_score,
    chronic_condition_flag,
    hcc_codes,
    member_months: 12,
  });
}

console.log('Generating synthetic claims (~100K)...');
const claims = [];
let claimId = 1;
const startDate = new Date('2024-01-01');
for (let m = 0; m < members.length; m++) {
  const member = members[m];
  const numClaims = Math.floor(3 + seededRandom(m * 7) * 18);
  for (let c = 0; c < numClaims; c++) {
    const cSeed = (m * 10000 + c) * 31;
    const claimTypeIdx = pickWeighted(cSeed, [0.1, 0.4, 0.5]);
    const claim_type = CLAIM_TYPES[claimTypeIdx];
    const daysFromStart = Math.floor(seededRandom(cSeed + 1) * 730);
    const service_date = new Date(startDate);
    service_date.setDate(service_date.getDate() + daysFromStart);
    let baseCost = claim_type === 'IP' ? 8000 : claim_type === 'OP' ? 350 : 85;
    baseCost *= (0.7 + seededRandom(cSeed + 2));
    baseCost *= (0.9 + member.risk_score * 0.3);
    const allowed_amount = Math.round(baseCost * 100) / 100;
    claims.push({
      claim_id: `CLM${String(claimId++).padStart(8, '0')}`,
      member_id: member.member_id,
      service_date: service_date.toISOString().split('T')[0],
      claim_type,
      allowed_amount,
    });
  }
}

if (claims.length > 100_000) claims.length = 100_000;

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(join(DATA_DIR, 'members.json'), JSON.stringify(members), 'utf-8');
writeFileSync(join(DATA_DIR, 'claims.json'), JSON.stringify(claims), 'utf-8');
console.log(`Done. ${members.length} members, ${claims.length} claims written to ${DATA_DIR}/`);
