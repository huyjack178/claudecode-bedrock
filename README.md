# claude-bedrock-setup

One-command CLI to configure [Claude Code](https://claude.ai/code) with [Amazon Bedrock](https://aws.amazon.com/bedrock/) for your engineering team.

## Usage

No installation required — run with `npx`:

```bash
npx claude-bedrock-setup
```

Or install globally once and run anywhere:

```bash
npm install -g claude-bedrock-setup
claude-bedrock-setup
```

## What it does

1. Checks Claude Code CLI is installed (≥ v2.1.94)
2. Detects existing AWS credentials — or prompts for them
3. Asks for preferred AWS region (default: `us-east-1`)
4. Verifies Anthropic inference profiles are available in your account
5. Writes `~/.claude/settings.json` with Bedrock enabled and models pinned
6. Runs an optional smoke test to confirm the connection works

## Prerequisites

| Requirement | Notes |
|---|---|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) v2.1.94+ | `npm install -g @anthropic-ai/claude-code` |
| AWS account with Bedrock access | Enable Anthropic models in [Model catalog](https://console.aws.amazon.com/bedrock/) |
| Node.js ≥ 18 | Required to run this CLI |

## IAM permissions

Your AWS identity needs the policy in [iam-policy.json](iam-policy.json):

```bash
aws iam create-policy \
  --policy-name ClaudeCodeBedrockPolicy \
  --policy-document file://iam-policy.json

aws iam attach-user-policy \
  --user-name <YOUR_IAM_USER> \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/ClaudeCodeBedrockPolicy
```

## Auth methods supported

| Method | How |
|---|---|
| **Bedrock API key** *(recommended)* | Prompted interactively or pre-set as `AWS_BEARER_TOKEN_BEDROCK` — no AWS CLI needed |
| Access Key ID + Secret | Prompted interactively or pre-set as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| AWS SSO profile | `AWS_PROFILE` — run `aws sso login` first |
| Existing AWS CLI credentials | Auto-detected from `~/.aws` |

### Getting a Bedrock API key

In the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) go to **API keys** → **Create API key**. No AWS CLI or IAM user required on the engineer's machine.

## Settings written

After setup, `~/.claude/settings.json` will contain:

```json
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "us.anthropic.claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "us.anthropic.claude-opus-4-7"
  }
}
```

## Monitoring & Usage Dashboard

During setup you can opt in to **Bedrock model invocation logging**. This creates:

- An IAM role (`BedrockInvocationLoggingRole`) that Bedrock uses to write logs
- A CloudWatch log group `/aws/bedrock/model-invocations` with every request's token counts, latency, and model ID

Once logging is enabled, use **CloudWatch Metrics** (namespace `AWS/Bedrock`) to track `InputTokenCount`, `OutputTokenCount`, `InvocationLatency`, and errors per model. Bedrock spend also appears in **AWS Cost Explorer** under service `Amazon Bedrock`.

## References

- [Claude Code on Amazon Bedrock — Docs](https://code.claude.com/docs/en/amazon-bedrock)
- [Bedrock inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)
- [Bedrock IAM reference](https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html)
