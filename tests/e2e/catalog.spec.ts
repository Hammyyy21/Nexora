import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: false } }),
  );
});
test('catalog preview, confirmed placement, inspector, undo and local persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  await page
    .locator('.viewport canvas')
    .evaluate((node) => node.setAttribute('data-retained', 'true'));
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search components' }).fill('TMP102');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Details' }).click();
  const dialog = page.getByRole('dialog', { name: 'component details' });
  const preview = dialog.locator('canvas');
  await expect(preview).toBeVisible();
  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -80);
  await dialog.getByRole('button', { name: 'Reset / fit preview' }).click();
  await expect(dialog.getByText('Integration: Not Yet Verified')).toBeVisible();
  await page.screenshot({ path: 'test-results/circuitforge-component-details.png' });
  await dialog.getByRole('button', { name: 'Add to Design' }).click();
  await page.getByRole('spinbutton', { name: 'Placement position X' }).fill('7');
  await page.getByRole('button', { name: 'Reset placement' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Placement position X' })).toHaveValue('6');
  await page.getByRole('button', { name: 'Cancel placement' }).click();
  await expect(page.getByRole('region', { name: 'Component placement' })).toBeHidden();
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('button', { name: 'Add to Design' }).click();
  await page.getByRole('spinbutton', { name: 'Placement position X' }).fill('7');
  await page.getByRole('button', { name: 'Confirm visual placement' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'TMP102 temperature sensor', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo (⌘/Ctrl Z)' }).click();
  await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo (⌘/Ctrl Shift Z)' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await page.locator('.inspector-advanced').evaluate((node) => node.setAttribute('open', ''));
  await expect(page.getByLabel('position X', { exact: true })).toHaveValue('7');
  await expect(page.locator('.viewport canvas')).toHaveAttribute('data-retained', 'true');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.reload();
  await page.getByLabel('Project file actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Load local save' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await page.locator('.inspector-advanced').evaluate((node) => node.setAttribute('open', ''));
  await expect(page.getByLabel('position X', { exact: true })).toHaveValue('7');
  expect(errors).toEqual([]);
});

test('comparison, MCU replacement and preserved firmware source', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('#firmware-view-c .monaco-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Edit C', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'C source editor', exact: true })
    .press('ControlOrMeta+End');
  await page.keyboard.insertText('\n// Preserve my source during hardware replacement\n');
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Microcontroller U1/ }).click();
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('button', { name: 'Compare RP2040', exact: true }).click();
  await page.getByRole('button', { name: 'Compare ATmega328P', exact: true }).click();
  await page.getByRole('button', { name: 'Compare (2/3)' }).click();
  await expect(page.getByRole('dialog', { name: 'component comparison' })).toContainText(
    'Different processor architectures',
  );
  await page.getByRole('button', { name: 'Close component comparison' }).click();
  await page.getByRole('textbox', { name: 'Search components' }).fill('ATmega328P');
  await page.getByRole('button', { name: 'View Details' }).click();
  await expect(page.getByText('Integration: Incompatible')).toBeVisible();
  await page.getByRole('button', { name: 'Replace selected component' }).click();
  await page.getByRole('button', { name: 'Apply visual replacement' }).click();
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByText('Incompatible target', { exact: true })).toBeVisible();
  await expect(page.locator('#firmware-view-c .monaco-editor')).toContainText('Preserve my source');
  await page.getByRole('tab', { name: 'Machine Code' }).click();
  await expect(page.getByText('00 68 70 47 01 60 70 47', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/circuitforge-replacement-firmware.png' });
  expect(errors).toEqual([]);
});

test('catalog filters and responsive navigation', async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Components', exact: true }).click();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Filter manufacturer' }).selectOption('Microchip');
    await expect(page.getByRole('article')).toHaveCount(3);
    await page.getByRole('textbox', { name: 'Search components' }).fill('24LC256');
    await expect(page.getByRole('article')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'AI Guide', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Ask Demo Assistant' })).toBeInViewport();
    await page.screenshot({ path: `test-results/circuitforge-catalog-${width}.png` });
  }
});
