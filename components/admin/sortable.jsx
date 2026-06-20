'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared column-sorting for the admin tables (Stock ledger, Catalogue prices,
// Mass edit). Click a header to sort ascending, again for descending, a third
// time to clear. Each table keeps its own <th> styling and just borrows the
// hook, the comparator and the caret so the look stays consistent.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { T } from './theme';

// Natural, type-aware comparison. Blanks/nulls always sort to the end.
export function cmpVals(a, b) {
  const ae = a == null || a === '';
  const be = b == null || b === '';
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Returns a new, sorted array. `get(row, key)` yields the comparable value
// (defaults to row[key]). When no sort is active the original order is kept.
export function sortRows(rows, sort, get) {
  if (!sort || !sort.key) return rows;
  const g = get || ((r, k) => r[k]);
  const out = rows.slice().sort((a, b) => cmpVals(g(a, sort.key), g(b, sort.key)));
  if (sort.dir === 'desc') out.reverse();
  return out;
}

// asc → desc → cleared, cycling on repeated clicks of the same column.
export function useSort(initial = null) {
  const [sort, setSort] = useState(initial);
  const toggle = (key) => setSort((s) =>
    !s || s.key !== key ? { key, dir: 'asc' } : (s.dir === 'asc' ? { key, dir: 'desc' } : null));
  return { sort, setSort, toggle, clear: () => setSort(null), active: !!sort };
}

// The clickable label + caret to drop inside an existing <th>. Pass the th's
// own text alignment so the caret hugs the right side on numeric columns.
export function SortLabel({ label, sortKey, sort, onSort, align = 'left' }) {
  const on = sort && sort.key === sortKey;
  const caret = !on ? '↕' : (sort.dir === 'asc' ? '▲' : '▼');
  return (
    <span onClick={() => onSort(sortKey)} title="Sort by this column"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start', color: on ? T.accent : 'inherit' }}>
      {label}
      <span style={{ fontSize: 8, opacity: on ? 1 : 0.4 }}>{caret}</span>
    </span>
  );
}
