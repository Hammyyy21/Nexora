import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { HardwareScene } from '../src/three/HardwareScene';
import { useDesignLayout as layout } from '../src/workspace/layout';
import { useLibraryStore as library } from '../src/catalog/store';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ frameloop }: { frameloop: string }) => (
    <canvas aria-label="Scene canvas" data-frameloop={frameloop} />
  ),
}));
beforeEach(() => {
  layout.setState(layout.getInitialState(), true);
  library.setState(library.getInitialState(), true);
});
it('keeps the hardware renderer live for every tool tab, focus mode and collapse', () => {
  render(<HardwareScene />);
  const canvas = screen.getByLabelText('Scene canvas');
  for (const panel of ['explorer', 'workspace', 'inspector', 'code', 'ai'] as const) {
    act(() => {
      layout.getState().setFocusMode(true);
      layout.getState().setPanel(panel);
    });
    expect(canvas).toHaveAttribute('data-frameloop', 'always');
    expect(screen.getByLabelText('Scene canvas')).toBe(canvas);
  }
  act(() => layout.getState().setCollapsed(true));
  expect(canvas).toHaveAttribute('data-frameloop', 'always');
  act(() => library.getState().navigate('components'));
  expect(canvas).toHaveAttribute('data-frameloop', 'never');
  act(() => library.getState().navigate('design'));
  expect(canvas).toHaveAttribute('data-frameloop', 'always');
  expect(screen.getByLabelText('Scene canvas')).toBe(canvas);
});
