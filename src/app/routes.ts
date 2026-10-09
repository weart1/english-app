import { lazy } from 'react';

/**
 * Route chunk loaders. Shared by the router (React.lazy) and by the boot code,
 * which starts downloading the chunk for the opened URL before React renders
 * (saves a round trip on deep links / reloads).
 */
export const loaders = {
  library: () => import('@/screens/Library'),
  word: () => import('@/screens/WordDetail'),
  train: () => import('@/screens/SessionBuilder'),
  stats: () => import('@/screens/Stats'),
  settings: () => import('@/screens/Settings'),
  import: () => import('@/screens/Import'),
  install: () => import('@/screens/InstallGuide'),
  session: () => import('@/screens/Session'),
  summary: () => import('@/screens/SessionSummary'),
  catalog: () => import('@/screens/Catalog'),
} as const;

export const Screens = {
  Library: lazy(loaders.library),
  WordDetail: lazy(loaders.word),
  SessionBuilder: lazy(loaders.train),
  Stats: lazy(loaders.stats),
  Settings: lazy(loaders.settings),
  Import: lazy(loaders.import),
  InstallGuide: lazy(loaders.install),
  Session: lazy(loaders.session),
  SessionSummary: lazy(loaders.summary),
  Catalog: lazy(loaders.catalog),
};

/** Kick off the chunk download for the current path (fire-and-forget). */
export function preloadForPath(pathname: string): void {
  const seg = pathname.split('/')[1] ?? '';
  const key =
    seg === 'session' ? (pathname.includes('summary') ? 'summary' : 'session') : (seg as keyof typeof loaders);
  const load = loaders[key as keyof typeof loaders];
  if (load) void load().catch(() => undefined);
}
