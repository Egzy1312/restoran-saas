'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { createTable, fetchRestaurant, fetchTables, updateTable } from '@/lib/api';
import { RestaurantTable } from '@/types/table';
import AppShell from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import TableNode from './table-node';
import NewTableForm from './new-table-form';
import TablePanel from './table-panel';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;

export default function TablesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string>('');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    reload(token);
    fetchRestaurant(token).then((r) => setRestaurantSlug(r.slug));
  }, [token]);

  // Skalira platno na uzim ekranima (mobitel/tablet) da tlocrt ostane
  // upotrebljiv bez horizontalnog skrolovanja - vidi TableNode za korekciju
  // pointer delta pri prevlacenju.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / CANVAS_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function reload(t: string) {
    fetchTables(t).then(setTables);
  }

  async function handleDragEnd(id: string, x: number, y: number) {
    if (!token) return;
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, posX: x, posY: y } : t)));
    await updateTable(token, id, { pos_x: x, pos_y: y });
  }

  async function handleCreateTable(values: { table_number: string; zone_name: string; capacity: number }) {
    if (!token) return;
    await createTable(token, values);
    setShowNewForm(false);
    reload(token);
  }

  if (!token) return null;

  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tlocrt stolova</h1>
            <p className="text-muted-foreground">Prevuci sto da promijeniš poziciju. Klik za detalje i QR kod.</p>
          </div>
          <Button onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" />
            Sto
          </Button>
        </div>

        <div ref={containerRef} className="w-full overflow-hidden rounded-xl border bg-card">
          <div style={{ width: '100%', height: CANVAS_HEIGHT * scale }}>
            <div
              className="relative"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              {tables.map((table) => (
                <TableNode key={table.id} table={table} selected={selectedId === table.id} scale={scale} onDragEnd={handleDragEnd} onClick={setSelectedId} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showNewForm && <NewTableForm onCancel={() => setShowNewForm(false)} onSubmit={handleCreateTable} />}

      {selectedTable && restaurantSlug && (
        <TablePanel
          table={selectedTable}
          restaurantSlug={restaurantSlug}
          token={token}
          onClose={() => setSelectedId(null)}
          onChanged={() => reload(token)}
        />
      )}
    </AppShell>
  );
}
