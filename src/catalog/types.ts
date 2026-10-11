import type { ComponentType, Vec3 } from '../types/workspace';
export type Category =
  'processors' | 'boards' | 'memory' | 'storage' | 'power' | 'sensors' | 'connectivity' | 'other';
export type VerificationStatus = 'verified' | 'partial' | 'unverified';
export type AssetAccuracy =
  'manufacturer_exact' | 'package_approximation' | 'generic_visualization' | 'unavailable';
export interface Specification {
  label: string;
  value: string | number;
  unit?: string;
  source: string;
}
export type PinRole = 'power-input' | 'power-output' | 'ground' | 'input' | 'output' | 'bidirectional' | 'passive';
export interface PhysicalPin {
  /** Manufacturer package or header terminal number. Never an invented schematic index. */
  id: string;
  number: string;
  role: PinRole;
  interface?: string;
  function?: string;
  drive?: 'push-pull' | 'open-drain';
  logicVoltage?: number;
  nominalVoltage?: number;
  supplyRange?: [number, number];
  note?: string;
}
export interface PhysicalPinout {
  package: string;
  source: string;
  sourceSection: string;
  pins: PhysicalPin[];
}
export interface CatalogPart {
  id: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  name: string;
  category: Category;
  subcategory: string;
  kind: 'device' | 'product' | 'family';
  description: string;
  useCase: string;
  caution: string;
  specifications: Record<string, Specification>;
  interfaces: string[];
  architecture?: string;
  socket?: string;
  memoryGeneration?: string;
  voltageRange?: [number, number];
  package?: string;
  platformIds?: string[];
  sources: { url: string; title: string; license: string }[];
  datasheetUrl?: string;
  physicalPinout?: PhysicalPinout;
  productUrl: string;
  lastVerifiedAt: string;
  verificationStatus: VerificationStatus;
  modelAccuracy: AssetAccuracy;
  model: 'chip' | 'board' | 'memory' | 'drive' | 'sensor' | 'power' | 'fan' | 'display';
  visualSize: Vec3;
  instanceType: ComponentType;
  insertionSupported: boolean;
  insertionNote: string;
}
export interface CatalogFilters {
  query: string;
  category: Category | 'all';
  subcategory: string;
  manufacturer: string;
  interface: string;
  insertable: boolean;
}
export interface CatalogProvider {
  id: string;
  search(filters: CatalogFilters, signal?: AbortSignal): Promise<readonly CatalogPart[]>;
  get(id: string, signal?: AbortSignal): Promise<CatalogPart | undefined>;
}
