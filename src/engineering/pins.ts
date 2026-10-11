import { getPart } from '../catalog/catalog';
import type { PhysicalPin } from '../catalog/types';
import type { HardwareComponent } from '../types/workspace';

/** Curated manufacturer pins are intentionally incomplete, not a full package netlist. */
export function verifiedPin(component: HardwareComponent, portId: string): PhysicalPin | undefined {
  return getPart(component.catalogId)?.physicalPinout?.pins.find((p) => `pin:${p.id}` === portId);
}
export function verifiedPinout(component: HardwareComponent) {
  return getPart(component.catalogId)?.physicalPinout;
}
export const isPhysicalPort = (id: string) => id.startsWith('pin:');
export const busFamily = (name?: string): string | null =>
  name ? (name.toUpperCase().startsWith('I2C') ? 'I2C' : name.toUpperCase().replace(/[^A-Z0-9]/g, '')) : null;
