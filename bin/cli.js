#!/usr/bin/env node
const auto = process.argv.includes('--yes') || process.argv.includes('-y') || process.argv.includes('--auto');
import(auto ? '../src/setup-auto.js' : '../src/setup.js').catch(err => {
  console.error(err.message);
  process.exit(1);
});
