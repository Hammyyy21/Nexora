import raw from './parts';
import type { CatalogFilters, CatalogPart, CatalogProvider, Category } from './types';
export const categories: { id: Category; label: string; children: string[] }[] = [
  {
    id: 'processors',
    label: 'Processors',
    children: ['Microcontrollers', 'Desktop CPUs', 'Embedded CPUs', 'System-on-chip devices'],
  },
  {
    id: 'boards',
    label: 'Boards',
    children: [
      'Development boards',
      'Single-board computers',
      'Computing modules',
      'Desktop motherboards',
      'Embedded carrier boards',
      'Custom PCB templates',
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    children: ['DDR4', 'DDR5', 'LPDDR4', 'LPDDR5', 'SRAM', 'EEPROM', 'eMMC'],
  },
  {
    id: 'storage',
    label: 'Storage',
    children: ['NVMe SSDs', 'SATA SSDs', 'microSD', 'SPI NOR Flash', 'Embedded flash'],
  },
  {
    id: 'power',
    label: 'Power',
    children: [
      'MOSFETs',
      'Voltage regulators',
      'DC-DC converters',
      'Batteries',
      'Power connectors',
      'Power-management ICs',
    ],
  },
  {
    id: 'sensors',
    label: 'Sensors',
    children: [
      'Temperature',
      'Humidity / pressure',
      'Humidity / temperature',
      'Motion',
      'Pressure',
      'Proximity',
      'Distance',
      'Light',
    ],
  },
  {
    id: 'connectivity',
    label: 'Connectivity',
    children: [
      'Wi-Fi / Bluetooth',
      'Ethernet',
      'USB controllers',
      'UART interfaces',
      'SPI interfaces',
      'I²C interfaces',
    ],
  },
  {
    id: 'other',
    label: 'Other Hardware',
    children: [
      'Cooling fans',
      'Displays',
      'Motor drivers',
      'Motors',
      'Actuators',
      'LEDs',
      'Resistors',
      'Capacitors',
      'Connectors',
      'Switches',
    ],
  },
];
export const catalog: readonly CatalogPart[] = raw;
export const getPart = (id?: string) => catalog.find((p) => p.id === id);
export const emptyFilters: CatalogFilters = {
  query: '',
  category: 'all',
  subcategory: '',
  manufacturer: '',
  interface: '',
  insertable: false,
};
export function filterCatalog(filters: CatalogFilters) {
  const words = filters.query.toLowerCase().trim().split(/\s+/);
  return catalog.filter(
    (p) =>
      words.every((word) =>
        `${p.name} ${p.manufacturer} ${p.manufacturerPartNumber} ${p.subcategory}`
          .toLowerCase()
          .includes(word),
      ) &&
      (filters.category === 'all' || p.category === filters.category) &&
      (!filters.subcategory || p.subcategory === filters.subcategory) &&
      (!filters.manufacturer || p.manufacturer === filters.manufacturer) &&
      (!filters.interface || p.interfaces.includes(filters.interface)) &&
      (!filters.insertable || p.insertionSupported),
  );
}
export function comparable(parts: readonly CatalogPart[]) {
  return parts.length <= 3 && parts.every((p) => p.subcategory === parts[0]?.subcategory);
}
export function comparisonSummary(parts: readonly CatalogPart[]) {
  if (parts.length < 2) return 'Select two or three products from the same subcategory.';
  if (!comparable(parts))
    return 'Choose products from one subcategory for a meaningful comparison.';
  const architectures = new Set(parts.map((p) => p.architecture).filter(Boolean));
  return `${parts.map((p) => p.name).join(' and ')} share the ${parts[0].subcategory} category. ${architectures.size > 1 ? 'Different processor architectures require different firmware targets. ' : ''}Listed clocks and capacities describe specifications, not benchmark rankings. Unknown fields and board integration still need review.`;
}
export const specText = (spec: CatalogPart['specifications'][string] | undefined) =>
  spec ? `${spec.value}${spec.unit ? ` ${spec.unit}` : ''}` : 'Unknown';
export const productIdentity = (p: CatalogPart) =>
  `${p.manufacturer.trim().toLowerCase()}::${p.manufacturerPartNumber.trim().toLowerCase()}::${p.kind}`;
export function mergeCatalogs(...lists: readonly (readonly CatalogPart[])[]) {
  const unique = new Map<string, CatalogPart>();
  for (const p of lists.flat()) {
    const key = productIdentity(p),
      old = unique.get(key);
    unique.set(
      key,
      old
        ? {
            ...old,
            sources: [
              ...old.sources,
              ...p.sources.filter((s) => !old.sources.some((o) => o.url === s.url)),
            ],
          }
        : p,
    );
  }
  return [...unique.values()];
}
export const localProvider: CatalogProvider = {
  id: 'curated-local-v1',
  search: async (filters) => filterCatalog(filters),
  get: async (id) => getPart(id),
};
