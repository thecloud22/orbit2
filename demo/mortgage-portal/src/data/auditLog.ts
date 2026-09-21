/**
 * A per-loan, append-only event log, kept for the current browser session.
 *
 * Real and read-only in the sense that matters for testing: once written, an
 * entry is never edited or removed, only added to, the same guarantee a real
 * audit trail makes. It is not wired into every other page's actions --
 * `submitApplication` writes the one entry that already had a natural,
 * single hook; everything else on this page is either seeded history or
 * something a person adds by hand.
 */

const AUDIT_LOG_KEY_PREFIX = 'mortgage-portal:audit-log:';

export interface AuditEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
}

function key(loanNumber: string): string {
  return `${AUDIT_LOG_KEY_PREFIX}${loanNumber.toUpperCase()}`;
}

export function getAuditTrail(loanNumber: string): readonly AuditEntry[] {
  try {
    const raw = window.sessionStorage.getItem(key(loanNumber));
    return raw === null ? [] : (JSON.parse(raw) as AuditEntry[]);
  } catch {
    return [];
  }
}

export function appendAuditEntry(loanNumber: string, actor: string, action: string): void {
  try {
    const existing = getAuditTrail(loanNumber);
    const entry: AuditEntry = { at: new Date().toISOString(), actor, action };
    window.sessionStorage.setItem(key(loanNumber), JSON.stringify([...existing, entry]));
  } catch {
    // Storage can be unavailable; the rest of the page still works, the
    // entry just won't persist across a reload.
  }
}
