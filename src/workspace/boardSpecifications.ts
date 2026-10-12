import { validBoardExtensions, type BoardOutline, type BoardLayer, type BoardSide } from './boardGeometry';
import parts from '../catalog/parts';
import type { HardwareComponent, Project, Vec3 } from '../types/workspace';
import { boardTemplates, type BoardTemplateId } from './boardTemplates';

export type SpecStatus = 'verified' | 'configured' | 'concept' | 'unverified' | 'unspecified';
export interface BoardField<T = string | number> {
  value?: T;
  status: SpecStatus;
  source?: string;
  note?: string;
}
export interface MountingHole {
  id?: string;
  x: number;
  z: number;
  diameter: number;
}
export interface RestrictedRegion {
  id?: string;
  side?: BoardSide | "all";
  name: string;
  x: number;
  z: number;
  length: number;
  width: number;
}
export interface BoardConfiguration {
  outline?: BoardOutline;
  coordinates?: { units: "mm"; origin: { x: number; z: number }; xDirection: 1 | -1; zDirection: 1 | -1 };
  grid?: { enabled: boolean; spacing: number };
  supportedSides?: BoardSide[];
  stackup?: BoardLayer[];
  length: number;
  width: number;
  thickness: number;
  material?: string;
  layers?: number;
  supplyVoltage?: number;
  currentBudgetMa?: number;
  componentSpacing?: number;
  edgeClearance: number;
  mountingHoles: MountingHole[];
  restrictedRegions: RestrictedRegion[];
}
export interface BoardSpecification {
  id: string;
  kind: 'concept' | 'blank' | 'development';
  name: BoardField;
  model: BoardField;
  manufacturer: BoardField;
  partNumber: BoardField;
  length: BoardField<number>;
  width: BoardField<number>;
  thickness: BoardField<number>;
  material: BoardField;
  layers: BoardField<number>;
  mountingHoles: BoardField<MountingHole[]>;
  mountingSummary: BoardField;
  restrictedRegions: BoardField<RestrictedRegion[]>;
  edgeClearance: BoardField<number>;
  supply: BoardField;
  logicVoltage: BoardField<number>;
  currentLimits: BoardField;
  powerInterfaces: BoardField;
  controller: BoardField;
  peripherals: BoardField;
  interfaces: BoardField<string[]>;
  connectors: BoardField;
  connectorPositions: BoardField;
  restrictions: BoardField;
  stackup: BoardField;
  fabrication: BoardField;
  documentation: string[];
  reviewedAt?: string;
}
export const unspecified = <T>(): BoardField<T> => ({ status: 'unspecified' });
const verified = <T>(value: T, source: string, note?: string): BoardField<T> => ({
  value,
  source,
  status: 'verified',
  ...(note ? { note } : {}),
});
export const specificationStatus: Record<SpecStatus, string> = {
  verified: 'Manufacturer verified',
  configured: 'User configured',
  concept: 'Concept design value',
  unverified: 'Unverified',
  unspecified: 'Not specified',
};
export const defaultBoardConfiguration = (): BoardConfiguration => ({
  length: 92,
  width: 64,
  thickness: 1.6,
  edgeClearance: 0,
  mountingHoles: [-41.5, 41.5].flatMap((x) => [-27.5, 27.5].map((z) => ({ x, z, diameter: 2.6 }))),
  restrictedRegions: [],
});
/** Explicit example design inputs, never manufacturer ratings. */
export function presetBoardConfiguration(id: BoardTemplateId): BoardConfiguration {
  const values: Partial<Record<BoardTemplateId, [number, number, number, number, number]>> = {
    compact: [50, 35, 1, 3.3, 250],
    standard: [92, 64, 2, 5, 1000],
    large: [150, 100, 2, 5, 2000],
    'double-sided': [100, 80, 2, 5, 1000],
    sensor: [70, 50, 2, 3.3, 300],
    iot: [100, 70, 2, 3.3, 800],
    robotics: [120, 90, 4, 5, 2000],
    motor: [100, 65, 2, 12, 3000],
    power: [80, 60, 2, 12, 2000],
    display: [120, 60, 2, 5, 1500],
  };
  const v = values[id];
  if (!v) return defaultBoardConfiguration();
  const [length, width, layers, supplyVoltage, currentBudgetMa] = v;
  return {
    length,
    width,
    thickness: 1.6,
    layers,
    material: 'FR-4 (example)',
    supplyVoltage,
    currentBudgetMa,
    componentSpacing: 2,
    edgeClearance: 2,
    mountingHoles: [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => ({ x: x * (length / 2 - 5), z: z * (width / 2 - 5), diameter: 3 })),
    ),
    restrictedRegions: [],
  };
}
/** Validate optional v2 extension, never trust imported verification claims. */
export function validBoardConfiguration(value: unknown): value is BoardConfiguration {
  if (!value || typeof value !== 'object') return false;
  const c = value as BoardConfiguration;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return (
    [c.supplyVoltage, c.currentBudgetMa, c.componentSpacing].every(
      (n) => n === undefined || (finite(n) && n >= 0 && n <= 100000),
    ) &&
    finite(c.length) &&
    c.length >= 10 &&
    c.length <= 200 &&
    finite(c.width) &&
    c.width >= 10 &&
    c.width <= 200 &&
    finite(c.thickness) &&
    c.thickness >= 0.2 &&
    c.thickness <= 10 &&
    (c.material === undefined ||
      (typeof c.material === 'string' &&
        c.material.trim().length > 0 &&
        c.material.length <= 80)) &&
    (c.layers === undefined || (Number.isInteger(c.layers) && c.layers >= 1 && c.layers <= 64)) &&
    finite(c.edgeClearance) &&
    c.edgeClearance >= 0 &&
    c.edgeClearance < Math.min(c.length, c.width) / 2 &&
    Array.isArray(c.mountingHoles) &&
    c.mountingHoles.length <= 32 &&
    c.mountingHoles.every(
      (h) =>
        h &&
        finite(h.x) &&
        finite(h.z) &&
        finite(h.diameter) &&
        h.diameter > 0 &&
        Math.abs(h.x) + h.diameter / 2 <= c.length / 2 &&
        Math.abs(h.z) + h.diameter / 2 <= c.width / 2,
    ) &&
    Array.isArray(c.restrictedRegions) &&
    c.restrictedRegions.length <= 32 &&
    c.restrictedRegions.every(
      (r) =>
        r &&
        typeof r.name === 'string' &&
        r.name.length > 0 &&
        r.name.length <= 80 &&
        finite(r.x) &&
        finite(r.z) &&
        finite(r.length) &&
        finite(r.width) &&
        r.length > 0 &&
        r.width > 0 &&
        Math.abs(r.x) + r.length / 2 <= c.length / 2 &&
        Math.abs(r.z) + r.width / 2 <= c.width / 2,
    ) && validBoardExtensions(c)
  );
}
function emptyRecord(id: string, kind: BoardSpecification['kind']): BoardSpecification {
  return {
    id,
    kind,
    name: unspecified(),
    model: unspecified(),
    manufacturer: unspecified(),
    partNumber: unspecified(),
    length: unspecified(),
    width: unspecified(),
    thickness: unspecified(),
    material: unspecified(),
    layers: unspecified(),
    mountingHoles: unspecified(),
    mountingSummary: unspecified(),
    restrictedRegions: unspecified(),
    edgeClearance: unspecified(),
    supply: unspecified(),
    logicVoltage: unspecified(),
    currentLimits: unspecified(),
    powerInterfaces: unspecified(),
    controller: unspecified(),
    peripherals: unspecified(),
    interfaces: unspecified(),
    connectors: unspecified(),
    connectorPositions: unspecified(),
    restrictions: unspecified(),
    stackup: unspecified(),
    fabrication: unspecified(),
    documentation: [],
  };
}
export function templateSpecification(
  id: BoardTemplateId,
  configuration?: BoardConfiguration,
): BoardSpecification {
  const c = configuration ?? presetBoardConfiguration(id);
  const status = configuration ? 'configured' : 'concept';
  const field = <T>(value: T): BoardField<T> => ({
    value,
    status,
    note: 'Demo preset / user-configured design value; not a hardware safety rating.',
  });
  return {
    ...emptyRecord(id, id === 'blank-92' ? 'blank' : 'concept'),
    name: field(
      id === 'blank-92'
        ? `Blank ${c.length} × ${c.width} mm PCB`
        : boardTemplates.find((t) => t.id === id)!.name,
    ),
    model: field(id),
    supply:
      c.supplyVoltage !== undefined
        ? field(`${c.supplyVoltage} V · example supply`)
        : unspecified(),
    currentLimits:
      c.currentBudgetMa !== undefined
        ? field(`${c.currentBudgetMa} mA · example budget`)
        : unspecified(),
    restrictions: field(
      `Minimum component spacing: ${c.componentSpacing ?? 0} mm. ${boardTemplates.find((t) => t.id === id)!.description}`,
    ),
    length: field(c.length),
    width: field(c.width),
    thickness: field(c.thickness),
    material: c.material ? field(c.material) : unspecified(),
    layers: c.layers ? field(c.layers) : unspecified(),
    mountingHoles: field(c.mountingHoles),
    mountingSummary: field(`${c.mountingHoles.length} holes`),
    restrictedRegions: field(c.restrictedRegions),
    edgeClearance: field(c.edgeClearance),
  };
}
const pico = 'https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf';
const pico2 = 'https://datasheets.raspberrypi.com/pico/pico-2-datasheet.pdf';
const uno = 'https://store.arduino.cc/products/arduino-uno-rev3';
const unoManual = 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf';
const esp =
  'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html';
