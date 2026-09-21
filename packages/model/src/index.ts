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

/** Priced per million tokens. Used to meter, never to choose. */
const PRICE: Record<string, { in: number; out: number }> = {
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
};

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
    const price = PRICE[this.model];
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
    const price = PRICE[this.model];
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
    // there is no JSON to fail on — only a shape to check.
    const checked = schema.safeParse(used.input);
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
