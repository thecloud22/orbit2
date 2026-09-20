import { createServer, type Server, type Socket } from 'node:net';

import { AID, encodeScreen, parseInbound, type ScreenDefinition } from './datastream';
import { advance, lookupScreen, render, type SessionScreen } from './screens';

/**
 * A TN3270 host, in the narrow slice this portal needs to be automatable.
 *
 * Telnet negotiation, then a stream of 3270 records. Only the three options a
 * 3270 session actually requires are accepted -- terminal type, end-of-record
 * and binary -- and anything else a client offers is declined. TN3270E is
 * deliberately not offered: it adds a session header and an LU name, neither of
 * which this portal has any use for, and a host that half-implements it is worse
 * than one that does not claim it.
 *
 * One connection is one session. There is no shared state of any kind between
 * them, so two sessions cannot see each other and a test does not have to reset
 * anything between cases.
 */

const IAC = 0xff;
const SE = 0xf0;
const EOR = 0xef;
const SB = 0xfa;
const WILL = 0xfb;
const WONT = 0xfc;
const DO = 0xfd;
const DONT = 0xfe;

const OPT_BINARY = 0x00;
const OPT_TERMINAL_TYPE = 0x18;
const OPT_EOR = 0x19;

const SUPPORTED_OPTIONS = new Set([OPT_BINARY, OPT_TERMINAL_TYPE, OPT_EOR]);

const TERMINAL_TYPE_SEND = 1;
const TERMINAL_TYPE_IS = 0;

/** The default port. 3270 is the protocol's own number and nothing else uses it here. */
export const DEFAULT_PORT = 3270;

export interface TerminalPortal {
  readonly port: number;
  close(): Promise<void>;
}

export interface PortalOptions {
  readonly port?: number;
  readonly host?: string;
  /** Diagnostics. Silent by default so a test suite stays readable. */
  readonly log?: (message: string) => void;
}

/** Doubles every 0xFF, which is how a data byte of 0xFF travels under telnet. */
function escape(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];

  for (const byte of bytes) {
    out.push(byte);
    if (byte === IAC) {
      out.push(IAC);
    }
  }

  return Uint8Array.from(out);
}

function keyOf(aid: number): 'enter' | 'pf3' | 'other' {
  if (aid === AID.enter) {
    return 'enter';
  }

  return aid === AID.pf3 ? 'pf3' : 'other';
}

/**
 * One client, from negotiation to hang-up.
 *
 * The parser is a single pass over everything that arrives: telnet commands are
 * acted on where they appear, and everything else accumulates into the current
 * record until `IAC EOR` closes it. Splitting the two would mean buffering a
 * command that arrived mid-record, which is exactly the case that breaks hosts.
 */
function serve(socket: Socket, log: (message: string) => void): void {
  let showing: SessionScreen = { kind: 'lookup' };
  let sent: ScreenDefinition = lookupScreen();
  let record: number[] = [];

  const send = (bytes: readonly number[]): void => {
    socket.write(Buffer.from(bytes));
  };

  const sendScreen = (): void => {
    sent = render(showing);
    send([...escape(encodeScreen(sent)), IAC, EOR]);
    log(`sent ${sent.name}`);
  };

  const handleCommand = (command: number, option: number): void => {
    if (command === DO) {
      send([IAC, SUPPORTED_OPTIONS.has(option) ? WILL : WONT, option]);
      return;
    }

    if (command === WILL) {
      send([IAC, SUPPORTED_OPTIONS.has(option) ? DO : DONT, option]);

      // The terminal has agreed to tell us what it is. Asking now, rather than
      // at connect, is what keeps this a response to the client rather than an
      // assumption about it.
      if (option === OPT_TERMINAL_TYPE) {
        send([IAC, SB, OPT_TERMINAL_TYPE, TERMINAL_TYPE_SEND, IAC, SE]);
      }
    }
  };

  const handleSubnegotiation = (bytes: readonly number[]): void => {
    if (bytes[0] !== OPT_TERMINAL_TYPE || bytes[1] !== TERMINAL_TYPE_IS) {
      return;
    }

    log(`terminal type ${String.fromCharCode(...bytes.slice(2))}`);

    // Binary in both directions is what turns the connection from a telnet
    // session into a 3270 one; the first screen goes out once it is agreed.
    send([IAC, DO, OPT_EOR, IAC, WILL, OPT_EOR, IAC, DO, OPT_BINARY, IAC, WILL, OPT_BINARY]);
    sendScreen();
  };

  const handleRecord = (bytes: readonly number[]): void => {
    const read = parseInbound(Uint8Array.from(bytes), sent);
    const key = keyOf(read.aid);
    const next = advance(showing, key, read.fields);

    log(`received ${key} -> ${next.kind}`);
    showing = next;
    sendScreen();
  };

  /**
   * Where the byte stream is, between telnet's four shapes.
   *
   * A state machine rather than look-ahead, because a command can be split
   * across two packets: `IAC` may be the last byte of one chunk and `DO` the
   * first byte of the next, and a parser that peeked would treat that as data.
   */
  type ParseState =
    | { readonly at: 'data' }
    | { readonly at: 'command' }
    | { readonly at: 'option'; readonly command: number }
    | { readonly at: 'subnegotiation'; readonly bytes: readonly number[] }
    | { readonly at: 'subnegotiation_iac'; readonly bytes: readonly number[] };

  let state: ParseState = { at: 'data' };

  socket.on('data', (chunk: Buffer) => {
    for (const byte of chunk) {
      switch (state.at) {
        case 'data':
          if (byte === IAC) {
            state = { at: 'command' };
          } else {
            record.push(byte);
          }
          break;

        case 'command':
          if (byte === IAC) {
            // A doubled IAC is one data byte of 0xFF.
            record.push(IAC);
            state = { at: 'data' };
          } else if (byte === EOR) {
            handleRecord(record);
            record = [];
            state = { at: 'data' };
          } else if (byte === SB) {
            state = { at: 'subnegotiation', bytes: [] };
          } else if (byte === DO || byte === DONT || byte === WILL || byte === WONT) {
            state = { at: 'option', command: byte };
          } else {
            state = { at: 'data' };
          }
          break;

        case 'option':
          handleCommand(state.command, byte);
          state = { at: 'data' };
          break;

        case 'subnegotiation':
          state =
            byte === IAC
              ? { at: 'subnegotiation_iac', bytes: state.bytes }
              : { at: 'subnegotiation', bytes: [...state.bytes, byte] };
          break;

        case 'subnegotiation_iac':
          if (byte === SE) {
            handleSubnegotiation(state.bytes);
            state = { at: 'data' };
          } else {
            // An IAC inside a subnegotiation that is not the end of it is an
            // escaped 0xFF, the same as it is in data.
            state = { at: 'subnegotiation', bytes: [...state.bytes, byte] };
          }
          break;
      }
    }
  });

  socket.on('error', (error: Error) => {
    log(`client ended: ${error.message}`);
  });
}

export function startTerminalPortal(options: PortalOptions = {}): Promise<TerminalPortal> {
  const log = options.log ?? ((): void => {});
  const server: Server = createServer((socket) => {
    socket.setNoDelay(true);
    log('client connected');
    // Asking for the terminal type is how a 3270 negotiation starts, and the
    // host is the one that asks.
    socket.write(Buffer.from([IAC, DO, OPT_TERMINAL_TYPE]));
    serve(socket, log);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? DEFAULT_PORT, options.host ?? '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : DEFAULT_PORT;

      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}
