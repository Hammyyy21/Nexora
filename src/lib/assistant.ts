import { useDesignLayout } from '../workspace/layout';
import { useLibraryStore } from '../catalog/store';
import { getPart, comparisonSummary } from '../catalog/catalog';
import { exploreReplacements, navigateWorkspace } from '../catalog/navigation';
import { useFirmwareStore } from '../firmware/store';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
export function runDemoCommand(input: string): string {
  const command = input
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '');
  const s = useWorkspaceStore.getState();
  const firmware = useFirmwareStore.getState();
  const library = useLibraryStore.getState();
  const selected = s.currentProject.components.find((c) => c.id === s.selectedComponentId);
  const part = getPart(library.detailId ?? selected?.catalogId);
  if (command === 'explain this component')
    return part
      ? `Demo Guide · ${part.name}: ${part.description} Use: ${part.useCase} Connections: ${part.interfaces.join(', ') || 'not curated'}. Review: ${part.caution} Source: ${part.productUrl}`
      : selected
        ? `Demo Guide · ${selected.name}: ${selected.description} ${selected.purpose} This is a concept, not a verified electrical design.`
        : 'Demo Guide: select a hardware object or open catalog details first.';
  if (command === 'what is ram')
    return 'Demo Guide · RAM is temporary working memory used while a processor runs. It normally loses its contents when power is removed. DDR memory modules, on-chip SRAM and serial SRAM have different interfaces; they are not interchangeable.';
  if (command === 'show microcontrollers') {
    library.setFilters({
      query: '',
      category: 'processors',
      subcategory: 'Microcontrollers',
      manufacturer: '',
      interface: '',
      insertable: false,
    });
    navigateWorkspace('components');
    return 'Demo Guide · Showing the curated microcontrollers. Visual placement does not establish electrical compatibility.';
  }
  if (command === 'show compatible options') {
    exploreReplacements();
    return 'Demo Guide · Showing supported visual alternatives. No drop-in replacement is verified for this concept board. Open details to inspect each compatibility rule.';
  }
  if (command === 'compare these processors') {
    if (library.compareIds.length < 2)
      return 'Demo Guide · Select two or three processors from the same subcategory using Compare in the library.';
    navigateWorkspace('components');
    useLibraryStore.setState({ compareOpen: true, detailId: null });
    return `Demo Guide · ${comparisonSummary(library.compareIds.map((id) => getPart(id)!))}`;
  }
  if (command === 'focus on selected hardware') {
    if (!selected) return 'Demo Guide · Select a project object first.';
    if (!selected.visible) s.editComponent(selected.id, { visible: true });
    navigateWorkspace('design');
    s.requestCamera('focus');
    return `Demo Guide · Focusing ${selected.name}.`;
  }
  if (command === 'view related code') {
    if (selected && !['mcu', 'sensor', 'mosfet', 'fan'].includes(selected.id))
      return 'Demo Guide · No firmware module is associated with this visual object. The project C source is available through Code.';
    navigateWorkspace('code');
    return 'Demo Guide · Project demonstration firmware opened. No new driver or compiled output was generated.';
  }
  if (/^(open|show) (the )?firmware( explorer)?$/.test(command)) {
    navigateWorkspace('code');
    firmware.setOpen(true);
    return 'Firmware Explorer opened. This is locally editable demonstration firmware with a recorded Cortex-M3 build.';
  }
  if (/^close (the )?firmware( explorer)?$/.test(command)) {
    firmware.setOpen(false);
    if (useDesignLayout.getState().panel === 'code') useDesignLayout.getState().setCollapsed(true);
    return 'Firmware Explorer collapsed. Your source edits and active tab are retained.';
  }
  if (/^show (c code|assembly|machine code)$/.test(command)) {
    navigateWorkspace('code');
    firmware.setTab(
      command === 'show c code' ? 'c' : command === 'show assembly' ? 'assembly' : 'machine',
    );
    if (!['mcu', 'sensor', 'mosfet', 'fan'].includes(s.selectedComponentId ?? 'mcu'))
      s.selectComponent(null);
    return 'Firmware view opened. Assembly and machine code are recorded demo artifacts; editing C does not recompile them.';
  }
  if (/^show (the )?microcontroller firmware$/.test(command)) {
    const mcu = s.currentProject.components.find((c) => c.id === 'mcu');
    if (mcu) {
      if (!mcu.visible) s.editComponent('mcu', { visible: true });
      s.selectComponent('mcu');
      navigateWorkspace('code');
      firmware.setTab('c');
      return 'Microcontroller selected and focused. The recorded Cortex-M3 demo and hardware validity status are open.';
    }
    return 'No microcontroller firmware is available for this project.';
  }
  if (
    /(generate|optimi[sz]e|compile|build|flash)/.test(command) &&
    /(firmware|code|motherboard)/.test(command)
  ) {
    return 'Live AI firmware generation and target-specific compilation are planned for a later phase. The local C editor preserves your edits, but cannot compile or flash them.';
  }
  if (/^(show |switch to |enter )?(exploded( view)?)( mode)?$/.test(command)) {
    navigateWorkspace('design');
    s.setViewMode('exploded');
    return 'Exploded view enabled. Components are separated into assembly layers; their original positions are preserved.';
  }
  if (/^(show |switch to |enter )?x-?ray( mode| view)?$/.test(command)) {
    navigateWorkspace('design');
    s.setViewMode('xray');
    return 'X-ray enabled. The housing and packages are translucent so you can inspect the internal geometry.';
  }
  if (/^(show |switch to |enter )?(assembly|connections)( mode| view)?$/.test(command)) {
    navigateWorkspace('design');
    s.setViewMode(command.includes('connections') ? 'connections' : 'assembly');
    return command.includes('connections')
      ? 'Showing illustrative connection paths. These animations are not an electrical simulation.'
      : 'Assembly restored to its original component positions.';
  }
  if (/^(show|unhide) all components$/.test(command)) {
    s.showAll();
    return `All ${s.currentProject.components.length} components are now visible.`;
  }
  if (/^(reset camera|fit (the )?model)$/.test(command)) {
    s.requestCamera('fit');
    return 'Camera fitted to the complete model.';
  }
  const match = command.match(/^(focus on|highlight|select) (the )?(.+)$/);
  if (match) {
    const target = match[3];
    const roleId = (
      {
        microcontroller: 'mcu',
        'temperature sensor': 'sensor',
        mosfet: 'mosfet',
        fan: 'fan',
      } as Record<string, string>
    )[target];
    const c = s.currentProject.components.find(
      (c) =>
        c.id === roleId ||
        c.name.toLowerCase() === target ||
        c.id === target ||
        c.reference.toLowerCase() === target,
    );
    if (c) {
      if (!c.visible) s.editComponent(c.id, { visible: true });
      navigateWorkspace('design');
      s.selectComponent(c.id);
      return `${c.name} selected and focused. Its properties are available in the inspector.`;
    }
  }
  return 'This local Demo Assistant supports viewing and inspection commands only. Try “Show exploded view”, “Focus on the microcontroller”, or “Reset camera”. Design generation, electrical calculations, and live firmware generation require a future AI integration.';
}
