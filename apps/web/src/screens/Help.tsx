import { useState } from 'react';
import { Page } from '../Page.tsx';

/**
 * The things people ask in the first week.
 *
 * Written for somebody using Orbit, not somebody building it — plain verbs,
 * sentence case, and an answer rather than a definition.
 */
const TOPICS: Array<{ topic: string; answers: Array<{ q: string; a: string }> }> = [
  { topic: 'The basics', answers: [
    { q: 'A draft, a version and a run are three different things',
      a: 'This trips everyone up once. The draft is what you edit, and it never runs. Publishing makes a version, which is permanent and is the only thing that can run. A run is one execution of one version. Editing a draft after publishing changes nothing about what is live until you publish again.' },
    { q: 'What is a conclusion, and why am I being asked to name it?',
      a: 'A conclusion is how the job ends — the answer, not data. If your procedure can approve or decline, those are its two conclusions, and every run ends at exactly one of them and reports which. You name them because they are decisions about your business, and Orbit will not invent a word for one. The left box is the short name the record uses; the right is how it reads to a person.' },
    { q: 'My run says succeeded but it did not find anything. Is that bad?',
      a: 'No — that is the job done correctly. Orbit keeps two facts apart: whether the work completed, and what it concluded. Establishing that a record does not exist is a real answer, so the run succeeded and its conclusion says so. It carries no error and is never shown in red.' },
    { q: 'Why can I not just write what I want the agent to do?',
      a: 'Because then nobody could tell you what it could not do. A workflow is built from a fixed list of ten kinds of step, and there is no eleventh and no way to add one. That is what makes it possible to say, of any agent, exactly what it is able to reach and able to change.' },
  ] },
  { topic: 'Writing a procedure', answers: [
    { q: 'It never asked for a user ID or a password',
      a: 'It does not need to. The account and password come from the system you registered, so every run signs in as that account and nobody starting a run can choose a different one. A password is never typed into a procedure, never stored in a workflow, and never appears in a run.' },
    { q: 'My agent is stuck on one record. How do I make it work on any?',
      a: 'Put the value in the "example to work through" box when you bring the procedure in, and leave it out of the sentence. Orbit declares an input for a value it is given an example of, and treats a value written into the procedure as fixed for every run. It cannot add an input afterwards, so this is decided on the way in.' },
    { q: 'It reported the opposite of what I expected',
      a: 'Write the condition around the thing you want to happen when it is true — "approve the file when the credit score is at least 620" rather than "if it is below 620, decline". Orbit follows the path you describe, and guarding the action you want makes which conclusion is which unambiguous.' },
    { q: 'It says it could not reach a page',
      a: 'Orbit opens the page you start it at and follows links from there. It does not go to an address of its own, because the system you registered is what keeps the agent where it belongs. If your procedure names a page nothing links to, start the agent at that page instead — that is what the "start at" box is for.' },
  ] },
  { topic: 'Why was it refused?', answers: [
    { q: 'It refused to publish. What did I do wrong?',
      a: 'Probably nothing. Orbit refuses to publish anything it cannot pin down completely, and it names the specific thing. The usual cause is a name that matches two things on a page, which means it identifies neither. Pick the one you meant and publish again.' },
    { q: 'It says a value is "not produced on every path"',
      a: 'A step is using something that only exists if the run went one particular way. Either move the step onto that path, or make the other path produce it too. It is a different problem from a value nothing produces at all, which is why it is worded differently.' },
    { q: 'It says a step "finds a value by looking for the value"',
      a: 'The step was set to find something by the words it contains, so it can only ever report what it searched for — and it will find nothing the day the page says something else. Point it at whatever labels the value instead of at the value.' },
    { q: 'It will not let me confirm',
      a: 'Something is outstanding. Orbit raises a question when it could not work something out, and a risk when there is something to have noticed rather than answered. Things Orbit worked out for itself are not questions: they appear under "what Orbit assumed", already settled, and you can disagree with any of them.' },
  ] },
  { topic: 'Reading a run', answers: [
    { q: 'What do the two headings at the top mean?',
      a: 'The left one is what happened technically — did the work complete. The right one is what the agent concluded about your business. They are never merged, because "succeeded" and "no such record" are both true at once and collapsing them loses one of them.' },
    { q: 'It says "stopped by a check". Did something break?',
      a: 'No. A check is a rule you wrote, and it did not hold — the run stopped exactly where your procedure says to stop, and the sentence beside it is your own. Nothing technical failed. Running it again would compare the same values and stop in the same place, which is the point of a check; try a different record, or change the rule.' },
    { q: 'Why is a screenshot missing?',
      a: 'If it says withheld, it was never stored, and the reason is given. That happens on any step that entered a secret — the picture is not taken rather than taken and judged safe. An unreadable record is recoverable; a leaked credential is not.' },
    { q: 'Can I trust the screenshots?',
      a: 'Each one carries a digest taken when it was captured, and Orbit re-checks the bytes against it every time it serves one. If they do not match you get a notice instead of a picture, rather than an image that may have changed.' },
  ] },
  { topic: 'Changing and removing', answers: [
    { q: 'I confirmed it and now I cannot edit the steps',
      a: 'Confirming is you putting your name to a particular set of steps, so they stop being editable at that moment. "Back to editing" undoes the confirmation and lets you work on them again — and the record says it happened, because the thing you attested to is no longer the thing in front of you.' },
    { q: 'I added a step and it will not let me say what it reads',
      a: 'Only endings, checks and branches can be added at the moment. The others name something on a page, and Orbit will not let anyone type that — it works out how a step finds things by looking at the page itself, which is what stops an agent quietly acting on the wrong thing. Adding one needs Orbit to open the page and offer what is on it, which it cannot do yet.' },
    { q: 'How do I get rid of an agent?',
      a: 'Discard it, while it is still a draft. Once something is published you cannot: the version and every run against it are the record, and a record that could be deleted would not prove anything. One thing survives a discard too — where a model helped author it, what it was asked and what it cost stays.' },
  ] },
  { topic: 'What is not recorded yet', answers: [
    { q: 'Why does nothing say who did it?',
      a: 'Because Orbit has no sign-in yet, and it will not invent a name it does not know. Rather than fill that column with something misleading, it is left empty and labelled. When sign-in arrives, entries from that day forward carry the person. Earlier ones never will, because nothing in Orbit edits a history entry.' },
    { q: 'Does Orbit notice if a page changes?',
      a: 'Only where a step touches it. Each step remembers something that must also be true of the thing it acts on, and a run stops rather than acting on something that no longer matches. Orbit does not keep a picture of the whole page and compare it, so a page can be redesigned around a step that still works — you find out at the step that breaks, not before.' },
  ] },
];

