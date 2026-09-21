/**
 * One interface, whichever provider is configured (Decision 7).
 *
 * The model proposes; it never writes. Everything it returns is validated
 * against a schema Orbit owns before anything is kept — a response that does
 * not validate is a call that produced nothing usable, and that is recorded,
 * metered and retried rather than acted on.
 *
 * Only authoring reaches this. A published version consults no model when it
 * runs, and the worker executes with none of these variables set.
 */
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import type { z } from '@orbit/contract';

export interface Asked {
  /** What the model is for, in the record's terms. */
  purpose: string;
  instruction: string;
  /** What it is being shown. Structured page text, never pixels where text will do. */
  shown: string;
}

export interface Answered<T> {
  /** Absent when the response did not validate. The call still happened. */
  value: T | null;
  /** The model that actually answered, not the variable that selected it —
   *  a record read in six months must still say which one produced it. */
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  /** True when no price is held for this model, so the cost above is not a
   *  figure. Reporting zero for a model whose price is unknown would put a
   *  number in the spend record that is simply false. */
  costUnknown?: boolean;
  /** Why nothing was kept, when nothing was. */
  refusedBecause?: string;
}

export interface ModelProvider {
  readonly provider: string;
  readonly model: string;
  propose<T>(asked: Asked, schema: z.ZodType<T>, shape: Record<string, unknown>): Promise<Answered<T>>;
}

/**
 * Priced per million tokens, in US dollars. Used to meter, never to choose.
 *
 * On-demand rates, taken from the providers' own pricing pages and correct as
 * at 2026-05. They are hard-coded deliberately: a spend record must say what
 * something cost when it was built, so a rate change must be a commit that
 * shows up in a diff rather than a number that moves underneath old records.
 *
 * Two things they do not cover, and both would make a figure here too low.
 * Batch and provisioned throughput are billed differently, and Orbit uses
 * neither. And a Bedrock rate can differ by region for the same model — these
 * are the common ones, so a figure from an unusual region is approximate.
 *
 * Checking one takes a minute against the AWS or OpenAI pricing page, and is
 * worth doing before anybody bills a customer from these numbers.
 *
 * This is what is known, not what is available. A model absent from here is
 * not refused — it is metered in tokens and its cost recorded as unknown,
 * which is the one honest thing to say about a rate nobody holds. Adding one
 * is a line, and `pnpm verify:model` says which case a model falls into
 * before a session spends anything on it.
 */
const PRICE: Record<string, { in: number; out: number }> = {
  // OpenAI, by the name ORBIT_MODEL holds.
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1': { in: 2, out: 8 },

  // Anthropic through Bedrock, by model id with the version suffix dropped.
  'anthropic.claude-opus-4-1-20250805-v1': { in: 15, out: 75 },
  'anthropic.claude-opus-4-20250514-v1': { in: 15, out: 75 },
  'anthropic.claude-sonnet-4-5-20250929-v1': { in: 3, out: 15 },
  'anthropic.claude-sonnet-4-20250514-v1': { in: 3, out: 15 },
  'anthropic.claude-haiku-4-5-20251001-v1': { in: 1, out: 5 },
  'anthropic.claude-3-7-sonnet-20250219-v1': { in: 3, out: 15 },
  'anthropic.claude-3-5-sonnet-20241022-v2': { in: 3, out: 15 },
  'anthropic.claude-3-5-sonnet-20240620-v1': { in: 3, out: 15 },
  'anthropic.claude-3-5-haiku-20241022-v1': { in: 0.8, out: 4 },
  'anthropic.claude-3-opus-20240229-v1': { in: 15, out: 75 },
  'anthropic.claude-3-sonnet-20240229-v1': { in: 3, out: 15 },
  'anthropic.claude-3-haiku-20240307-v1': { in: 0.25, out: 1.25 },

  // Amazon's own, through the same surface.
  'amazon.nova-premier-v1': { in: 2.5, out: 12.5 },
  'amazon.nova-pro-v1': { in: 0.8, out: 3.2 },
  'amazon.nova-lite-v1': { in: 0.06, out: 0.24 },
  'amazon.nova-micro-v1': { in: 0.035, out: 0.14 },
};

/** Region prefixes a cross-region inference profile puts in front of an id. */
const ROUTED = /^(?:us|eu|apac|jp|au|ca|global|us-gov)\./;

/**
 * What a million tokens of this model costs, or nothing if no rate is held.
 *
 * A Bedrock id carries two things the rate does not depend on, and looking one
 * up whole finds neither. The newer Claude models are reachable only through a
 * cross-region inference profile, so the id an author must configure is
 * `eu.anthropic.claude-sonnet-4-5-…` rather than `anthropic.claude-sonnet-4-5-…`
 * — and every id ends in a `:0` revision that is not part of the product. Both
 * were enough to miss the table entirely and report the cost as unknown for a
 * model whose price is sitting in it.
 */
export function priceFor(model: string): { in: number; out: number } | undefined {
  return PRICE[model] ?? PRICE[model.replace(ROUTED, '').replace(/:\d+$/, '')];
}

