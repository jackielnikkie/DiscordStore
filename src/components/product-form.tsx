import { getProductTypeLabel, ProductType, type Product } from "../lib/db-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ProductFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  redirectTo: string;
  product?: Product | null;
};

export function ProductForm({ action, redirectTo, product }: ProductFormProps) {
  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Basic Info</legend>
        <input type="hidden" name="id" defaultValue={product?.id || ""} />
        <input type="hidden" name="redirectTo" defaultValue={redirectTo} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Nama Produk</Label>
            <Input id="name" name="name" required defaultValue={product?.name || ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" required defaultValue={product?.slug || ""} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" defaultValue={product?.description || ""} rows={2} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="price">Harga</Label>
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
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={product?.sortOrder || 0} />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Image & Display</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={product?.imageUrl || ""} placeholder="https://" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="formatLabel">Format Delivery</Label>
            <Input id="formatLabel" name="formatLabel" defaultValue={product?.formatLabel || ""} placeholder="email|password" />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <legend className="-ml-1 px-1 font-semibold text-sm">Type & Delivery</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
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
            <Label htmlFor="bulkPriceJson">Bulk Price JSON</Label>
            <Textarea
              id="bulkPriceJson"
              name="bulkPriceJson"
              defaultValue={product?.bulkPriceJson || ""}
              placeholder='{"10": 50}'
              rows={2}
            />
          </div>
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
