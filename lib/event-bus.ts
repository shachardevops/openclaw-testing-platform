/**
 * Server-side event bus for SSE broadcasting.
 * Replaces client-side polling with push-based updates.
 */

export interface SSEEvent {
  type: string;
  data: unknown;
  ts: number;
}

type Listener = (event: SSEEvent) => void;

class EventBus {
  private _listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  emit(type: string, data: unknown): void {
    const event: SSEEvent = { type, data, ts: Date.now() };
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* don't let one bad listener break others */ }
    }
  }

  get listenerCount(): number {
    return this._listeners.size;
  }
}

const eventBus = new EventBus();
export default eventBus;
