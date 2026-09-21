/**
 * What the Bedrock adapter does with an answer, and what selects a provider.
 *
 * The call itself belongs to the AWS SDK and is not re-tested here. What is
 * Orbit's own is everything around it: a forced tool rather than an offered
 * one, arguments checked against Orbit's schema whatever the provider let
 * through, and a cost that says it is unknown rather than reporting zero.
 *
 * `packages/model/src/verify.ts` is the other half — one real call, run by
 * hand, against whichever provider is configured. This half needs no account.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { z } from '@orbit/contract';
import { BedrockProvider, modelFromEnvironment, priceFor } from './index.ts';

const proposal = z.object({ control: z.string(), why: z.string() });
const shape = {
  type: 'object',
  properties: { control: { type: 'string' }, why: { type: 'string' } },
  required: ['control', 'why'],
  additionalProperties: false,
};
const asked = { purpose: 'name a control', instruction: 'say which', shown: 'button "Open file"' };

const answering = (out: Partial<ConverseCommandOutput>) => {
  let sent: unknown;
  const send = async (command: { input: unknown }) => {
    sent = command.input;
    return { $metadata: {}, ...out } as ConverseCommandOutput;
  };
  return { send, asked: () => sent };
};

test('the proposal is forced as a tool, not offered as one', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'proposal', input: { control: 'Open file', why: 'it is the only one' } } }] } },
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    stopReason: 'tool_use',
  });
  const model = new BedrockProvider('anthropic.claude-x', 'eu-west-1', fake.send);
  await model.propose(asked, proposal, shape);

  const input = fake.asked() as { toolConfig: { toolChoice: unknown; tools: Array<{ toolSpec: { name: string; inputSchema: { json: unknown } } }> } };
  assert.deepEqual(input.toolConfig.toolChoice, { tool: { name: 'proposal' } });
  assert.equal(input.toolConfig.tools[0]!.toolSpec.name, 'proposal');
  assert.deepEqual(input.toolConfig.tools[0]!.toolSpec.inputSchema.json, shape);
});

test('an answer that matches the schema is kept, with what it cost in tokens', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'proposal', input: { control: 'Open file', why: 'it is the only one' } } }] } },
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    stopReason: 'tool_use',
  });
  const answered = await new BedrockProvider('anthropic.claude-x', 'eu-west-1', fake.send)
    .propose(asked, proposal, shape);

  assert.deepEqual(answered.value, { control: 'Open file', why: 'it is the only one' });
  assert.equal(answered.provider, 'bedrock');
  assert.equal(answered.tokensIn, 100);
  assert.equal(answered.tokensOut, 20);
});

test('an inference profile is priced as the model it routes to', () => {
  // The id an author must configure for the newer Claude models. Looked up
  // whole it matches nothing, and the cost of a real session reads as unknown.
  assert.deepEqual(priceFor('eu.anthropic.claude-sonnet-4-5-20250929-v1:0'), { in: 3, out: 15 });
  assert.deepEqual(priceFor('us.anthropic.claude-sonnet-4-5-20250929-v1:0'), { in: 3, out: 15 });
  assert.deepEqual(priceFor('anthropic.claude-sonnet-4-5-20250929-v1:0'), { in: 3, out: 15 });
  assert.deepEqual(priceFor('anthropic.claude-3-5-haiku-20241022-v1:0'), { in: 0.8, out: 4 });
  assert.deepEqual(priceFor('apac.anthropic.claude-haiku-4-5-20251001-v1:0'), { in: 1, out: 5 });
  assert.deepEqual(priceFor('us.amazon.nova-lite-v1:0'), { in: 0.06, out: 0.24 });
});

test('a model held under no rate at all is still unknown, not free', () => {
  assert.equal(priceFor('meta.llama3-70b-instruct-v1:0'), undefined);
  assert.equal(priceFor('mistral.mistral-large-2407-v1:0'), undefined);
  // Not so eager that it prices something it has never heard of: stripping a
  // prefix must not turn one model's id into another's.
  assert.equal(priceFor('us.anthropic.claude-9-20301231-v1:0'), undefined);
});

test('a Bedrock session is costed in the record, not reported as nothing spent', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'proposal', input: { control: 'a', why: 'b' } } }] } },
    usage: { inputTokens: 10_000, outputTokens: 1_000, totalTokens: 11_000 },
  });
  const answered = await new BedrockProvider('eu.anthropic.claude-sonnet-4-5-20250929-v1:0', 'eu-west-1', fake.send)
    .propose(asked, proposal, shape);

  // 10000 in at $3/M plus 1000 out at $15/M is $0.045, and micro-dollars are
  // what the record holds: tokens times dollars-per-million needs no scaling.
  assert.equal(answered.costMicros, 45_000);
  assert.equal(answered.costUnknown, undefined);
});

test('a model with no price held says so, rather than reporting nothing spent', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'proposal', input: { control: 'a', why: 'b' } } }] } },
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  });
  const answered = await new BedrockProvider('anthropic.claude-x', 'eu-west-1', fake.send)
    .propose(asked, proposal, shape);

  assert.equal(answered.costUnknown, true);
  assert.equal(answered.costMicros, 0);
});

test('arguments the provider let through are still checked against Orbit\'s schema', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'proposal', input: { control: 'Open file' } } }] } },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  });
  const answered = await new BedrockProvider('anthropic.claude-x', 'eu-west-1', fake.send)
    .propose(asked, proposal, shape);

  assert.equal(answered.value, null);
  assert.match(answered.refusedBecause ?? '', /why/);
});

test('a response with no proposal in it names why it stopped', async () => {
  const fake = answering({
    output: { message: { role: 'assistant', content: [{ text: 'I am not sure which one you mean.' }] } },
    usage: { inputTokens: 1, outputTokens: 9, totalTokens: 10 },
    stopReason: 'max_tokens',
  });
  const answered = await new BedrockProvider('anthropic.claude-x', 'eu-west-1', fake.send)
    .propose(asked, proposal, shape);

  assert.equal(answered.value, null);
  assert.match(answered.refusedBecause ?? '', /max_tokens/);
});

test('a failed call is thrown, naming the provider, not returned as a refusal', async () => {
  const send = async () => { throw Object.assign(new Error('User is not authorized'), { name: 'AccessDeniedException' }); };
  await assert.rejects(
    () => new BedrockProvider('anthropic.claude-x', 'eu-west-1', send as never).propose(asked, proposal, shape),
    /bedrock AccessDeniedException: User is not authorized/,
  );
});

test('bedrock without a region is refused at start-up, not at the first call', () => {
  assert.throws(
    () => modelFromEnvironment({ ORBIT_MODEL_PROVIDER: 'bedrock', ORBIT_MODEL: 'anthropic.claude-x' } as NodeJS.ProcessEnv),
    /no region is set/,
  );
});

test('bedrock takes the region AWS itself uses when none is named for Orbit', () => {
  const model = modelFromEnvironment({
    ORBIT_MODEL_PROVIDER: 'bedrock', ORBIT_MODEL: 'anthropic.claude-x', AWS_REGION: 'eu-west-2',
  } as NodeJS.ProcessEnv);
  assert.equal(model.provider, 'bedrock');
  assert.equal(model.model, 'anthropic.claude-x');
});

test('a provider with no adapter is refused at start-up, saying what to use instead', () => {
  assert.throws(
    () => modelFromEnvironment({ ORBIT_MODEL_PROVIDER: 'anthropic', ORBIT_MODEL: 'claude-x' } as NodeJS.ProcessEnv),
    /has no adapter yet/,
  );
  assert.throws(
    () => modelFromEnvironment({ ORBIT_MODEL_PROVIDER: 'gemini', ORBIT_MODEL: 'x' } as NodeJS.ProcessEnv),
    /expected openai or bedrock/,
  );
});
