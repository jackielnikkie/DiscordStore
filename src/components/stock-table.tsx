"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Eye, EyeOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/status-pill";
import { deleteStockAction } from "@/app/admin/actions";
import { deleteStockBulkAction } from "@/app/admin/stock-actions";
import type { StockStatus } from "@/lib/db-types";
import { getStockTone } from "@/lib/order-presenter";

export type StockTableRow = {
  id: string;
  content: string;
  status: string;
  reservedBy: string | null;
  soldOrderId: string | null;
  createdAt: string;
};

type StockTableProps = {
  productId: string;
  stocks: StockTableRow[];
  total: number;
  page: number;
  perPage: number;
  statusFilter: string;
};

const STATUS_TABS = [
  { value: "", label: "Semua" },
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "SOLD", label: "Sold" },
];

export function StockTable({
  productId,
  stocks,
  total,
  page,
  perPage,
  statusFilter,
}: StockTableProps) {
  const basePath = `/admin/products/${productId}/stock`;
  const redirectTo = basePath;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pageIds = stocks.map((stock) => stock.id);
  const selectedCount = selected.size;
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id)) && !allSelected;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function reveal(ids: string[]) {
    const missing = ids.filter((id) => !(id in revealed));
    if (missing.length === 0) return;

    try {
      const response = await fetch("/api/admin/stock/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: missing }),
      });

      if (!response.ok) return;

      const data = await response.json();
      setRevealed((current) => {
        const next = { ...current };
        for (const item of data.items ?? []) {
          next[item.id] = item.content;
        }
        return next;
      });
    } catch {
      // ponytail: reveal is best-effort; content stays masked on failure.
    }
  }

  function toggleReveal(id: string) {
    if (id in revealed) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    void reveal([id]);
  }

  function hideAll() {
    setRevealed({});
  }

  async function copy(id: string) {
    const content = revealed[id];
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 1500);
    } catch {
      // ponytail: clipboard can be blocked; ignore silently.
    }
  }

  function confirmDelete(count: number) {
    return window.confirm(
      `Hapus ${count} stok? hanya stok AVAILABLE yang dihapus.`,
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <Link key={tab.value} href={`${basePath}?status=${tab.value}&page=1`}>
              <Badge
                variant={statusFilter === tab.value ? "default" : "outline"}
                className="cursor-pointer"
              >
                {tab.label}
              </Badge>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {total > 0 ? (
            <form
              action={deleteStockBulkAction}
              onSubmit={(event) => {
                if (!confirmDelete(total)) event.preventDefault();
              }}
            >
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="status" value={statusFilter} />
              <input type="hidden" name="all" value="1" />
              <Button type="submit" variant="outline" size="sm">
                Pilih semua hasil filter ({total})
              </Button>
            </form>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reveal(pageIds)}
            disabled={pageIds.length === 0}
          >
            Tampilkan semua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={hideAll}
            disabled={Object.keys(revealed).length === 0}
          >
            Sembunyikan semua
          </Button>
        </div>
      </div>

      {selectedCount > 0 ? (
        <form
          action={deleteStockBulkAction}
          onSubmit={(event) => {
            if (!confirmDelete(selectedCount)) event.preventDefault();
          }}
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2"
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="status" value={statusFilter} />
          <input
            type="hidden"
            name="stockIds"
            value={Array.from(selected).join(",")}
          />
          <span className="text-xs font-medium">{selectedCount} dipilih</span>
          <Button type="submit" variant="destructive" size="sm">
            Hapus terpilih
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            Batalkan
          </Button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  aria-label="Pilih semua baris"
                  className="h-4 w-4 rounded border-border align-middle"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Content</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Reserved By</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Sold Order</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stocks.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Tidak ada stok.
                </td>
              </tr>
            ) : (
              stocks.map((stock) => {
                const isRevealed = stock.id in revealed;
                return (
                  <tr key={stock.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${stock.id}`}
                        className="h-4 w-4 rounded border-border align-middle"
                        checked={selected.has(stock.id)}
                        onChange={() => toggleRow(stock.id)}
                      />
                    </td>
                    <td className="p-4 align-middle font-mono text-xs leading-relaxed break-all">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          {isRevealed ? revealed[stock.id] : stock.content}
                        </span>
                        <button
                          type="button"
                          aria-label={isRevealed ? "Sembunyikan" : "Tampilkan"}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => toggleReveal(stock.id)}
                        >
                          {isRevealed ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Salin"
                          className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!isRevealed}
                          onClick={() => void copy(stock.id)}
                        >
                          {copiedId === stock.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {copiedId === stock.id ? (
                        <span className="text-[10px] text-green-600">Tersalin</span>
                      ) : null}
                    </td>
                    <td className="p-4 align-middle">
                      <StatusPill
                        label={stock.status}
                        tone={getStockTone(stock.status as StockStatus)}
                      />
                    </td>
                    <td className="p-4 align-middle font-mono text-xs text-muted-foreground break-all">
                      {stock.reservedBy || "-"}
                    </td>
                    <td className="p-4 align-middle font-mono text-xs text-muted-foreground break-all">
                      {stock.soldOrderId || "-"}
                    </td>
                    <td className="p-4 align-middle">{stock.createdAt}</td>
                    <td className="p-4 align-middle">
                      <form
                        action={deleteStockAction}
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              "Hapus stok ini? hanya stok AVAILABLE yang dihapus.",
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="stockId" value={stock.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                          Hapus
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Halaman {page} dari {totalPages} • {total} stok
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={`${basePath}?status=${statusFilter}&page=${page - 1}`}>
              <Button variant="outline" size="sm">Sebelumnya</Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>Sebelumnya</Button>
          )}
          {page < totalPages ? (
            <Link href={`${basePath}?status=${statusFilter}&page=${page + 1}`}>
              <Button variant="outline" size="sm">Berikutnya</Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>Berikutnya</Button>
          )}
        </div>
      </div>
    </div>
  );
}
