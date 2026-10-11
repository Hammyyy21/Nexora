import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentPreview } from '../src/catalog/ComponentPreview';
import { getPart } from '../src/catalog/catalog';

const renderer = vi.hoisted(() => ({ fails: false, mounts: 0 }));
vi.mock('@react-three/fiber', () => ({
  Canvas: (props: { 'aria-label': string; frameloop: string }) => {
    if (renderer.fails) throw new Error('Simulated renderer initialization failure');
    renderer.mounts++;
    return <div role="img" aria-label={props['aria-label']} data-frameloop={props.frameloop} />;
  },
}));
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }));
beforeEach(() => {
  renderer.fails = false;
  renderer.mounts = 0;
});

it('loads an on-demand preview and lets users reset the camera framing', async () => {
  render(<ComponentPreview part={getPart('rp2040')!} />);
  expect(screen.getByRole('img', { name: '3D preview of RP2040' })).toHaveAttribute(
    'data-frameloop',
    'demand',
  );
  expect(screen.getByText(/Generic visualization · not to scale/)).toBeVisible();
  const before = renderer.mounts;
  await userEvent.click(screen.getByRole('button', { name: 'Reset / fit preview' }));
  expect(renderer.mounts).toBeGreaterThan(before);
});

it('isolates renderer failure and allows retry without losing part information', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  renderer.fails = true;
  render(<ComponentPreview part={getPart('rp2040')!} />);
  expect(screen.getByRole('status')).toHaveTextContent('3D preview unavailable');
  renderer.fails = false;
  await userEvent.click(screen.getByRole('button', { name: 'Reset / fit preview' }));
  expect(screen.getByRole('img', { name: '3D preview of RP2040' })).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  log.mockRestore();
});
