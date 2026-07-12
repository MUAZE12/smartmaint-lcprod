import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test config for SmartMaint - L.C PROD.
 *
 * Runs against a Next.js dev server on http://localhost:3000. `webServer`
 * boots it before the tests and tears it down after — no manual step
 * needed. CI needs SUPABASE env vars in the workflow secrets.
 */
export default defineConfig({
    testDir: './e2e',
    // 90s per test — the first `page.goto('/')` triggers on-demand webpack
    // compilation which can take 15-60s on a cold dev server. Subsequent
    // navigations are fast, but Playwright bills the whole test.
    timeout: 90_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,       // Auth tests share the same demo tenant
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        locale: 'fr-FR',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        // 5 min — webpack compiles ~55k lines on the first request, and
        // Playwright waits for the URL to respond, not for "Ready" to print.
        timeout: 300_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
