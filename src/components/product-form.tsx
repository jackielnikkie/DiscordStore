"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { getProductTypeLabel, ProductType, type Product } from "../lib/db-types";
import {
  MAX_PRICE_TIERS,
  parsePriceTiers,
  serializePriceTiers,
  type PriceTier,
} from "../lib/pricing";
import { slugify } from "../lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProductFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  redirectTo: string;
  product?: Product | null;
};

export function ProductForm({ action, redirectTo, product }: ProductFormProps) {
  const [name, setName] = useState(product?.name || "");
  const [slug, setSlug] = useState(product?.slug || "");
  const [tiers, setTiers] = useState<PriceTier[]>(
    parsePriceTiers(product?.bulkPriceJson),
  );

  const updateTier = (index: number, patch: Partial<PriceTier>) => {
    setTiers((current) =>
      current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  };

  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Basic Info</legend>
        <input type="hidden" name="id" defaultValue={product?.id || ""} />
        <input type="hidden" name="redirectTo" defaultValue={redirectTo} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Nama Produk</Label>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (!slug.trim()) {
                  setSlug(slugify(name));
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug (opsional)</Label>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="otomatis dari nama"
            />
            <p className="text-xs text-muted-foreground">
              Dipakai sebagai label internal &amp; bahan pencarian. Kosongkan untuk
              dibuat otomatis.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" defaultValue={product?.description || ""} rows={2} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="price">Harga (Rp, tanpa titik)</Label>
            <Input
              id="price"
              name="price"
              type="number"
              min="0"
              required
              defaultValue={product?.price || 0}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sortOrder">Urutan Tampil</Label>
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={product?.sortOrder || 0} />
            <p className="text-xs text-muted-foreground">
              Angka kecil tampil lebih atas di katalog Discord &amp; Telegram.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Harga Grosir</legend>
        <input
          type="hidden"
          name="bulkPriceJson"
          value={serializePriceTiers(tiers)}
        />

        <p className="text-xs text-muted-foreground">
          Harga per akun untuk pembelian dengan jumlah minimal tertentu. Berlaku juga
          untuk jumlah di atasnya (beli 12 tetap dapat harga tier 10).
        </p>

        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada tier. Semua pembelian pakai harga normal.
          </p>
        ) : (
          <div className="grid gap-3">
            {tiers.map((tier, index) => (
              <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`tier-qty-${index}`}>Minimal qty</Label>
                  <Input
                    id={`tier-qty-${index}`}
                    type="number"
                    min="2"
                    value={tier.qty || ""}
                    onChange={(event) =>
                      updateTier(index, { qty: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`tier-price-${index}`}>Harga per akun (Rp)</Label>
                  <Input
                    id={`tier-price-${index}`}
                    type="number"
                    min="1"
                    value={tier.price || ""}
                    onChange={(event) =>
                      updateTier(index, { price: Number(event.target.value) })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Hapus tier"
                  onClick={() =>
                    setTiers((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          disabled={tiers.length >= MAX_PRICE_TIERS}
          onClick={() => setTiers((current) => [...current, { qty: 0, price: 0 }])}
        >
          <Plus className="size-4" /> Tambah tier
        </Button>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Image &amp; Display</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={product?.imageUrl || ""} placeholder="https://" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="formatLabel">Format Delivery</Label>
            <Input id="formatLabel" name="formatLabel" defaultValue={product?.formatLabel || ""} placeholder="email|password" />
            <p className="text-xs text-muted-foreground">
              Contoh format akun yang ditampilkan ke pembeli.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Type &amp; Delivery</legend>

        <div className="grid gap-2 md:max-w-sm">
          <Label htmlFor="type">Tipe Produk</Label>
          <select
            id="type"
            name="type"
            className="flex w-full h-9 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            defaultValue={product?.type || ProductType.STOCK_LINE}
          >
            <option value={ProductType.STOCK_LINE}>{getProductTypeLabel(ProductType.STOCK_LINE)}</option>
            <option value={ProductType.CUSTOM_TEXT}>{getProductTypeLabel(ProductType.CUSTOM_TEXT)}</option>
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="customText">
            Custom Text (untuk {getProductTypeLabel(ProductType.CUSTOM_TEXT)})
          </Label>
          <Textarea
            id="customText"
            name="customText"
            defaultValue={product?.customText || ""}
            placeholder="Custom format text..."
            rows={2}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="deliveryNote">Catatan Pengiriman (opsional)</Label>
          <Textarea
            id="deliveryNote"
            name="deliveryNote"
            defaultValue={product?.deliveryNote || ""}
            rows={4}
            placeholder={"Contoh:\nBase URL: https://api.coralbricks.com/v1\nDocs: https://docs.coralbricks.com"}
          />
          <p className="text-xs text-muted-foreground">
            Dikirim setelah data produk (juga masuk file .txt). Placeholder:
            {" {{productName}}, {{referenceId}}, {{quantity}}"}
          </p>
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={product?.isActive ?? true}
            className="h-4 w-4 rounded border border-border"
          />
          <span className="text-sm text-muted-foreground">Aktifkan produk ini</span>
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit">
          {product ? "Update Produk" : "Simpan Produk"}
        </Button>
      </div>
    </form>
  );
}
