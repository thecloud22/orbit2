/**
 * What the chat on a draft may not carry (Orbit 2.1, plan §12). Enforced by
 * Orbit, in code, before and after the model — never a rule the model is asked
 * to follow. Each check errs towards refusing: a refused request costs the
 * author a rephrase, and a wrong one costs a secret sent or a step added that
 * nobody meant.
 */

/** Anything that reads like a credential, a card or a key. Blocked before it is sent or stored. */
export function looksLikeSecret(text: string): boolean {
  if (/\b(?:password|passwd|pwd|passcode|pin|passphrase)\b\s*(?:is|:|=)/i.test(text)) return true;
  if (/\b(?:login|credentials?|username\s*\/\s*password)\s*:/i.test(text)) return true;
  if (/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/.test(text) || /\bAKIA[0-9A-Z]{16}\b/.test(text)) return true;
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    if (luhn(m[0].replace(/\D/g, ''))) return true;
  }
  return false;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/** Every web address or host name a message mentions, lower-cased. */
export function addressesIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\bhttps?:\/\/([^\s/:?#]+)/gi)) found.add(m[1]!.toLowerCase());
  for (const m of text.matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|net|org|io|co|gov|edu|uk|us|app|dev|ai|biz|info))\b/gi)) {
    found.add(m[1]!.toLowerCase());
  }
  return [...found];
}

/** The addresses in a message that this workflow's applications do not own. */
export function outsideAddresses(text: string, allowedHosts: readonly string[]): string[] {
  const allowed = allowedHosts.map((h) => h.toLowerCase().replace(/:\d+$/, ''));
  return addressesIn(text).filter((a) => !allowed.some((h) => a === h || a.endsWith(`.${h}`)));
}

const CHANGING = [
  'buy', 'purchase', 'order', 'pay', 'submit', 'send', 'email', 'update', 'delete', 'remove', 'approve', 'decline',
  'reject', 'cancel', 'create', 'save', 'post', 'transfer', 'refund', 'change', 'edit', 'modify', 'reopen', 'close',
  'write', 'record in', 'log it', 'file it',
];

/**
 * Whether a request asks for something that changes an application's data.
 * A prohibition is not a request: "never change the claim" says what not to
 * do, and is not held against the message.
 */
export function asksToChangeData(text: string): boolean {
  const words = text.toLowerCase();
  for (const verb of CHANGING) {
    for (const m of words.matchAll(new RegExp(`\\b${verb}(?:s|d|ed|es|ing)?\\b`, 'g'))) {
      const before = words.slice(Math.max(0, m.index! - 24), m.index!);
      if (!/\b(?:not|never|don't|dont|do not|no)\s+(?:\w+\s+)?$/.test(before)) return true;
    }
  }
  return false;
}

/** What the chat says when it refuses, in fixed words the model cannot change. */
export const CHAT_REFUSALS = {
  secret: 'That looked like a password, a card number or a key, so it was not sent and not kept. '
    + 'Orbit never needs one here: a password is given when a run starts.',
  otherApplication: 'This workflow can only open its own application, and an administrator adds applications in Admin, '
    + 'not from here. Nothing was changed.',
  addressNotSent: 'That names an address this workflow cannot open, so it was not sent to Orbit\'s model. Nothing was changed.',
  notAboutThisDraft: 'This chat changes this draft and nothing else. Nothing was changed.',
  cannotDoThat: 'Orbit cannot make that change here. It can add steps in your words, change what a sentence is for, '
    + 'or explain the draft.',
  changesData: 'That would change data in the application, which a step added here cannot do. '
    + 'Orbit can add it as work for a person instead.',
  closed: 'This agent is published, so the chat is closed. Take it back to editing to change it for the next version.',
  busy: 'Orbit is still working on the last change. Try again when it has finished.',
  limit: 'This draft has had its messages for today. Changing it by hand still works.',
} as const;
export type ChatRefusal = keyof typeof CHAT_REFUSALS;
