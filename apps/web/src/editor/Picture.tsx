import type { Shot } from './model.ts';

/**
 * The picture Orbit captured, never a drawing of one (R7).
 *
 * Small beside a step, larger when the step is chosen; the element the step
 * acts on is boxed where Orbit measured it. A picture that was withheld says
 * so and why, rather than leaving a gap that reads as a failure (product rule
 * 11, Decision 4 item 13).
 */
export function Picture({ shot, size, alt }: { shot: Shot | null | undefined; size: 'small' | 'large'; alt: string }) {
  const small = size === 'small';
  if (!shot?.digest) {
    const why = shot?.withheld ?? 'No picture: nothing on a page was looked at for this.';
    return small
      ? <span title={why} style={{ width: 64, height: 36, flexShrink: 0, boxSizing: 'border-box', border: '1px dashed var(--rule-2)',
          borderRadius: 3, fontSize: 10, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', lineHeight: 1.1, padding: 2 }}>{shot?.withheld ? 'withheld' : 'no page'}</span>
      : <div style={{ border: '1px dashed var(--rule-2)', borderRadius: 4, padding: '14px 16px', fontSize: 12.5,
          color: 'var(--ink-2)', lineHeight: 1.5 }}>{why}</div>;
  }
  const src = `/api/screens/${shot.digest}`;
  const box = shot.box;
  const image = (
    <span style={{ position: 'relative', display: 'block', width: small ? 64 : '100%', flexShrink: 0,
      border: '1px solid var(--rule-2)', borderRadius: small ? 3 : 4, overflow: 'hidden', background: 'var(--panel-2)' }}>
      <img src={src} alt={alt} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
      {box && (
        <span aria-hidden style={{ position: 'absolute', left: `${box.x * 100}%`, top: `${box.y * 100}%`,
          width: `${box.w * 100}%`, height: `${box.h * 100}%`, boxSizing: 'border-box',
          border: `${small ? 1.5 : 2.5}px solid var(--primary)`, borderRadius: 2,
          boxShadow: small ? 'none' : '0 0 0 3px rgba(255,107,107,0.25)' }} />
      )}
    </span>
  );
  if (small) return image;
  return (
    <a href={src} target="_blank" rel="noreferrer" title="Open the picture full size"
      style={{ display: 'block', textDecoration: 'none' }}>{image}</a>
  );
}
