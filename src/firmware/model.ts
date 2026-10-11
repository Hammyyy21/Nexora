import source from '../../assets/firmware/cooling.c?raw';
import build from './demoBuild.json';

export type FirmwareLanguage = 'c' | 'assembly' | 'machine';
export interface FirmwareModule {
  id: string;
  filename: string;
  language: FirmwareLanguage;
  source: string;
  relatedComponentIds: string[];
  readonly: boolean;
}
export interface FirmwareBuild {
  id: string;
  targetArchitecture: string;
  compiler: string;
  compilerFlags: string[];
  sourceRevision: string;
  sourceSha256: string;
  status: 'demo' | 'current' | 'stale' | 'unavailable';
  assembly?: string;
  disassembly?: string;
  machineCode?: number[];
  addressKind: string;
}
export const demoSource = source;
export const demoBuild = build as FirmwareBuild;
export const demoModule: FirmwareModule = {
  id: 'cooling',
  filename: 'cooling.c',
  language: 'c',
  source,
  relatedComponentIds: ['mcu', 'sensor', 'mosfet', 'fan'],
  readonly: false,
};
export function sourceRevision(value: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function buildStatus(value: string): FirmwareBuild['status'] {
  // Equality also prevents a noncryptographic revision collision from validating edits.
  return value === demoSource && sourceRevision(value) === demoBuild.sourceRevision
    ? 'demo'
    : 'stale';
}
const associations: Record<string, { symbol: string; description: string }> = {
  mcu: {
    symbol: 'update_fan',
    description: 'U1 executes cooling.c on the demonstration Cortex-M3 target.',
  },
  sensor: {
    symbol: 'sensor_read_celsius',
    description:
      'U1 reads U3 through sensor_read_celsius. The sensor does not execute firmware; this adapter reads a decoded RAM sample.',
  },
  mosfet: {
    symbol: 'fan_set_duty',
    description:
      'U1 requests fan duty through fan_set_duty; Q1 switches the fan. This RAM adapter requires a real GPIO/PWM driver. Q1 has no executable.',
  },
  fan: {
    symbol: 'fan_set_duty',
    description:
      'FAN1 is driven through Q1 by U1. fan_set_duty models the requested duty; the fan has no standalone executable.',
  },
};
export function association(projectId: string, componentId: string | null) {
  if (projectId !== 'smart-cooling-01') return null;
  if (!componentId)
    return {
      symbol: 'update_fan',
      description: 'Project firmware · Smart Cooling Controller · U3 → U1 → Q1 → FAN1',
    };
  return associations[componentId] ?? null;
}
export function hexRows(bytes: number[]) {
  return Array.from({ length: Math.ceil(bytes.length / 8) }, (_, row) => {
    const group = bytes.slice(row * 8, row * 8 + 8);
    return {
      offset: (row * 8).toString(16).padStart(8, '0').toUpperCase(),
      hex: group.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      ascii: group.map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
    };
  });
}
export const hexBytes = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
export function exportContent(tab: FirmwareLanguage, value: string) {
  if (tab === 'c') return { filename: 'cooling.c', text: value };
  if (tab === 'assembly') return { filename: 'cooling.demo.s', text: demoBuild.assembly ?? '' };
  return {
    filename: 'cooling.demo.hex.txt',
    text:
      '# Demo .text section offsets; NOT Intel HEX or physical flash addresses.\nOFFSET    HEX BYTES                ASCII\n' +
      hexRows(demoBuild.machineCode ?? [])
        .map((r) => `${r.offset}  ${r.hex.padEnd(23)}  ${r.ascii}`)
        .join('\n') +
      '\n',
  };
}
