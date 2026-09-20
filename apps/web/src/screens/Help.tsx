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
    { q: 'My run says succeeded but it did not find anything. Is that bad?',
      a: 'No — that is the job done correctly. Orbit keeps two facts apart: whether the work completed, and what it concluded. Establishing that a record does not exist is a real answer, so the run succeeded and its conclusion says so. It carries no error and is never shown in red.' },
    { q: 'Why can I not just write what I want the agent to do?',
      a: 'Because then nobody could tell you what it could not do. A workflow is built from a fixed list of ten kinds of step, and there is no eleventh and no way to add one. That is what makes it possible to say, of any agent, exactly what it is able to reach and able to change.' },
  ] },
  { topic: 'Why was it refused?', answers: [
    { q: 'It refused to publish. What did I do wrong?',
      a: 'Probably nothing. Orbit refuses to publish anything it cannot pin down completely, and it names the specific thing. The usual cause is a name that matches two things on a page, which means it identifies neither. Pick the one you meant and publish again.' },
    { q: 'It says a value is "not produced on every path"',
      a: 'A step is using something that only exists if the run went one particular way. Either move the step onto that path, or make the other path produce it too. It is a different problem from a value nothing produces at all, which is why it is worded differently.' },
    { q: 'It will not let me confirm',
      a: 'Something is outstanding — a question, an assumption, an exception or a risk nobody has acknowledged. Each one is shown against the step it concerns. Confirmation is an attestation, and attesting to something with an open question in it would not mean much.' },
  ] },
  { topic: 'Reading a run', answers: [
    { q: 'What do the two headings at the top mean?',
      a: 'The left one is what happened technically — did the work complete. The right one is what the agent concluded about your business. They are never merged, because "succeeded" and "no such record" are both true at once and collapsing them loses one of them.' },
    { q: 'Why is a screenshot missing?',
      a: 'If it says withheld, it was never stored, and the reason is given. That happens when a secret was typed into a field Orbit could not confirm was masked. An unreadable record is recoverable; a leaked credential is not.' },
    { q: 'Can I trust the screenshots?',
      a: 'Each one carries a digest taken when it was captured, and Orbit re-checks the bytes against it every time it serves one. If they do not match you get a notice instead of a picture, rather than an image that may have changed.' },
  ] },
  { topic: 'What is not recorded yet', answers: [
    { q: 'Why does nothing say who did it?',
      a: 'Because Orbit has no sign-in yet, and it will not invent a name it does not know. Rather than fill that column with something misleading, it is left empty and labelled. When sign-in arrives, entries from that day forward carry the person. Earlier ones never will, because nothing in Orbit edits a history entry.' },
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