class OpenAIProvider implements ModelProvider {
  readonly provider = 'openai';
  readonly model: string;
  readonly #key: string;

  constructor(model: string, key: string) {
    this.model = model;
    this.#key = key;
  }

  async propose<T>(asked: Asked, schema: z.ZodType<T>, shape: Record<string, unknown>): Promise<Answered<T>> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#key}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: asked.instruction },
          { role: 'user', content: asked.shown },
        ],
        // The provider's own structured-output feature constrains the shape.
        // It is not trusted to be enough: the answer is validated against
        // Orbit's schema afterwards regardless, so a provider that validates
        // less strictly cannot weaken what gets kept.
        response_format: { type: 'json_schema', json_schema: { name: 'proposal', strict: true, schema: shape } },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${this.provider} ${response.status}: ${body.slice(0, 300)}`);
    }

    const body = await response.json() as {
      model: string;
      choices: Array<{ message: { content: string | null } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const tokensIn = body.usage?.prompt_tokens ?? 0;
    const tokensOut = body.usage?.completion_tokens ?? 0;
    const price = priceFor(this.model);
    const meta = {
      model: body.model, provider: this.provider, tokensIn, tokensOut,
      costMicros: price ? Math.round(tokensIn * price.in + tokensOut * price.out) : 0,
      ...(price ? {} : { costUnknown: true }),
    };

    const content = body.choices[0]?.message.content;
    if (!content) return { ...meta, value: null, refusedBecause: 'the response had no content' };

    let parsed: unknown;
    try { parsed = JSON.parse(content); }
    catch { return { ...meta, value: null, refusedBecause: 'the response was not valid JSON' }; }

    const checked = schema.safeParse(parsed);
    return checked.success
      ? { ...meta, value: checked.data }
      : { ...meta, value: null, refusedBecause: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
}

/**
 * Bedrock, through Converse.
 *
 * Two things differ from OpenAI and neither is cosmetic.
 *
 * There is no `response_format` here, so the shape is imposed by declaring it
 * as the input schema of a single tool and forcing that tool to be the answer.
 * The JSON that comes back is the tool's arguments rather than the message
 * body. That is a different mechanism reaching the same place, and it changes
 * nothing downstream: the answer is validated against Orbit's own schema
 * afterwards regardless, exactly as it is for OpenAI, so a provider whose
 * constraint is weaker cannot weaken what gets kept.
 *
 * And the response does not echo which model answered. OpenAI returns the
 * resolved name, which is why `Answered.model` exists — a record read in six
 * months must still say what produced it. Bedrock returns nothing to put
 * there, so this reports the id the request named. That is the honest answer
 * and it is a weaker one: with an inference profile, the id names a routing
 * decision rather than the model at the end of it.
 */
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type Sends = (command: ConverseCommand) => Promise<ConverseCommandOutput>;

/** Whether a JSON Schema node permits null. */
const permitsNull = (node: unknown): boolean => {
  const t = (node as { type?: unknown })?.type;
  return Array.isArray(t) ? t.includes('null') : t === 'null';
};

/**
 * Fill in required-but-nullable keys the model left out.
 *
 * OpenAI's strict json_schema guarantees every key listed in `required` comes
 * back. A tool schema on Bedrock carries no such guarantee, and both Claude
 * and Nova omit a key rather than sending an explicit null for it. Orbit's
 * shapes declare those keys as `["string", "null"]`, so an absent one arrived
 * as undefined and failed validation: eight of the thirteen turns in the first
 * real Bedrock authoring session produced nothing for this reason alone, every
 * one of them on `value` and `optional`.
 *
 * This asserts nothing the model did not. It fills only where the schema
 * itself says null is a legal value, and to a schema that permits both, absent
 * and null mean the same thing — the difference between them was the
 * provider's, not the author's. Anything the schema does not permit to be null
 * is left missing, so a genuinely incomplete answer still fails validation and
 * is still recorded as having produced nothing.
 *
 * It lives in the provider because that is where a provider's shortfall
 * belongs, next to the forced tool choice that exists for the same reason.
 */
function fillAbsentNullable(value: unknown, node: unknown): unknown {
  const schema = node as { type?: unknown; properties?: Record<string, unknown>;
                           required?: string[]; items?: unknown };
  const type = schema?.type;
  const allows = (want: string) => Array.isArray(type) ? type.includes(want) : type === want;

  if (allows('object') && schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const filled: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in filled) filled[key] = fillAbsentNullable(filled[key], sub);
      else if (schema.required?.includes(key) && permitsNull(sub)) filled[key] = null;
    }
    return filled;
  }

  if (allows('array') && schema.items && Array.isArray(value)) {
    return value.map((item) => fillAbsentNullable(item, schema.items));
  }

  return value;
}

export class BedrockProvider implements ModelProvider {
  readonly provider = 'bedrock';
  readonly model: string;
  readonly #send: Sends;

  /**
   * `send` is here so that what this class does with an answer can be tested
   * without an AWS account, which is the half of it Orbit is responsible for:
   * a truncated response, a model that answered in prose, arguments that do
   * not match the schema. The call itself is the SDK's and is not re-tested.
   */
  constructor(model: string, region: string, send?: Sends) {
    this.model = model;
    // No credentials passed: the SDK's own chain finds them — environment,
    // shared config, SSO, or an instance role — which is what running under an
    // assumed role on AWS means. A key in .env would defeat all four.
    if (send) { this.#send = send; return; }
    const client = new BedrockRuntimeClient({ region });
    this.#send = (command) => client.send(command);
  }

  async propose<T>(asked: Asked, schema: z.ZodType<T>, shape: Record<string, unknown>): Promise<Answered<T>> {
    let out;
    try {
      out = await this.#send(new ConverseCommand({
        modelId: this.model,
        system: [{ text: asked.instruction }],
        messages: [{ role: 'user', content: [{ text: asked.shown }] }],
        toolConfig: {
          tools: [{ toolSpec: {
            name: 'proposal',
            description: asked.purpose,
            // The SDK types this as Smithy's recursive document type. A JSON
            // Schema object is one; TypeScript cannot see that through the
            // `Record<string, unknown>` every provider is handed, and widening
            // that shared signature to an AWS type would put one provider's
            // vocabulary into the interface all of them implement.
            inputSchema: { json: shape as unknown as JsonValue },
          } }],
          // Forced, not offered. An unforced tool lets the model answer in
          // prose instead, which is a response with no proposal in it.
          toolChoice: { tool: { name: 'proposal' } },
        },
        // Enough for a proposal and not for an essay. A model that runs out
        // of room stops mid-JSON, which arrives here as a response that does
        // not parse — recorded as such rather than mistaken for a refusal.
        inferenceConfig: { maxTokens: 4096 },
      }));
    } catch (e) {
      // The SDK's errors carry the AWS name and message; a failed call is
      // thrown rather than returned, the same as a non-2xx from OpenAI, so
      // authoring records an attempt that produced nothing and retries.
      throw new Error(`${this.provider} ${(e as Error).name}: ${String((e as Error).message).slice(0, 300)}`);
    }

    const tokensIn = out.usage?.inputTokens ?? 0;
    const tokensOut = out.usage?.outputTokens ?? 0;
    const price = priceFor(this.model);
    const meta = {
      model: this.model, provider: this.provider, tokensIn, tokensOut,
      costMicros: price ? Math.round(tokensIn * price.in + tokensOut * price.out) : 0,
      ...(price ? {} : { costUnknown: true }),
    };

    const used = out.output?.message?.content?.find((c) => c.toolUse)?.toolUse;
    if (!used) {
      // Says which, because "no proposal" for a refused prompt and "no
      // proposal" for a truncated one are different problems.
      return { ...meta, value: null,
        refusedBecause: `the response carried no proposal (stopped: ${out.stopReason ?? 'unknown'})` };
    }

    // Converse hands back the arguments already parsed, so unlike OpenAI
    // there is no JSON to fail on — only a shape to check, once the keys this
    // provider is entitled to leave out have been put back as null.
    const checked = schema.safeParse(fillAbsentNullable(used.input, shape));
    return checked.success
      ? { ...meta, value: checked.data }
      : { ...meta, value: null, refusedBecause: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
}

export function modelFromEnvironment(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  const provider = env['ORBIT_MODEL_PROVIDER'];
  const model = env['ORBIT_MODEL'];
  // Resolved once, at start-up, so a typo fails on boot rather than in the
  // middle of an authoring session.
  if (!provider) throw new Error('ORBIT_MODEL_PROVIDER is not set');
  if (!model) throw new Error('ORBIT_MODEL is not set');

  switch (provider) {
    case 'openai': {
      const key = env['OPENAI_API_KEY'];
      if (!key) throw new Error('ORBIT_MODEL_PROVIDER is openai but OPENAI_API_KEY is not set');
      return new OpenAIProvider(model, key);
    }
    case 'bedrock': {
      // AWS_REGION is honoured because everything else on an AWS host reads
      // it, and a Bedrock call that silently went to us-east-1 while the rest
      // of the account was in eu-west-1 would be a confusing bill.
      const region = env['ORBIT_MODEL_REGION'] || env['AWS_REGION'] || env['AWS_DEFAULT_REGION'];
      if (!region) {
        throw new Error('ORBIT_MODEL_PROVIDER is bedrock but no region is set — '
          + 'set ORBIT_MODEL_REGION, and ORBIT_MODEL to a model id or inference profile in it');
      }
      // No key is checked. Bedrock authenticates through the ambient AWS
      // credential chain, so whether this machine may call it is a question
      // only the first call can answer. `pnpm verify:model` asks it.
      return new BedrockProvider(model, region);
    }
    case 'anthropic':
      throw new Error('ORBIT_MODEL_PROVIDER is anthropic, which has no adapter yet. '
        + 'Use openai, or bedrock with an Anthropic model id.');
    default:
      throw new Error(`ORBIT_MODEL_PROVIDER is "${provider}"; expected openai or bedrock`);
  }
}
