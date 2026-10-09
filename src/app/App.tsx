import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { Background } from '@/components/Background';
import { DbGate } from './DbGate';
import { Screens } from './routes';
// The start screen is bundled eagerly: it saves a network round trip on first load.
import Today from '@/screens/Today';

export function App() {
  return (
    <ErrorBoundary level="root">
      <Background />
      <DbGate>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Today />} />
              <Route path="library" element={<Screens.Library />} />
              <Route path="word/:id" element={<Screens.WordDetail />} />
              <Route path="train" element={<Screens.SessionBuilder />} />
              <Route path="stats" element={<Screens.Stats />} />
              <Route path="settings" element={<Screens.Settings />} />
              <Route path="import" element={<Screens.Import />} />
              <Route path="catalog" element={<Screens.Catalog />} />
              <Route path="install" element={<Screens.InstallGuide />} />
              <Route path="session" element={<Screens.Session />} />
              <Route path="session/summary" element={<Screens.SessionSummary />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DbGate>
    </ErrorBoundary>
  );
}
