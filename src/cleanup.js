import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';

// ── colours ───────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};

const info    = (...a) => console.log(`${c.cyan}[info]${c.reset}  `, ...a);
const success = (...a) => console.log(`${c.green}[ok]${c.reset}    `, ...a);
const warn    = (...a) => console.log(`${c.yellow}[warn]${c.reset}  `, ...a);

const rl = createInterface({ input, output });
const ask = async (question, defaultVal = '') => {
  const hint = defaultVal ? ` [${defaultVal}]` : '';
  const answer = await rl.question(`  ${question}${hint}: `);
  return answer.trim() || defaultVal;
};

// ── helpers ───────────────────────────────────────────────────────────────────
const ENV_KEYS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
];

const MARKERS = [
  '# Claude Code + API Gateway',
  '# Claude Code + Amazon Bedrock',
];

function removeMarkersFromProfile(content) {
  let lines = content.split('\n');
  const result = [];
  let skip = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MARKERS.some(m => line.trim() === m)) {
      // Remove preceding blank line if we added it
      if (result.length && result[result.length - 1].trim() === '') {
        result.pop();
      }
      skip = true;
      continue;
    }
    // Stop skipping at the next blank line after the export block,
    // or when we hit a line that doesn't look like an export
    if (skip) {
      if (line.startsWith('export ') || line.trim() === '') {
        continue;
      }
      skip = false;
    }
    result.push(line);
  }

  return result.join('\n');
}

// ── main ──────────────────────────────────────────────────────────────────────
console.log(`\n${c.bold}Claude Code — Cleanup${c.reset}\n`);

const confirm = await ask('This will remove all Claude Code gateway config. Continue? (y/N)', 'N');
if (!/^y/i.test(confirm)) {
  info('Aborted.');
  rl.close();
  process.exit(0);
}

// 1. settings.json
const settingsPath = join(homedir(), '.claude', 'settings.json');
if (existsSync(settingsPath)) {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (settings.env) {
      for (const key of ENV_KEYS) delete settings.env[key];
      if (Object.keys(settings.env).length === 0) delete settings.env;
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    success(`Removed env keys from ${settingsPath}`);
  } catch (e) {
    warn(`Could not update ${settingsPath}: ${e.message}`);
  }
} else {
  info('No settings.json found — skipping.');
}

// 2. Shell profile
const shell = process.env.SHELL ?? '';
const profiles = [
  join(homedir(), '.zshrc'),
  join(homedir(), '.bashrc'),
  join(homedir(), '.config', 'fish', 'config.fish'),
];

for (const profileFile of profiles) {
  if (!existsSync(profileFile)) continue;
  const original = readFileSync(profileFile, 'utf8');
  const cleaned = removeMarkersFromProfile(original);
  if (cleaned !== original) {
    writeFileSync(profileFile, cleaned, 'utf8');
    success(`Removed exports from ${profileFile}`);
  }
}

rl.close();

console.log(`
${c.green}${c.bold}Cleanup complete!${c.reset}

  Open a new terminal (or run ${c.cyan}source ~/.zshrc${c.reset}) to apply the changes.
`);
