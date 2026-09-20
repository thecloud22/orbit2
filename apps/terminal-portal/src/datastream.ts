import { fromEbcdic, toEbcdic } from './ebcdic';

/**
 * The 3270 data stream, in the narrow slice a practice host needs.
 *
 * This is a byte emitter, not a 3270 implementation, and the asymmetry is
 * deliberate -- it is the same one TASK-P3-000 relied on. Everything that
 * *interprets* the stream is x3270's, so a misreading on Orbit's side cannot be
 * cancelled out by the same misreading here. What this file does is the easy
 * direction: lay captions and input fields on a buffer, and read back the fields
 * a terminal says were modified.
 *
 * Reference: IBM 3270 Data Stream Programmer's Reference (GA23-0059).
 */

/** Orders, attributes and AIDs, named rather than spelled at each use. */
const ERASE_WRITE = 0xf5;
/** Reset the modified-data tags and unlock the keyboard. */
const WCC_RESET_AND_UNLOCK = 0xc3;
const ORDER_SBA = 0x11;
const ORDER_SF = 0x1d;
const ORDER_IC = 0x13;

export const ATTR_PROTECTED = 0x60;
export const ATTR_PROTECTED_INTENSE = 0xf8;
export const ATTR_INPUT = 0x40;
/** Non-display is a field attribute the host declares, never a guess. */
export const ATTR_INPUT_HIDDEN = 0x4c;

export const SCREEN_ROWS = 24;
export const SCREEN_COLUMNS = 80;

/**
 * The 12-bit buffer address code table.
 *
 * Addresses are not sent as plain binary: each 6-bit half is mapped through
 * this table so the result never collides with a control code.
 */
const ADDRESS_CODES = [
  0x40, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f,
  0x50, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f,
  0x60, 0x61, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f,
  0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f,
] as const;

export function addressOf(row: number, column: number): number {
  return row * SCREEN_COLUMNS + column;
}

function encodeAddress(address: number): readonly number[] {
  return [ADDRESS_CODES[(address >> 6) & 0x3f] ?? 0x40, ADDRESS_CODES[address & 0x3f] ?? 0x40];
}

/**
 * Reads an address back, in either form a terminal may send.
 *
 * A 14-bit address is identified by its two top bits being zero; anything else
 * is the 12-bit coded form. Both appear in the wild, and a host that assumed one
 * would fail against the other for reasons that look like a screen-layout bug.
 */
function decodeAddress(high: number, low: number): number {
  return (high & 0xc0) === 0 ? ((high & 0x3f) << 8) | low : ((high & 0x3f) << 6) | (low & 0x3f);
}

/** A caption. Protected, so nothing a terminal sends can change it. */
export interface Caption {
  readonly kind: 'caption';
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly intense?: boolean;
}

/**
 * A field a person types into.
 *
 * `column` is where the field's *attribute* sits; the typed value starts one
 * column later, which is how a 3270 buffer works and why the addresses a client
 * sends back are one past what a screen layout reads like.
 */
export interface InputField {
  readonly kind: 'input';
  readonly name: string;
  readonly row: number;
  readonly column: number;
  readonly length: number;
  readonly value?: string;
  readonly hidden?: boolean;
}

export type ScreenElement = Caption | InputField;

export interface ScreenDefinition {
  /** Diagnostic only. The client never sees it. */
  readonly name: string;
  readonly elements: readonly ScreenElement[];
  /** Which input the cursor lands in, by name. */
  readonly cursorAt?: string;
}

/** Where a field's typed value begins, which is what a client addresses. */
function dataAddressOf(field: InputField): number {
  return addressOf(field.row, field.column) + 1;
}

export function inputsOf(screen: ScreenDefinition): readonly InputField[] {
  return screen.elements.filter((element): element is InputField => element.kind === 'input');
}

