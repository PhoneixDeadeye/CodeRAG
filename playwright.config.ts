import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for CodeRAG E2E tests.
 * Run with: npx playwright test
 */
export default defineConfig({
    testDir: './e2e/tests',

    // Run tests in parallel
    fullyParallel: true,

    // Fail build on CI if test.only is left in code
    forbidOnly: !!process.env.CI,

    // Retry failed tests on CI
    retries: process.env.CI ? 2 : 0,

    // Limit parallel workers on CI
    workers: process.env.CI ? 1 : undefined,

    // Reporter config
    reporter: [
        ['html', { open: 'never' }],
        ['list']
    ],

    // Shared settings for all projects
    use: {
        // Base URL for tests
        baseURL: 'http://localhost:5173',

        // Collect trace on first retry
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure
        video: 'on-first-retry',
    },

    // Configure projects for major browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        // Mobile viewports
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],

    // Run local dev server before tests
    webServer: [
        {
            command: 'npm run dev',
            cwd: './frontend',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
        },
        {
            command: 'uvicorn api:app --host 0.0.0.0 --port 8000',
            url: 'http://localhost:8000/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
        },
    ],
});
