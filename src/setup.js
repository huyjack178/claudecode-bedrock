import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
console.log(`\n${c.bold}Claude Code × Amazon Bedrock — Setup${c.reset}\n`);

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

// 2. Region
console.log();
const region = await ask('AWS region', 'us-east-1');
info(`Using region: ${region}`);

// 3. Bedrock API key
console.log();
const presetKey  = process.env.AWS_BEARER_TOKEN_BEDROCK ?? '';
const bedrockKey = presetKey || await ask('Bedrock API key (Please ask your administrator)', '');
if (bedrockKey) {
  info('API key accepted.');
} else {
  warn('No API key entered — falling back to AWS credentials chain (IAM / SSO / CLI).');
}

// 4. Write ~/.claude/settings.json
const regionPrefix = region.startsWith('eu') ? 'eu'
                   : region.startsWith('ap') ? 'ap'
                   : 'us';

const envBlock = {
  CLAUDE_CODE_USE_BEDROCK:         '1',
  AWS_REGION:                       region,
  ...(bedrockKey && { AWS_BEARER_TOKEN_BEDROCK: bedrockKey }),
  ANTHROPIC_DEFAULT_SONNET_MODEL:  `${regionPrefix}.anthropic.claude-sonnet-4-6`,
  ANTHROPIC_DEFAULT_HAIKU_MODEL:   `${regionPrefix}.anthropic.claude-haiku-4-5-20251001-v1:0`,
  ANTHROPIC_DEFAULT_OPUS_MODEL:    `${regionPrefix}.anthropic.claude-opus-4-6`,
};

const settingsPath = join(homedir(), '.claude', 'settings.json');
mkdirSync(dirname(settingsPath), { recursive: true });

let existing = {};
if (existsSync(settingsPath)) {
  try { existing = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}
}
existing.env = { ...(existing.env ?? {}), ...envBlock };
writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n');
success(`Settings written to ${settingsPath}`);

// 5. Inject env vars into shell profile so claude starts without the auth wizard
const shellExports = [
  ``,
  `# Claude Code + Amazon Bedrock`,
  `export CLAUDE_CODE_USE_BEDROCK=1`,
  `export AWS_REGION=${region}`,
  ...(bedrockKey ? [`export AWS_BEARER_TOKEN_BEDROCK=${bedrockKey}`] : []),
].join('\n');

const MARKER = '# Claude Code + Amazon Bedrock';
const shell = process.env.SHELL ?? '';
const profileFile = shell.includes('zsh')  ? join(homedir(), '.zshrc')
                  : shell.includes('fish') ? join(homedir(), '.config', 'fish', 'config.fish')
                  : join(homedir(), '.bashrc');

const profileContent = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : '';
if (!profileContent.includes(MARKER)) {
  writeFileSync(profileFile, profileContent + shellExports + '\n', 'utf8');
  success(`Shell exports added to ${profileFile}`);
} else {
  info(`Shell profile already configured (${profileFile})`);
}

console.log();

// 6. Optional smoke test
const runTest = await ask('Run a smoke test to verify the connection? (Y/n)', 'Y');
if (/^y/i.test(runTest)) {
  info('Running smoke test …');
  const result = spawnSync(
    'claude',
    ['--print', 'Reply with exactly one word: ready'],
    { stdio: 'inherit', env: { ...process.env, CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: region } }
  );
  if (result.status === 0) {
    success('Bedrock connection confirmed.');
  } else {
    warn('Smoke test failed. Run "claude" and use /status to debug.');
  }
}

// 7. Enable Bedrock model invocation logging (requires full AWS credentials, skipped for API-key users)
if (!bedrockKey) {
  console.log();
  const enableLogging = await ask('Enable Bedrock model invocation logging for usage monitoring? (Y/n)', 'Y');
  if (/^y/i.test(enableLogging)) {
    info('Setting up CloudWatch invocation logging …');

    const accountId = run('aws sts get-caller-identity --query Account --output text');
    if (!accountId) {
      warn('Could not read AWS account ID — ensure the AWS CLI is installed and credentials are configured.');
    } else {
      const logGroup  = '/aws/bedrock/model-invocations';
      const roleName  = 'BedrockInvocationLoggingRole';
      const roleArn   = `arn:aws:iam::${accountId}:role/${roleName}`;

      const trustPath  = join(tmpdir(), 'bedrock-trust.json');
      const policyPath = join(tmpdir(), 'bedrock-cw-policy.json');
      const configPath = join(tmpdir(), 'bedrock-logging.json');

      writeFileSync(trustPath, JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'bedrock.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      }));
      writeFileSync(policyPath, JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogGroups', 'logs:DescribeLogStreams'], Resource: `arn:aws:logs:${region}:${accountId}:log-group:${logGroup}:*` }],
      }));
      writeFileSync(configPath, JSON.stringify({
        cloudWatchConfig: { logGroupName: logGroup, roleArn },
        textDataDeliveryEnabled: true,
      }));

      // create-role / create-log-group return null if already exists — that's fine, proceed
      run(`aws iam create-role --role-name ${roleName} --assume-role-policy-document file://${trustPath}`);
      run(`aws iam put-role-policy --role-name ${roleName} --policy-name CloudWatchLogs --policy-document file://${policyPath}`);
      run(`aws logs create-log-group --log-group-name ${logGroup} --region ${region}`);
      const logResult = run(`aws bedrock put-model-invocation-logging-configuration --logging-config file://${configPath} --region ${region}`);

      for (const f of [trustPath, policyPath, configPath]) { try { unlinkSync(f); } catch {} }

      if (logResult !== null) {
        success(`Invocation logging → CloudWatch log group: ${logGroup}`);
        info(`View logs: CloudWatch → Log groups → ${logGroup}`);
      } else {
        warn('Could not enable invocation logging. Ensure your identity has these permissions:');
        warn('  iam:CreateRole  iam:PutRolePolicy  bedrock:PutModelInvocationLoggingConfiguration');
      }
    }
  }
}

rl.close();

console.log(`
${c.green}${c.bold}Setup complete!${c.reset}

  Start Claude Code:   claude
  Check provider:      /status         (inside claude)
`);
