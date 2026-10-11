import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: false } }),
  );
});
test('firmware edits, artifacts, resizing, and the live 3D workspace coexist', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((node) => node.setAttribute('data-original-canvas', 'true'));
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('#firmware-view-c .monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Edit C', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'C source editor', exact: true });
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n// browser draft: f g l v o h\n');
  await expect(page.getByText('Outdated build', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Toggle grid (G)"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('// browser draft:');
  let downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download firmware file' }).click();
  let file = await downloadPromise;
  expect(file.suggestedFilename()).toBe('cooling.c');
  expect(await readFile((await file.path())!, 'utf8')).toContain('// browser draft:');
  await page.getByRole('tab', { name: 'Assembly', exact: true }).click();
  await expect(page.locator('#firmware-view-assembly .monaco-editor')).toBeVisible();
  await page.getByRole('tab', { name: 'Machine Code' }).click();
  await expect(page.getByText('00 68 70 47 01 60 70 47', { exact: true })).toBeVisible();
  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download firmware file' }).click();
  file = await downloadPromise;
  expect(await readFile((await file.path())!, 'utf8')).toContain('00000010  64 22 0A 60 70 47');
  const handle = page.getByRole('separator', { name: 'Resize tools panel' });
  const original = Number(await handle.getAttribute('aria-valuenow'));
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 75, bounds.y + 100, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(original);
  expect((await canvas.boundingBox())!.height).toBeGreaterThanOrEqual(179);
  await page.getByRole('button', { name: 'Expand editor' }).click();
  await expect(page.locator('#firmware-view-machine')).toBeVisible();
  await page.getByRole('button', { name: 'Restore editor size' }).click();
  await page.getByRole('button', { name: 'Collapse tools panel' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Machine Code' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // All scene modes and camera controls stay live while code remains mounted.
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Workspace', exact: true }).click();
  for (const mode of ['Exploded', 'X-Ray', 'Connections', 'Assembly']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Microcontroller U1/ }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Microcontroller', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Orbit (O)' }).click();
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 + 40, b.y + b.height * 0.65 + 10, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -80);
  await page.getByRole('button', { name: 'Pan (H)' }).click();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 + 30, b.y + b.height * 0.65, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Fit to Model' }).click();
  await expect(canvas).toHaveAttribute('data-original-canvas', 'true');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await page.screenshot({ path: 'test-results/nexora-firmware-machine.png' });
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Machine Code' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Outdated build', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'C', exact: true }).click();
  await expect(page.locator('#firmware-view-c .monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Copy code' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('// browser draft:');
  await page.screenshot({ path: 'test-results/nexora-firmware-c.png' });
  expect(errors).toEqual([]);
});

test('firmware assistant, component association, and responsive panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'AI Guide', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Ask Demo Assistant' })
    .fill('Show microcontroller firmware.');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.getByRole('tab', { name: 'C', exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Temperature Sensor U3/ }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByText(/The sensor does not execute firmware/)).toBeVisible();
  await page.getByRole('button', { name: 'Go to sensor_read_celsius ↗' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Resistor R1 R1/ }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByText('No firmware associated with this component.')).toBeVisible();
  await page.getByRole('button', { name: 'View project firmware' }).click();
  for (const [width, height] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Firmware Explorer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('#firmware-view-c .monaco-editor')).toBeVisible();
    expect((await page.locator('canvas').boundingBox())!.height).toBeGreaterThanOrEqual(179);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/nexora-firmware-${width}.png` });
  }
});

test('failed editor chunk keeps C recoverable', async ({ page }) => {
  await page.route('**/src/firmware/monaco.ts*', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByText(/Advanced editor unavailable/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit C', exact: true }).click();
  await page.getByRole('textbox', { name: 'C source fallback editor' }).fill('int recoverable;');
  await expect(page.getByText('Outdated build', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});
