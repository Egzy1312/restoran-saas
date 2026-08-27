'use client';

import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RestaurantTable } from '@/types/table';

export type ComputedStatus = 'free' | 'reserved' | 'waiting_food' | 'served' | 'bill_requested';

const STATUS_STYLES: Record<ComputedStatus, { classes: string; label: string }> = {
  free: { classes: 'bg-secondary text-secondary-foreground', label: 'Slobodan' },
  reserved: { classes: 'bg-violet-200 text-violet-900', label: 'Rezervisan' },
  waiting_food: { classes: 'bg-warning text-warning-foreground', label: 'Čeka hranu' },
  served: { classes: 'bg-success text-success-foreground', label: 'Poslužen' },
  bill_requested: { classes: 'bg-sky-300 text-sky-950', label: 'Traži račun' },
};

export default function TableTile({
  table,
  status,
  isCalling,
  onClick,
}: {
  table: RestaurantTable;
  status: ComputedStatus;
  isCalling: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLES[status];

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-4 shadow-sm transition-transform active:scale-95',
        isCalling ? 'animate-blink-red text-destructive-foreground' : style.classes,
      )}
    >
      {isCalling && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-destructive">
          <Bell className="h-3 w-3" />
        </span>
      )}
      <span className="text-2xl font-bold">{table.tableNumber}</span>
      <span className="text-xs opacity-80">{table.capacity} os.</span>
      <span className="text-xs font-medium">{isCalling ? 'Zove konobara' : style.label}</span>
    </button>
  );
}
