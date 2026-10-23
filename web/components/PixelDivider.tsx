import { useMemo } from "react";

/** Mor zeminden siyaha geçen piksel mozaik ayraç: aşağı indikçe siyah kareler sıklaşır (her çizimde aynı desen). */
function buildCells(cols: number, rows: number): [number, number][] {
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (rnd() < 0.18 + (r / (rows - 1)) * 0.7) cells.push([c, r]);
  return cells;
}

export function PixelDivider({ cols = 48, rows = 6 }: { cols?: number; rows?: number }) {
  const cells = useMemo(() => buildCells(cols, rows), [cols, rows]);
  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" className="block h-16 w-full sm:h-24" aria-hidden shapeRendering="crispEdges">
      {cells.map(([c, r]) => <rect key={`${c}-${r}`} x={c} y={r} width={1.02} height={1.02} fill="#000" />)}
    </svg>
  );
}
