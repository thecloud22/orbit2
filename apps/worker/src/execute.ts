/**
 * Executing a published version.
 *
 * No model is consulted here — not as a matter of configuration, but because
 * nothing in this file can reach one (Decision 6). The worker runs with no
 * model key set at all.
 *
 * Every attempt is written before the side effect and again after it
 * (Decision 2), so an attempt that started and never ended is exactly the
 * interrupted case and is found by a query rather than by inference.
 */
import type { ErrorKind, Step } from '@orbit/contract';
import type { PoolClient } from 'pg';
import { describeRefusal, type Binding } from './binder.ts';
import { capture } from './evidence.ts';
import { decide } from './compare.ts';
import type { Surface } from './surface.ts';

export interface Halt { kind: ErrorKind; step: number; describe: string }

interface Ctx {
  db: PoolClient;
  runId: string;
  /** Whatever this application is driven through. The executor never learns
   *  which, and Decision 5 item 9 requires that it cannot. */
  surface: Surface;
  values: Map<string, string | null>;
  inputs: Record<string, string>;
  /** The ending actually reached, which is not the last step in the list. */
  reached: string | null;
}

/**
 * One side of a comparison, as text or absence.
 *
 * A literal is a constant in the published version; a step value is something
 * a run produced; an input is what the run was started with. None of them is
 * an expression, which is what keeps a comparison a fact rather than a small
 * program.
 */
function resolveRef(ctx: Ctx, ref: { from: string; value?: string; literal?: unknown }): string | null {
  if (ref.from === 'step') return ctx.values.get(ref.value ?? '') ?? null;
  if (ref.from === 'input') return ctx.inputs[ref.value ?? ''] ?? null;
  if (ref.from === 'literal') {
    const l = ref.literal as { type: string; text?: string; number?: number; date?: string; yesNo?: boolean };
    return l.type === 'text' ? l.text ?? null
      : l.type === 'number' ? String(l.number)
      : l.type === 'date' ? l.date ?? null
      : l.type === 'yesNo' ? (l.yesNo ? 'yes' : 'no')
      : null;
  }
  return null;
}

const binding = (step: Step): Binding | null => {
  const target =
    step.kind === 'enter' ? step.into
    : step.kind === 'activate' ? step.control
    : step.kind === 'read' ? step.region
    : null;
  return (target?.binding ?? null) as Binding | null;
};

async function event(ctx: Ctx, attemptId: string | null, kind: string, detail: unknown) {
  await ctx.db.query(
    `INSERT INTO run_event (run_id, attempt_id, kind, detail) VALUES ($1, $2, $3, $4)`,
    [ctx.runId, attemptId, kind, JSON.stringify(detail)]);
}

async function screenshot(ctx: Ctx, attemptId: string) {
  // Sign-in happened before capture started, so nothing here can hold a
  // credential — which is what makes deferring redaction safe rather than
  // reckless (Decision 4 item 13).
  const shot = await ctx.surface.capture();
  const { digest, bytes, mediaType } = await capture(shot.bytes, shot.mediaType);
  await ctx.db.query(
    `INSERT INTO artefact (run_id, attempt_id, kind, media_type, bytes, digest)
     VALUES ($1, $2, 'screenshot', $3, $4, $5)`, [ctx.runId, attemptId, mediaType, bytes, digest]);
}

