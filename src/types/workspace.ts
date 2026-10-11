import type { BoardConfiguration } from '../workspace/boardSpecifications';
export type Vec3 = [number, number, number];
export type ViewMode = 'assembly' | 'exploded' | 'xray' | 'connections';
export type CameraView = 'isometric' | 'top' | 'front' | 'focus' | 'fit';
export type Tool = 'select' | 'orbit' | 'pan';
export type ComponentType =
  | 'catalog'
  | 'board'
  | 'microcontroller'
  | 'sensor'
  | 'mosfet'
  | 'fan'
  | 'usb'
  | 'terminal'
  | 'header'
  | 'resistor'
  | 'capacitor'
  | 'housing';
export interface HardwareComponent {
  id: string;
  catalogId?: string;
  fixed?: boolean;
  integration?: 'visual-only';
  initialPosition?: Vec3;
  name: string;
  reference: string;
  type: ComponentType;
  group: 'structure' | 'active' | 'connectors' | 'passives';
  description: string;
  purpose: string;
  connectionNotes: string;
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  color: string;
  material: 'matte' | 'metal' | 'polymer';
  opacity: number;
  visible: boolean;
  explodedOffset: Vec3;
}
export interface SchematicEndpoint {
  componentId: string;
  portId: string;
}
export interface SchematicConnection {
  id: string;
  from: SchematicEndpoint;
  to: SchematicEndpoint;
}
export interface EngineeringInput {
  provenance: 'demo' | 'configured';
  currentMa?: number;
  voltage?: number;
  dissipationW?: number;
  thermalResistance?: number;
  ambientC?: number;
  maxTemperatureC?: number;
}
export interface Project {
  engineeringInputs?: Record<string, EngineeringInput>;
  firmwareSource?: string;
  /** Conceptual pin-to-pin netlist, not a verified physical layout or routed PCB. */
  connections?: SchematicConnection[];
  placementMode?: 'free' | 'board';
  boardConfiguration?: BoardConfiguration;
  boardConfigurations?: Partial<
    Record<import('../workspace/boardTemplates').BoardTemplateId, BoardConfiguration>
  >;
  boardTemplateId?: import('../workspace/boardTemplates').BoardTemplateId;
  schemaVersion: 1 | 2;
  selectedComponentId?: string | null;
  firmwareTargetId?: string;
  id: string;
  name: string;
  components: HardwareComponent[];
}
export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}
