import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/uat-evidence',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: '/usr/bin/chromium' } } }],
})
