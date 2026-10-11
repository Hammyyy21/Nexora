import { getPart } from '../catalog/catalog';
import type { HardwareComponent } from '../types/workspace';

/** Explicit teaching model. These terminals are NOT manufacturer pin assignments. */
export interface DemoPin {
  id: string;
  kind: 'power' | 'ground' | 'signal';
  protocol?: 'GPIO' | 'I2C' | 'SPI' | 'UART' | 'PWM';
  signal?: string;
  direction?: 'input' | 'output' | 'bidirectional';
}
const signal = (
  protocol: DemoPin['protocol'],
  name: string,
  direction: DemoPin['direction'],
): DemoPin => ({ id: `demo:${name}`, kind: 'signal', protocol, signal: name, direction });
export function demoPins(c: HardwareComponent): DemoPin[] {
  const controller = c.type === 'microcontroller' || Boolean(getPart(c.catalogId)?.architecture);
  if (controller)
    return [
      { id: 'demo:VDD', kind: 'power' },
      { id: 'demo:GND', kind: 'ground' },
      signal('I2C', 'SDA', 'bidirectional'),
      signal('I2C', 'SCL', 'output'),
      signal('SPI', 'MOSI', 'output'),
      signal('SPI', 'MISO', 'input'),
      signal('SPI', 'SCK', 'output'),
      signal('UART', 'TX', 'output'),
      signal('UART', 'RX', 'input'),
      signal('GPIO', 'GPIO', 'output'),
      signal('PWM', 'PWM', 'output'),
    ];
  if (c.type === 'sensor')
    return [
      { id: 'demo:VDD', kind: 'power' },
      { id: 'demo:GND', kind: 'ground' },
      signal('I2C', 'SDA', 'bidirectional'),
      signal('I2C', 'SCL', 'input'),
    ];
  if (c.catalogId === 'drv8833' || c.type === 'mosfet')
    return [
      { id: 'demo:VDD', kind: 'power' },
      { id: 'demo:GND', kind: 'ground' },
      signal('PWM', 'PWM', 'input'),
      signal('GPIO', 'GPIO', 'input'),
    ];
  return [];
}
