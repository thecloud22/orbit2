import { describe, expect, it } from 'vitest';

import { addressOf, encodeScreen, parseInbound, AID, type ScreenDefinition } from './datastream';
import { fromEbcdic, toEbcdic } from './ebcdic';

const SCREEN: ScreenDefinition = {
  name: 'test',
  cursorAt: 'requestNumber',
  elements: [
    { kind: 'caption', row: 0, column: 2, text: 'REQUEST NUMBER ===>' },
    { kind: 'input', name: 'requestNumber', row: 0, column: 22, length: 8 },
  ],
};

describe('code page 037', () => {
  it('round-trips every character a screen can show', () => {
    const printable = Array.from({ length: 0x7f - 0x20 }, (_, index) =>
      String.fromCharCode(0x20 + index),
    ).join('');

    expect(fromEbcdic(toEbcdic(printable))).toBe(printable);
  });

  it('refuses a character the code page cannot carry', () => {
    // Substituting would put a different character on the screen than the one
    // the portal meant to write, which is worse than not starting.
    expect(() => toEbcdic('café')).toThrow(/cannot be written/);
  });

  it('reads an unknown byte as a space', () => {
    expect(fromEbcdic(Uint8Array.from([0x00, 0xc1]))).toBe(' A');
  });
});

describe('outbound', () => {
  it('writes a caption and an input as separate fields', () => {
    const bytes = encodeScreen(SCREEN);

    // Erase/Write, then the write-control character.
    expect(bytes[0]).toBe(0xf5);
    // Two start-field orders: the caption's and the input's, plus the one that
    // ends the input so it does not run into whatever follows.
    expect([...bytes].filter((byte) => byte === 0x1d)).toHaveLength(3);
  });

  it('places the cursor in the named input', () => {
    // The insert-cursor order is last, and it follows the input's data address
    // rather than its attribute position.
    expect([...encodeScreen(SCREEN)].at(-1)).toBe(0x13);
  });
});

describe('inbound', () => {
  /** What a terminal sends: AID, cursor, then one group per modified field. */
  function inbound(aid: number, address: number, text: string): Uint8Array {
    const codes = [
      0x40, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e,
      0x4f, 0x50, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0x5a, 0x5b, 0x5c, 0x5d,
      0x5e, 0x5f, 0x60, 0x61, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0x6a, 0x6b, 0x6c,
      0x6d, 0x6e, 0x6f, 0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0x7a, 0x7b,
      0x7c, 0x7d, 0x7e, 0x7f,
    ];
    const encode = (value: number): number[] => [
      codes[(value >> 6) & 0x3f] ?? 0x40,
      codes[value & 0x3f] ?? 0x40,
    ];

    return Uint8Array.from([aid, ...encode(address), 0x11, ...encode(address), ...toEbcdic(text)]);
  }

  it('reads a modified field back under the name the screen gave it', () => {
    // The address a terminal sends is the field's *data*, one past the
    // attribute the layout names.
    const read = parseInbound(inbound(AID.enter, addressOf(0, 22) + 1, 'SR-1001 '), SCREEN);

    expect(read.aid).toBe(AID.enter);
    expect(read.fields.get('requestNumber')).toBe('SR-1001');
  });

  it('reads a key pressed with nothing typed', () => {
    // PF3 arrives as an AID and a cursor and no field groups at all, which is
    // not an error and must not read as one.
    const read = parseInbound(Uint8Array.from([AID.pf3, 0x40, 0x40]), SCREEN);

    expect(read.aid).toBe(AID.pf3);
    expect(read.fields.size).toBe(0);
  });

  it('ignores a field at an address this screen does not have', () => {
    expect(parseInbound(inbound(AID.enter, 1234, 'X'), SCREEN).fields.size).toBe(0);
  });
});
