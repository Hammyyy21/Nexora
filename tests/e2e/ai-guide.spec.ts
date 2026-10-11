import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`AI Guide opens and preserves the workspace at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/health', (route) =>
      route.fulfill({
        json: { status: 'ok', ai_configured: true },
      }),
    );
    await page.goto('/');
    await expect(page.getByText('Assembling your workspace…')).toBeHidden();
    const canvas = page.locator('.viewport canvas');
    await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
    const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
    await nav.getByRole('button', { name: 'AI Guide' }).click();
    const chat = page.getByRole('region', { name: 'Assistant conversation' });
    await expect(chat).toBeVisible();
    await expect(page.getByLabel('Ask AI Guide')).toBeFocused();
    await page.getByLabel('Ask AI Guide').fill('Unsent question');
    for (const name of ['Components', 'Code', 'Design']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await expect(page.getByLabel('Ask AI Guide')).toHaveCount(1);
      await expect(page.getByLabel('Ask AI Guide')).toHaveValue('Unsent question');
      await expect(page.locator('#assistant-conversation')).toHaveCount(1);
      await expect(canvas).toHaveAttribute('data-retained', 'true');
    }
    // Exercise the cleanup paths that used to destroy nested label roots.
    await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle labels (L)' }).click();
    await page.getByRole('button', { name: 'Toggle labels (L)' }).click();
    await nav.getByRole('button', { name: 'AI Guide' }).click();
    await page.screenshot({ path: `test-results/ai-guide-${width}.png` });
    expect(errors).toEqual([]);
  });
}
