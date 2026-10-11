import { boardVisualSize } from '../workspace/boardSpecifications';
import type { CatalogPart } from './types';
import { BoxPart, CylinderPart, PrintedText } from '../three/Primitives';
export function CatalogModel({ part }: { part: CatalogPart }) {
  const [w, h, d] = boardVisualSize(part.id, part.visualSize);
  const board = ['board', 'memory', 'drive'].includes(part.model);
  return (
    <group>
      <BoxPart size={[w, h, d]} />
      {board && (
        <>
          <BoxPart
            size={[w * 0.27, 0.16, d * 0.45]}
            position={[-w * 0.15, h / 2 + 0.08, 0]}
            color="#18202d"
          />
          <BoxPart
            size={[w * 0.2, 0.12, d * 0.3]}
            position={[w * 0.25, h / 2 + 0.06, 0]}
            color="#202936"
          />
          {Array.from({ length: 8 }, (_, i) => (
            <BoxPart
              key={i}
              size={[w / 18, 0.05, 0.22]}
              position={[-w * 0.42 + i * w * 0.12, h / 2 + 0.025, d * 0.46]}
              color="#c2aa67"
              metal
            />
          ))}
        </>
      )}
      {!board &&
        part.model !== 'fan' &&
        part.model !== 'display' &&
        [-1, 1].flatMap((side) =>
          Array.from({ length: 5 }, (_, i) => (
            <BoxPart
              key={`${side}-${i}`}
              size={[0.2, 0.06, d / 10]}
              position={[side * (w / 2 + 0.07), -0.02, -d * 0.35 + i * d * 0.175]}
              color="#a8b7c6"
              metal
            />
          )),
        )}
      {part.model === 'fan' && (
        <>
          <CylinderPart
            radius={w * 0.37}
            height={0.08}
            position={[0, h / 2 + 0.05, 0]}
            color="#111b29"
          />
          <CylinderPart
            radius={w * 0.12}
            height={0.12}
            position={[0, h / 2 + 0.12, 0]}
            color="#8598ac"
            metal
          />
          {Array.from({ length: 7 }, (_, i) => (
            <group key={i} rotation={[0, (i * Math.PI * 2) / 7, 0]}>
              <BoxPart
                size={[w * 0.28, 0.04, 0.2]}
                position={[w * 0.2, h / 2 + 0.12, 0]}
                color="#667d95"
              />
            </group>
          ))}
        </>
      )}
      {part.model === 'display' && (
        <BoxPart size={[w * 0.9, 0.02, d * 0.86]} position={[0, h / 2 + 0.02, 0]} color="#184b6b" />
      )}
      <PrintedText
        text={part.manufacturer.slice(0, 14)}
        position={[0, h / 2 + 0.19, -d * 0.25]}
        width={w * 0.7}
        color="#c6d6e8"
      />
    </group>
  );
}
