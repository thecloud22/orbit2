/**
 * The practice copy of a service desk, as a green screen.
 *
 * Exported so a test can start one in its own process rather than shelling out:
 * it is a TCP server and a few pure functions, with no build step and nothing to
 * wait for beyond `listen`.
 */
export { startTerminalPortal, DEFAULT_PORT, type TerminalPortal } from './host';
export {
  findServiceRequest,
  SERVICE_REQUESTS,
  NOT_FOUND_MESSAGE,
  type ServiceRequest,
} from './screens';
