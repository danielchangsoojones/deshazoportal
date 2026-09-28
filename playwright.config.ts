import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.SMOKE_TEST_BASE_URL || 'http://127.0.0.1:5173'
const useLocalDevServer = !process.env.SMOKE_TEST_BASE_URL

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          chromiumSandbox: false,
        },
      },
    },
  ],
  webServer: useLocalDevServer
    ? {
        command: 'npm run dev -- --host 127.0.0.1',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
})
