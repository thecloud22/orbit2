/**
 * Answering the chat on a draft (Orbit 2.1, plan §12).
 *
 * The model is shown the draft as it stands — every sentence and what it is
 * for — and the author's message, and says which of a closed list of edits
 * the message asks for. That is all it decides. It does not write the edit:
 * steps are added as the author's own message, verbatim, and a relabel names
 * a sentence from an enum of the draft's numbers and a label from the five.
 * Orbit then checks the answer and applies it, or refuses in fixed words.
 */
import { CHAT_REFUSALS, SENTENCE_LABELS, asksToChangeData, outsideAddresses, z, type ChatRefusal } from '@orbit/contract';
import type { Answered, ModelProvider } from '@orbit/model';

export const CHAT = [
  'You are the chat on a draft in Orbit. The author is checking how their written procedure was understood,',
  'and asks for a change. You are shown every sentence of the procedure, numbered, with what it is for:',
  'task (done in the application), rule, forAPerson, background, or wontDo.',
  '',
  'Answer with ONE kind:',
  'addSteps  The message itself describes steps, conditions or work to add to the procedure. Orbit adds the',
  '          author\'s message exactly as written; you do not rewrite it. Set departs=true when it contradicts',
  '          what the procedure says (a different threshold, a different outcome); otherwise false.',
  'relabel   The author says what one numbered sentence is for. sentence is its number; label is one of',
  '          task, rule, forAPerson, background, wontDo.',
  'explain   A question about this draft. Answer it in reply, briefly, from the sentences shown.',
  'refuse    Anything else. refusal is notAboutThisDraft for shopping, email, general questions, code or another',
  '          workflow; otherApplication for using any application or website other than this workflow\'s;',
  '          cannotDoThat for publishing, running, connecting, or anything not listed here.',
  '',
  'reply is one or two plain sentences to the author.',
].join('\n');

const REFUSALS = ['notAboutThisDraft', 'otherApplication', 'cannotDoThat'] as const;

const answer = z.object({
  kind: z.enum(['addSteps', 'relabel', 'explain', 'refuse']),
  sentence: z.string().nullable(),
  label: z.enum(SENTENCE_LABELS).nullable(),
  departs: z.boolean(),
  refusal: z.enum(REFUSALS).nullable(),
  reply: z.string().max(1000),
});
export type ChatAnswer = z.infer<typeof answer>;

const shapeFor = (numbers: readonly string[]) => ({
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['addSteps', 'relabel', 'explain', 'refuse'] },
    sentence: numbers.length ? { type: ['string', 'null'], enum: [...numbers, null] } : { type: 'null' },
    label: { type: ['string', 'null'], enum: [...SENTENCE_LABELS, null] },
    departs: { type: 'boolean' },
    refusal: { type: ['string', 'null'], enum: [...REFUSALS, null] },
    reply: { type: 'string' },
  },
  required: ['kind', 'sentence', 'label', 'departs', 'refusal', 'reply'],
  additionalProperties: false,
});

/** What Orbit does with the message, decided from the model's answer and Orbit's own checks. */
export type ChatDecision =
  | { do: 'addSteps'; departs: boolean }
  | { do: 'relabel'; sentence: string; label: (typeof SENTENCE_LABELS)[number] }
  | { do: 'explain'; reply: string }
  | { do: 'offerForAPerson' }
  | { do: 'refuse'; why: ChatRefusal };

export async function decide(
  message: string,
  draft: ReadonlyArray<{ number: string; text: string; label: string | null }>,
  application: { name: string; hosts: string[] },
  model: ModelProvider,
): Promise<{ decision: ChatDecision; answered: Answered<ChatAnswer> }> {
  const numbers = draft.map((s) => s.number);
  const answered = await model.propose(
    { purpose: 'answer the chat on a draft', instruction: CHAT,
      shown: [`APPLICATION: ${application.name}`, '', 'DRAFT:',
        ...draft.map((s) => `${s.number} (${s.label ?? 'not sorted'}) ${s.text.replace(/\s+/g, ' ')}`),
        '', `MESSAGE: ${message}`].join('\n') },
    answer, shapeFor(numbers));
  return { decision: check(message, answered.value, numbers, application.hosts), answered };
}

/** Orbit's checks on an answer. Pure, so every rule here is tested without a model. */
export function check(
  message: string, a: ChatAnswer | null, numbers: readonly string[], hosts: readonly string[],
): ChatDecision {
  if (!a) return { do: 'refuse', why: 'cannotDoThat' };
  // Checked again after the model, whatever it said: the address rule is
  // Orbit's, and does not depend on the model having noticed.
  if (outsideAddresses(message, hosts).length) return { do: 'refuse', why: 'otherApplication' };
  switch (a.kind) {
    case 'refuse':
      return { do: 'refuse', why: a.refusal ?? 'cannotDoThat' };
    case 'explain':
      return { do: 'explain', reply: a.reply.trim() || 'There is nothing to add.' };
    case 'relabel':
      return a.sentence && numbers.includes(a.sentence) && a.label
        ? { do: 'relabel', sentence: a.sentence, label: a.label }
        : { do: 'refuse', why: 'cannotDoThat' };
    case 'addSteps':
      return asksToChangeData(message) ? { do: 'offerForAPerson' } : { do: 'addSteps', departs: a.departs };
  }
}

export { CHAT_REFUSALS };
