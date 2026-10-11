import { expect, test } from '@playwright/test';

for (const width of [1440, 768, 390]) {
  test(`board comparison and accessible Fit to Model at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok', ai_configured: false } }),
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const dashboard = page.getByRole('dialog', { name: 'Nexora projects' });
    if (await dashboard.isVisible())
      await page.getByRole('button', { name: 'Close projects' }).click();
    await expect(page.getByText('Assembling your workspace…')).toBeHidden();
    const canvas = page.locator('.viewport canvas');
    await expect(canvas).toBeVisible();
    await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
    const fit = page.getByRole('button', { name: 'Fit to Model', exact: true });
    await expect(fit).toBeVisible();
    await fit.click(); // Also reachable while the compact tools drawer is open.
    const rect = (await fit.boundingBox())!;
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    const toolbar = (await page.locator('.design-shell > .mode-bar').boundingBox())!;
    const viewport = (await canvas.boundingBox())!;
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(viewport.y + 1);
    await page.getByRole('button', { name: 'Focus Mode' }).click();
    await fit.click();
    await expect(page.locator('.viewport-title')).toBeHidden();
    await page.getByRole('button', { name: 'Choose Board' }).click();
    const drawer = page.getByRole('dialog', { name: 'Choose Board' });
    await drawer.getByLabel('Board 2', { exact: true }).selectOption('uno-r3');
    await expect(drawer.getByRole('table')).toContainText('68.6 mm');
    await drawer.getByText('Board Specifications · Raspberry Pi Pico', { exact: true }).click();
    const pico = drawer.getByRole('region', {
      name: 'Board Specifications: Raspberry Pi Pico',
      exact: true,
    });
    await expect(pico.getByText('51 mm', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/board-specifications-${width}.png` });
    await drawer.getByRole('button', { name: 'Use Blank 92 × 64 mm PCB' }).click();
    await page
      .getByRole('navigation', { name: 'Main workspace navigation' })
      .getByRole('button', { name: 'Inspector', exact: true })
      .click();
    await page.getByText('Configure blank PCB', { exact: true }).click();
    await page.getByLabel('Length (mm)', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Apply board configuration' }).click();
    await expect(page.locator('.inspector').getByText('120 mm', { exact: true })).toBeVisible();
    await fit.click();
    await page.getByRole('button', { name: 'Collapse tools panel', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-retained', 'true');
    await expect(fit).toBeVisible();
    await page.locator('.viewport').focus();
    await page.keyboard.press('f');
    await page.screenshot({ path: `test-results/fit-to-model-${width}.png` });
    expect(errors).toEqual([]);
  });
}
