'use client';

export default function SkillBadge({ skill, onRemove }) {
  return (
    <span className="role-badge">
      <span>{skill.icon}</span>
      <span>{skill.name}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="role-badge-remove"
          title={`Remove ${skill.name}`}
        >
          {'\u00d7'}
        </button>
      )}
    </span>
  );
}
