import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests target WebKit with iPhone profiles (the real iOS engine).
 * Set PW_BROWSER=chromium to run the same iPhone-emulated profiles on Chromium
 * (used in environments where the WebKit build is not installed).
 */
const browserName = (process.env.PW_BROWSER ?? 'webkit') as 'webkit' | 'chromium';
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
