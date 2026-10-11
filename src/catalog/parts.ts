import type { CatalogPart } from './types';
import data from './parts.json';
// Shared with the read-only Python catalog loader; keep one authoritative catalog.
const parts = data as unknown as CatalogPart[];
export default parts;
