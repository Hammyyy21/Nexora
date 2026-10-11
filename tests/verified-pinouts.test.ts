import { describe, expect, it } from 'vitest';
import { createInstance } from '../src/catalog/instances';
import { getPart } from '../src/catalog/catalog';
import { logicalPorts, validateConnection } from '../src/schematic/model';
import { reviewPhysicalConnections } from '../src/engineering/physicalValidation';
import { reviewElectrical } from '../src/engineering/electrical';
import { createProject } from '../src/projects/templates';
import { parseProject, serializeProject } from '../src/lib/project';
import type { Project, SchematicConnection } from '../src/types/workspace';

const component = (catalogId: string, id: string) => ({ ...createInstance(getPart(catalogId)!, id), id, reference: id.toUpperCase() });
const wire = (id: string, a: string, ap: string, b: string, bp: string): SchematicConnection => ({
  id, from: { componentId: a, portId: ap }, to: { componentId: b, portId: bp },
});
const projectWith = (...ids: string[]): Project => {
  const p = createProject('Pin validation', 'blank');
  p.components.push(...ids.map((id) => component(id, `part-${id}`)));
  return p;
};

describe('manufacturer-specific physical-pin validation', () => {
  it('provides sourced, package-specific manufacturer pin records', () => {
    const expected = [
      ['pico', 'GP0', '1'], ['tmp102', 'SDA', '6'], ['irlz44n', 'GATE', '1'],
    ];
    for (const [partId, pinId, number] of expected) {
      const part = getPart(partId)!;
      expect(part.physicalPinout?.source).toMatch(/^https:\/\//);
      expect(part.physicalPinout?.pins).toContainEqual(expect.objectContaining({ id: pinId, number }));
    }
    expect(getPart('eeprom24lc')?.physicalPinout).toBeUndefined(); // No unselected-package pin assignment.
  });
  it('preserves existing symbolic IDs without pretending they map to package pins', () => {
    const pico = component('pico', 'part-controller');
    const ports = logicalPorts(pico);
    expect(ports).toContainEqual(expect.objectContaining({ id: 'pin:GP0', verification: 'physical', number: '1' }));
    expect(ports).toContainEqual(expect.objectContaining({ id: 'IO-A', verification: 'logical' }));
    expect(ports.find((p) => p.id === 'IO-A')?.number).toBeUndefined();
    const temp = component('tmp102', 'part-temp');
    expect(logicalPorts(temp).find((p) => p.id === 'pin:SDA')?.number).toBe('6');
    expect(logicalPorts(temp).find((p) => p.id === 'DATA')?.verification).toBe('logical');
  });
  it('accepts documented physical endpoints and persists connections', () => {
    const project = projectWith('pico', 'tmp102');
    const a = { componentId: 'part-pico', portId: 'pin:GP0' };
    const b = { componentId: 'part-tmp102', portId: 'pin:SDA' };
    expect(validateConnection(project, a, b)).toBeNull();
    project.connections = [wire('wire-physical-persistence', 'part-pico', 'pin:GP0', 'part-tmp102', 'pin:SDA')];
    expect(parseProject(serializeProject(project)).connections).toEqual(project.connections);
  });
  it('rejects malformed wire identifiers on import without discarding valid physical endpoints', () => {
    const project = projectWith('pico', 'tmp102');
    project.connections = [wire('wire1', 'part-pico', 'pin:GP0', 'part-tmp102', 'pin:SDA')];
    expect(() => parseProject(serializeProject(project))).toThrow('Project contains invalid or dangling schematic wires.');
  });
  it('passes only a documented matching I2C signal function', () => {
    const p = projectWith('pico', 'tmp102');
    p.connections = [wire('sda', 'part-pico', 'pin:GP0', 'part-tmp102', 'pin:SDA')];
    expect(reviewPhysicalConnections(p).some((f) => f.status === 'pass' && f.id.startsWith('bus-lane-match:'))).toBe(true);
    expect(reviewElectrical(p).some((f) => f.id === 'unverified-pinout')).toBe(true);
  });
  it('fails a documented SDA-to-SCL mismatch', () => {
    const p = projectWith('pico', 'tmp102');
    p.connections = [wire('cross', 'part-pico', 'pin:GP0', 'part-tmp102', 'pin:SCL')];
    expect(reviewPhysicalConnections(p).some((f) => f.id.startsWith('bus-lane-mismatch:') && f.status === 'fail')).toBe(true);
  });
  it('passes compatible nominal supply voltage without certifying current or protection', () => {
    const p = projectWith('pico', 'tmp102');
    p.connections = [wire('power', 'part-pico', 'pin:3V3_OUT', 'part-tmp102', 'pin:V+')];
    const result = reviewPhysicalConnections(p).find((f) => f.id.startsWith('physical-supply:'));
    expect(result?.status).toBe('pass');
    expect(result?.details).toContain('not current');
  });
  it('detects a verified power-to-ground schematic short', () => {
    const p = projectWith('pico', 'tmp102');
    p.connections = [wire('short', 'part-pico', 'pin:3V3_OUT', 'part-tmp102', 'pin:GND')];
    expect(reviewPhysicalConnections(p).some((f) => f.id.startsWith('physical-ground-short:') && f.status === 'fail')).toBe(true);
  });
  it('marks mixed physical-and-concept wiring as unknown instead of mapping it automatically', () => {
    const p = projectWith('pico', 'tmp102');
    p.connections = [wire('legacy', 'part-pico', 'pin:GP0', 'part-tmp102', 'DATA')];
    const finding = reviewPhysicalConnections(p).find((f) => f.id.startsWith('mixed-net:'));
    expect(finding?.status).toBe('unknown');
    expect(finding?.remedy).toContain('documented physical pins');
  });
});
