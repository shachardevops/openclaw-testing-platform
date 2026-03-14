// ── Project identity ─────────────────────────────────────────────
export const PROJECT = {
  name: 'OrderTu QA Command Center',
  subtitle: 'Multi-Agent Testing Platform',
  icon: '⚡',
  workspace: '~/.openclaw/workspace/qa-dashboard',
};

// ── Models ──────────────────────────────────────────────────────
export const MODELS = [
  { id: 'anthropic/claude-opus-4-6', short: 'Opus', color: '#f472b6' },
  { id: 'anthropic/claude-sonnet-4-6', short: 'Sonnet', color: '#c084fc' },
  { id: 'anthropic/claude-haiku-4-5', short: 'Haiku', color: '#22d3ee' },
  { id: 'openai-codex/gpt-5.3-codex', short: 'GPT-5.3', color: '#4ade80' },
];

// ── Skills (attachable test perspectives) ───────────────────────
// Canonical skills are defined in config/ordertu-qa/skills.json.
// This legacy list is kept for backward compatibility only.
export const SKILLS = [
  { id: 'verbose', name: 'Verbose Output', icon: '📝', description: 'Produce detailed step-by-step output with reasoning for each action taken.' },
  { id: 'strict', name: 'Strict Mode', icon: '🛡️', description: 'Enforce strict validation — treat any warning as a failure. Do not skip minor issues.' },
  { id: 'retry-on-fail', name: 'Retry on Failure', icon: '🔄', description: 'Automatically retry failed steps up to 3 times before reporting as failed.' },
  { id: 'responsive-checks', name: 'Responsive', icon: '📐', description: 'Validate responsive layouts and breakpoint behavior using the live browser and recordings.' },
  { id: 'mobile-checks', name: 'Mobile', icon: '📱', description: 'Run a dedicated phone-sized viewport pass and capture mobile-specific behavior in the browser and recordings.' },
  { id: 'report', name: 'Detailed Report', icon: '📊', description: 'Generate a comprehensive markdown report.' },
];

// ── Tasks (pipeline units) ──────────────────────────────────────
export const TASKS = [
  { id: 'story-0', num: '0', title: 'Admin Foundation Setup', actor: 'Admin', icon: '🏗️',
    desc: 'Products, intake, supplier orders, consignment', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: [] },
  { id: 'story-1', num: '1', title: 'Buyer Browses & Purchases', actor: 'Buyer', icon: '🛒',
    desc: 'Catalog → options → cart → checkout → tracking', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-2', num: '2', title: 'Admin Manages Order', actor: 'Admin', icon: '📋',
    desc: 'Confirm → reserve → payment → ship → deliver', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-1'] },
  { id: 'story-3', num: '3', title: 'Supplier Manufactures', actor: 'Supplier+Admin', icon: '🔨',
    desc: 'Accept → materials → production → intake → ship', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-4', num: '4', title: 'Distributor Sells & Returns', actor: 'Distributor+Admin', icon: '🏪',
    desc: 'Report sale → create order → return unsold', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-5', num: '5', title: 'Cross-Portal Threads', actor: 'All Roles', icon: '💬',
    desc: 'Threads, replies, @mentions, internal notes', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-1', 'story-3', 'story-4'] },
  { id: 'story-6', num: '6', title: 'Admin Manual Order', actor: 'Admin', icon: '✏️',
    desc: 'Create, edit, cancel orders — inventory impact', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-7', num: '7', title: 'Inventory Lifecycle', actor: 'Admin', icon: '📦',
    desc: 'Search, detail, stock count, movement tracking', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-8', num: '8', title: 'Shipment Lifecycle', actor: 'Admin', icon: '🚚',
    desc: 'All 5 types: transfer, consignment, sale, return, supplier', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-9', num: '9', title: 'Semi-Mounts & Assembly', actor: 'Admin', icon: '💍',
    desc: 'Rings + crowns + stones → assembly orders', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-11', num: '11', title: 'Activity Log & Audit Trail', actor: 'Admin', icon: '📜',
    desc: 'Activity log page, entity events, performer resolution', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-12', num: '12', title: 'Supplier Orders (Admin)', actor: 'Admin', icon: '📝',
    desc: 'Creation form, items, ship-to, notes, validation', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-13', num: '13', title: 'RTL, i18n & Localization', actor: 'Admin', icon: '🌐',
    desc: 'Hebrew locale, logical CSS, directional icons, translations', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
  { id: 'story-14', num: '14', title: 'Security & Access Control', actor: 'All Roles', icon: '🔒',
    desc: 'Auth checks, RLS, XSS, input validation, RBAC', defaultModel: 'anthropic/claude-sonnet-4-6', defaultSkills: [], deps: ['story-0'] },
];

// ── Pipelines ───────────────────────────────────────────────────
export const PIPELINES = [
  { id: 'full-regression', name: 'Full Regression', taskIds: TASKS.map(t => t.id) },
  { id: 'smoke-test', name: 'Smoke Test', taskIds: ['story-0', 'story-1'] },
  { id: 'buyer-flow', name: 'Buyer Flow', taskIds: ['story-0', 'story-1', 'story-2'] },
];
