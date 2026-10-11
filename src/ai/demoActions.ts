import { getPart } from '../catalog/catalog';
import type { Project } from '../types/workspace';
import type { AIAction } from './actions';

/** Offline command examples use the same validator and approval flow as live AI. */
export function demoActions(text: string, project: Project): AIAction[] | null {
  const q = text.toLowerCase();
  const controllers = project.components.filter(
    (c) => c.type === 'microcontroller' || getPart(c.catalogId)?.architecture,
  );
  const controller =
    controllers.find((c) => c.id === project.selectedComponentId) ?? controllers[0];
  if (/create.*iot.*project/.test(q))
    return [
      { type: 'create_project', template_id: 'iot', project_name: 'IoT Environmental Monitor' },
    ];
  if (/^add (a |an |the )?(temperature )?sensor[.!]?$/.test(q))
    return [{ type: 'add_component', catalog_id: 'tmp102' }];
  if (/^add (a |the )?(cooling )?fan[.!]?$/.test(q))
    return [{ type: 'add_component', catalog_id: 'pi-cooler' }];
  if (/^remove (the )?(cooling )?fan[.!]?$/.test(q)) {
    const fan = project.components.find((c) => c.type === 'fan' || c.catalogId === 'pi-cooler');
    if (!fan) throw new Error('No cooling fan exists in this project.');
    return [{ type: 'remove_component', component_id: fan.id }];
  }
  if (/^move the controller/.test(q)) {
    const coordinates = ['x', 'y', 'z'].map((axis) =>
      Number(q.match(new RegExp(`${axis}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`))?.[1]),
    );
    if (!controller || coordinates.some((n) => !Number.isFinite(n)))
      throw new Error('Choose a controller and specify X, Y and Z in mm.');
    return [
      {
        type: 'move_component',
        component_id: controller.id,
        position: coordinates.map((n) => n / 10) as [number, number, number],
      },
    ];
  }
  if (/^connect .*sensor.*controller/.test(q)) {
    const sensor = project.components.find((c) => c.type === 'sensor');
    if (!sensor || !controller) throw new Error('Add a sensor and controller first.');
    const actions: AIAction[] = ['SDA', 'SCL', 'VDD', 'GND']
      .filter(
        (pin) =>
          !(project.connections ?? []).some(
            (w) =>
              [w.from, w.to].some(
                (e) => e.componentId === sensor.id && e.portId === `demo:${pin}`,
              ) &&
              [w.from, w.to].some(
                (e) => e.componentId === controller.id && e.portId === `demo:${pin}`,
              ),
          ),
      )
      .map((pin) => ({
        type: 'connect_components',
        component_id: sensor.id,
        port_id: `demo:${pin}`,
        target_component_id: controller.id,
        target_port_id: `demo:${pin}`,
      }));
    if (!actions.length)
      throw new Error('The four demonstration connections are already recorded.');
    return actions;
  }
  if (/check .*circuit|check .*problems/.test(q)) return [{ type: 'review_project' }];
  if (/suggest .*position/.test(q)) return [{ type: 'suggest_placements' }];
  if (/specifications.*board/.test(q))
    return [{ type: 'show_specifications', component_id: 'pcb' }];
  if (/generate .*firmware/.test(q)) {
    if (!controller) throw new Error('Add or select a supported controller first.');
    return [
      {
        type: 'generate_firmware',
        component_id: controller.id,
        source: `// Demo starter C for ${controller.name}\n// Board SDK, clocks, real pin assignments and device drivers must be supplied.\n// No hardware access or compilation has been performed.\n\nstatic void sample_inputs(void) { /* TODO: configure and read sensor */ }\nstatic void update_outputs(void) { /* TODO: implement driver control */ }\n\nint main(void) {\n  /* TODO: initialize the target SDK and peripherals */\n  for (;;) {\n    sample_inputs();\n    update_outputs();\n  }\n}\n`,
      },
    ];
  }
  return null;
}
