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
  { topic: 'The agent\'s page', answers: [
    { q: 'Where is everything?',
      a: 'On one page. Your procedure is on the left, exactly as you wrote it, with your own numbering in the text and Orbit\'s sentence numbers (1.12, 2.3) in the margin. What Orbit made of each sentence opens in the panel on the right: Steps, Chat, Inputs, Outputs, Rules and DataStore. The same page shows the agent from the first sentence to its latest run.' },
    { q: 'Why can I not see the steps?',
      a: 'They never sit between your sentences, so the procedure stays readable. Under each sentence you see what it is for and the values it uses and finds; press "3 steps" to open them in the panel. Each step is said in words, names what it acts on on the page, and shows a small picture Orbit captured when it mapped it, with that element boxed. Anything that needs you — a question, an unfinished step, a change not yet mapped — is always shown, never folded away.' },
    { q: 'How do I change the procedure?',
      a: 'Press Edit beside a sentence. You can reword it, say what it is for, take it out, or add a sentence after it. Nothing is overwritten: the change is kept as a revision, and what it said before stays on the record. Orbit sorts what changed, and the sentence waits to be mapped. You can also ask in the chat; when it suggests a rewording, nothing changes until you press "Make this change".' },
    { q: 'What does Map changes do?',
      a: 'It asks Orbit to map only what changed since it last mapped the procedure. Orbit replays the steps before the first change exactly as they are, with no model, then works through the application from there. It never replays a step that changes a record: if a change can only be reached past one, it says which and stops. You cannot confirm while a change waits to be mapped, because the steps would not be the ones your words now ask for.' },
    { q: 'What are BR1, BR2 on the steps?',
      a: 'Every business rule in your procedure has an identifier: BR1, BR2, and BR1.1, BR1.2 for the rows of a rule\'s table. The rule\'s sentence shows it beside its label, the Rules tab shows each rule as a table, and every step built from a rule carries it as a small superscript, so you can see which rule a press came from.' },
    { q: 'What is the DataStore, and why is it objects?',
      a: 'Everything a run holds: what it was given, what it found, what it decided and what it handed back. Values are grouped into the things they belong to — a loan with its number, loan-to-value and credit score — rather than a loose list, and a run hands its outputs back the same way. You can rename a value or move it into another object on the DataStore tab; everything that uses it follows.' },
    { q: 'Can I change an agent that is already published?',
      a: 'Yes. Press "Edit for a new version". The words, the chat and the steps open again; publishing makes the next version. The version already published never changes, and every run of it keeps naming it.' },
  ] },
  { topic: 'Green screens, and the swivel chair', answers: [
    { q: 'Can an agent work on a mainframe green screen?',
      a: 'Yes, over TN3270. Register the application in Admin with the connector "Terminal · TN3270": its host and port, TLS if the host uses it, its code page and screen model, and who it signs in as. The procedure is written exactly as for a web application — Orbit signs on, types into the field after a label, presses the keys the screen names (Enter, PF5), and reads what a label shows. Nothing in your words says "terminal".' },
    { q: 'How does a step find its field on a green screen?',
      a: 'By the screen it was mapped on, the label beside it, and where it sits. When a run gets there the screen must be the same one, the label must be there once, and the field where it was. If any of that disagrees the run stops and says which, rather than typing into whatever is there now. A key is named by what it does — APPROVE, not PF5.' },
    { q: 'Can one agent work across the web portal and the green screen?',
      a: 'Yes — that is the swivel chair. Pick both when you start a new agent, or "Add an application" on the agent\'s page later. Orbit places each line of work on the system it happens on, and you can change it like a label. It reads on one, types what it read on the other, and brings the answer back. Where the two spell the same thing differently (the web\'s Conventional, the green screen\'s CONV) it proposes a table of codes and asks you once.' },
    { q: 'What if it stops half-way across the two?',
      a: 'Nothing spans two systems as one transaction, so Orbit never guesses a reversal. The run page says what each system now holds: what went through, and a press that never got an answer. Until somebody says they have checked, it will not retry or run it again — doing that blind could board a loan twice.' },
    { q: 'Is a password on a green screen ever captured?',
      a: 'No. A password field on a green screen is one the host marks as not displayed. Orbit never reads what is in it, and it is blanked before the model, a picture or a log could see it.' },
  ] },
  { topic: 'Writing a procedure', answers: [
    { q: 'It never asked for a user ID or a password',
      a: 'It does not need to. The account and password come from the system you registered, so every run signs in as that account and nobody starting a run can choose a different one. A password is never typed into a procedure, never stored in a workflow, and never appears in a run.' },
    { q: 'My agent is stuck on one record. How do I make it work on any?',
      a: 'Open the Inputs tab and press "Make it an input" beside the fixed value: it becomes something every run is given, with the value you wrote as its example. Orbit also asks this as a question under the sentence, and answering it does the same. You can add, change and remove inputs there too; one a step still uses cannot be removed, and it says which step.' },
    { q: 'Can I start without a document?',
      a: 'Yes. Start a new agent, pick its systems and choose "Write it". Every sentence is sorted as it arrives, and nothing is drafted until you press "Draft it".' },
    { q: 'I pasted a procedure. Where do I confirm the sort?',
      a: 'There is nothing to confirm. Orbit sorts every sentence, drafts straight away and shows you as it goes. What it needs from you is asked afterwards, on the sentence it concerns: a line that reads like instructions to Orbit is a risk, a rule comparing something no step reads is a question on that rule, and a sentence for a person asks whether the run waits there. A wrong label is changed on the sentence, then Map changes. It stops before drafting only when you said more is to come, or when nothing in it is Orbit\'s to do, and it says which.' },
    { q: 'Orbit stopped and asked for an example',
      a: 'The procedure is given something a run starts from, such as a loan number, and Orbit needs a real one to try it with. Type one that exists in the application now and press "Try this one": it carries on from that sentence. The value is kept as the example on the Inputs tab; each run is given its own.' },
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
    { q: 'How do I see what a run did about each part of my procedure?',
      a: 'The run page lists your procedure, sentence by sentence, with what the run did beside each one: the values it found, which way each rule went and why, what it pressed, and what it left to a person. Press a picture to see that step\'s screenshot and its record.' },
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
      a: 'Confirming is you putting your name to a particular set of steps, so they stop being editable at that moment. "Back to editing" undoes the confirmation and lets you work on them again — and the record says it happened, because the thing you attested to is no longer the thing in front of you. Any change you make on the page does the same.' },
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
