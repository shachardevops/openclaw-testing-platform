/**
 * Ruflo Semantic Search — high-level search API over RuVector collections.
 */

import { getVectorStore } from './ruvector-store.js';

/**
 * Find similar bugs by description.
 */
export async function findSimilarBugs(description, limit = 5) {
  const store = await getVectorStore();
  return store.search(description, 'bugs', limit);
}

/**
 * Find relevant module notes for a story's target pages.
 */
export async function findRelevantNotes(storyId, limit = 5) {
  const store = await getVectorStore();
  return store.search(`story ${storyId} test cases modules pages`, 'module-notes', limit);
}

/**
 * Find related past runs with similar context.
 */
export async function findRelatedRuns(storyId, model, limit = 3) {
  const store = await getVectorStore();
  const query = `${storyId} ${model || ''} run results bugs findings`;
  return store.search(query, 'run-history', limit);
}

/**
 * Find similar orchestrator decisions for pattern matching.
 */
export async function findSimilarDecisions(pattern, limit = 3) {
  const store = await getVectorStore();
  return store.search(pattern, 'decisions', limit);
}

/**
 * Search across all collections.
 */
export async function searchAll(query, limit = 5) {
  const store = await getVectorStore();
  const collections = ['bugs', 'module-notes', 'run-history', 'agent-issues', 'decisions'];
  const results = {};

  for (const collection of collections) {
    try {
      results[collection] = await store.search(query, collection, limit);
    } catch {
      results[collection] = [];
    }
  }

  return results;
}