/**
 * One screen as a stream of orders: erase, then every element in buffer order.
 *
 * Elements are sorted by position rather than trusted to be declared in order.
 * A screen written out of order still renders correctly -- the orders carry
 * their own addresses -- but the field *sequence* is what `field_after_label`
 * resolves against, and a caption declared after its own input would silently
 * bind the wrong field.
 */
export function encodeScreen(screen: ScreenDefinition): Uint8Array {
  const bytes: number[] = [ERASE_WRITE, WCC_RESET_AND_UNLOCK];
  const ordered = [...screen.elements].sort(
    (left, right) => addressOf(left.row, left.column) - addressOf(right.row, right.column),
  );

  for (const element of ordered) {
    bytes.push(ORDER_SBA, ...encodeAddress(addressOf(element.row, element.column)));

    if (element.kind === 'caption') {
      bytes.push(ORDER_SF, element.intense === true ? ATTR_PROTECTED_INTENSE : ATTR_PROTECTED);
      bytes.push(...toEbcdic(element.text));
      continue;
    }

    bytes.push(ORDER_SF, element.hidden === true ? ATTR_INPUT_HIDDEN : ATTR_INPUT);
    bytes.push(
      ...toEbcdic((element.value ?? '').padEnd(element.length, ' ').slice(0, element.length)),
    );
    // The attribute that ends the field. Without it the input would run to the
    // next field on the screen, and a value typed into it would overwrite a
    // caption.
    bytes.push(
      ORDER_SBA,
      ...encodeAddress(addressOf(element.row, element.column) + element.length + 1),
    );
    bytes.push(ORDER_SF, ATTR_PROTECTED);
  }

  const cursor = inputsOf(screen).find((field) => field.name === screen.cursorAt);

  if (cursor !== undefined) {
    bytes.push(ORDER_SBA, ...encodeAddress(dataAddressOf(cursor)), ORDER_IC);
  }

  return Uint8Array.from(bytes);
}

export interface InboundRead {
  readonly aid: number;
  /** Field name to the text a terminal sent back, trimmed of its padding. */
  readonly fields: ReadonlyMap<string, string>;
}

/**
 * What a terminal sent when a key was pressed.
 *
 * The inbound stream is an AID byte, the cursor address, then one
 * `SBA + address + data` group per field whose modified-data tag is set. A key
 * pressed with nothing typed sends the AID and the cursor and no groups at all,
 * which is not an error -- it is how PF3 arrives.
 */
export function parseInbound(bytes: Uint8Array, screen: ScreenDefinition): InboundRead {
  const aid = bytes[0] ?? 0;
  const byAddress = new Map(inputsOf(screen).map((field) => [dataAddressOf(field), field]));
  const fields = new Map<string, string>();

  // Byte 0 is the AID and bytes 1-2 are the cursor address; groups start after.
  let index = 3;

  while (index < bytes.length) {
    if (bytes[index] !== ORDER_SBA) {
      index += 1;
      continue;
    }

    const address = decodeAddress(bytes[index + 1] ?? 0, bytes[index + 2] ?? 0);
    index += 3;

    const start = index;
    while (index < bytes.length && bytes[index] !== ORDER_SBA) {
      index += 1;
    }

    const field = byAddress.get(address);

    if (field !== undefined) {
      fields.set(field.name, fromEbcdic(bytes.subarray(start, index)).trim());
    }
  }

  return { aid, fields };
}

/** AID values, as the keys Orbit's own `AidKey` vocabulary names them. */
export const AID = {
  enter: 0x7d,
  clear: 0x6d,
  pa1: 0x6c,
  pa2: 0x6e,
  pa3: 0x6b,
  pf1: 0xf1,
  pf2: 0xf2,
  pf3: 0xf3,
  pf4: 0xf4,
  pf5: 0xf5,
  pf6: 0xf6,
  pf7: 0xf7,
  pf8: 0xf8,
  pf9: 0xf9,
  pf10: 0x7a,
  pf11: 0x7b,
  pf12: 0x7c,
} as const;
