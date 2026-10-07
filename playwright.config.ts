import { defineConfig } from '@playwright/test';
const port = process.env.PORT || '3000';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
