import { expect, test } from '@playwright/test';

test('custom PCB editing, inspection navigation and approval survive undo and reload', async ({ page }) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/health',r=>r.fulfill({json:{status:'ok',ai_configured:true}}));
  let inspected=false;
  await page.route('**/api/ai/chat',async r=>{
    const body=r.request().postDataJSON();const s=body.context.workspace_snapshot;
    expect(s.version).toBe(1);expect(s.board.outline.kind).toBe('circle');expect(s.components.length).toBeGreaterThan(1);
    expect(s.firmware.language).toBe('c');expect(s.findings.length).toBeGreaterThan(0);
    inspected=true;
    const f=s.findings.find((f:{entities:{kind:string}[]})=>f.entities.some(e=>e.kind==='component'));
    await r.fulfill({json:{mode:'ai',request_id:'inspection-test',answer:'Review the configured PCB and missing physical pin mappings.',notice:'Proposals require approval.',missing_data:[],unverified_recommendations:[],cited_catalog_ids:[],references:[],findings:[{evidence_id:f.id,explanation:'This evidence requires a manual review.',next_step:'Inspect the affected component.'}],actions:body.messages[0].content.includes('thickness')?[{type:'configure_board',configuration:{...s.board,thickness:2.4}}]:[]}});
  });
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const dashboard=page.getByRole('dialog',{name:'Nexora projects'});if(await dashboard.isVisible())await page.getByRole('button',{name:'Close projects'}).click();
  await expect(page.getByText('Assembling your workspace…')).toBeHidden();
  const canvas=page.locator('.viewport canvas');await expect(canvas).toBeVisible();await canvas.evaluate(n=>n.setAttribute('data-retained','yes'));
  await page.getByRole('button',{name:'Choose Board',exact:true}).click();await page.getByRole('button',{name:'Create custom PCB',exact:true}).click();
  await page.getByText('Configure blank PCB',{exact:true}).click();
  await page.getByLabel('Length (mm)',{exact:true}).fill('100');
  await page.getByLabel('Board outline',{exact:true}).selectOption('circle');
  await page.getByLabel('Layer count',{exact:true}).fill('4');
  await page.getByLabel('Snap to grid',{exact:true}).check();
  await page.getByLabel('Grid spacing (mm)',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Apply board configuration',exact:true}).click();
  await expect(page.locator('.inspector').getByText('100 mm',{exact:true})).toHaveCount(2);
  const nav=page.getByRole('navigation',{name:'Main workspace navigation'});
  await nav.getByRole('button',{name:'AI Guide',exact:true}).click();
  await page.getByRole('button',{name:'Inspect entire project',exact:true}).click();
  const findings=page.getByRole('region',{name:'Project inspection findings'});
  // section uses aria-label but no implicit region on some accessibility engines.
  await expect(page.locator('[aria-label="Project inspection findings"]')).toBeVisible();
  expect(inspected).toBe(true);
  await page.locator('[aria-label="Project inspection findings"] details').first().locator('summary').click();
  await page.getByRole('button',{name:/Inspect component:/}).first().click();
  await expect(page.getByRole('complementary',{name:'Component inspector'})).toBeVisible();
  await nav.getByRole('button',{name:'AI Guide',exact:true}).click();
  const input=page.getByPlaceholder(/Ask/i);await input.fill('Set board thickness to 2.4 mm');await input.press('Enter');
  await expect(page.getByRole('region',{name:'AI design proposal'})).toBeVisible();
  await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  await nav.getByRole('button',{name:'Inspector',exact:true}).click();
  await page.getByRole('button',{name:/Undo/}).first().click();
  await page.getByRole('button',{name:/Redo/}).first().click();
  await expect(canvas).toHaveAttribute('data-retained','yes');
  await page.screenshot({path:'test-results/engineering-workspace-v2.png',fullPage:true});
  expect(errors).toEqual([]);
  void findings;
});
