'use client';

import { useRef } from 'react';
import { RestaurantTable } from '@/types/table';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  free: 'bg-muted border-border',
  occupied: 'bg-orange-200 border-orange-500 dark:bg-orange-950 dark:border-orange-700',
  reserved: 'bg-violet-200 border-violet-500 dark:bg-violet-950 dark:border-violet-700',
  bill_requested: 'bg-sky-200 border-sky-500 dark:bg-sky-950 dark:border-sky-700',
};

const DRAG_THRESHOLD_PX = 3;

/**
 * Draggable tile na tlocrtu (Visual Floor Plan Editor, modul E.2). Cist
 * pointer-events pristup bez eksternih drag-and-drop biblioteka - dovoljno
 * za slobodno pozicioniranje stolova po jednostavnom canvas-u.
 *
 * `scale` - platno se na uzim ekranima skalira CSS transformom (vidi
 * tables/page.tsx) da tlocrt ostane upotrebljiv na mobitelu/tabletu bez
 * horizontalnog skrolovanja - pointer delta se mora podijeliti sa istim
 * faktorom, inace prevlacenje "bježi" brže/sporije od stvarnog pokazivača.
 */
export default function TableNode({
  table,
  selected,
  scale,
  onDragEnd,
  onClick,
}: {
  table: RestaurantTable;
  selected: boolean;
  scale: number;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: table.posX, origY: table.posY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !ref.current) return;
    const dx = (e.clientX - drag.current.startX) / scale;
    const dy = (e.clientY - drag.current.startY) / scale;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.current.moved = true;
    ref.current.style.left = `${Math.max(0, drag.current.origX + dx)}px`;
    ref.current.style.top = `${Math.max(0, drag.current.origY + dy)}px`;
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.startX) / scale;
    const dy = (e.clientY - drag.current.startY) / scale;
    const moved = drag.current.moved;
    const newX = Math.max(0, Math.round(drag.current.origX + dx));
    const newY = Math.max(0, Math.round(drag.current.origY + dy));
    drag.current = null;
    if (moved) onDragEnd(table.id, newX, newY);
    else onClick(table.id);
  }

  return (
    <div
      ref={ref}
      style={{ left: table.posX, top: table.posY }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        'absolute flex h-20 w-20 cursor-grab touch-none select-none flex-col items-center justify-center rounded-xl border-2 shadow-sm active:cursor-grabbing',
        STATUS_COLOR[table.status] ?? STATUS_COLOR.free,
        selected && 'ring-2 ring-primary ring-offset-2',
      )}
    >
      <span className="text-lg font-bold">{table.tableNumber}</span>
      <span className="text-[10px] text-muted-foreground">{table.capacity} os.</span>
    </div>
  );
}
