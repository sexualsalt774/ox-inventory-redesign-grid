import React, { useCallback, useMemo, useState } from 'react';
import { Inventory, InventoryType, Slot } from '../../typings';
import WeightBar from '../utils/WeightBar';
import InventorySlot, { getItemWidth, getItemHeight } from './InventorySlot';
import { getTotalWeight } from '../../helpers';
import { useAppSelector } from '../../store';
import { toAsciiLower } from '../../utils/string';

// ─────────────────────────────────────────────────────────────────────────────
// Fixed Grid Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CELL_SIZE = 56;
const CELL_GAP = 3;
const GRID_COLS = 10;

interface Placement {
  slot: number;
  col: number;
  row: number;
  w: number;
  h: number;
}

// Fixed-size packing (NO row growth)
function packItems(
  slots: Slot[],
  cols: number,
  maxRows: number
): { placements: Placement[]; rows: number } {
  const occupied: boolean[][] = Array.from({ length: maxRows }, () =>
    new Array(cols).fill(false)
  );
  const placements: Placement[] = [];

  const fits = (col: number, row: number, w: number, h: number) => {
    if (col + w > cols || row + h > maxRows) return false;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++)
        if (occupied[row + r][col + c]) return false;
    return true;
  };

  const mark = (col: number, row: number, w: number, h: number) => {
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++)
        occupied[row + r][col + c] = true;
  };

  for (const slot of slots) {
    const w = slot.name ? getItemWidth(slot) : 1;
    const h = slot.name ? getItemHeight(slot) : 1;
    let placed = false;

    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < cols; c++) {
        if (fits(c, r, w, h)) {
          if (slot.name) mark(c, r, w, h);
          placements.push({ slot: slot.slot, col: c, row: r, w, h });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  return { placements, rows: maxRows };
}

interface InventoryGridProps {
  inventory: Inventory;
  itemsOverride?: Slot[];
  hideHeader?: boolean;
  hideExtras?: boolean;
  noWrapper?: boolean;
  onCtrlClick?: (item: any) => void;
  collapsible?: boolean;
}

const InventoryGrid: React.FC<InventoryGridProps> = ({
  inventory,
  itemsOverride,
  hideHeader,
  hideExtras,
  noWrapper,
  onCtrlClick,
  collapsible,
}) => {
  const weight = useMemo(
    () =>
      inventory.maxWeight !== undefined
        ? Math.floor(getTotalWeight(inventory.items) * 1000) / 1000
        : 0,
    [inventory.maxWeight, inventory.items]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isBusy = useAppSelector((state) => state.inventory.isBusy);

  const slotsToRender = useMemo(() => {
    const base = itemsOverride ?? inventory.items;
    return inventory.type === InventoryType.OTHERPLAYER
      ? base.slice(9)
      : base;
  }, [itemsOverride, inventory.items, inventory.type]);

  const GRID_ROWS = Math.ceil(slotsToRender.length / GRID_COLS);

  const { placements, rows } = useMemo(
    () => packItems(slotsToRender, GRID_COLS, GRID_ROWS),
    [slotsToRender, GRID_ROWS]
  );

  const cellStep = CELL_SIZE + CELL_GAP;
  const gridW = GRID_COLS * CELL_SIZE + (GRID_COLS - 1) * CELL_GAP;
  const gridH = GRID_ROWS * CELL_SIZE + (GRID_ROWS - 1) * CELL_GAP;
  const normalizedQuery = toAsciiLower(searchQuery);

  // ─────────────────────────────────────────────────────────────
  // Grid content
  // ─────────────────────────────────────────────────────────────
  const gridContent = (
    <div
      style={{
        position: 'relative',
        width: gridW,
        height: gridH,
        overflow: 'hidden',
      }}
    >
      {slotsToRender.map((slot, index) => {
        const col = index % GRID_COLS;
        const row = Math.floor(index / GRID_COLS);
        const w = getItemWidth(slot);
        const h = getItemHeight(slot);
        const remainingCols = GRID_COLS - col;
        const remainingRows = GRID_ROWS - row;
        const visualWidth = w * CELL_SIZE + (w - 1) * CELL_GAP;
        const visualHeight = h * CELL_SIZE + (h - 1) * CELL_GAP;

        const canDropHere = (dragItem: any) => {
          const dragWidth = getItemWidth(dragItem);
          const dragHeight = getItemHeight(dragItem);
          if (dragWidth > remainingCols || dragHeight > remainingRows) return false;
          for (let r = 0; r < dragHeight; r++)
            for (let c = 0; c < dragWidth; c++) {
              const checkIndex = (row + r) * GRID_COLS + (col + c);
              const checkSlot = slotsToRender[checkIndex];
              if (!checkSlot) return false;
              if (checkSlot?.name && checkSlot.slot !== slot.slot) return false;
            }
          return true;
        };

        return (
          <InventorySlot
            key={`${inventory.type}-${inventory.id}-${slot.slot}`}
            item={slot}
            inventoryType={inventory.type}
            inventoryGroups={inventory.groups}
            inventoryId={inventory.id}
            absolute
            posLeft={col * cellStep}
            posTop={row * cellStep}
            slotWidth={visualWidth}
            slotHeight={visualHeight}
            canDrop={canDropHere}
            style={{
              opacity:
                searchQuery &&
                !toAsciiLower(slot.name ?? '').includes(normalizedQuery)
                  ? 0.25
                  : 1,
            }}
          />
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // Header, search & weight bar design
  // ─────────────────────────────────────────────────────────────
  const headerTitle = useMemo(() => {
    switch (inventory.type) {
      case InventoryType.PLAYER:
        return 'Pockets';
      case InventoryType.SHOP:
        return 'Shop';
      case InventoryType.CRAFTING:
        return 'Crafting';
      case InventoryType.CRAFTING_STORAGE:
        return 'Crafting Storage';
      case InventoryType.BACKPACK:
        return inventory.label || 'Backpack';
      case InventoryType.CONTAINER:
        return 'Storage';
      case InventoryType.OTHERPLAYER:
        return 'Robed Pockets';
      case InventoryType.OTHERPLAYER_HOTBAR:
        return 'Robed Pockets Hotbar';
      case 'stash':
        return inventory.label || 'Stash';
      case 'drop':
        return 'Ground';
      case 'trunk':
        return 'Trunk';
      case 'glovebox':
        return 'Glovebox';
      default:
        return 'Ground';
    }
  }, [inventory.type, inventory.label]);

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!collapsible) return;
      const target = event.target as HTMLElement;
      if (target.closest('input') || target.closest('[data-stop-collapse]')) return;
      setIsCollapsed((prev) => !prev);
    },
    [collapsible]
  );

  const content = (
    <>
      {!hideHeader && (
        <div
          className="inventory-header-wrapper"
          onClick={collapsible ? handleHeaderClick : undefined}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.4rem 0.8rem',
            backgroundColor: '#222',
            color: '#fff',
            borderRadius: '4px',
            cursor: collapsible ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {collapsible && (
              <span
                style={{
                  display: 'inline-block',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: '0.2s',
                }}
              >
                ▶
              </span>
            )}
            <h1 style={{ fontSize: '1rem', margin: 0 }}>{headerTitle}</h1>
          </div>

          {!hideExtras && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              data-stop-collapse
            >
              <input
                type="search"
                placeholder="Search Item"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  height: '1.8rem',
                  fontSize: '0.9rem',
                  borderRadius: '3px',
                  border: '1px solid #555',
                  backgroundColor: '#111',
                  color: '#fff',
                  padding: '0 0.3rem',
                }}
                onClick={(e) => e.stopPropagation()}
              />
              {inventory.maxWeight && (
                <p style={{ fontSize: '0.8rem', margin: 0 }}>
                  {weight / 1000} / {inventory.maxWeight / 1000}kg
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!hideExtras && inventory.maxWeight && (
        <div
          style={{
            marginTop: '0.3rem',
            height: '6px',
            borderRadius: '3px',
            border: '1px solid #333',
            overflow: 'hidden',
            backgroundColor: '#111',
          }}
        >
          <WeightBar percent={(weight / inventory.maxWeight) * 100} />
        </div>
      )}


      {collapsible ? (
        <div
          style={{
            maxHeight: isCollapsed ? 0 : gridH + 32,
            opacity: isCollapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            pointerEvents: isCollapsed ? 'none' : 'auto',
          }}
        >
          {gridContent}
        </div>
      ) : (
        gridContent
      )}
    </>
  );

  if (noWrapper)
    return content;

  return (
    <div
      style={{
        pointerEvents: isBusy ? 'none' : 'auto',
        overflowX: 'auto',
        padding: '0.3rem',
        backgroundColor: '#111',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}
    >
      {content}
    </div>
  );
};

export default InventoryGrid;
