/**
 * Ruflo Stream Transforms — built-in transform stages for stream chains.
 */

import { Transform, PassThrough } from 'stream';

/**
 * Filter events by type.
 */
export function filterByType(type) {
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      if (event.type === type) this.push(event);
      callback();
    },
  });
}

/**
 * Filter events by predicate.
 */
export function filter(predicate) {
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      if (predicate(event)) this.push(event);
      callback();
    },
  });
}

/**
 * Map/transform events.
 */
export function map(fn) {
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      try {
        const result = fn(event);
        if (result !== undefined) this.push(result);
      } catch { /* skip */ }
      callback();
    },
  });
}

/**
 * Aggregate events into a summary.
 * Collects all events and emits a single summary on flush.
 */
export function aggregate(reducer, initial = {}) {
  let acc = typeof initial === 'function' ? initial() : { ...initial };
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      try {
        acc = reducer(acc, event);
      } catch { /* skip */ }
      callback();
    },
    flush(callback) {
      this.push({ type: 'aggregate', ...acc, ts: Date.now() });
      callback();
    },
  });
}

/**
 * Tee — split stream to multiple consumers.
 * Returns the main pass-through; also writes to all provided writable streams.
 */
export function tee(...targets) {
  const main = new PassThrough({ objectMode: true });
  const original = main.write.bind(main);

  main.write = function(chunk, encoding, callback) {
    for (const target of targets) {
      try { target.write(chunk); } catch { /* skip failed target */ }
    }
    return original(chunk, encoding, callback);
  };

  const originalEnd = main.end.bind(main);
  main.end = function(...args) {
    for (const target of targets) {
      try { target.end(); } catch { /* skip */ }
    }
    return originalEnd(...args);
  };

  return main;
}

/**
 * Batch events into groups of N.
 */
export function batch(size = 10) {
  let buffer = [];
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      buffer.push(event);
      if (buffer.length >= size) {
        this.push({ type: 'batch', events: buffer, count: buffer.length, ts: Date.now() });
        buffer = [];
      }
      callback();
    },
    flush(callback) {
      if (buffer.length > 0) {
        this.push({ type: 'batch', events: buffer, count: buffer.length, ts: Date.now() });
      }
      callback();
    },
  });
}

/**
 * Throttle events to at most one per interval.
 */
export function throttle(intervalMs = 1000) {
  let lastEmitTs = 0;
  let pending = null;
  return new Transform({
    objectMode: true,
    transform(event, encoding, callback) {
      const now = Date.now();
      if (now - lastEmitTs >= intervalMs) {
        this.push(event);
        lastEmitTs = now;
        pending = null;
      } else {
        pending = event;
      }
      callback();
    },
    flush(callback) {
      if (pending) this.push(pending);
      callback();
    },
  });
}
