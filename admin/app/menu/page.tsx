'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import {
  addModifier,
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  deleteModifier,
  fetchMenu,
  updateCategory,
  updateItem,
} from '@/lib/api';
import { MenuCategory, MenuItem } from '@/types/menu';
import AppShell from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import CategoryForm, { CategoryFormValues } from './category-form';
import ItemForm, { ItemFormValues } from './item-form';
import MenuItemCard from './menu-item-card';

function localizedName(json: Record<string, string> | null | undefined): string {
  if (!json) return '';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}

function buildNameJson(bs: string, en: string): Record<string, string> {
  const out: Record<string, string> = { bs };
  if (en) out.en = en;
  return out;
}

export default function MenuPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCategory, setEditingCategory] = useState<MenuCategory | 'new' | null>(null);
  const [editingItem, setEditingItem] = useState<{ categoryId: string; item?: MenuItem } | null>(null);
  const [dragCategoryIndex, setDragCategoryIndex] = useState<number | null>(null);
  const [dragItemIndex, setDragItemIndex] = useState<number | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  function reload(t: string, keepActive = true) {
    fetchMenu(t).then((cats) => {
      setCategories(cats);
      setActiveCategoryId((current) => {
        if (keepActive && current && cats.some((c) => c.id === current)) return current;
        return cats[0]?.id ?? null;
      });
    });
  }

  async function handleSaveCategory(values: CategoryFormValues) {
    if (!token) return;
    const payload = {
      name_json: buildNameJson(values.name_bs, values.name_en),
      sort_order: values.sort_order,
      active_from_time: values.active_from_time,
      active_to_time: values.active_to_time,
    };
    const wasNew = editingCategory === 'new';
    if (editingCategory && editingCategory !== 'new') {
      await updateCategory(token, editingCategory.id, payload);
    } else {
      await createCategory(token, payload);
    }
    setEditingCategory(null);
    reload(token, !wasNew);
    toast.success('Kategorija sačuvana.');
  }

  async function handleDeleteCategory(id: string) {
    if (!token || !confirm('Obrisati kategoriju i sve njene artikle?')) return;
    await deleteCategory(token, id);
    reload(token, false);
    toast.success('Kategorija obrisana.');
  }

  async function handleSaveItem(values: ItemFormValues) {
    if (!token || !editingItem) return;
    const payload = {
      category_id: editingItem.categoryId,
      name_json: buildNameJson(values.name_bs, values.name_en),
      description_json: values.description_bs ? { bs: values.description_bs } : undefined,
      price: values.price,
      image_url: values.image_url,
      allergens: values.allergens,
      print_target: values.print_target,
    };
    if (editingItem.item) {
      await updateItem(token, editingItem.item.id, payload);
    } else {
      await createItem(token, payload);
    }
    setEditingItem(null);
    reload(token);
    toast.success('Artikal sačuvan.');
  }

  async function handleDeleteItem(id: string) {
    if (!token || !confirm('Obrisati artikal?')) return;
    await deleteItem(token, id);
    reload(token);
  }

  async function toggleAvailability(item: MenuItem) {
    if (!token) return;
    await updateItem(token, item.id, { is_available: !item.isAvailable });
    reload(token);
  }

  /** Prevlačenjem (drag-and-drop) mijenja redoslijed kategorija-tabova - optimistički odmah u UI-ju, pa čuva sort_order za sve pogođene kategorije. */
  function reorderCategories(fromIndex: number, toIndex: number) {
    if (!token || fromIndex === toIndex) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setCategories(reordered);
    Promise.all(reordered.map((cat, i) => updateCategory(token, cat.id, { sort_order: i })))
      .then(() => toast.success('Redoslijed kategorija sačuvan.'))
      .catch(() => {
        toast.error('Greška pri čuvanju redoslijeda.');
        reload(token);
      });
  }

  /** Isto kao gore, ali za artikle unutar TRENUTNO aktivne kategorije. */
  function reorderItems(categoryId: string, fromIndex: number, toIndex: number) {
    if (!token || fromIndex === toIndex) return;
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const items = [...category.items];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, items } : c)));
    Promise.all(items.map((item, i) => updateItem(token, item.id, { sort_order: i })))
      .then(() => toast.success('Redoslijed artikala sačuvan.'))
      .catch(() => {
        toast.error('Greška pri čuvanju redoslijeda.');
        reload(token);
      });
  }

  if (!token) return null;

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;
  const searchResults = isSearching
    ? categories.flatMap((cat) =>
        cat.items
          .filter((item) => localizedName(item.nameJson).toLowerCase().includes(trimmedQuery))
          .map((item) => ({ item, categoryId: cat.id, categoryLabel: localizedName(cat.nameJson) })),
      )
    : [];

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meni</h1>
            <p className="text-muted-foreground">Kategorije, artikli i modifikatori.</p>
          </div>
          <Button onClick={() => setEditingCategory('new')}>
            <Plus className="h-4 w-4" />
            Kategorija
          </Button>
        </div>

        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Nema kategorija - dodajte prvu.</CardContent>
          </Card>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pretraži artikle po nazivu…"
                className="pl-9 pr-9"
              />
              {isSearching && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isSearching ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {searchResults.length === 0
                    ? `Nema artikala za "${searchQuery}".`
                    : `${searchResults.length} ${searchResults.length === 1 ? 'rezultat' : 'rezultata'} za "${searchQuery}"`}
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {searchResults.map(({ item, categoryId, categoryLabel }) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      categoryLabel={categoryLabel}
                      onEdit={() => setEditingItem({ categoryId, item })}
                      onDelete={() => handleDeleteItem(item.id)}
                      onToggleAvailability={() => toggleAvailability(item)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Kategorije kao horizontalne "tabove" - izgleda kao meni koji se lista po sekcijama, ne kao admin akordeon lista. */}
                <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {categories.map((cat, idx) => (
                    <button
                      key={cat.id}
                      draggable
                      onClick={() => setActiveCategoryId(cat.id)}
                      onDragStart={() => setDragCategoryIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragCategoryIndex !== null) reorderCategories(dragCategoryIndex, idx);
                        setDragCategoryIndex(null);
                      }}
                      onDragEnd={() => setDragCategoryIndex(null)}
                      className={cn(
                        'shrink-0 cursor-grab whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors active:cursor-grabbing',
                        activeCategoryId === cat.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input text-muted-foreground hover:bg-accent',
                        dragCategoryIndex === idx && 'opacity-40',
                      )}
                    >
                      {localizedName(cat.nameJson)}
                      <span className="ml-1.5 opacity-70">({cat.items.length})</span>
                    </button>
                  ))}
                </div>
                <p className="-mt-3 text-xs text-muted-foreground">Prevucite kategoriju da promijenite redoslijed.</p>

                {activeCategory && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold">{localizedName(activeCategory.nameJson)}</h2>
                        {activeCategory.activeFromTime && (
                          <p className="text-xs text-muted-foreground">
                            Aktivno {activeCategory.activeFromTime.slice(11, 16)}–{activeCategory.activeToTime?.slice(11, 16)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditingCategory(activeCategory)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(activeCategory.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => setEditingItem({ categoryId: activeCategory.id })} className="ml-2">
                          <Plus className="h-4 w-4" /> Artikal
                        </Button>
                      </div>
                    </div>

                    {activeCategory.items.length > 1 && (
                      <p className="-mb-1 text-xs text-muted-foreground">Prevucite artikal da promijenite redoslijed u meniju.</p>
                    )}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {activeCategory.items.map((item, idx) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragItemIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragItemIndex !== null) reorderItems(activeCategory.id, dragItemIndex, idx);
                            setDragItemIndex(null);
                          }}
                          onDragEnd={() => setDragItemIndex(null)}
                          className={cn('cursor-grab active:cursor-grabbing', dragItemIndex === idx && 'opacity-40')}
                        >
                          <MenuItemCard
                            item={item}
                            onEdit={() => setEditingItem({ categoryId: activeCategory.id, item })}
                            onDelete={() => handleDeleteItem(item.id)}
                            onToggleAvailability={() => toggleAvailability(item)}
                          />
                        </div>
                      ))}

                      {activeCategory.items.length === 0 && (
                        <button
                          onClick={() => setEditingItem({ categoryId: activeCategory.id })}
                          className="col-span-full rounded-lg border border-dashed border-primary/40 py-10 text-sm font-medium text-primary hover:bg-primary/5"
                        >
                          + Dodaj prvi artikal u ovu kategoriju
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {editingCategory && (
        <CategoryForm
          initial={editingCategory === 'new' ? undefined : editingCategory}
          onCancel={() => setEditingCategory(null)}
          onSubmit={handleSaveCategory}
        />
      )}
      {editingItem && token && (
        <ItemForm
          initial={editingItem.item}
          onCancel={() => setEditingItem(null)}
          onSubmit={handleSaveItem}
          onAddModifier={
            editingItem.item
              ? async (name, price) => addModifier(token, editingItem.item!.id, { name_json: { bs: name }, price })
              : undefined
          }
          onDeleteModifier={editingItem.item ? async (id) => { await deleteModifier(token, id); } : undefined}
        />
      )}
    </AppShell>
  );
}