export function Help() {
  const [open, setOpen] = useState(0);
  const topic = TOPICS[open]!;
  return (
    <Page title="Help"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        The things people ask in the first week. If something here is wrong or missing, tell your administrator.
      </p>}>
      <div style={{ display: 'flex', gap: 30, paddingTop: 24 }}>
        <nav style={{ width: 240, flexShrink: 0, borderTop: '1px solid var(--ink)' }}>
          {TOPICS.map((t, i) => (
            <button key={t.topic} type="button" onClick={() => setOpen(i)}
              style={{ width: '100%', font: 'inherit', textAlign: 'left', cursor: 'pointer', border: 0,
                borderBottom: '1px solid var(--rule)', padding: '11px 12px',
                background: i === open ? 'var(--failed-wash)' : 'transparent',
                boxShadow: i === open ? 'inset 3px 0 0 var(--primary)' : undefined,
                fontSize: 13.5, fontWeight: i === open ? 600 : 400 }}>
              {t.topic}
            </button>
          ))}
        </nav>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' }}>
            {topic.topic}</h2>
          <div style={{ borderTop: '1px solid var(--ink)', marginTop: 14 }}>
            {topic.answers.map((a) => (
              <div key={a.q} style={{ borderBottom: '1px solid var(--rule)', padding: '18px 0' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{a.q}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 680 }}>{a.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
