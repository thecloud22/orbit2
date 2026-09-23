/**
 * Values named in the author's words (Decision 20; plan
 * docs/plans/2026-09-23-values-in-your-words.md, V1–V3).
 *
 * Each phrase that means a value is underlined in the sentence, with the
 * value's name beside it: dotted while it is Orbit's guess, solid once the
 * author has said so. Choosing one says what it means. The words themselves
 * are never changed: the link is kept beside the sentence.
 */
import { useState, type ReactNode } from 'react';
import type { Draft, ValueLink } from './model.ts';

const mono: React.CSSProperties = { fontFamily: 'var(--mono)' };

/** What a phrase can mean: a value a step reads, or one given when a run starts. */
export type Choice = { name: string; label: string; from: string };

export function choicesOf(draft: Draft): Choice[] {
  const reads = draft.steps.flatMap((s) => {
    const p = s.kind === 'read' ? s.declares['produces'] as { name?: string; label?: string } | undefined : undefined;
    return p?.name ? [{ name: p.name, label: p.label ?? p.name, from: `step ${s.position}` }] : [];
  });
  const inputs = (draft.workflow.declared_inputs ?? []).map((i) => ({ name: i.name, label: i.label, from: 'given when a run starts' }));
  const seen = new Set<string>();
  return [...reads, ...inputs].filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

/** The words a value is written as when it is named with @: "Credit score" is "the credit score". */
export function wordsFor(c: { name: string; label: string }): string {
  const label = c.label && c.label !== c.name ? c.label : c.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return `the ${label.toLowerCase()}`;
}

const NAME = /^[a-z][a-zA-Z0-9]*$/;

/** A sentence as written, with each phrase that means a value underlined, and its name beside it. */
export function LinkedWords({ text, links, open, onPick, style }: {
  text: string; links: ValueLink[]; open: boolean; onPick: (l: ValueLink) => void; style: React.CSSProperties;
}) {
  const marked = links.filter((l) => l.value !== null)
    .map((l) => ({ l, at: text.indexOf(l.phrase) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  const parts: ReactNode[] = [];
  let from = 0;
  for (const { l, at } of marked) {
    if (at < from) continue;
    if (at > from) parts.push(text.slice(from, at));
    const line = `2px ${l.by === 'author' ? 'solid' : 'dotted'} var(--running-ink)`;
    const says = l.by === 'author' ? `“${l.phrase}” is ${l.value}, as you said` : `Orbit takes “${l.phrase}” to be ${l.value}. Choose to confirm or change it`;
    parts.push(open
      ? <button key={`${l.phrase}@${at}`} type="button" title={says} aria-label={says}
          onClick={(e) => { e.stopPropagation(); onPick(l); }}
          style={{ font: 'inherit', color: 'inherit', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', borderBottom: line }}>
          {l.phrase}</button>
      : <span key={`${l.phrase}@${at}`} title={says} style={{ borderBottom: line }}>{l.phrase}</span>);
    parts.push(<span key={`${l.phrase}@${at}#name`} style={{ ...mono, fontSize: 10.5, color: 'var(--running-ink)', marginLeft: 3 }}>{l.value}</span>);
    from = at + l.phrase.length;
  }
  parts.push(text.slice(from));
  return <span style={style}>{parts}</span>;
}

/** What a phrase means, as the author says (V2): a value read, an input, a new name, or not a value. */
export function LinkPicker({ link, choices, busy, onLink, onClose }: {
  link: ValueLink; choices: Choice[]; busy: boolean;
  onLink: (value: string | null) => Promise<boolean>; onClose: () => void;
}) {
  const [fresh, setFresh] = useState('');
  const freshId = `fresh-${link.sentence}-${link.phrase}`.replace(/[^a-zA-Z0-9-]/g, '-');
  const pick = (value: string | null) => void onLink(value).then((ok) => ok && onClose());
  const row: React.CSSProperties = { font: 'inherit', textAlign: 'left', background: 'transparent', border: 0, padding: '7px 14px',
    display: 'flex', gap: 10, alignItems: 'baseline', cursor: 'pointer', color: 'var(--ink)', width: '100%' };
  return (
    <div role="dialog" aria-label={`What “${link.phrase}” means`} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      style={{ margin: '8px 0 4px', width: 360, background: 'var(--panel)', border: '1px solid var(--rule-2)', borderRadius: 6,
        boxShadow: '0 6px 20px rgba(20,20,19,0.12)', cursor: 'default' }}>
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>“{link.phrase}” means</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
          {link.by === 'author' ? 'As you said. Choose another to change it.' : 'Orbit’s guess. Confirm it, or choose what it is.'}</div>
      </div>
      <div role="listbox" aria-label="Values" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
        {choices.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-2)', padding: '4px 14px 8px' }}>Nothing is read yet. Name a new value below.</div>}
        {choices.map((c) => (
          <button key={c.name} type="button" role="option" aria-selected={c.name === link.value} disabled={busy}
            onClick={() => pick(c.name)} style={{ ...row, background: c.name === link.value ? 'var(--running-wash)' : 'transparent' }}>
            <span style={{ ...mono, fontSize: 12, fontWeight: c.name === link.value ? 600 : 400, width: 128, flexShrink: 0 }}>{c.name}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{c.label} · {c.from}</span>
          </button>
        ))}
        <div style={{ borderTop: '1px solid var(--rule)', margin: '4px 0' }} />
        <form onSubmit={(e) => { e.preventDefault(); if (NAME.test(fresh)) pick(fresh); }}
          style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 14px' }}>
          <label style={{ fontSize: 12.5, flexShrink: 0 }} htmlFor={freshId}>A new value</label>
          <input id={freshId} value={fresh} onChange={(e) => setFresh(e.target.value.trim())} placeholder="creditRating"
            style={{ ...mono, fontSize: 12, flexGrow: 1, minWidth: 0, padding: '4px 6px', border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }} />
          <button type="submit" disabled={busy || !NAME.test(fresh)}
            style={{ font: 'inherit', fontSize: 12, border: '1px solid var(--rule-2)', borderRadius: 3, background: 'transparent', padding: '3px 8px', cursor: 'pointer' }}>Name it</button>
        </form>
        {fresh && !NAME.test(fresh) && <div style={{ fontSize: 11.5, color: 'var(--failed-ink)', padding: '0 14px 4px' }}>A name starts with a small letter, then letters and digits: creditRating.</div>}
        <div style={{ fontSize: 11.5, color: 'var(--ink-2)', padding: '0 14px 4px' }}>Nothing reads a new value yet: Orbit reads it the next time it maps this.</div>
        <button type="button" disabled={busy} onClick={() => pick(null)} style={{ ...row, fontSize: 12.5 }}>Not a value: leave it as words</button>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 12px', borderTop: '1px solid var(--rule)' }}>
        {link.by === 'orbit' && link.value && (
          <button type="button" disabled={busy} onClick={() => pick(link.value)}
            style={{ font: 'inherit', fontSize: 13, fontWeight: 600, borderRadius: 3, padding: '6px 12px', cursor: 'pointer',
              color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}>That’s right</button>
        )}
        <button type="button" onClick={onClose}
          style={{ font: 'inherit', fontSize: 13, borderRadius: 3, padding: '6px 12px', cursor: 'pointer', color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--rule-2)' }}>Close</button>
      </div>
    </div>
  );
}

/** How many of the values in the words are still Orbit's guesses, and a way to confirm them all at once. */
export function GuessesStrip({ links, open, busy, onConfirmAll }: {
  links: ValueLink[]; open: boolean; busy: boolean; onConfirmAll: () => void;
}) {
  const guesses = links.filter((l) => l.by === 'orbit' && l.value);
  const named = links.filter((l) => l.by === 'author' && l.value);
  if (!guesses.length && !named.length) return null;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 10px', fontSize: 12.5, color: 'var(--ink-2)' }}>
      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Values in your words</span>
      {guesses.length > 0 && (
        <span style={{ fontWeight: 600, color: 'var(--attention-ink)', background: 'var(--attention-wash)', borderRadius: 3, padding: '2px 8px' }}>
          {guesses.length === 1 ? '1 is Orbit’s guess' : `${guesses.length} are Orbit’s guesses`}</span>
      )}
      {named.length > 0 && <span>{named.length === 1 ? '1 you named' : `${named.length} you named`}</span>}
      {open && guesses.length > 0 && (
        <button type="button" disabled={busy} onClick={onConfirmAll}
          style={{ font: 'inherit', fontSize: 12.5, color: 'var(--ink)', background: 'var(--panel)', border: '1px solid var(--rule-2)', borderRadius: 3, padding: '3px 10px', cursor: 'pointer' }}>
          {guesses.length === 1 ? 'Confirm it' : `Confirm all ${guesses.length}`}</button>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
        <span><span style={{ borderBottom: '2px dotted var(--running-ink)', color: 'var(--ink)' }}>dotted</span> Orbit’s guess</span>
        <span><span style={{ borderBottom: '2px solid var(--running-ink)', color: 'var(--ink)' }}>solid</span> you said so</span>
      </span>
    </div>
  );
}

/**
 * Typing @ in the Edit box (V3): what the author has typed after the @, and
 * where, so the list can offer values and the choice can replace it with the
 * value's own words.
 */
export function atQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s(])@([a-zA-Z0-9]*)$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2]!.length - 1, query: m[2]! } : null;
}

export function AtList({ query, choices, onChoose }: {
  query: string; choices: Choice[]; onChoose: (c: Choice, isNew: boolean) => void;
}) {
  const q = query.toLowerCase();
  const matching = choices.filter((c) => c.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)).slice(0, 8);
  const fresh = NAME.test(query) && !choices.some((c) => c.name === query) ? query : null;
  return (
    <div role="listbox" aria-label="Name a value" style={{ width: 380, background: 'var(--panel)', border: '1px solid var(--rule-2)', borderRadius: 6,
      boxShadow: '0 6px 20px rgba(20,20,19,0.12)', padding: '6px 0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-2)', padding: '2px 12px 4px' }}>@{query} · choose what it is</div>
      {matching.map((c) => (
        <button key={c.name} type="button" role="option" aria-selected={false}
          onMouseDown={(e) => { e.preventDefault(); onChoose(c, false); }}
          style={{ font: 'inherit', textAlign: 'left', background: 'transparent', border: 0, padding: '6px 12px', display: 'flex', gap: 10, alignItems: 'baseline', cursor: 'pointer', color: 'var(--ink)' }}>
          <span style={{ ...mono, fontSize: 12, width: 128, flexShrink: 0 }}>{c.name}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{c.label} · {c.from}</span>
        </button>
      ))}
      {fresh && (
        <button type="button" role="option" aria-selected={false}
          onMouseDown={(e) => { e.preventDefault(); onChoose({ name: fresh, label: fresh, from: 'new' }, true); }}
          style={{ font: 'inherit', textAlign: 'left', background: 'transparent', border: 0, borderTop: matching.length ? '1px solid var(--rule)' : 0,
            padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', color: 'var(--ink)' }}>
          <span style={{ fontSize: 12.5 }}>A new value, <span style={mono}>{fresh}</span></span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Nothing reads it yet. Orbit reads it the next time it maps this.</span>
        </button>
      )}
      {!matching.length && !fresh && <div style={{ fontSize: 12, color: 'var(--ink-2)', padding: '4px 12px' }}>Type a value’s name, or a new one like creditRating.</div>}
    </div>
  );
}
