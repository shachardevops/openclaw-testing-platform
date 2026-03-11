const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // All route handlers use Node.js runtime (needed for child_process, fs)
  serverExternalPackages: ['ws'],
  // Ensure correct project root when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
