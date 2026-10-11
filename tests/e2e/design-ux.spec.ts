import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: false } }),
  );
});
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [390, 844],
]) {
  test(`focused tool dock at ${width}x${height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByText('Assembling your workspace…')).toBeHidden();
    const canvas = page.locator('.viewport canvas');
    await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
    const tab = (name: string) => name === 'Explorer' || name === 'Workspace' || name === 'Inspector' || name === 'Code' || name === 'AI'
      ? page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: name === 'Explorer' ? 'Design' : name === 'AI' ? 'AI Guide' : name, exact: true })
      : page.getByRole('tab', { name, exact: true });
    const initial = (await canvas.boundingBox())!;
    await page.getByRole('button', { name: 'Focus Mode' }).click();
    await expect(page.locator('.viewport-title')).toBeHidden();
    await page.getByRole('button', { name: /Microcontroller U1/ }).click();
    await tab('Inspector').click();
    await expect(page.getByRole('heading', { name: 'Microcontroller', exact: true })).toBeVisible();
    await tab('Electrical').click();
    await expect(
      page.getByText('No verified electrical specifications are available for this component.'),
    ).toBeVisible();
    await tab('Connections').click();
    await expect(page.getByText('ILLUSTRATIVE DEMO PATHS')).toBeVisible();
    for (const name of ['Explorer', 'Workspace', 'Inspector', 'Code', 'AI']) {
      await tab(name).click();
      await expect(page.locator('.tool-content:visible')).toHaveCount(1);
      await expect(page.locator(`#design-panel-${name === 'Explorer' ? 'explorer' : name === 'AI' ? 'ai' : name.toLowerCase()}`)).toBeVisible();
      await expect(canvas).toHaveAttribute('data-retained', 'true');
      expect((await canvas.boundingBox())!.height).toBe(initial.height);
    }
    await page.getByLabel('Ask Demo Assistant').fill('Unsent panel draft');
    await tab('Code').click();
    await page.getByRole('button', { name: 'Edit C', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'C source editor', exact: true })
      .press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// retained by right panel\n');
    await tab('Assembly').click();
    await tab('AI').click();
    await expect(page.getByLabel('Ask Demo Assistant')).toHaveValue('Unsent panel draft');
    await tab('Code').click();
    await expect(tab('Assembly')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Expand editor' }).click();
    await page.getByRole('button', { name: 'Restore editor size' }).click();
    if (width > 900) {
      const handle = page.getByRole('separator', { name: 'Resize tools panel' });
      const before = Number(await handle.getAttribute('aria-valuenow'));
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x - 65, box.y + 100, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
        .toBeGreaterThan(before);
      expect((await canvas.boundingBox())!.width).toBeLessThan(initial.width);
    } else {
      expect((await canvas.boundingBox())!.width).toBe(width);
      await expect(page.getByRole('button', { name: 'Close tools drawer' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Collapse tools panel' }).click();
    await expect(page.locator('.tools-panel')).toBeHidden();
    expect((await canvas.boundingBox())!.width).toBe(width);
    // Real orbit, zoom and pan gestures stay on the canvas, separate from the dock.
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -80);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect(tab('Code')).toHaveAttribute('aria-current', 'page');
    await expect(canvas).toHaveAttribute('data-retained', 'true');
    await page.reload();
    await expect(page.locator('.tools-panel')).toBeHidden();
    await tab('Code').click();
    await expect(tab('Assembly')).toHaveAttribute('aria-selected', 'true');
    await tab('C').click();
    await expect(page.locator('#firmware-view-c .monaco-editor')).toContainText(
      'retained by right panel',
    );
    await expect(page.getByText('Outdated build', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/focused-workspace-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('drawer placement and board changes stay connected to the same scene', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.viewport canvas');
  await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
  await page.getByRole('button', { name: '+ Add Component' }).click();
  const drawer = page.getByRole('dialog', { name: 'Add Component' });
  await drawer.getByLabel('Search drawer components').fill('TMP102');
  await drawer.getByRole('button', { name: 'Add to Design' }).click();
  await page.getByRole('button', { name: 'Confirm visual placement' }).click();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'TMP102 temperature sensor', exact: true }),
  ).toBeVisible();
  await page.getByRole('navigation', { name: 'Main workspace navigation' }).getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Choose Board', exact: true }).click();
  await page.getByRole('button', { name: 'Use Blank 92 × 64 mm PCB' }).click();
  await expect(canvas).toHaveAttribute('data-retained', 'true');
});
