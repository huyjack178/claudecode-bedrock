import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { stdin as input, stdout as output, exit } from 'node:process';

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

function run(cmd) {
  try { return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim(); } catch { return null; }
}

function semverAtLeast(version, major, minor, patch) {
  const [maj, min, pat] = version.split('.').map(Number);
  if (maj !== major) return maj > major;
  if (min !== minor) return min > minor;
  return pat >= patch;
}

const rl = createInterface({ input, output });
const ask = async (question, defaultVal = '') => {
  const hint = defaultVal ? ` [${defaultVal}]` : '';
  const answer = await rl.question(`  ${question}${hint}: `);
  return answer.trim() || defaultVal;
};

// ── main ──────────────────────────────────────────────────────────────────────
console.log(`\n${c.bold}Claude Code — Backend Setup${c.reset}\n`);

// 1. Check claude CLI
if (!run('command -v claude')) {
  console.error(`${c.red}[error]${c.reset}  Claude Code CLI not found.`);
  console.error(`         Install it first:  npm install -g @anthropic-ai/claude-code`);
  exit(1);
}

const claudeVersion = run('claude --version')?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0';
info(`Claude Code version: ${claudeVersion}`);
if (!semverAtLeast(claudeVersion, 2, 1, 94)) {
  warn(`Version ${claudeVersion} is below recommended 2.1.94. Upgrade: npm install -g @anthropic-ai/claude-code`);
}

const settingsPath = join(homedir(), '.claude', 'settings.json');
let existing = {};
if (existsSync(settingsPath)) {
  try {
    existing = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {}
}

const shell = process.env.SHELL ?? '';
const profileFile = shell.includes('zsh')
  ? join(homedir(), '.zshrc')
  : shell.includes('fish')
    ? join(homedir(), '.config', 'fish', 'config.fish')
    : join(homedir(), '.bashrc');

// ── Gateway path ──────────────────────────────────────────────────────────────
console.log();
info('Configuring Custom API Gateway backend.');

const storedBaseUrl   = existing?.env?.ANTHROPIC_BASE_URL ?? '';
const storedAuthToken = existing?.env?.ANTHROPIC_AUTH_TOKEN ?? '';
const storedKeyHelper = existing?.apiKeyHelper ?? '';

const defaultBaseUrl = storedBaseUrl || 'http://localhost:4000';
const baseUrl = await ask('Gateway base URL', defaultBaseUrl);

// Auth: static token or apiKeyHelper script
info('Authentication — choose one:');
info('  1) Static token  (ANTHROPIC_AUTH_TOKEN)');
info('  2) Helper script (apiKeyHelper) — for JWT / rotating keys');
const authMode = await ask('Auth mode', storedKeyHelper ? '2' : '1');

let authToken = '';
let apiKeyHelper = '';

if (authMode === '2') {
  const defaultHelper = storedKeyHelper || '~/bin/get-litellm-key.sh';
  apiKeyHelper = await ask('Path to key helper script', defaultHelper);
  info(`apiKeyHelper set to: ${apiKeyHelper}`);
} else {
  if (storedAuthToken) {
    const masked = storedAuthToken.slice(0, 4) + '****' + storedAuthToken.slice(-4);
    info(`Existing auth token detected: ${masked}`);
    const newToken = await ask('Enter new auth token to replace, or press Enter to keep existing', '');
    authToken = newToken || storedAuthToken;
    info(newToken ? 'Auth token updated.' : 'Keeping existing auth token.');
  } else {
    authToken = await ask('Auth token (ANTHROPIC_AUTH_TOKEN)', '');
    if (!authToken) warn('No auth token entered — gateway may reject unauthenticated requests.');
  }
}

// Write settings.json — also strip any legacy Bedrock keys
const LEGACY_KEYS = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH'];
for (const k of LEGACY_KEYS) delete (existing.env ?? {})[k];
if (apiKeyHelper) delete (existing.env ?? {}).ANTHROPIC_AUTH_TOKEN;

const envBlock = {
  ANTHROPIC_BASE_URL: baseUrl,
  ...(authToken && { ANTHROPIC_AUTH_TOKEN: authToken }),
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5',
};

mkdirSync(dirname(settingsPath), { recursive: true });
existing.env = { ...(existing.env ?? {}), ...envBlock };
if (apiKeyHelper) {
  existing.apiKeyHelper = apiKeyHelper;
} else {
  delete existing.apiKeyHelper;
}
writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n');
success(`Settings written to ${settingsPath}`);

// Shell profile
const MARKER = '# Claude Code + API Gateway';
const shellExports = [
  ``,
  MARKER,
  `export ANTHROPIC_BASE_URL=${baseUrl}`,
  `export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`,
  ...(authToken ? [`export ANTHROPIC_AUTH_TOKEN=${authToken}`] : []),
].join('\n');

const profileContent = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '';
if (!profileContent.includes(MARKER)) {
  writeFileSync(profileFile, profileContent + shellExports + '\n', 'utf8');
  success(`Shell exports added to ${profileFile}`);
} else {
  info(`Shell profile already configured (${profileFile})`);
}

console.log();

// Smoke test
const runTest = await ask('Run a smoke test to verify the connection? (Y/n)', 'Y');
if (/^y/i.test(runTest)) {
  info('Running smoke test …');
  const smokeEnv = { ...process.env, ANTHROPIC_BASE_URL: baseUrl };
  // Strip any legacy Bedrock flags inherited from the shell
  delete smokeEnv.CLAUDE_CODE_USE_BEDROCK;
  delete smokeEnv.CLAUDE_CODE_SKIP_BEDROCK_AUTH;
  smokeEnv.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1';
  if (authToken) smokeEnv.ANTHROPIC_AUTH_TOKEN = authToken;
  if (apiKeyHelper) delete smokeEnv.ANTHROPIC_AUTH_TOKEN;
  const result = spawnSync('claude', ['--print', 'Reply with exactly one word: ready'], { stdio: 'inherit', env: smokeEnv });
  if (result.status === 0) {
    success('Gateway connection confirmed.');
  } else {
    warn('Smoke test failed. Run "claude" and use /status to debug.');
  }
}

rl.close();

console.log(`
${c.green}${c.bold}Setup complete!${c.reset}

  Start Claude Code:   claude
  Check provider:      /status         (inside claude)
`);
