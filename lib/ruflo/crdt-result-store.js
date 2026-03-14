/**
 * Ruflo CRDT Result Store — wraps result JSON files with CRDT merge semantics.
 *
 * Fields:
 *   - passed, failed, warnings: G-Counter (only increment)
 *   - status, lastLog, progress: LWW-Register (latest wins)
 *   - findings: OR-Set (union of adds minus observed removes)
 *
 * CRDT metadata stored in `_crdt` field of result JSON.
 */

import fs from 'fs';
import path from 'path';
import { GCounter, LWWRegister, ORSet } from './crdt.js';
import { resultsDir } from '@/lib/config';

function resultPath(taskId) {
  return path.join(resultsDir(), `${taskId}.json`);
}

/**
 * Read a result file with CRDT state.
 */
export function crdtRead(taskId) {
  const filePath = resultPath(taskId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

/**
 * Write updates to a result file using CRDT merge.
 * @param {string} taskId
 * @param {Object} updates - Fields to update
 * @param {string} source - Identity of the writer (e.g., 'agent', 'dashboard', 'orchestrator')
 */
export function crdtWrite(taskId, updates, source = 'dashboard') {
  const filePath = resultPath(taskId);
  let data = {};
  let crdt = { counters: {}, registers: {}, sets: {} };

  try {
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      crdt = data._crdt || crdt;
    }
  } catch { /* start fresh */ }

  // G-Counter fields
  for (const field of ['passed', 'failed', 'warnings']) {
    if (updates[field] !== undefined) {
      const counter = GCounter.fromJSON(crdt.counters[field]);
      const currentValue = counter.value();
      const newValue = Number(updates[field]);
      if (newValue > currentValue) {
        counter.increment(source, newValue - currentValue);
      }
      crdt.counters[field] = counter.toJSON();
      data[field] = counter.value();
    }
  }

  // LWW-Register fields
  for (const field of ['status', 'lastLog', 'progress', 'model', 'startedAt', 'finishedAt', 'updatedAt']) {
    if (updates[field] !== undefined) {
      const reg = LWWRegister.fromJSON(crdt.registers[field]);
      reg.set(updates[field], source);
      crdt.registers[field] = reg.toJSON();
      data[field] = reg.value;
    }
  }

  // OR-Set for findings
  if (updates.findings) {
    const set = ORSet.fromJSON(crdt.sets.findings);
    for (const finding of updates.findings) {
      const fid = finding.id || `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (!set.has(fid)) {
        set.add(fid, source);
      }
    }
    crdt.sets.findings = set.toJSON();

    // Rebuild findings array from OR-Set + original findings data
    const activeIds = new Set(set.values());
    const existingFindings = (data.findings || []).filter(f => activeIds.has(f.id));
    const existingIds = new Set(existingFindings.map(f => f.id));
    const newFindings = updates.findings.filter(f => f.id && activeIds.has(f.id) && !existingIds.has(f.id));
    data.findings = [...existingFindings, ...newFindings];
  }

  // Pass through non-CRDT fields
  for (const [key, value] of Object.entries(updates)) {
    if (!['passed', 'failed', 'warnings', 'status', 'lastLog', 'progress', 'model',
          'startedAt', 'finishedAt', 'updatedAt', 'findings'].includes(key)) {
      data[key] = value;
    }
  }

  data._crdt = crdt;
  data.updatedAt = data.updatedAt || new Date().toISOString();

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  return data;
}

/**
 * Remove a finding using CRDT OR-Set remove.
 */
export function crdtRemoveFinding(taskId, findingId) {
  const filePath = resultPath(taskId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const crdt = data._crdt || { counters: {}, registers: {}, sets: {} };

    const set = ORSet.fromJSON(crdt.sets.findings);
    set.remove(findingId);
    crdt.sets.findings = set.toJSON();

    data.findings = (data.findings || []).filter(f => f.id !== findingId);
    data._crdt = crdt;
    data.updatedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data;
  } catch {
    return null;
  }
}