const espDrawing = 'https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_dimensions.pdf';
const nucleo =
  'https://www.st.com/resource/en/user_manual/um1724-stm32-nucleo64-boards-mb1136-stmicroelectronics.pdf';
const pi5 = 'https://www.raspberrypi.com/products/raspberry-pi-5/';
const pi5Drawing =
  'https://pip.raspberrypi.com/documents/RP-008347-DS-1-raspberry-pi-5-mechanical-drawing.pdf';
const cm4 = 'https://pip.raspberrypi.com/documents/RP-008169-DS-cm4-product-brief.pdf';
const dimensions = (length: number, width: number, source: string, thickness?: number) => ({
  length: verified(length, source),
  width: verified(width, source),
  thickness: thickness === undefined ? unspecified<number>() : verified(thickness, source),
});
const picoRecord = (source: string, controller: string): Partial<BoardSpecification> => ({
  ...dimensions(51, 21, source, 1),
  controller: verified(controller, source),
  supply: verified('VSYS: 1.8–5.5 V; USB VBUS: nominal 5 V', source),
  logicVoltage: verified(3.3, source),
  currentLimits: verified(
    '3V3 external load: recommended below 300 mA; depends on processor load and VSYS',
    source,
  ),
  powerInterfaces: verified('VSYS, VBUS, 3V3, GND and AGND', source),
  interfaces: verified(['GPIO', 'I²C', 'SPI', 'UART', 'USB', 'SWD'], source),
  connectors: verified(
    'Micro-USB B; 40 castellated / through-hole contacts, 2.54 mm pitch; 3-contact SWD',
    source,
  ),
  mountingSummary: verified('4 holes, diameter 2.1 mm; positions not yet transcribed', source),
  restrictions: verified(
    'USB connector overhangs the PCB; consult the surface-mount footprint before carrier design',
    source,
  ),
  peripherals: verified('26 exposed GPIO, 3 ADC inputs; on-board flash and LED', source),
  documentation: [source],
});
const overrides: Record<string, Partial<BoardSpecification>> = {
  pico: picoRecord(pico, 'RP2040'),
  pico2: picoRecord(pico2, 'RP2350A'),
  'uno-r3': {
    ...dimensions(68.6, 53.4, uno),
    controller: verified('ATmega328P; ATmega16U2 USB bridge', unoManual),
    logicVoltage: verified(5, uno),
    supply: verified('VIN recommended: 7–12 V; USB: 5 V', uno),
    currentLimits: verified('20 mA per I/O; 50 mA on the 3.3 V pin', uno),
    powerInterfaces: verified('VIN, 5V, 3V3, GND; USB B and barrel jack', unoManual),
    interfaces: verified(['GPIO', 'I²C', 'SPI', 'UART', 'USB'], unoManual),
    peripherals: verified('14 digital I/O, 6 PWM outputs, 6 analog inputs', uno),
    connectors: verified('USB B, DC jack, expansion headers, ICSP', unoManual),
    documentation: [uno, unoManual],
  },
  'esp32-devkitc': {
    ...dimensions(48.26, 27.94, espDrawing),
    controller: verified('ESP32-WROOM-32E module', esp),
    supply: verified('USB or 5V/GND or 3V3/GND; use only one supply option', esp),
    powerInterfaces: verified('Micro USB; 5V, 3V3 and GND headers', esp),
    interfaces: verified(['GPIO', 'SPI', 'UART', 'USB-to-UART'], esp),
    connectors: verified('Micro USB; J2 and J3 expansion headers', esp),
    restrictions: verified(
      'Power sources are mutually exclusive. D0, D1, D2, D3, CMD and CLK are reserved for flash.',
      esp,
    ),
    documentation: [esp, espDrawing],
  },
  'nucleo-f401re': {
    controller: verified('STM32F401RE; ST-LINK/V2-1 debugger', nucleo),
    supply: verified(
      'USB; VIN 7–12 V; E5V 5 V; or 3.3 V with required jumper configuration',
      nucleo,
    ),
    powerInterfaces: verified('CN6 / CN7: VIN, E5V, 3V3, 5V, GND; CN1 USB', nucleo),
    currentLimits: verified(
      'USB: 300 mA with JP1 OFF, 100 mA with JP1 ON; see §7.5 for external-supply limits',
      nucleo,
    ),
    connectors: verified('Arduino Uno V3 headers, ST morpho, Mini-USB and SWD', nucleo),
    restrictions: verified(
      'ST-LINK section can be separated; check §7.3 and jumper configuration before cutting or powering',
      nucleo,
    ),
    documentation: [nucleo],
  },
  pi5: {
    ...dimensions(85, 56, pi5Drawing),
    length: verified(85, pi5Drawing, 'Approximate reference dimension; not production data.'),
    width: verified(56, pi5Drawing, 'Approximate reference dimension; not production data.'),
    controller: verified('Broadcom BCM2712; quad Cortex-A76', pi5),
    supply: verified('5 V DC via USB-C', pi5),
    currentLimits: verified('Recommended supply: 5 A; not a GPIO current rating', pi5),
    connectors: verified(
      '40-pin header; USB-C power; 2 USB 3, 2 USB 2; Ethernet; 2 micro HDMI; MIPI; PCIe; microSD',
      pi5,
    ),
    interfaces: verified(
      ['GPIO', 'USB', 'Ethernet', 'PCIe', 'MIPI', 'HDMI', 'microSD', 'Wi-Fi', 'Bluetooth'],
      pi5,
    ),
    peripherals: verified('RTC, power button, VideoCore VII GPU', pi5),
    restrictions: verified(
      'Mechanical drawing is approximate reference data, not production data',
      pi5Drawing,
    ),
    documentation: [pi5, pi5Drawing],
  },
  cm4: {
    ...dimensions(55, 40, cm4),
    controller: verified('BCM2711; quad Cortex-A72', cm4),
    connectors: verified('Dual 100-pin board-to-board connectors; requires a carrier', cm4),
    restrictions: verified(
      'Family record: select the exact memory, storage and wireless variant',
      cm4,
    ),
    documentation: [cm4],
  },
};
/** All catalog boards get a record; existing partial facts remain explicitly unverified. */
export const developmentBoardSpecifications: BoardSpecification[] = parts
  .filter((p) => p.category === 'boards')
  .map((p) => ({
    ...emptyRecord(p.id, 'development'),
    name: verified(p.name, p.productUrl),
    model: verified(p.manufacturerPartNumber, p.productUrl),
    manufacturer: verified(p.manufacturer, p.productUrl),
    partNumber:
      p.kind === 'family' ? unspecified() : verified(p.manufacturerPartNumber, p.productUrl),
    interfaces: p.interfaces.length
      ? {
          value: p.interfaces,
          status: 'unverified',
          source: p.productUrl,
          note: 'Existing partial catalog record.',
        }
      : unspecified(),
    ...overrides[p.id],
    reviewedAt: '2026-10-10',
  }));
export function boardSpecification(
  project: Project,
  component: HardwareComponent,
): BoardSpecification | undefined {
  if (component.id === 'pcb')
    return templateSpecification(
      project.boardTemplateId ?? 'cooling-demo',
      project.boardConfiguration,
    );
  return developmentBoardSpecifications.find((s) => s.id === component.catalogId);
}
/** Real PCB footprint where sourced; height stays a visual estimate unless specified. */
export function boardVisualSize(id: string, fallback: Vec3): Vec3 {
  const s = developmentBoardSpecifications.find((s) => s.id === id);
  return [
    s?.length.value !== undefined ? s.length.value / 10 : fallback[0],
    s?.thickness.value !== undefined ? s.thickness.value / 10 : fallback[1],
    s?.width.value !== undefined ? s.width.value / 10 : fallback[2],
  ];
}
