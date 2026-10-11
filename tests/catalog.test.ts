import { describe, expect, it } from 'vitest';
import {
  catalog,
  categories,
  comparable,
  comparisonSummary,
  emptyFilters,
  filterCatalog,
  getPart,
  localProvider,
  mergeCatalogs,
  productIdentity,
} from '../src/catalog/catalog';
import { evaluateCompatibility } from '../src/catalog/compatibility';
describe('curated catalog foundation', () => {
  it('loads 29 distinct attributed records across all eight categories', async () => {
    expect(await localProvider.search(emptyFilters)).toHaveLength(29);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(29);
    expect(new Set(catalog.map(productIdentity)).size).toBe(29);
    expect(new Set(catalog.map((p) => p.category)).size).toBe(categories.length);
    for (const p of catalog) {
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.lastVerifiedAt).toBe('2026-10-10');
      expect(p.modelAccuracy).toBe('generic_visualization');
      expect(p.verificationStatus).toBe('partial');
      for (const s of Object.values(p.specifications)) {
        expect(s.source.startsWith('https://')).toBe(true);
        if (typeof s.value === 'number') expect(s.unit).toBeTruthy();
      }
    }
  });
  it.each(['Microchip', 'KVR32N22S8/8', 'temperature'])('searches %s locally', (query) =>
    expect(filterCatalog({ ...emptyFilters, query }).length).toBeGreaterThan(0),
  );
  it('combines category, manufacturer, interface and insertion filters', () => {
    const found = filterCatalog({
      ...emptyFilters,
      category: 'sensors',
      manufacturer: 'Texas Instruments',
      interface: 'I²C',
      insertable: true,
    });
    expect(found.map((p) => p.id)).toEqual(['tmp102']);
    expect(filterCatalog({ ...emptyFilters, subcategory: 'LPDDR5' })).toEqual([]);
  });
  it('compares only two or three items from a meaningful subcategory', () => {
    expect(comparable([getPart('rp2040')!, getPart('stm32f103c8')!])).toBe(true);
    expect(comparable([getPart('rp2040')!, getPart('ddr4-8')!])).toBe(false);
    expect(comparisonSummary([getPart('rp2040')!, getPart('stm32f103c8')!])).toContain(
      'Different processor architectures',
    );
  });
  it('deduplicates provider products by manufacturer, part number and product kind', () =>
    expect(mergeCatalogs(catalog, catalog)).toHaveLength(29));
});
describe('compatibility rules', () => {
  it('does not equate one matching property with complete compatibility', () => {
    const result = evaluateCompatibility(getPart('tmp102')!, { supplyV: 3.3 });
    expect(result.status).toBe('Not Yet Verified');
    expect(result.unverified).toContain('Footprint');
  });
  it('reports hard socket, memory and supply violations', () => {
    expect(evaluateCompatibility(getPart('i5-12400')!, { socket: 'AM4' }).status).toBe(
      'Incompatible',
    );
    expect(evaluateCompatibility(getPart('ddr4-8')!, { memoryGeneration: 'DDR5' }).status).toBe(
      'Incompatible',
    );
    expect(evaluateCompatibility(getPart('tmp102')!, { supplyV: 5 }).status).toBe('Incompatible');
  });
  it('only passes all requirements of an explicitly verified integration profile', () => {
    const result = evaluateCompatibility(getPart('tmp102')!, {
      instanceType: 'sensor',
      supplyV: 3.3,
      interfaces: ['I²C'],
      footprint: 'SOT563',
      pinoutVerified: true,
      mountingVerified: true,
      boardSupportVerified: true,
    });
    expect(result.status).toBe('Compatible');
    expect(result.rules.every((r) => r.status === 'pass')).toBe(true);
  });
});
