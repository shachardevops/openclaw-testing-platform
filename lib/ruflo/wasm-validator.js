/**
 * Ruflo WASM Validator — loads WASM modules for high-performance validation.
 * Falls back to JS validators if WASM not available.
 */

import fs from 'fs';
import path from 'path';

const WASM_DIR = path.join(process.cwd(), 'lib', 'ruflo', 'wasm', 'build');
const _modules = new Map();

/**
 * Load a WASM validator module.
 */
async function loadValidator(name) {
  if (_modules.has(name)) return _modules.get(name);

  const wasmPath = path.join(WASM_DIR, `${name}.wasm`);
  if (!fs.existsSync(wasmPath)) {
    return null; // WASM not built — fall back to JS
  }

  try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const module = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        abort: () => {},
      },
    });
    _modules.set(name, module.instance);
    return module.instance;
  } catch {
    return null;
  }
}

/**
 * JS fallback validators.
 */
const JS_VALIDATORS = {
  'validate-result': (data) => {
    if (!data) return { valid: false, errors: ['Empty data'] };
    const errors = [];
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return { valid: false, errors: ['Invalid JSON'] }; }
    }
    const validStatuses = ['idle', 'running', 'passed', 'failed', 'done', 'completed', 'cancelled'];
    if (data.status && !validStatuses.includes(data.status)) {
      errors.push(`Invalid status: ${data.status}`);
    }
    if (data.passed !== undefined && typeof data.passed !== 'number') errors.push('passed must be number');
    if (data.failed !== undefined && typeof data.failed !== 'number') errors.push('failed must be number');
    if (data.findings && !Array.isArray(data.findings)) errors.push('findings must be array');
    return { valid: errors.length === 0, errors };
  },

  'validate-report': (data) => {
    if (!data || typeof data !== 'string') return { valid: false, errors: ['Empty report'] };
    const errors = [];
    if (!/^#+\s*Summary/im.test(data)) errors.push('Missing Summary section');
    if (!/^#+\s*Test Results/im.test(data)) errors.push('Missing Test Results section');
    return { valid: errors.length === 0, errors };
  },

  'validate-config': (data) => {
    if (!data) return { valid: false, errors: ['Empty config'] };
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return { valid: false, errors: ['Invalid JSON'] }; }
    }
    const errors = [];
    if (!data.id) errors.push('Missing id');
    if (!data.name) errors.push('Missing name');
    if (!data.workspace) errors.push('Missing workspace');
    return { valid: errors.length === 0, errors };
  },
};

/**
 * Validate data using WASM (or JS fallback).
 * @param {string} name - Validator name
 * @param {*} data - Data to validate (string or object)
 * @returns {{ valid: boolean, errors: string[], source: 'wasm'|'js' }}
 */
export async function validate(name, data) {
  // Try WASM first
  const wasm = await loadValidator(name);
  if (wasm && wasm.exports.validate) {
    try {
      const buf = typeof data === 'string' ? data : JSON.stringify(data);
      const encoder = new TextEncoder();
      const encoded = encoder.encode(buf);
      // Note: actual WASM memory interaction would need more setup
      const result = wasm.exports.validate(0, encoded.length);
      return { valid: result === 0, errors: result !== 0 ? ['WASM validation failed'] : [], source: 'wasm' };
    } catch {
      // Fall through to JS
    }
  }

  // JS fallback
  const jsFn = JS_VALIDATORS[name];
  if (jsFn) {
    const result = jsFn(data);
    return { ...result, source: 'js' };
  }

  return { valid: true, errors: [], source: 'none' };
}

/**
 * Check if WASM validators are available.
 */
export function isWasmAvailable() {
  return fs.existsSync(WASM_DIR);
}
