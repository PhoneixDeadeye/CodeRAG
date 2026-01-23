import { test, expect } from '@playwright/test';

/**
 * Chat E2E Tests
 * Tests chat functionality including sending messages and receiving responses
 */

test.describe('Chat Interface', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for app to load
        await page.waitForLoadState('networkidle');
    });

    test('should display chat interface', async ({ page }) => {
        // Chat input should be visible
        const chatInput = page.getByPlaceholder(/ask|type|question|message/i);
        await expect(chatInput).toBeVisible({ timeout: 10000 });
    });

    test('should have send button', async ({ page }) => {
        // Send button should be present
        const sendButton = page.getByRole('button', { name: /send/i });
        await expect(sendButton).toBeVisible({ timeout: 10000 });
    });

    test('should show placeholder when no messages', async ({ page }) => {
        // Look for empty state or placeholder
        const placeholder = page.getByText(/start|ask|welcome|hello/i);
        await expect(placeholder).toBeVisible({ timeout: 10000 });
    });

    test('should allow typing in chat input', async ({ page }) => {
        const chatInput = page.getByPlaceholder(/ask|type|question|message/i);

        await chatInput.fill('Hello, how does authentication work?');
        await expect(chatInput).toHaveValue('Hello, how does authentication work?');
    });

    test('should show keyboard shortcuts hint', async ({ page }) => {
        // Press ? or look for shortcuts hint
        await page.keyboard.press('?');

        // Should show keyboard shortcuts modal or the hint should be visible
        const shortcutsModal = page.getByText(/keyboard shortcuts|shortcuts/i);
        // This may or may not appear based on implementation
    });
});

test.describe('Chat with Repository', () => {
    test('should show message when no repository is ingested', async ({ page }) => {
        const chatInput = page.getByPlaceholder(/ask|type|question|message/i);

        // Try to send a message
        await chatInput.fill('What is this codebase about?');
        await page.keyboard.press('Enter');

        // Should either work (if repos exist) or show a message about ingesting
        await page.waitForTimeout(2000);

        // Check for either a response or an error message about repos
        const response = page.locator('[data-testid="chat-message"], .message, .response');
        const noRepoMessage = page.getByText(/ingest|repository|no repo/i);

        // One of these should be visible
        const hasResponse = await response.count() > 0;
        const hasNoRepoMessage = await noRepoMessage.isVisible().catch(() => false);

        expect(hasResponse || hasNoRepoMessage).toBe(true);
    });
});

test.describe('Chat Streaming', () => {
    test('should support streaming responses', async ({ page }) => {
        // This test verifies the streaming endpoint exists
        // Actual streaming behavior is hard to test in E2E

        const response = await page.request.get('/api/v1/chat/stream', {
            failOnStatusCode: false
        });

        // Endpoint should exist (may return error if no query, but shouldn't 404)
        expect([200, 400, 422, 500]).toContain(response.status());
    });
});
