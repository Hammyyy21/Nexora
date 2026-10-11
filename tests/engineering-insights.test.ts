import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/data/demoProject';
import { createProject } from '../src/projects/templates';
import { buildBOM, exportBOMCsv, reviewDesign } from '../src/engineering/insights';

describe('engineering foundation: concept BOM and design review', () => {
  it('generates a BOM with honest unmapped concept items and safe CSV output', () => {
    const bom = buildBOM(demoProject);
    expect(bom.reduce((n, line) => n + line.quantity, 0)).toBe(demoProject.components.length);
    expect(bom.every((line) => line.status === 'concept')).toBe(true);
    const csv = exportBOMCsv(demoProject);
    expect(csv).toContain('"Manufacturer"');
    expect(csv).toContain('"Unspecified"');
    expect(csv).not.toContain('undefined');
  });
  it('uses actual catalog manufacturer data for a template and does not invent a price', () => {
    const bom = buildBOM(createProject('Demo', 'iot'));
    expect(bom.some((line) => line.status === 'catalog' && line.manufacturerPartNumber !== 'Unspecified')).toBe(true);
    expect(exportBOMCsv(createProject('Demo', 'iot'))).not.toMatch(/,\s*"Price"/);
  });
  it('reports missing connectivity verification and approximate placement issues', () => {
    const copy = structuredClone(demoProject);
    expect(reviewDesign(copy).some((f) => f.id === 'no-netlist')).toBe(true);
    copy.components.find((c) => c.id === 'fan')!.position = [19, 0.7, 0];
    expect(reviewDesign(copy).some((f) => f.id.startsWith('geometry:fan:'))).toBe(true);
  });
  it('protects CSV export against formula injection', () => {
    const copy = structuredClone(demoProject);
    copy.components.find((c) => c.id === 'fan')!.name = '=SUM(A1:A4)';
    expect(exportBOMCsv(copy)).toContain("\"'=SUM(A1:A4)\"");
  });
});
