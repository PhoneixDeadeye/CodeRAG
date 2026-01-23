import { test, expect } from '@playwright/test';

test.describe('Diff Analysis API', () => {
    test('should analyze diff correctly', async ({ request }) => {
        const response = await request.post('/api/v1/diff/analyze', {
            data: {
                file_path: 'test.py',
                old_content: 'def hello():\n    print("Hello")',
                new_content: 'def hello():\n    print("Hello World")'
            }
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();

        expect(data.file_path).toBe('test.py');
        expect(data.hunks).toBeDefined();
        expect(data.additions).toBe(1); // One line changed (del + add)
        expect(data.deletions).toBe(1);
        expect(data.summary).toBeDefined();
    });
});
