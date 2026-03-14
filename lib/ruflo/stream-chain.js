/**
 * Ruflo Stream Chain — NDJSON pipeline for streaming task output.
 *
 * Each stage emits typed NDJSON events:
 *   { type: "finding", ... }
 *   { type: "test-result", ... }
 *   { type: "checkpoint", ... }
 *   { type: "progress", ... }
 *   { type: "error", ... }
 */

import { Transform, PassThrough } from 'stream';

/**
 * StreamChain — connects Transform stages into a pipeline.
 */
export class StreamChain {
  constructor(name = 'chain') {
    this.name = name;
    this._stages = [];
    this._input = new PassThrough({ objectMode: true });
  }

  /**
   * Add a transform stage.
   */
  addStage(transform) {
    this._stages.push(transform);
    return this;
  }

  /**
   * Build the pipeline and return the output stream.
   */
  build() {
    let current = this._input;
    for (const stage of this._stages) {
      current = current.pipe(stage);
    }
    return current;
  }

  /**
   * Write an event into the chain.
   */
  write(event) {
    this._input.write(event);
  }

  /**
   * Signal end of input.
   */
  end() {
    this._input.end();
  }
}

/**
 * Create a Transform that parses NDJSON lines into objects.
 */
export function ndjsonParse() {
  let buffer = '';
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed lines
        }
      }
      callback();
    },
    flush(callback) {
      if (buffer.trim()) {
        try { this.push(JSON.parse(buffer.trim())); } catch { /* skip */ }
      }
      callback();
    },
  });
}

/**
 * Create a Transform that serializes objects to NDJSON lines.
 */
export function ndjsonStringify() {
  return new Transform({
    objectMode: true,
    transform(obj, encoding, callback) {
      try {
        this.push(JSON.stringify(obj) + '\n');
      } catch {
        // Skip unserializable
      }
      callback();
    },
  });
}

/**
 * Create a typed event.
 */
export function createEvent(type, data, meta = {}) {
  return {
    type,
    ts: Date.now(),
    ...data,
    ...meta,
  };
}
