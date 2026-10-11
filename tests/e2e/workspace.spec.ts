import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: false } }),
  );
});
test('complete hardware exploration and local project workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/circuitforge-1440-assembly.png' });
  const canvas = page.locator('canvas');
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 + 60, b.y + b.height * 0.5 + 20, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + b.width * 0.6 + 85, b.y + b.height * 0.5 + 20, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.getByRole('button', { name: /Microcontroller U1/ }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Microcontroller', exact: true })).toBeVisible();
  await page.locator('.inspector-advanced').evaluate((node) => node.setAttribute('open', ''));
  await expect(page.getByLabel('position X', { exact: true })).toHaveValue('-1.25');
  await page.waitForTimeout(900);
  await canvas.dispatchEvent('keydown', { key: 'Escape', bubbles: true });
  await expect(page.getByRole('heading', { name: 'Meet your design.' })).toBeVisible();
  await canvas.click({ position: { x: b.width / 2, y: b.height / 2 } });
  await expect(page.getByRole('heading', { name: 'Microcontroller', exact: true })).toBeVisible();
  await page.getByLabel('position X', { exact: true }).fill('-1.5');
  await page.getByRole('button', { name: 'Undo (⌘/Ctrl Z)' }).click();
  await expect(page.getByLabel('position X', { exact: true })).toHaveValue('-1.25');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Microcontroller' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByLabel('Component visibility', { exact: true })).not.toBeChecked();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Show Microcontroller' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Workspace', exact: true }).click();
  for (const mode of ['Exploded', 'X-Ray', 'Connections', 'Assembly']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/circuitforge-${mode.toLowerCase()}.png` });
  }
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByLabel('position X', { exact: true })).toHaveValue('-1.25');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'AI Guide', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Ask Demo Assistant' })
    .fill('Highlight the temperature sensor');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.getByText(/Temperature Sensor selected and focused/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Temperature Sensor', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByLabel('Project file actions', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project JSON' }).click();
  const download = await downloaded;
  const json = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(json.components).toHaveLength(14);
  expect(json.schemaVersion).toBe(1);
  await page.reload();
  await page.getByLabel('Project file actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Load local save' }).click();
  await expect(page.getByText('Local project loaded.')).toBeVisible();
  await page.getByLabel('Import project file', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByText(/Use a CircuitForge Smart Cooling Controller project/)).toBeVisible();
  await page.getByLabel('Import project file', { exact: true }).setInputFiles({
    name: 'valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByText('Project imported.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('responsive workspace, preferences, keyboard, and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Display preferences' }).click();
  await page.getByLabel('Rendering quality', { exact: true }).selectOption('low');
  await expect(page.getByRole('checkbox', { name: /Reduced motion/ })).toBeChecked();

  await page.locator('.viewport canvas').dispatchEvent('keydown', { key: 'g', bubbles: true });
  await expect(page.getByRole('button', { name: 'Toggle grid (G)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.locator('.viewport canvas').dispatchEvent('keydown', { key: 'g', bubbles: true });
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  await page.getByRole('button', { name: 'Isometric view', exact: true }).click();
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bounds = (await page.locator('.viewport canvas').boundingBox())!;
    expect(bounds.width).toBeGreaterThan(300);
    expect(bounds.height).toBeGreaterThan(220);
    await page.screenshot({ path: `test-results/circuitforge-${width}.png` });
  }
});
