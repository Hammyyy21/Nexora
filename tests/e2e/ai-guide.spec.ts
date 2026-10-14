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
    await page.getByRole('button', { name: 'Close projects' }).click();
    const canvas = page.locator('.viewport canvas');
    await canvas.evaluate((node) => node.setAttribute('data-retained', 'true'));
    const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
    await nav.getByRole('button', { name: 'AI Guide' }).click();
    const chat = page.getByRole('region', { name: 'Assistant conversation' });
    await expect(chat).toBeVisible();
    await expect(nav.getByRole('button', { name: 'AI Guide' })).toBeFocused();
    await page.getByLabel('Ask AI Guide').fill('Unsent question');
    for (const name of ['Components', 'Code', 'Design']) {
      await nav.getByRole('button', { name, exact: true }).click();
      await expect(page.getByLabel('Ask AI Guide')).toHaveCount(1);
      await expect(page.getByLabel('Ask AI Guide')).toHaveValue('Unsent question');
      await expect(page.locator('#assistant-conversation')).toHaveCount(1);
      await expect(canvas).toHaveAttribute('data-retained', 'true');
    }
    // Exercise the cleanup paths that used to destroy nested label roots.
    await page
      .getByRole('navigation', { name: 'Main workspace navigation' })
      .getByRole('button', { name: 'Workspace', exact: true })
      .click();
    await page.getByRole('button', { name: 'Toggle labels (L)' }).click();
    await page.getByRole('button', { name: 'Toggle labels (L)' }).click();
    await nav.getByRole('button', { name: 'AI Guide' }).click();
    await page.screenshot({ path: `test-results/ai-guide-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('mentor remembers physical distance goals and explanation style after refresh', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ai_configured: true } }),
  );
  const requests: {
    messages: { role: string; content: string }[];
    explanation_mode: string;
    context: { project_intent: { intended_function: string; requirements: string[] } };
  }[] = [];
  await page.route('**/api/ai/chat', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        mode: 'ai',
        request_id: 'mentor-browser',
        answer:
          requests.length === 1
            ? 'A distance sensor measures how far away an object is. The catalog has no suitable sensor yet. Will you use this indoors or outdoors?'
            : 'I asked about the environment because sunlight can affect some light-based sensors.',
        actions: [],
        missing_data: ['Environment unknown'],
        unverified_recommendations: [],
        cited_catalog_ids: [],
        references: [],
        notice: 'Proposals require approval.',
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Close projects' }).click();
  const nav = page.getByRole('navigation', { name: 'Main workspace navigation' });
  await nav.getByRole('button', { name: 'AI Guide' }).click();
  await page
    .getByLabel('Ask AI Guide')
    .fill('I want to measure the distance to objects 1–2 meters away.');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.getByText(/The catalog has no suitable sensor yet/)).toBeVisible();
  await page.getByLabel('Explanation style').selectOption('engineer');
  await page.getByLabel('Ask AI Guide').fill('What did you mean by your last question?');
  await page.reload();
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  await nav.getByRole('button', { name: 'AI Guide' }).click();
  await expect(page.getByLabel('Explanation style')).toHaveValue('engineer');
  await expect(page.getByLabel('Ask AI Guide')).toHaveValue(
    'What did you mean by your last question?',
  );
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.getByText(/I asked about the environment/)).toBeVisible();
  expect(requests[1].messages.at(-2)?.content).toContain('indoors or outdoors?');
  expect(requests[1].context.project_intent.intended_function).toBe('object-distance measurement');
  expect(requests[1].context.project_intent.requirements.join(' ')).toContain('1–2 meters');
  expect(requests[1].explanation_mode).toBe('engineer');
  await page.screenshot({ path: 'test-results/ai-hardware-mentor.png', fullPage: true });
});
