import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests login, registration, and logout flows
 */

test.describe('Authentication', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should display login modal when clicking sign in', async ({ page }) => {
        // Look for sign in button
        const signInButton = page.getByRole('button', { name: /sign in/i });

        if (await signInButton.isVisible()) {
            await signInButton.click();

            // Verify modal appears
            await expect(page.getByRole('dialog')).toBeVisible();
            await expect(page.getByPlaceholder(/email/i)).toBeVisible();
            await expect(page.getByPlaceholder(/password/i)).toBeVisible();
        }
    });

    test('should show error for invalid credentials', async ({ page }) => {
        const signInButton = page.getByRole('button', { name: /sign in/i });

        if (await signInButton.isVisible()) {
            await signInButton.click();

            // Fill invalid credentials
            await page.getByPlaceholder(/email/i).fill('invalid@example.com');
            await page.getByPlaceholder(/password/i).fill('wrongpassword');

            // Submit
            await page.getByRole('button', { name: /log in|sign in/i }).click();

            // Should show error
            await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
        }
    });

    test('should allow guest access without login', async ({ page }) => {
        // App should load and allow interaction as guest
        await expect(page.locator('body')).toBeVisible();

        // Chat interface should be accessible
        const chatInput = page.getByPlaceholder(/ask|type|question/i);
        await expect(chatInput).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Registration', () => {
    test('should show registration form', async ({ page }) => {
        await page.goto('/');

        // Look for register/sign up link
        const registerLink = page.getByRole('link', { name: /register|sign up|create account/i });

        if (await registerLink.isVisible()) {
            await registerLink.click();

            // Should show registration form
            await expect(page.getByPlaceholder(/email/i)).toBeVisible();
            await expect(page.getByPlaceholder(/password/i)).toBeVisible();
        }
    });
});
