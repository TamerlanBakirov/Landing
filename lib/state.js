import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function loadJSON(path, fallback = []) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function saveJSON(path, data) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function appendLead(lead) {
  const leads = loadJSON('database/leads.json', []);
  // De-duplicate so a business is only ever added (and later pitched) once.
  // Match on any of: OSM place_id, name+city, or email address.
  const emailLc = (lead.email || '').trim().toLowerCase();
  const exists = leads.some(l => {
    if (lead.place_id && l.place_id && l.place_id === lead.place_id) return true;
    if (l.name === lead.name && l.city === lead.city) return true;
    const lEmail = (l.email || '').trim().toLowerCase();
    if (emailLc && lEmail && lEmail === emailLc) return true;
    return false;
  });
  if (exists) return false;
  leads.push({ ...lead, created_at: new Date().toISOString() });
  saveJSON('database/leads.json', leads);
  return true;
}

export function updateLead(name, city, updates) {
  const leads = loadJSON('database/leads.json', []);
  const idx = leads.findIndex(l => l.name === name && l.city === city);
  if (idx === -1) return false;
  leads[idx] = { ...leads[idx], ...updates, updated_at: new Date().toISOString() };
  saveJSON('database/leads.json', leads);
  return true;
}

export function getLeadsByStage(stage) {
  const leads = loadJSON('database/leads.json', []);
  return leads.filter(l => l.stage === stage);
}

export function getLeadsByMinScore(minScore) {
  const leads = loadJSON('database/leads.json', []);
  return leads.filter(l => (l.score || 0) >= minScore);
}

export function logAction(agent, action, details = {}) {
  const today = new Date().toISOString().split('T')[0];
  const logPath = `database/logs/${today}.json`;
  const logs = loadJSON(logPath, []);
  logs.push({
    timestamp: new Date().toISOString(),
    agent,
    action,
    ...details
  });
  saveJSON(logPath, logs);
}

export function loadConfig() {
  return loadJSON('config.json', {});
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[őŐ]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/[űŰ]/g, 'u')
    .replace(/[ýỳŷÿ]/g, 'y')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
