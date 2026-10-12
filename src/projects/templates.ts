import { migrateProject } from '../workspace/migrations';
import { presetBoardConfiguration } from '../workspace/boardSpecifications';
import { suggestPlacements } from '../engineering/placement';
import { validateConnection } from '../schematic/model';
import { demoProject } from '../data/demoProject';
import { createInstance } from '../catalog/instances';
import { getPart } from '../catalog/catalog';
import type { HardwareComponent, Project, Vec3 } from '../types/workspace';

export const projectTemplates = [
  {
    id: 'blank',
    name: 'Blank PCB',
    description: 'An empty concept board, ready for your hardware.',
    parts: [],
  },
  {
    id: 'cooling',
    name: 'Smart Cooling Controller',
    description: 'The original fan-controller demonstration.',
    parts: [],
  },
  {
    id: 'microcontroller',
    name: 'Microcontroller System',
    description: 'RP2040 controller with an external EEPROM.',
    parts: ['rp2040', 'eeprom24lc'],
  },
  {
    id: 'iot',
    name: 'IoT Environmental Monitor',
    description: 'Wi-Fi development board and environmental sensor.',
    parts: ['esp32-devkitc', 'bme280'],
  },
  {
    id: 'robotics',
    name: 'Robotics / Motor Controller',
    description: 'Microcontroller, motor driver, and motion-ready concepts.',
    parts: ['atmega328p', 'drv8833'],
  },
  {
    id: 'power',
    name: 'Power Management',
    description: 'A starting point for power-switching concepts.',
    parts: ['irlz44n', 'rp2040'],
  },
  {
    id: 'display',
    name: 'Display Controller',
    description: 'Computing board and screen visualization.',
    parts: ['pi5', 'touch2'],
  },
  {
    id: 'logger',
    name: 'Sensor Data Logger',
    description: 'Microcontroller, temperature sensor, and flash storage.',
    parts: ['stm32f401cc', 'tmp102', 'w25q128'],
  },
] as const;
export type TemplateId = (typeof projectTemplates)[number]['id'];
export function createProject(name: string, template: TemplateId = 'blank'): Project {
  const definition = projectTemplates.find((t) => t.id === template);
  if (!definition) throw new Error('Unknown project template.');
  if (!name.trim() || name.trim().length > 100)
    throw new Error('Enter a project name (1–100 characters).');
  const id = crypto.randomUUID();
  if (template === 'cooling') {
    const p: Project = {
      ...structuredClone(demoProject),
      schemaVersion: 2,
      id,
      name: name.trim(),
      connections: [],
      engineeringInputs: {},
    };
    for (const [componentId, catalogId] of [
      ['mcu', 'rp2040'],
      ['sensor', 'tmp102'],
      ['mosfet', 'irlz44n'],
    ]) {
      const index = p.components.findIndex((c) => c.id === componentId);
      const old = p.components[index];
      p.components[index] = {
        ...createInstance(getPart(catalogId)!, componentId),
        reference: old.reference,
        position: old.position,
      };
    }
    p.boardConfiguration = {
      ...presetBoardConfiguration('standard'),
      supplyVoltage: 5,
      currentBudgetMa: 500,
    };
    p.boardTemplateId = 'standard';
    addWire(p, 'mcu', 'demo:SDA', 'sensor', 'demo:SDA');
    addWire(p, 'mcu', 'demo:SCL', 'sensor', 'demo:SCL');
    addWire(p, 'mcu', 'demo:PWM', 'mosfet', 'demo:PWM');
    addWire(p, 'mcu', 'demo:GND', 'sensor', 'demo:GND');
    addWire(p, 'mcu', 'demo:VDD', 'sensor', 'demo:VDD');
    addWire(p, 'mosfet', 'D', 'fan', '-');
    addWire(p, 'usb', 'VBUS', 'fan', '+');
    addWire(p, 'usb', 'GND', 'mcu', 'demo:GND');
    for (const [componentId, currentMa] of [
      ['mcu', 40],
      ['sensor', 2],
      ['mosfet', 1],
      ['fan', 180],
    ] as const)
      p.engineeringInputs![componentId] = { provenance: 'demo', currentMa, voltage: 5 };
    p.engineeringInputs!.mosfet = {
      ...p.engineeringInputs!.mosfet,
      dissipationW: 0.25,
      thermalResistance: 40,
      ambientC: 25,
      maxTemperatureC: 80,
    };
    return migrateProject(p);
  }
  const board = { ...structuredClone(demoProject.components[0]), fixed: true };
  const components: HardwareComponent[] = [board];
  definition.parts.forEach((partId, i) => {
    const part = getPart(partId);
    if (!part?.insertionSupported)
      throw new Error(`Template unavailable: ${partId} is not insertable.`);
    const instanceId = `part-${crypto.randomUUID()}`;
    const position: Vec3 = [(i - (definition.parts.length - 1) / 2) * 2.4, 1.5, 0];
    components.push({ ...createInstance(part, instanceId), position, initialPosition: position });
  });
  const project: Project = {
    schemaVersion: 2,
    id,
    name: name.trim(),
    placementMode: 'free',
    boardTemplateId: 'blank-92',
    components,
  };
  if (template === 'iot' || template === 'robotics') {
    const cfg = presetBoardConfiguration(template);
    project.boardTemplateId = template;
    project.boardConfiguration = cfg;
    board.dimensions = [cfg.length / 10, cfg.thickness / 10, cfg.width / 10];
    for (const c of components.slice(1))
      c.position = suggestPlacements(project, c)[0]?.position ?? c.position;
    const a = components[1].id,
      b = components[2].id;
    for (const pin of ['VDD', 'GND', ...(template === 'iot' ? ['SDA', 'SCL'] : ['PWM', 'GPIO'])])
      addWire(project, a, `demo:${pin}`, b, `demo:${pin}`);
    project.engineeringInputs = {
      [a]: {
        provenance: 'demo',
        currentMa: template === 'iot' ? 180 : 40,
        voltage: cfg.supplyVoltage,
      },
      [b]: {
        provenance: 'demo',
        currentMa: template === 'iot' ? 3 : 2300,
        voltage: cfg.supplyVoltage,
      },
    };
  }
  return migrateProject(project);
}
function addWire(project: Project, a: string, ap: string, b: string, bp: string) {
  const from = { componentId: a, portId: ap },
    to = { componentId: b, portId: bp };
  const error = validateConnection(project, from, to);
  if (error) throw new Error(error);
  project.connections = [
    ...(project.connections ?? []),
    { id: `wire-${crypto.randomUUID()}`, from, to },
  ];
}
