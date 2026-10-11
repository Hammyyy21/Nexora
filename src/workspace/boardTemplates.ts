export const boardTemplates = [
  {
    id: 'cooling-demo',
    name: 'Smart Cooling Controller',
    description: 'Original 92 × 64 mm concept PCB with illustrative routing and silkscreen.',
  },
  {
    id: 'blank-92',
    name: 'Blank 92 × 64 mm PCB',
    description:
      'The same concept outline and mounting holes, without demo routing or silkscreen. Existing components remain as unconnected visual objects.',
  },
  {
    id: 'compact',
    name: 'Compact prototype PCB',
    description: 'Demo preset · compact wearable and breadboard experiments.',
  },
  {
    id: 'standard',
    name: 'Standard prototype PCB',
    description: 'Demo preset · general-purpose prototyping.',
  },
  {
    id: 'large',
    name: 'Large prototype PCB',
    description: 'Demo preset · multi-module experiments.',
  },
  {
    id: 'double-sided',
    name: 'Double-sided development PCB',
    description: 'Demo preset · two-layer controller experiments.',
  },
  {
    id: 'sensor',
    name: 'Sensor controller PCB',
    description: 'Demo preset · measurement and data logging.',
  },
  {
    id: 'iot',
    name: 'IoT controller PCB',
    description: 'Demo preset · environmental monitoring and connected devices.',
  },
  {
    id: 'robotics',
    name: 'Robotics controller PCB',
    description: 'Demo preset · controller and driver assemblies.',
  },
  {
    id: 'motor',
    name: 'Motor-driver PCB',
    description: 'Demo preset · low-voltage motor control.',
  },
  {
    id: 'power',
    name: 'Power-management PCB',
    description: 'Demo preset · regulator and supply experiments.',
  },
  {
    id: 'display',
    name: 'LED/display PCB',
    description: 'Demo preset · indicators and display control.',
  },
] as const;
export type BoardTemplateId = (typeof boardTemplates)[number]['id'];
export const isBoardTemplate = (id: unknown): id is BoardTemplateId =>
  boardTemplates.some((t) => t.id === id);
