import { saveWorkspaceWithPlan } from '../ai/planner/state';
import { useLibraryStore } from '../catalog/store';
import { useEffect } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[contenteditable="true"],.firmware-panel,.tools-panel,.position-transform',
        )
      )
        return;
      if (
        useLibraryStore.getState().workspace === 'components' ||
        target.closest('dialog,.placement-controls')
      )
        return;
      const s = useWorkspaceStore.getState();
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (key === 's') {
          e.preventDefault();
          saveWorkspaceWithPlan();
        }
        return;
      }
      if (e.altKey) return;
      if (key === 'escape') {
        s.selectComponent(null);
        if (s.settingsOpen) s.toggle('settingsOpen');
      }
      if (s.settingsOpen) return;
      switch (key) {
        case 'v':
          s.setTool('select');
          break;
        case 'o':
          s.setTool('orbit');
          break;
        case 'h':
          s.setTool('pan');
          break;
        case 'f':
          if (target.closest('.viewport')) {
            e.preventDefault();
            s.requestCamera('fit');
          }
          break;
        case '0':
          s.requestCamera('isometric');
          break;
        case 'g':
          s.toggle('gridVisible');
          break;
        case 'l':
          s.toggle('labelsVisible');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
