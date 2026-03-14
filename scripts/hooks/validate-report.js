/**
 * Hook: validate-report.js
 * Validates markdown report structure.
 * Checks for required sections, summary table, bug ID format.
 */

const fs = require('fs');

const REQUIRED_SECTIONS = ['Summary', 'Test Results'];
const BUG_ID_PATTERN = /S\d+-B\d+/;

function validateReport(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Report file not found:', filePath);
    process.exit(2);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const warnings = [];

    // Check for required sections (## heading)
    for (const section of REQUIRED_SECTIONS) {
      const regex = new RegExp(`^#+\\s*${section}`, 'im');
      if (!regex.test(content)) {
        warnings.push(`Missing section: ${section}`);
      }
    }

    // Check for summary table (pipe-separated)
    if (!content.includes('|') || !content.includes('---')) {
      warnings.push('No markdown table found (expected summary table)');
    }

    // Check bug IDs follow convention
    const bugMentions = content.match(/\b[A-Z]\d+-[A-Z]\d+\b/g) || [];
    for (const bug of bugMentions) {
      if (!BUG_ID_PATTERN.test(bug)) {
        warnings.push(`Non-standard bug ID format: ${bug} (expected SX-BY)`);
      }
    }

    if (warnings.length > 0) {
      console.log('Report validation warnings:');
      warnings.forEach(w => console.log(`  - ${w}`));
    } else {
      console.log('Report validation passed');
    }

    // Warnings don't block — exit 0
    process.exit(0);
  } catch (e) {
    console.error('Report validation error:', e.message);
    process.exit(0); // Don't block on parse errors
  }
}

const file = process.env.HOOK_FILE || process.argv[2];
if (file) validateReport(file);
else { console.log('No file specified, skipping'); process.exit(0); }

module.exports = { validate: (ctx) => {
  if (!ctx.file) return { valid: true };
  try {
    const content = fs.readFileSync(ctx.file, 'utf8');
    const hasSummary = /^#+\s*Summary/im.test(content);
    const hasResults = /^#+\s*Test Results/im.test(content);
    return { valid: true, message: `Sections: Summary=${hasSummary}, Results=${hasResults}` };
  } catch (e) {
    return { valid: true, message: `Parse warning: ${e.message}` };
  }
}};
