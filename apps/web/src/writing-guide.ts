/**
 * What to write in a procedure, and what not to.
 *
 * Shown in two places — beside the box on a new agent's page, and in Help —
 * and kept here so the two cannot drift. Written for the person writing the
 * procedure: a business user, not somebody who knows how Orbit works. Each
 * point is something that changes what Orbit does with their words.
 */
export interface Advice {
  /** The point, short enough for the new agent's page. */
  say: string;
  /** An example in the person's own terms, or why. */
  like?: string;
}

export const DO: Advice[] = [
  { say: 'One step per line, in the order you do it.',
    like: '"Log in to the claims system. Search for the claim by its number. Note the claim status."' },
  { say: 'Just say "log in".',
    like: 'Log in, sign in or log on — Orbit fills in the account and password and presses the button, whatever the button is called.' },
  { say: 'Name the action for anything that changes something.',
    like: '"Approve the file", "Save the note", "Submit the claim". Orbit only presses a button like that when your words ask for it.' },
  { say: 'Say what is different each time in plain words.',
    like: '"the claim number", "the loan number". Orbit asks you for one example to try it with, and each run is given its own.' },
  { say: 'Say what to read or note.',
    like: '"Note the claim status", "Record the note rate".' },
  { say: 'Say what happens when something is not there.',
    like: '"If there is no such claim, say so." That is a correct answer, not a failure.' },
];

export const DONT: Advice[] = [
  { say: 'Put a user ID or password in the procedure.',
    like: 'They come from the system registered in Admin, and a run always signs in as that account.' },
  { say: 'Answer an example question with a password.',
    like: 'If Orbit asks for an example where you would type a password, stop and tell your administrator: the answer would be kept as ordinary text.' },
  { say: 'Expect it to approve, save or submit what you did not ask for.',
    like: '"Review the file" never approves it. If approving is the step, say "Approve the file".' },
  { say: 'Write catch-alls.',
    like: '"Do the usual" or "handle it" gives Orbit nothing to map. Say what the usual is.' },
  { say: 'Write notes to the computer.',
    like: '"Ignore the above" or "SYSTEM:" is flagged as a risk and never acted on.' },
];

/** The one thing people trip over, and what to do. */
export const WATCH: Advice = {
  say: 'A button called Submit on a form that only searches.',
  like: 'If Orbit says it would not press it, add "…and press Submit" to that line and map it again.',
};
