/**
 * Ruflo CRDT — Conflict-Free Replicated Data Types for concurrent writes.
 *
 * Types:
 *   - GCounter: increment-only counter, merge = max per source
 *   - LWWRegister: last-writer-wins register with Lamport timestamps
 *   - ORSet: observed-remove set — union of adds minus observed removes
 */

/**
 * G-Counter: grow-only counter.
 * State: { [source]: count }
 */
export class GCounter {
  constructor(state = {}) {
    this.state = { ...state };
  }

  increment(source, amount = 1) {
    this.state[source] = (this.state[source] || 0) + amount;
    return this;
  }

  value() {
    return Object.values(this.state).reduce((a, b) => a + b, 0);
  }

  merge(other) {
    const merged = new GCounter(this.state);
    for (const [source, count] of Object.entries(other.state || other)) {
      merged.state[source] = Math.max(merged.state[source] || 0, count);
    }
    return merged;
  }

  toJSON() {
    return { ...this.state };
  }

  static fromJSON(json) {
    return new GCounter(json || {});
  }
}

/**
 * LWW-Register: last-writer-wins register with Lamport timestamps.
 * State: { value, ts, source }
 */
export class LWWRegister {
  constructor(value = null, ts = 0, source = '') {
    this.value = value;
    this.ts = ts;
    this.source = source;
  }

  set(value, source) {
    this.value = value;
    this.ts = Date.now();
    this.source = source;
    return this;
  }

  merge(other) {
    const otherTs = other.ts || 0;
    const otherVal = other.value;
    const otherSource = other.source || '';

    if (otherTs > this.ts || (otherTs === this.ts && otherSource > this.source)) {
      return new LWWRegister(otherVal, otherTs, otherSource);
    }
    return new LWWRegister(this.value, this.ts, this.source);
  }

  toJSON() {
    return { value: this.value, ts: this.ts, source: this.source };
  }

  static fromJSON(json) {
    if (!json) return new LWWRegister();
    return new LWWRegister(json.value, json.ts || 0, json.source || '');
  }
}

/**
 * OR-Set: observed-remove set.
 * State: { elements: Map<elementId, Set<uniqueTag>>, tombstones: Set<uniqueTag> }
 */
export class ORSet {
  constructor() {
    this.elements = new Map(); // elementId -> Set of unique tags
    this.tombstones = new Set();
    this._tagCounter = 0;
  }

  _newTag(source) {
    return `${source}:${Date.now()}:${++this._tagCounter}`;
  }

  add(elementId, source = 'default') {
    const tag = this._newTag(source);
    if (!this.elements.has(elementId)) {
      this.elements.set(elementId, new Set());
    }
    this.elements.get(elementId).add(tag);
    return this;
  }

  remove(elementId) {
    const tags = this.elements.get(elementId);
    if (tags) {
      for (const tag of tags) {
        this.tombstones.add(tag);
      }
      this.elements.delete(elementId);
    }
    return this;
  }

  has(elementId) {
    const tags = this.elements.get(elementId);
    if (!tags) return false;
    for (const tag of tags) {
      if (!this.tombstones.has(tag)) return true;
    }
    return false;
  }

  values() {
    const result = [];
    for (const [elementId, tags] of this.elements) {
      for (const tag of tags) {
        if (!this.tombstones.has(tag)) {
          result.push(elementId);
          break;
        }
      }
    }
    return result;
  }

  merge(other) {
    const merged = new ORSet();
    merged.tombstones = new Set([...this.tombstones, ...(other.tombstones || [])]);

    // Merge elements
    const allKeys = new Set([
      ...this.elements.keys(),
      ...(other.elements instanceof Map ? other.elements.keys() : Object.keys(other.elements || {})),
    ]);

    for (const key of allKeys) {
      const tags = new Set();
      const aTags = this.elements.get(key) || new Set();
      const bTags = other.elements instanceof Map
        ? (other.elements.get(key) || new Set())
        : new Set(other.elements?.[key] || []);

      for (const tag of aTags) tags.add(tag);
      for (const tag of bTags) tags.add(tag);

      // Remove tombstoned tags
      for (const tag of merged.tombstones) tags.delete(tag);

      if (tags.size > 0) {
        merged.elements.set(key, tags);
      }
    }

    return merged;
  }

  toJSON() {
    const elements = {};
    for (const [key, tags] of this.elements) {
      elements[key] = [...tags];
    }
    return { elements, tombstones: [...this.tombstones] };
  }

  static fromJSON(json) {
    const set = new ORSet();
    if (!json) return set;
    if (json.elements) {
      for (const [key, tags] of Object.entries(json.elements)) {
        set.elements.set(key, new Set(tags));
      }
    }
    if (json.tombstones) {
      set.tombstones = new Set(json.tombstones);
    }
    return set;
  }
}
