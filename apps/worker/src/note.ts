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
  /**
   * The answer Orbit took, where it took one.
   *
   * A note with this is on the record and settled: it is something Orbit did
   * rather than something it is waiting on, and it blocks nothing. Without it
   * a note is outstanding, and confirmation waits for a person.
   */
  answer?: string;
}

/** Something Orbit could not work out, and a person can say. */
export const asQuestion = (body: string): Note => ({ kind: 'question', body });

/**
 * A reading Orbit took, stated so it can be disagreed with.
 *
 * §4: "confirm the assumptions". An assumption is not a question — it does not
 * stop the work, it records the interpretation that was made so somebody can
 * see it and say otherwise. The distinction went missing because everything
 * was raised as a question, so a statement about how Orbit behaves — "when the
 * conditions do not hold, this takes no action" — arrived as a demand for
 * prose before anything could be confirmed.
 */
export const asAssumption = (body: string, took: string): Note =>
  ({ kind: 'assumption', body, answer: took });

/**
 * Something true about the draft that a person should see before attesting to
 * it. There is nothing to answer; there is something to have noticed.
 */
export const asRisk = (body: string): Note => ({ kind: 'risk', body });
