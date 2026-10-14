import { expect, test } from '@playwright/test';

for (const width of [1366, 390]) {
  test(`placement keeps a real viewport and supports collapse at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.route('**/api/health', (r) =>
      r.fulfill({ json: { status: 'ok', ai_configured: false } }),
    );
    await page.goto('/');
    await page.getByLabel('Project name', { exact: true }).fill('Placement board');
    await page.getByRole('button', { name: 'Create and open' }).click();
    await expect(page.getByText('Assembling your workspace…')).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
    const canvas = page.locator('.viewport canvas');
    await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
    await nav.getByRole('button', { name: 'PCB Layout', exact: true }).click();
    await page.getByRole('button', { name: 'Add Component', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add Component' });
    await drawer.getByLabel('Search drawer components').fill('TMP102');
    await drawer.getByRole('button', { name: 'Add to Design' }).click();
    await expect(page.getByRole('main', { name: '3D design workspace' })).toBeVisible();
    const panel = page.getByRole('region', { name: 'Component placement', exact: true });
    await expect(panel).toBeVisible();
    await expect(page.locator('.tools-panel')).toBeHidden();
    await expect(canvas).toHaveAttribute('data-retained', 'true');
    const initial = (await canvas.boundingBox())!;
    const bounds = (await panel.boundingBox())!;
    if (width > 620) {
      expect(initial.x + initial.width).toBeLessThanOrEqual(bounds.x + 1);
      const handle = page.getByRole('separator', { name: 'Resize placement panel' });
      await handle.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(handle).toHaveAttribute('aria-valuenow', '320');
      const edge = (await handle.boundingBox())!;
      await page.mouse.move(edge.x + edge.width / 2, edge.y + 70);
      await page.mouse.down();
      await page.mouse.move(edge.x - 50, edge.y + 70, { steps: 8 });
      await page.mouse.up();
      expect((await canvas.boundingBox())!.width).toBeLessThan(initial.width);
    } else {
      expect(initial.y + initial.height).toBeLessThanOrEqual(bounds.y + 1);
      expect(initial.height).toBeGreaterThan(220);
    }
    const target = page.getByRole('spinbutton', { name: 'Placement position X' });
    const before = await page
      .locator('.placement-fields input')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLInputElement).value));
    await page.getByRole('button', { name: 'Use suggested placement 2' }).click();
    const second = await page
      .locator('.placement-fields input')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLInputElement).value));
    expect(second).not.toEqual(before);
    await target.fill('1.2');
    await page.getByRole('button', { name: 'Collapse placement panel' }).click();
    await expect(panel).toBeVisible();
    await expect(target).toBeHidden();
    await expect.poll(async () => {
      const collapsed = (await canvas.boundingBox())!;
      return width > 620 ? collapsed.width : collapsed.height;
    }).toBeGreaterThan(width > 620 ? initial.width : initial.height);
    await page.getByRole('button', { name: 'Fit PCB to View' }).click();
    await page.getByRole('button', { name: 'Focus Mode', exact: true }).click();
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: 'Expand placement panel' }).click();
    await expect(target).toHaveValue('1.2');
    await page.getByRole('button', { name: 'Fit PCB to View' }).click();
    await page.screenshot({ path: `test-results/placement-ux-${width}.png` });
    await page.getByRole('button', { name: 'Confirm visual placement' }).click();
    await expect(panel).toBeHidden();
    await page.reload();
    await nav.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toHaveCount(
      1,
    );
    await page.getByRole('button', { name: '+ Add Component' }).click();
    await drawer.getByLabel('Search drawer components').fill('TMP102');
    await drawer.getByRole('button', { name: 'Add to Design' }).click();
    if (width > 620) {
      expect(
        Number(
          await page
            .getByRole('separator', { name: 'Resize placement panel' })
            .getAttribute('aria-valuenow'),
        ),
      ).toBeGreaterThan(320);
    }
    await page.getByRole('button', { name: 'Cancel placement' }).click();
    await expect(page.getByRole('button', { name: /TMP102 temperature sensor LIB-/ })).toHaveCount(
      1,
    );
  });
}

test('slow chat clears on Enter, preserves a new draft and discards a response after project switching', async ({
  page,
}) => {
  await page.route('**/api/health', (r) =>
    r.fulfill({ json: { status: 'ok', ai_configured: true } }),
  );
  let release!: () => void;
  let requests = 0;
  await page.route('**/api/ai/chat', async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: {
        mode: 'ai',
        request_id: 'slow',
        answer: 'Old project response',
        actions: [],
        missing_data: [],
        unverified_recommendations: [],
        cited_catalog_ids: [],
        references: [],
        notice: 'Review required',
      },
    });
  });
  await page.goto('/');
  await page.getByLabel('Project name', { exact: true }).fill('Chat project');
  await page.getByRole('button', { name: 'Create and open' }).click();
  const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  const input = page.getByLabel('Ask AI Guide');
  await input.fill('Explain my board');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByText('Explain my board', { exact: true })).toBeVisible();
  await expect(page.getByText('Asking AI Guide…')).toBeVisible();
  await input.fill('Independent next question');
  await input.press('Enter');
  await expect.poll(() => requests).toBe(1);
  await nav.getByRole('button', { name: 'Components', exact: true }).click();
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  await expect(input).toHaveValue('Independent next question');
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Second chat project');
  await page.getByRole('button', { name: 'Create and open' }).click();
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  await expect(input).toHaveValue('');
  release();
  await expect(page.getByText('Asking AI Guide…')).toBeHidden();
  await expect(page.getByText('Old project response')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open Chat project', exact: true }).click();
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  await expect(input).toHaveValue('Independent next question');
  await expect(page.getByText('Explain my board', { exact: true })).toBeVisible();
  await page.reload();
  await nav.getByRole('button', { name: 'AI Guide', exact: true }).click();
  await expect(input).toHaveValue('Independent next question');
  await expect(page.getByText('Explain my board', { exact: true })).toBeVisible();
});

test('completed Markdown honors reduced motion and keeps a reader’s scroll position', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/health', (r) =>
    r.fulfill({ json: { status: 'ok', ai_configured: true } }),
  );
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      json: {
        mode: 'ai',
        request_id: 'markdown',
        answer:
          '**Power review**\n\n```c\nint main(void) { return 0; }\n```\n\n' +
          Array.from(
            { length: 35 },
            (_, i) => `Step ${i + 1}: check the documented requirements.`,
          ).join('\n\n'),
        actions: [],
        missing_data: [],
        unverified_recommendations: [],
        cited_catalog_ids: [],
        references: [],
        notice: 'Review required',
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Close projects' }).click();
  await page
    .getByRole('navigation', { name: 'Main workspace navigation' })
    .getByRole('button', { name: 'AI Guide', exact: true })
    .click();
  await page.getByLabel('AI response length').selectOption('detailed');
  await page.getByLabel('Ask AI Guide').fill('Review power');
  await page.getByLabel('Ask AI Guide').press('Enter');
  await expect(page.locator('.chat-markdown code')).toContainText('int main');
  expect(
    await page
      .locator('.chat-message.assistant')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
  const scroll = page.locator('.response-messages');
  expect(await scroll.evaluate((node) => node.scrollHeight > node.clientHeight + 100)).toBe(true);
  await scroll.evaluate((node) => {
    node.scrollTop = 120;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.getByLabel('Ask AI Guide').fill('Explain the next step');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(120);
});
