import { describe, expect, it } from 'vitest';

import { advance, findServiceRequest, BLANK_MESSAGE, NOT_FOUND_MESSAGE } from './screens';

const nothing = new Map<string, string>();
const typed = (value: string): ReadonlyMap<string, string> => new Map([['requestNumber', value]]);

describe('lookup', () => {
  it('finds the seeded request', () => {
    expect(findServiceRequest('SR-1001')?.status).toBe('IN PROGRESS');
  });

  it('matches what a terminal sends, which is upper case and padded', () => {
    expect(findServiceRequest('  sr-1001  ')?.requestNumber).toBe('SR-1001');
  });

  it('finds nothing for a request number nobody has', () => {
    expect(findServiceRequest('SR-9999')).toBeUndefined();
  });
});

describe('advance', () => {
  it('shows the record when the request number is known', () => {
    const next = advance({ kind: 'lookup' }, 'enter', typed('SR-1001'));

    expect(next.kind).toBe('detail');
    expect(next.kind === 'detail' && next.request.assignedTeam).toBe('INFRASTRUCTURE OPERATIONS');
  });

  it('comes back to the lookup screen with a message when it is not', () => {
    expect(advance({ kind: 'lookup' }, 'enter', typed('SR-9999'))).toEqual({
      kind: 'lookup',
      message: NOT_FOUND_MESSAGE,
    });
  });

  it('distinguishes an empty search from an unknown request', () => {
    // Two different things a person did, and a workflow branching on "not
    // found" must not be handed "you typed nothing" under the same caption.
    expect(advance({ kind: 'lookup' }, 'enter', nothing)).toEqual({
      kind: 'lookup',
      message: BLANK_MESSAGE,
    });
  });

  it('returns from the record to the lookup screen on PF3', () => {
    const detail = advance({ kind: 'lookup' }, 'enter', typed('SR-1002'));

    expect(advance(detail, 'pf3', nothing)).toEqual({ kind: 'lookup' });
  });

  it('does nothing for a key this application does not use', () => {
    const detail = advance({ kind: 'lookup' }, 'enter', typed('SR-1002'));

    expect(advance(detail, 'other', nothing)).toBe(detail);
  });
});
