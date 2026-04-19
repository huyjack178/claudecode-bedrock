#!/usr/bin/env node
const cleanup = process.argv.includes('--cleanup') || process.argv.includes('--reset');
const auto = process.argv.includes('--yes') || process.argv.includes('-y') || process.argv.includes('--auto');
const target = cleanup ? '../src/cleanup.js' : auto ? '../src/setup-auto.js' : '../src/setup.js';
import(target).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
