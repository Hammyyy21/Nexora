#!/usr/bin/env python3
"""Targeted, backup-first responsive schematic layout fix for Nexora.

Edits the files in the local working tree so newer app changes aren't replaced
by a stale copy of SchematicWorkspace.tsx. Requires recognizable layout anchors;
refuses to change files if the actual implementation has diverged.
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TSX = ROOT / 'src/schematic/SchematicWorkspace.tsx'
CSS = ROOT / 'src/schematic/schematic.css'

class LayoutError(Exception):
    pass


def once(s: str, old: str, new: str, description: str) -> str:
    n = s.count(old)
    if n != 1:
        raise LayoutError(f"Expected one {description} anchor, found {n}. No files changed. Please upload the current src/schematic files.")
    return s.replace(old, new, 1)


def sub_once(s: str, pattern: str, repl: str, description: str) -> str:
    result, n = re.subn(pattern, lambda m: repl, s, count=1, flags=re.MULTILINE | re.DOTALL)
    if n != 1:
        raise LayoutError(f"Could not find {description}. No files changed. Please upload the current src/schematic files.")
    return result


def main() -> int:
    if not TSX.is_file() or not CSS.is_file():
        raise LayoutError(f"Nexora source not found at {ROOT}. Install script inside Nexora/tools/.")
    tsx = TSX.read_text()
    css = CSS.read_text()
    if 'Responsive schematic canvas layout' in tsx:
        print('Schematic responsive layout already installed; no changes needed.')
        return 0

    tsx = once(
        tsx,
        "import { useEffect, useMemo, useState } from 'react';",
        "import { useEffect, useMemo, useRef, useState } from 'react';",
        'React hooks import',
    )

    # This helper is used both for diagram symbols and wire endpoints. Move it
    # into the component so it shares the same responsive X coordinates.
    tsx = sub_once(
        tsx,
        r"const portXY = \(index: number, portIndex: number\) => \{\n.*?\n\};\n(?=export function SchematicWorkspace\(\))",
        '',
        'schematic terminal coordinate helper',
    )

    tsx = once(
        tsx,
        "  const [zoom, setZoom] = useState(100);",
        "  const [zoom, setZoom] = useState(100);\n"
        "  const sheetRef = useRef<HTMLDivElement>(null);\n"
        "  const [sheetWidth, setSheetWidth] = useState(0);\n"
        "  // Responsive schematic canvas layout. Measure its real available width, not the window.\n"
        "  useEffect(() => {\n"
        "    const node = sheetRef.current;\n"
        "    if (!node) return;\n"
        "    const measure = () => {\n"
        "      const nextWidth = node.clientWidth;\n"
        "      setSheetWidth((previous) => Math.abs(previous - nextWidth) > 1 ? nextWidth : previous);\n"
        "    };\n"
        "    measure();\n"
        "    if (typeof ResizeObserver !== 'undefined') {\n"
        "      const observer = new ResizeObserver(measure);\n"
        "      observer.observe(node);\n"
        "      return () => observer.disconnect();\n"
        "    }\n"
        "    window.addEventListener('resize', measure);\n"
        "    return () => window.removeEventListener('resize', measure);\n"
        "  }, []);",
        'schematic zoom state',
    )

    # Leave the existing card height and vertical step unchanged. Several
    # versions calculate those differently depending on the physical pin count.
    tsx = sub_once(
        tsx,
        r"  const width = Math\.max\(450, offset\.x \* 2 \+ \(columns - 1\) \* X_STEP \+ BOX_WIDTH\);",
        "  const naturalWidth = Math.max(450, offset.x * 2 + (columns - 1) * X_STEP + BOX_WIDTH);\n"
        "  const width = Math.max(naturalWidth, sheetWidth > 0 ? sheetWidth - 2 : 0);\n"
        "  // Spread large drawings across their pane; cap the gap so symbols remain related.\n"
        "  const stepX = columns > 1\n"
        "    ? Math.min(540, Math.max(X_STEP, (width - 2 * offset.x - BOX_WIDTH) / (columns - 1)))\n"
        "    : X_STEP;\n"
        "  const symbolX = (index: number) => {\n"
        "    const row = Math.floor(index / COLS);\n"
        "    const countOnRow = Math.min(COLS, symbols.length - row * COLS);\n"
        "    const rowWidth = BOX_WIDTH + Math.max(0, countOnRow - 1) * stepX;\n"
        "    return Math.max(offset.x, (width - rowWidth) / 2) + (index % COLS) * stepX;\n"
        "  };\n"
        "  const portXY = (index: number, portIndex: number) => {\n"
        "    const left = portIndex % 2 === 0;\n"
        "    return {\n"
        "      x: symbolX(index) + (left ? 0 : BOX_WIDTH),\n"
        "      y: offset.y + Math.floor(index / COLS) * Y_STEP + 60 + Math.floor(portIndex / 2) * 29,\n"
        "    };\n"
        "  };",
        'computed schematic SVG width',
    )

    tsx = once(
        tsx,
        '        <div className="schematic-sheet" aria-label="Schematic drawing" tabIndex={0}>',
        '        <div ref={sheetRef} className="schematic-sheet" aria-label="Schematic drawing" tabIndex={0}>',
        'schematic drawing container',
    )
    tsx = once(
        tsx,
        '                const x = offset.x + (index % COLS) * X_STEP;',
        '                const x = symbolX(index);',
        'schematic symbol horizontal position',
    )
    if '.schematic-sheet svg{display:block;max-width:none}' not in css:
        raise LayoutError('Schematic SVG style has changed. No files changed. Please upload the latest styles.')
    css = once(
        css,
        '.schematic-sheet{background:#0e1928;overflow:auto;',
        '.schematic-sheet{background-color:#0e1928;background-image:radial-gradient(circle,#30425b 0.9px,transparent 1px);background-size:20px 20px;overflow:auto;',
        'full-width schematic dotted canvas',
    )
    css = once(
        css,
        '.schematic-sheet svg{display:block;max-width:none}',
        '.schematic-sheet svg{display:block;max-width:none;margin-inline:auto}',
        'schematic SVG alignment rule',
    )
    css = once(
        css,
        '.schematic-net-panel{flex:0 0 270px;',
        '.schematic-net-panel{flex:0 0 clamp(270px,18vw,330px);box-sizing:border-box;min-width:0;',
        'connection sidebar width',
    )

    # All anchors verified. Write source backups before touching either file.
    for file in (TSX, CSS):
        backup = file.with_name(file.name + '.before-responsive-layout.bak')
        if not backup.exists():
            shutil.copy2(file, backup)
    TSX.write_text(tsx)
    CSS.write_text(css)
    print('Applied responsive schematic layout. Original TSX/CSS files backed up.')
    print('Schematic cards will spread/center inside the available pane; wire endpoints track the same positions.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except LayoutError as exc:
        print('Layout patch stopped safely:', exc, file=sys.stderr)
        sys.exit(1)
