import { expect, test, type Page } from '@playwright/test';

// Read the existing dev renderer; no production debug hooks or extra React roots.
async function scenePoint(page: Page, offsetX = 0) {
  return page.evaluate(
    async ({ modulePath, offsetX }) => {
      const { _roots } = (await import(modulePath)) as typeof import('@react-three/fiber');
      const canvas = document.querySelector('.viewport canvas') as HTMLCanvasElement;
      const state = _roots.get(canvas)!.store.getState();
      const object = state.scene.getObjectByName('mcu')!;
      const world = object.getWorldPosition(object.position.clone());
      if (offsetX) {
        const camera = state.camera as import('three').PerspectiveCamera;
        const factor =
          (world.distanceTo(camera.position) * 1.9 * Math.tan((Math.PI * camera.fov) / 360) * 0.8) /
          7;
        world.x += offsetX * factor;
      }
      const point = world.project(state.camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
        position: object.position.toArray(),
        camera: state.camera.position.toArray(),
        orbitEnabled: (state.controls as unknown as { enabled: boolean }).enabled,
      };
    },
    { modulePath: '/node_modules/.vite/deps/@react-three_fiber.js', offsetX },
  );
}

test('selects in 3D, edits mm coordinates, drags without orbiting, undoes and retains transforms across tools and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.text().includes('unmount a root')) errors.push(m.text());
  });
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: false } }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  await page.getByRole('button', { name: /Microcontroller U1/ }).click();
  const panel = page.getByRole('region', { name: 'Position & Transform' });
  await expect(panel).toBeVisible();
  await page.locator('.viewport canvas').dispatchEvent('keydown', { key: 'Escape', bubbles: true });
  await expect(panel).toBeHidden();
  const component = await scenePoint(page);
  await page.mouse.click(component.x, component.y);
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Microcontroller')).toBeVisible();
  const input = page.getByLabel('X position (mm)', { exact: true });
  await input.fill('-17.5');
  await input.press('Enter');
  await expect.poll(async () => (await scenePoint(page)).position[0]).toBe(-1.75);
  await page.getByRole('button', { name: 'Drag Mode', exact: true }).click();
  const start = await scenePoint(page, 0.65);
  const end = await scenePoint(page, 1.8);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect.poll(async () => (await scenePoint(page)).orbitEnabled).toBe(false);
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(input).not.toHaveValue('-17.5');
  expect((await scenePoint(page)).camera).toEqual(start.camera);
  await page.mouse.up();
  await expect.poll(async () => (await scenePoint(page)).orbitEnabled).toBe(true);
  await page.getByRole('button', { name: 'Undo (⌘/Ctrl Z)' }).click();
  await expect(input).toHaveValue('-17.5');
  await expect.poll(async () => (await scenePoint(page)).position[0]).toBe(-1.75);
  await page.getByRole('button', { name: 'XYZ Mode', exact: true }).click();
  for (const name of ['AI', 'Code', 'Explorer', 'Inspector', 'Workspace']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(input).toHaveValue('-17.5');
  }
  for (const [mode, y] of [
    ['Exploded', 2.39],
    ['X-Ray', 0.29],
    ['Assembly', 0.29],
  ] as const) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect.poll(async () => (await scenePoint(page)).position[1]).toBeCloseTo(y);
    await expect(page.getByLabel('Y position (mm)', { exact: true })).toHaveValue('2.9');
  }
  await page.getByLabel('Placement constraints').selectOption('board');
  await input.fill('100');
  await input.press('Enter');
  await expect(page.getByText(/Keep the whole component inside/)).toBeVisible();
  expect((await scenePoint(page)).position[0]).toBe(-1.75);
  await input.press('Escape');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.reload();
  await page.getByLabel('Project file actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Load local save' }).click();
  await expect(input).toHaveValue('-17.5');
  await page.getByRole('button', { name: 'Collapse tools panel' }).click();
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const bounds = (await panel.boundingBox())!;
    const viewport = (await page.locator('.viewport').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(viewport.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width);
    expect(bounds.width).toBeLessThanOrEqual(275);
    await page.screenshot({ path: `test-results/position-transform-${width}.png` });
  }
  expect(errors).toEqual([]);
});
