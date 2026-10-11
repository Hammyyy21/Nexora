import { expect, test } from '@playwright/test';

test('connected demo, smart placement, AI approval and source survive reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: true } }),
  );
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      json: {
        mode: 'ai',
        request_id: 'mvp-mock',
        answer: 'Sensor ready to add. Review the proposed placement.',
        actions: [{ type: 'add_component', catalog_id: 'tmp102' }],
        references: [],
        notice: 'Review before applying',
        missing_data: [],
        unverified_recommendations: [],
        cited_catalog_ids: [],
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const projects = page.getByRole('dialog', { name: 'Nexora projects' });
  if (!(await projects.isVisible()))
    await page.getByRole('button', { name: 'Open projects' }).click();
  await projects.getByText('Open a connected demonstration project').click();
  await projects.getByRole('button', { name: 'Open demo: IoT Environmental Monitor' }).click();
  await expect(projects).toBeHidden();
  const canvas = page.locator('.viewport canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Fit to Model', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Board', exact: true }).click();
  await page.getByRole('button', { name: 'Use Large prototype PCB', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  await page.getByLabel('Ask AI Guide').fill('Add a temperature sensor.');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  const proposal = page.getByRole('region', { name: 'AI design proposal' });
  await expect(proposal).toBeVisible();
  await proposal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Ask AI Guide').fill('Add a temperature sensor.');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await proposal.getByRole('button', { name: 'Apply changes' }).click();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.screenshot({ path: 'test-results/mvp-ai-approved.png' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open projects' })).toContainText(
    'IoT Environmental Monitor',
  );
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nexora.project.v1')!));
  expect(saved.boardTemplateId).toBe('large');
  expect(saved.connections).toHaveLength(4);
  expect(saved.components.some((c: { catalogId?: string }) => c.catalogId === 'tmp102')).toBe(true);
  expect(errors).toEqual([]);
});