async function runStep(ctx: Ctx, step: Step, position: number,
  positionOf: Map<string, number>): Promise<Halt | 'ok' | { goto: number }> {
  const { rows: [attempt] } = await ctx.db.query<{ id: string }>(
    `INSERT INTO step_attempt (run_id, step_position, step_kind, attempt)
     VALUES ($1, $2, $3, 1) RETURNING id`, [ctx.runId, position, step.kind]);
  const attemptId = attempt!.id;
  await event(ctx, attemptId, 'step.attempt.started', { attempt: 1 });
  const started = Date.now();

  const end = async (outcome: string, halt?: Halt) => {
    await ctx.db.query(
      `UPDATE step_attempt SET outcome = $2, error = $3, ended_at = now() WHERE id = $1`,
      [attemptId, outcome, halt ? JSON.stringify(halt) : null]);
    await event(ctx, attemptId, 'step.attempt.ended', { outcome, tookMs: Date.now() - started });
  };

  const bind = async () => {
    const b = binding(step);
    if (!b) return { refusal: 'this step names nothing on the page' } as const;
    const found = await ctx.surface.find(b);
    if (found.found === 'one') return { it: found.it, by: found.it.by } as const;
    const label = step.kind === 'enter' ? step.into.label
      : step.kind === 'activate' ? step.control.label
      : step.kind === 'read' ? step.region.label : 'the control';
    return { refusal: describeRefusal(label, found), many: found.found === 'many' } as const;
  };

  switch (step.kind) {
    case 'open': {
      await ctx.surface.open(step.path);
      await event(ctx, attemptId, 'navigated', { to: step.path });
      await screenshot(ctx, attemptId);
      await end('ok');
      return 'ok';
    }
    case 'enter': {
      const found = await bind();
      if ('refusal' in found) {
        const halt = { kind: (found.many ? 'controlAmbiguous' : 'controlNotFound') as ErrorKind, step: position, describe: found.refusal };
        await end('halted', halt); return halt;
      }
      const ref = step.value;
      const value = ref.from === 'input' ? ctx.inputs[ref.value] ?? ''
        : ref.from === 'literal' && ref.literal.type === 'text' ? ref.literal.text : '';
      await found.it.fill(value);
      await event(ctx, attemptId, 'entered', { into: step.into.label, by: found.by });
      await screenshot(ctx, attemptId);
      await end('ok'); return 'ok';
    }
    case 'activate': {
      const found = await bind();
      if ('refusal' in found) {
        const halt = { kind: (found.many ? 'controlAmbiguous' : 'controlNotFound') as ErrorKind, step: position, describe: found.refusal };
        await end('halted', halt); return halt;
      }
      await found.it.activate();
      await ctx.surface.settle();
      await event(ctx, attemptId, 'activated', { control: step.control.label, by: found.by });
      await screenshot(ctx, attemptId);
      await end('ok'); return 'ok';
    }
    case 'read': {
      const found = await bind();
      const name = step.produces.name;
      if ('refusal' in found) {
        if (!step.produces.required && !found.many) {
          // Not required and not there: the value is *absent*, which a branch
          // may test for. This is what makes "the record does not exist"
          // expressible at all (Decision 14 item 2).
          ctx.values.set(name, null);
          await event(ctx, attemptId, 'read.absent', { value: name });
          await end('ok'); return 'ok';
        }
        const halt = { kind: (found.many ? 'controlAmbiguous' : 'controlNotFound') as ErrorKind, step: position, describe: found.refusal };
        await end('halted', halt); return halt;
      }
      const text = (await found.it.text()).trim();
      ctx.values.set(name, text);
      await event(ctx, attemptId, 'read', { value: name, read: text, by: found.by });
      await screenshot(ctx, attemptId);
      await end('ok'); return 'ok';
    }
    case 'branch': {
      const decided = decide(step.when, (ref) => resolveRef(ctx, ref));
      if (!decided.decided) {
        // A comparison that cannot be decided stops the run. It used to fall
        // through to "is the left side present", which answers a different
        // question and answers it confidently.
        const halt: Halt = { kind: decided.kind, step: position, describe: decided.describe };
        await end('halted', halt); return halt;
      }
      const took = decided.held;
      // Both operands, exactly as they arrived (§10). A comparison that went
      // the wrong way is fixable only because these are here.
      await event(ctx, attemptId, 'branch.evaluated', {
        left: decided.left, operator: step.when.operator, right: decided.right,
        tookPath: took ? 'yes' : 'no',
      });
      await end('ok');
      // A branch names its two targets by step id. Resolving the id to a
      // position is why the graph is stored as a graph rather than an order.
      const target = took ? step.ifTrue : step.ifFalse;
      const to = positionOf.get(target);
      if (to === undefined) {
        const halt: Halt = { kind: 'pathReachesNothing', step: position,
          describe: 'This branch names a step the version does not contain.' };
        return halt;
      }
      return { goto: to };
    }
    case 'check': {
      // §14: a check asserts a condition holds and stops the run when it does
      // not, saying what was expected. Unlike a branch it has one way out, so
      // the failure is the interesting half.
      const decided = decide(step.that, (ref) => resolveRef(ctx, ref));
      if (!decided.decided) {
        const halt: Halt = { kind: decided.kind, step: position, describe: decided.describe };
        await end('halted', halt); return halt;
      }
      await event(ctx, attemptId, 'check.evaluated', {
        left: decided.left, operator: step.that.operator, right: decided.right,
        held: decided.held,
      });
      if (!decided.held) {
        const halt: Halt = { kind: 'checkFailed', step: position, describe: step.otherwise };
        await end('halted', halt); return halt;
      }
      await end('ok'); return 'ok';
    }
    case 'end': {
      await event(ctx, attemptId, 'ended', { outcome: step.outcome });
      ctx.reached = step.outcome;
      await end('ok'); return 'ok';
    }
    default: {
      // A kind the executor does not carry out yet halts rather than skipping.
      // Skipping would make a run that did less than the version says look the
      // same as one that did all of it.
      const halt: Halt = { kind: 'pathReachesNothing', step: position,
        describe: `A ${step.kind} step is not executed yet, so this run cannot continue.` };
      await end('halted', halt); return halt;
    }
  }
}

/**
 * Runs a version's steps against a surface.
 *
 * The surface is handed in rather than made here. That is what makes the ten
 * step kinds surface-neutral by construction: this function contains no way of
 * discovering what it is driving, so it cannot come to depend on one.
 */
export async function execute(db: PoolClient, runId: string, steps: Step[],
  inputs: Record<string, string>, surface: Surface) {
  const ctx: Ctx = { db, runId, surface, values: new Map(), inputs, reached: null };
  const positionOf = new Map(steps.map((s, i) => [s.id, i + 1]));
  try {
    let position = 1;
    while (position <= steps.length) {
      // The safe boundary §10 asks for. Cancellation is cooperative: a run
      // stops *between* steps, never part-way through one, so what completed
      // before it stopped is a whole number of steps and the evidence for each
      // is complete. Killing the browser mid-action would leave a step that
      // half-happened, which is the one thing the record must never contain.
      const { rows: [asked] } = await db.query<{ cancel_requested_at: string | null }>(
        `SELECT cancel_requested_at FROM run WHERE id = $1`, [runId]);
      if (asked?.cancel_requested_at) {
        const halt: Halt = { kind: 'cancelled', step: position,
          describe: `Cancelled before step ${position} ran. Everything before it completed.` };
        await event(ctx, null, 'run.cancelled', { stoppedBefore: position });
        return { halted: halt, values: ctx.values };
      }

      const step = steps[position - 1]!;
      const outcome = await runStep(ctx, step, position, positionOf);
      if (typeof outcome === 'object' && 'kind' in outcome) return { halted: outcome, values: ctx.values };
      if (typeof outcome === 'object' && 'goto' in outcome) { position = outcome.goto; continue; }
      if (step.kind === 'end') break;
      position += 1;
    }
    return { halted: null, values: ctx.values, reached: ctx.reached };
  } finally {
    await surface.close();
  }
}
