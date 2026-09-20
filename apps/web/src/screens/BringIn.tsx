import { useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import type { Route } from '../router.ts';

/**
 * §5's two ways in, meeting at the same place.
 *
 * Both produce a draft you check before anything is published. Neither skips a
 * gate: a recording proposes steps exactly as a written procedure does.
 */
export function BringIn({ go }: { go: (to: Route) => void }) {
  const [way, setWay] = useState<'write' | 'record'>('write');
  const [procedure, setProcedure] = useState(
    'Open the underwriting pipeline and search for the file using the loan number the requester gave us. '
    + 'If the file is there, record the note rate. '
    + 'If there is no such file, say so — that happens a lot, it is not an error.');

  return (
    <Page kicker="New agent" title="Bring in a procedure"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        Two ways in. They meet at the same place: a draft you check before anything is fixed.
      </p>}>
      <div style={{ display: 'flex', gap: 12, paddingTop: 22 }}>
        <Pick chosen={way === 'write'} onPick={() => setWay('write')} title="Write it out"
          body="Describe it the way you would to somebody starting Monday. Orbit works through it against the application." />
        <Pick chosen={way === 'record'} onPick={() => setWay('record')} title="Show it once"
          body="Do the job by hand while Orbit watches. It records what you touched rather than guessing what you meant." />
      </div>

      {way === 'write' ? (
        <Section title="The procedure">
          <textarea value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={6}
            style={{ width: '100%', font: 'inherit', fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink)',
              background: 'var(--panel)', border: '1px solid var(--rule-2)', borderRadius: 5,
              padding: '16px 18px', boxSizing: 'border-box', resize: 'vertical' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 16 }}>
            <Action disabled why="Authoring runs from the worker for now">Work through it</Action>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              Runs from the worker today: <code style={{ fontFamily: 'var(--mono)' }}>
              node --experimental-strip-types src/author-cli.ts</code>
            </span>
          </div>
        </Section>
      ) : (
        <Section title="Recording">
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 700 }}>
            A browser opens and you do the job once. Orbit records what you touched and turns it into steps,
            deriving how to find each control again from what the page offers.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Action disabled why="Recording runs from the worker for now">Start recording</Action>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              <code style={{ fontFamily: 'var(--mono)' }}>node --experimental-strip-types src/record-cli.ts</code>
            </span>
          </div>
          <Refusal title="Three things to know before you record" blockers={[
            'A password is a keystroke. The field is remembered and the value never leaves the page.',
            'One recording is one path. It shows the ending that happened; the others must be recorded or described, and a path reaching no conclusion cannot publish.',
            'You record as yourself and the agent runs as the registered credential, so every control is checked again as that account before anything publishes.',
          ]} />
        </Section>
      )}

      <Section title="What happens next">
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {[
            ['Orbit reads the application', 'It works through what you gave it, looking at each page.'],
            ['You check every step', 'Each one is shown beside the thing on the page it was matched to.'],
            ['You confirm, then publish', 'A version is fixed the moment it is made. Editing afterwards changes nothing until you publish again.'],
          ].map(([title, body], i) => (
            <div key={title} style={{ borderBottom: i === 2 ? 'none' : '1px solid var(--rule)',
              padding: '14px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ width: 20, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

const Pick = ({ chosen, onPick, title, body }: {
  chosen: boolean; onPick: () => void; title: string; body: string;
}) => (
  <button type="button" onClick={onPick} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer',
    flexGrow: 1, flexBasis: 0, borderRadius: 5, padding: '18px 20px',
    background: chosen ? 'var(--failed-wash)' : 'var(--panel)',
    border: `1px solid ${chosen ? 'var(--primary)' : 'var(--rule)'}` }}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
  </button>
);
