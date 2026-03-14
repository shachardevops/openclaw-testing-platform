/**
 * Ruflo Chain Bus — in-memory event buses for stream chains.
 */

const _chains = new Map();

export function getChainBus(chainId) {
  if (!_chains.has(chainId)) {
    _chains.set(chainId, []);
  }
  return _chains.get(chainId);
}

export function pushChainEvent(chainId, event) {
  const bus = getChainBus(chainId);
  bus.push(event);
  if (bus.length > 1000) bus.splice(0, bus.length - 1000);
}
