/**
 * The four things Orbit can raise against a draft, and what settles each.
 *
 * §4 is specific, and the difference is not decoration: "answer the questions,
 * confirm the assumptions, decide the exceptions, acknowledge the risks". Each
 * verb is a different act by a person, and only one of them is answering.
 *
 * Everything was being raised as a question. A caution — "this recording shows
 * one way the procedure can end" — then appeared on the confirmation screen
 * with a text box beneath it, demanding prose that does not exist. Whatever
 * the author typed let them past a warning that typing cannot address.
 */
export interface Note {
  kind: 'question' | 'assumption' | 'exception' | 'risk';
  body: string;
}

/** Something Orbit could not work out, and a person can say. */
export const asQuestion = (body: string): Note => ({ kind: 'question', body });

/**
 * Something true about the draft that a person should see before attesting to
 * it. There is nothing to answer; there is something to have noticed.
 */
export const asRisk = (body: string): Note => ({ kind: 'risk', body });
