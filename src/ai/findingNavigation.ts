import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useDesignLayout } from '../workspace/layout';
import { navigateWorkspace } from '../catalog/navigation';
import { useFirmwareStore } from '../firmware/store';
import { workspaceNets, type EntityRef } from './snapshot';
import { endpointKey } from '../schematic/model';
export function navigateFinding(entity: EntityRef): boolean {
  const s = useWorkspaceStore.getState(),
    p = s.currentProject;
  if (entity.kind === 'component') {
    if (!p.components.some((c) => c.id === entity.id)) return false;
    s.selectComponent(entity.id);
    navigateWorkspace('design');
    useDesignLayout.getState().setPanel('inspector');
  } else if (entity.kind === 'net') {
    const net = workspaceNets(p).find((n) => n.id === entity.id);
    if (!net) return false;
    // Resolve from typed project connections, not a colon-delimited net key.
    // Physical pin IDs contain colons and should never require string parsing.
    const endpoint = (p.connections ?? [])
      .flatMap((wire) => [wire.from, wire.to])
      .find((point) => net.terminals.includes(endpointKey(point)) &&
        p.components.some((component) => component.id === point.componentId));
    if (!endpoint) return false;
    s.selectComponent(endpoint.componentId);
    navigateWorkspace('schematic');
  } else if (entity.kind === 'region') {
    if (
      ![
        ...(p.boardConfiguration?.mountingHoles ?? []),
        ...(p.boardConfiguration?.restrictedRegions ?? []),
      ].some((r) => r.id === entity.id)
    )
      return false;
    s.selectComponent('pcb');
    navigateWorkspace('design');
    useDesignLayout.getState().setPanel('inspector');
  } else {
    if (entity.id !== 'cooling') return false;
    const target = p.firmwareTargetId ?? (p.components.some((c) => c.id === 'mcu') ? 'mcu' : null);
    s.selectComponent(target);
    useFirmwareStore.getState().setTab('c');
    navigateWorkspace('code');
  }
  useWorkspaceStore.setState({ selectedEntity: entity });
  return true;
}
