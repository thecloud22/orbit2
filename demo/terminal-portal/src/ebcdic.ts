/**
 * The one character encoding a 3270 host speaks: EBCDIC, code page 037.
 *
 * A table rather than a dependency. The mapping is fixed by the code page and
 * has not changed since 1964, and the alternative -- pulling in an encoding
 * library so a demo host can spell "REQUEST NUMBER" -- costs more than it saves.
 *
 * Only printable ASCII is represented. A green screen shows captions and typed
 * values; anything outside that range is not a character this portal has any
 * business rendering, so encoding one is refused rather than approximated, and
 * an unrecognised byte arriving from a client decodes to a space.
 */

/** ASCII 0x20-0x7E, in order, as their code page 037 bytes. */
const CP037 = [
  0x40, 0x5a, 0x7f, 0x7b, 0x5b, 0x6c, 0x50, 0x7d, 0x4d, 0x5d, 0x5c, 0x4e, 0x6b, 0x60, 0x4b, 0x61,
  0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0x7a, 0x5e, 0x4c, 0x7e, 0x6e, 0x6f,
  0x7c, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
  0xd7, 0xd8, 0xd9, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xba, 0xe0, 0xbb, 0xb0, 0x6d,
  0x79, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xc0, 0x4f, 0xd0, 0xa1,
] as const;

const FIRST_ASCII = 0x20;
const LAST_ASCII = 0x7e;
const SPACE = 0x40;

const TO_ASCII = new Map<number, string>(
  CP037.map((byte, index) => [byte, String.fromCharCode(FIRST_ASCII + index)]),
);

/** Throws on a character the code page cannot carry, rather than substituting one. */
export function toEbcdic(text: string): Uint8Array {
  const out = new Uint8Array(text.length);

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (code < FIRST_ASCII || code > LAST_ASCII) {
      throw new Error(`"${text[index] ?? ''}" cannot be written to a 3270 screen`);
    }

    // Indexing is in range by the bounds check above, which
    // `noUncheckedIndexedAccess` cannot see.
    out[index] = CP037[code - FIRST_ASCII] ?? SPACE;
  }

  return out;
}

/** Unknown bytes become spaces: a client may send anything, and it is data. */
export function fromEbcdic(bytes: Uint8Array): string {
  let text = '';

  for (const byte of bytes) {
    text += TO_ASCII.get(byte) ?? ' ';
  }

  return text;
}
