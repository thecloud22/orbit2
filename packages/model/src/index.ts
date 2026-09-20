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
    case 'anthropic':
    case 'bedrock':
      throw new Error(`ORBIT_MODEL_PROVIDER is ${provider}, which has no adapter yet. Slice 1 uses openai.`);
    default:
      throw new Error(`ORBIT_MODEL_PROVIDER is "${provider}"; expected openai, anthropic or bedrock`);
  }
}
