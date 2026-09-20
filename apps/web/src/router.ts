/**
 * Where you are, in the URL.
 *
 * Not a library: the product has a dozen screens and one of them is a run
 * somebody will paste into a ticket. What a router has to do here is keep the
 * address honest, so a link to a run is a link to that run.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { at: 'home' }
  | { at: 'agents' }
  | { at: 'agent'; id: string }
  | { at: 'bringIn' }
  | { at: 'runs' }
  | { at: 'run'; reference: string }
  | { at: 'start'; version: string }
  | { at: 'admin' }
  | { at: 'audit' }
  | { at: 'help' };

export function parse(path: string): Route {
  const [, first, second] = path.replace(/\/+$/, '').split('/');
  switch (first) {
    case '': case undefined: return { at: 'home' };
    case 'agents': return second ? { at: 'agent', id: second } : { at: 'agents' };
    case 'bring-in': return { at: 'bringIn' };
    case 'runs': return second ? { at: 'run', reference: second } : { at: 'runs' };
    case 'start': return second ? { at: 'start', version: second } : { at: 'agents' };
    case 'admin': return { at: 'admin' };
    case 'audit': return { at: 'audit' };
    case 'help': return { at: 'help' };
    default: return { at: 'home' };
  }
}

export function href(route: Route): string {
  switch (route.at) {
    case 'home': return '/';
    case 'agents': return '/agents';
    case 'agent': return `/agents/${route.id}`;
    case 'bringIn': return '/bring-in';
    case 'runs': return '/runs';
    case 'run': return `/runs/${route.reference}`;
    case 'start': return `/start/${route.version}`;
    case 'admin': return '/admin';
    case 'audit': return '/audit';
    case 'help': return '/help';
  }
}

export function useRoute(): [Route, (to: Route) => void] {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (to: Route) => {
    const next = href(to);
    window.history.pushState(null, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  };
  return [parse(path), go];
}

/** A link that is a real link — right-clickable, openable in a tab — and still
 *  navigates without a reload. A button pretending to be a link is neither. */
export function useLinkProps(to: Route, go: (to: Route) => void) {
  return {
    href: href(to),
    onClick: (event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      go(to);
    },
  };
}
