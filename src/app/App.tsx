import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { Background } from '@/components/Background';

const Today = lazy(() => import('@/screens/Today'));
const Library = lazy(() => import('@/screens/Library'));
const SessionBuilder = lazy(() => import('@/screens/SessionBuilder'));
const Stats = lazy(() => import('@/screens/Stats'));
const WordDetail = lazy(() => import('@/screens/WordDetail'));
const Session = lazy(() => import('@/screens/Session'));
const SessionSummary = lazy(() => import('@/screens/SessionSummary'));

export function App() {
  return (
    <ErrorBoundary level="root">
      <Background />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Today />} />
            <Route path="library" element={<Library />} />
            <Route path="word/:id" element={<WordDetail />} />
            <Route path="train" element={<SessionBuilder />} />
            <Route path="stats" element={<Stats />} />
            <Route path="session" element={<Session />} />
            <Route path="session/summary" element={<SessionSummary />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
