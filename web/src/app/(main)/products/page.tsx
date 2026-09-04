"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import Caption from "@/components/shared/Caption";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import TableState from "@/components/shared/TableState";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useSelectedShop } from "@/components/shared/SelectedShopContext";
import { CategoryManagerDialog } from "@/components/shared/CategoryManagerDialog";
import {
  AdjustStockDialog,
  SellStockDialog,
  TransferStockDialog,
} from "@/components/features/products/StockActionDialogs";
import { ProductScopeTabs } from "@/components/shared/ProductScopeTabs";
import { ApiError, api } from "@/lib/api-client";
import {
  invalidateStockAndSales,
  useAdjustStock,
  useCategories,
  useShopProducts,
  useShops,
  type ShopProduct,
} from "@/lib/hooks/use-inventory";

type Status = "success" | "warning" | "error" | "neutral";

/** ปุ่มลัดปรับสต็อก — ทีละ 1 กับ 10 อยู่ในตาราง ที่เหลืออยู่ในกล่องแก้ไข */
const QUICK_STEPS = [1, 5, 10, 50] as const;
const MAX_QUICK_CHIPS = 6;

/** หัวตารางกับช่องข้อมูลต้องใช้ค่าเดียวกัน ไม่งั้นเหลื่อมกันแน่นอน */
const COLUMN_ALIGN = [
  "text-left",
  "text-left",
  "text-left",
  "text-right",
  "text-center",
  "text-center",
  "text-center",
  "text-right",
] as const;

const content = {
  th: {
    title: "สินค้าและสต็อก",
    searchPlaceholder: "ค้นหาสินค้าด้วยชื่อหรือบาร์โค้ด…",
    allCategories: "ทุกหมวดหมู่",
    manageCategories: "จัดการหมวดหมู่",
    noCategory: "ไม่ระบุหมวดหมู่",
    quickLabel: "ค้นหาด่วน:",
    clearSearch: "ล้างการค้นหา",
    columns: ["สินค้า", "หมวดหมู่", "บาร์โค้ด", "ราคาขาย", "คงเหลือ", "สถานะ", "จัดการสต็อก", ""],
    restoreBtn: "กู้คืน",
    sellBtn: "ขายออก",
    adjustBtn: "ปรับสต็อก",
    transferBtn: "ย้าย",
    editBtn: "แก้ไข",
    statusNormal: "ปกติ",
    statusLow: "ใกล้หมด",
    statusOut: "หมด",
    statusInactive: "ถอดออกแล้ว",
    loading: "กำลังโหลดข้อมูลสินค้า…",
    empty: "ยังไม่มีสินค้าในร้านนี้",
    caption:
      "ทุกการปรับสต็อกจากหน้านี้จะถูกบันทึกเข้าประวัติสต็อก เช่นเดียวกับรายการจากแชทบอทและการขายหน้าร้าน",
    dialogTitle: "แก้ไขสินค้า",
    dialogDesc: "ปรับสต็อกและราคาของสินค้าตัวนี้เฉพาะในร้านนี้",
    adjustHeading: "ปรับสต็อก",
    current: "คงเหลือตอนนี้",
    increase: "รับเข้า",
    decrease: "ตัดออก",
    amount: "จำนวน",
    note: "หมายเหตุ",
    notePh: "เช่น รับของจากซัพพลายเออร์",
    after: "หลังปรับจะเหลือ",
    applyAdjust: "บันทึกการปรับสต็อก",
    priceHeading: "ราคาและจุดแจ้งเตือน",
    sellPrice: "ราคาขาย (บาท)",
    cost: "ต้นทุน (บาท)",
    threshold: "จุดแจ้งเตือนสต็อกต่ำ",
    savePrice: "บันทึกราคา",
    saving: "กำลังบันทึก…",
    close: "ปิด",
    saved: "บันทึกแล้ว",
    catalogHeading: "ข้อมูลสินค้ากลาง",
    catalogNote: "ข้อมูลชุดนี้ใช้ร่วมกันทุกสาขา แก้ที่นี่แล้วเปลี่ยนทุกร้านที่ขายสินค้าตัวนี้",
    productName: "ชื่อสินค้า",
    category: "หมวดหมู่",
    barcode: "บาร์โค้ด",
    barcodePh: "เว้นว่างได้",
    saveCatalog: "บันทึกข้อมูลสินค้า",
    newCategory: "＋ สร้างหมวดหมู่ใหม่",
    newCategoryPh: "ชื่อหมวดหมู่ เช่น ของสด",
    createCategory: "สร้าง",
    cancelCategory: "ยกเลิก",
    removeHeading: "เอาสินค้าออกจากร้าน",
    removeNote:
      "สินค้าจะถูกซ่อนจากหน้าร้านและ POS แต่ราคา ต้นทุน และประวัติการขายยังอยู่ครบ กดกู้คืนได้ตลอด",
    removeNote2:
      "สินค้ายังอยู่ในคลังกลาง สาขาอื่นขายต่อได้ตามปกติ และยังนับรวมในโควตาสินค้าอยู่",
    removeBtn: "เอาออกจากร้าน",
    removeConfirmTitle: "เอาสินค้าออกจากร้านนี้?",
    removeConfirmDesc:
      "สินค้าจะเปลี่ยนเป็นสถานะถอดออกแล้ว กดกู้คืนในตารางเพื่อเอากลับมาขายได้ทุกเมื่อ",
    removeConfirm: "เอาออก",
    removeCancel: "ยกเลิก",
    removePending: "กำลังเอาออก…",
    removeSuccess: "เอาออกจากร้านแล้ว",
  },
  en: {
    title: "Products & Stock",
    searchPlaceholder: "Search products by name or barcode…",
    allCategories: "All categories",
    manageCategories: "Manage categories",
    noCategory: "Uncategorised",
    quickLabel: "Quick search:",
    clearSearch: "Clear search",
    columns: ["Product", "Category", "Barcode", "Sell price", "Stock", "Status", "Stock actions", ""],
    restoreBtn: "Restore",
    sellBtn: "Sell",
    adjustBtn: "Adjust",
    transferBtn: "Move",
    editBtn: "Edit",
    statusNormal: "Normal",
    statusLow: "Low stock",
    statusOut: "Out of stock",
    statusInactive: "Delisted",
    loading: "Loading products…",
    empty: "No products in this shop yet",
    caption:
      "Every stock change made here is written to stock history, exactly like chatbot and point-of-sale entries.",
    dialogTitle: "Edit product",
    dialogDesc: "Adjust stock and pricing for this product in this shop only",
    adjustHeading: "Adjust stock",
    current: "Current stock",
    increase: "Stock in",
    decrease: "Stock out",
    amount: "Quantity",
    note: "Note",
    notePh: "e.g. delivery from supplier",
    after: "Resulting stock",
    applyAdjust: "Save stock change",
    priceHeading: "Price & alert threshold",
    sellPrice: "Sell price (THB)",
    cost: "Cost (THB)",
    threshold: "Low-stock alert threshold",
    savePrice: "Save pricing",
    saving: "Saving…",
    close: "Close",
    saved: "Saved",
    catalogHeading: "Catalog details",
    catalogNote: "These fields are shared by every branch — changing them here changes them everywhere this product is sold.",
    productName: "Product name",
    category: "Category",
    barcode: "Barcode",
    barcodePh: "Optional",
    saveCatalog: "Save catalog details",
    newCategory: "＋ New category",
    newCategoryPh: "Category name, e.g. Fresh food",
    createCategory: "Create",
    cancelCategory: "Cancel",
    removeHeading: "Remove from this shop",
    removeNote:
      "The product is hidden from the shop and the POS, but its price, cost and sales history stay intact. You can restore it any time.",
    removeNote2:
      "It stays in the central catalog, other branches keep selling it, and it still counts against your product quota.",
    removeBtn: "Remove from shop",
    removeConfirmTitle: "Remove this product from the shop?",
    removeConfirmDesc:
      "It becomes delisted. Use Restore in the table to bring it back whenever you want.",
    removeConfirm: "Remove",
    removeCancel: "Cancel",
    removePending: "Removing…",
    removeSuccess: "Removed from the shop",
  },
};

export default function ProductsStockPage() {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);
  const [selling, setSelling] = useState<ShopProduct | null>(null);
  const [transferring, setTransferring] = useState<ShopProduct | null>(null);
  const [adjusting, setAdjusting] = useState<ShopProduct | null>(null);

  const shopsQuery = useShops();
  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data]);
  const { selectedShopId } = useSelectedShop();
  const shopId =
    (selectedShopId && shops.some((shop) => shop.id === selectedShopId)
      ? selectedShopId
      : shops[0]?.id) ?? "";

  const categoriesQuery = useCategories();
  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  const shopProductsQuery = useShopProducts(shopId || undefined, {
    q: search || undefined,
    limit: 100,
  });

  const allProducts = useMemo(
    () => shopProductsQuery.data?.items ?? [],
    [shopProductsQuery.data],
  );

  // api ยังไม่มีตัวกรองหมวดหมู่ใน GET /shops/:shopId/products จึงกรองฝั่งนี้
  // ทำได้เพราะดึงมาทีเดียว 100 รายการอยู่แล้ว
  const products = useMemo(
    () =>
      categoryFilter === "all"
        ? allProducts
        : allProducts.filter(
            (row) => (row.product.categoryId ?? "none") === categoryFilter,
          ),
    [allProducts, categoryFilter],
  );

  /** ชิปค้นหาด่วน — ชื่อสินค้าจริงในร้าน ไม่ใช่รายการตัวอย่าง */
  const quickChips = useMemo(
    () =>
      Array.from(new Set(allProducts.map((row) => row.product.name))).slice(
        0,
        MAX_QUICK_CHIPS,
      ),
    [allProducts],
  );

  const restore = useMutation({
    mutationFn: (row: ShopProduct) =>
      api.post(`/api/backend/shops/${shopId}/products`, {
        productId: row.productId,
        sellPrice: Number(row.sellPrice),
        costPrice: Number(row.costPrice),
        lowStockThreshold: row.lowStockThreshold,
      }),
    // กู้คืนสินค้ากลับเข้าร้าน = จำนวนสินค้าที่ขายอยู่บนแดชบอร์ดเปลี่ยนด้วย
    onSuccess: () => invalidateStockAndSales(queryClient),
  });


  const selectedCategoryLabel =
    categoryFilter === "all"
      ? t.allCategories
      : categoryFilter === "none"
        ? t.noCategory
        : (categoryName.get(categoryFilter) ?? t.allCategories);

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <ProductScopeTabs active="shop" />
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="min-w-60 flex-1"
            />
            <Select
              value={categoryFilter}
              onValueChange={(value) => setCategoryFilter(String(value ?? "all"))}
            >
              <SelectTrigger className="min-w-44">
                <span className="flex-1 truncate text-left">
                  {selectedCategoryLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allCategories}</SelectItem>
                {(categoriesQuery.data ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">{t.noCategory}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setCategoryManagerOpen(true)}
            >
              {t.manageCategories}
            </Button>
          </div>

          {(quickChips.length > 0 || search) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t.quickLabel}</span>
              {quickChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSearch(chip)}
                  className={`rounded-full px-3.5 py-1 text-xs transition-colors ${
                    search === chip
                      ? "bg-foreground text-background"
                      : "bg-secondary text-foreground/70 hover:bg-accent"
                  }`}
                >
                  {chip}
                </button>
              ))}
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-full px-3 py-1 text-xs text-muted-foreground underline underline-offset-2"
                >
                  {t.clearSearch}
                </button>
              )}
            </div>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-350 table-fixed border-collapse text-sm">
              {/*
                กำหนดความกว้างคอลัมน์ตายตัว + table-fixed
                ไม่งั้นเบราว์เซอร์จะเกลี่ยความกว้างตามเนื้อหาของแถวที่มีอยู่
                พอมีสินค้าแค่ตัวเดียว หัวตารางกับค่าข้างล่างจะเหลื่อมกันทันที
                คอลัมน์แรกไม่กำหนด = กินพื้นที่ที่เหลือทั้งหมด

                min-w ต้องมากกว่าผลรวมของคอลัมน์ตายตัว ไม่งั้นทุกคอลัมน์จะถูกบีบ
                ตามสัดส่วน แล้วชื่อสินค้าจะเหลือแทบศูนย์ (เดิม min-w-200 = 800px
                ซึ่งน้อยกว่าผลรวม จึงโดนบีบทุกแถว)

                40+44+28+52+28+64+20 = 276 (1104px) + เผื่อชื่อสินค้า 74 (296px) = 350
                แก้ความกว้างคอลัมน์ไหนก็ต้องมาบวกใหม่ที่นี่ด้วย
              */}
              <colgroup>
                <col />
                <col className="w-40" />
                <col className="w-44" />
                <col className="w-28" />
                <col className="w-52" />
                <col className="w-28" />
                <col className="w-64" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  {t.columns.map((col, index) => (
                    <th
                      key={index}
                      className={`px-4 py-3.5 text-xs font-medium tracking-[0.05em] whitespace-nowrap text-muted-foreground uppercase ${COLUMN_ALIGN[index]}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={8}
                  isLoading={shopsQuery.isLoading || shopProductsQuery.isLoading}
                  error={
                    (shopsQuery.error ?? shopProductsQuery.error) instanceof Error
                      ? ((shopsQuery.error ?? shopProductsQuery.error) as Error)
                      : null
                  }
                  isEmpty={
                    Boolean(shopId) &&
                    !shopProductsQuery.isLoading &&
                    products.length === 0
                  }
                  loadingLabel={t.loading}
                  emptyLabel={t.empty}
                />
                {products.map((row) => {
                  const isInactive = row.status === "INACTIVE";
                  const status: Status = isInactive
                    ? "neutral"
                    : row.stockQty <= 0
                      ? "error"
                      : row.stockQty <= row.lowStockThreshold
                        ? "warning"
                        : "success";
                  const statusLabel = isInactive
                    ? t.statusInactive
                    : status === "error"
                      ? t.statusOut
                      : status === "warning"
                        ? t.statusLow
                        : t.statusNormal;

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0"
                      style={{ opacity: isInactive ? 0.6 : 1 }}
                    >
                      <td
                        className={`px-4 py-3.5 font-medium ${COLUMN_ALIGN[0]}`}
                      >
                        <span className="block truncate">
                          {row.product.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            / {row.product.unit}
                          </span>
                        </span>
                      </td>
                      <td
                        className={`truncate px-4 py-3.5 text-muted-foreground ${COLUMN_ALIGN[1]}`}
                      >
                        {row.product.categoryId
                          ? (categoryName.get(row.product.categoryId) ??
                            t.noCategory)
                          : t.noCategory}
                      </td>
                      <td
                        className={`truncate px-4 py-3.5 font-mono text-[13px] text-foreground/70 ${COLUMN_ALIGN[2]}`}
                      >
                        {row.product.barcode ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3.5 font-mono text-[13px] whitespace-nowrap ${COLUMN_ALIGN[3]}`}
                      >
                        ฿{Number(row.sellPrice).toFixed(2)}
                      </td>
                      <td className={`px-4 py-3.5 ${COLUMN_ALIGN[4]}`}>
                        <span className="font-mono text-sm font-semibold">
                          {row.stockQty}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 ${COLUMN_ALIGN[5]}`}>
                        <Badge variant={status}>{statusLabel}</Badge>
                      </td>
                      <td className={`px-4 py-3.5 ${COLUMN_ALIGN[6]}`}>
                        {!isInactive && (
                          <span className="inline-flex gap-1.5">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={row.stockQty <= 0}
                              onClick={() => setSelling(row)}
                            >
                              {t.sellBtn}
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => setAdjusting(row)}
                            >
                              {t.adjustBtn}
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={row.stockQty <= 0 || shops.length < 2}
                              onClick={() => setTransferring(row)}
                            >
                              {t.transferBtn}
                            </Button>
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap ${COLUMN_ALIGN[7]}`}
                      >
                        {isInactive ? (
                          <button
                            type="button"
                            disabled={restore.isPending}
                            onClick={() => restore.mutate(row)}
                            className="text-[13px] font-semibold text-primary disabled:opacity-50"
                          >
                            {t.restoreBtn}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            className="text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                          >
                            {t.editBtn}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Caption>{t.caption}</Caption>
        </div>
      </main>

      <SellStockDialog
        row={selling}
        shopId={shopId}
        onClose={() => setSelling(null)}
      />

      <AdjustStockDialog
        row={adjusting}
        shopId={shopId}
        onClose={() => setAdjusting(null)}
      />

      <TransferStockDialog
        row={transferring}
        shopId={shopId}
        shops={shops}
        onClose={() => setTransferring(null)}
      />

      <CategoryManagerDialog
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        onCategoryDeleted={(deletedId) => {
          // ตัวกรองอาจค้างอยู่ที่หมวดที่เพิ่งลบ ตารางจะว่างทั้งที่ยังมีสินค้าอยู่
          setCategoryFilter((current) =>
            current === deletedId ? "all" : current,
          );
        }}
      />

      <EditProductDialog
        key={editing?.id ?? "none"}
        shopId={shopId}
        row={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-xs font-bold tracking-[0.12em] uppercase">
          {title}
        </h3>
        {aside}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}

function EditProductDialog({
  shopId,
  row,
  onOpenChange,
}: {
  shopId: string;
  row: ShopProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories();

  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [sellPrice, setSellPrice] = useState(row ? String(row.sellPrice) : "");
  const [costPrice, setCostPrice] = useState(row ? String(row.costPrice) : "");
  const [threshold, setThreshold] = useState(
    row ? String(row.lowStockThreshold) : "",
  );
  const [name, setName] = useState(row?.product.name ?? "");
  const [categoryId, setCategoryId] = useState(row?.product.categoryId ?? "");
  const [barcode, setBarcode] = useState(row?.product.barcode ?? "");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedFlag, setSavedFlag] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const adjustStock = useAdjustStock(shopId);

  /**
   * ครอบทั้งแก้ราคา แก้ข้อมูลสินค้า และเอาออกจากร้าน — ทั้งสามอย่างขยับตัวเลข
   * บนแดชบอร์ด และการแก้จุดแจ้งเตือนยังเปลี่ยนได้ว่าสินค้านับเป็นของใกล้หมดไหม
   */
  const invalidate = () => invalidateStockAndSales(queryClient);

  const updatePricing = useMutation({
    mutationFn: (input: {
      sellPrice: number;
      costPrice: number;
      lowStockThreshold: number;
    }) => api.patch(`/api/backend/shops/${shopId}/products/${row?.id}`, input),
    onSuccess: invalidate,
  });

  /** ชื่อ/หมวดหมู่/บาร์โค้ด อยู่ที่สินค้าในคลังกลาง ไม่ใช่แถวของร้าน */
  const updateCatalog = useMutation({
    mutationFn: (input: {
      name: string;
      categoryId: string | null;
      barcode: string | null;
    }) => api.patch(`/api/backend/products/${row?.productId}`, input),
    onSuccess: invalidate,
  });

  /**
   * เอาออกจากร้าน = เปลี่ยนสถานะเป็น INACTIVE ไม่ได้ลบแถวจริง
   * (ดู shop-products.service.ts) จึงกู้คืนได้และประวัติการขายไม่ขาด
   */
  const removeFromShop = useMutation({
    mutationFn: () =>
      api.delete(`/api/backend/shops/${shopId}/products/${row?.id}`),
    onSuccess: invalidate,
  });

  const createCategory = useMutation({
    mutationFn: (categoryName: string) =>
      api.post<{ id: string; name: string }>("/api/backend/categories", {
        name: categoryName,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryId(created.id);
      setNewCategoryOpen(false);
      setNewCategoryName("");
    },
  });

  if (!row) return null;

  const quantity = Number(amount || 0);
  const delta = direction === "INCREASE" ? quantity : -quantity;
  const resulting = row.stockQty + delta;
  const canAdjust = quantity > 0 && resulting >= 0 && !adjustStock.isPending;

  const categoryLabel = categoryId
    ? ((categoriesQuery.data ?? []).find((c) => c.id === categoryId)?.name ??
      t.noCategory)
    : t.noCategory;

  const fail = (caught: unknown, fallback: string) =>
    setError(caught instanceof ApiError ? caught.message : fallback);

  const run = async (flag: string, action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    setSavedFlag(null);
    try {
      await action();
      setSavedFlag(flag);
    } catch (caught) {
      fail(caught, fallback);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-xl">
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle>
            {t.dialogTitle} — {row.product.name}
          </DialogTitle>
          <DialogDescription>{t.dialogDesc}</DialogDescription>
        </DialogHeader>

        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-1">
          <Section
            title={t.adjustHeading}
            aside={
              <span className="text-[13px] text-muted-foreground">
                {t.current}{" "}
                <span className="font-mono font-semibold text-foreground">
                  {row.stockQty}
                </span>
              </span>
            }
          >
            <div className="inline-flex w-fit gap-0.5 rounded-full bg-secondary p-1">
              {(["INCREASE", "DECREASE"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDirection(option)}
                  className={`rounded-full px-4 py-1 text-[13px] transition-all ${
                    direction === option
                      ? "bg-background font-semibold text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
                      : "text-muted-foreground"
                  }`}
                >
                  {option === "INCREASE" ? t.increase : t.decrease}
                </button>
              ))}
            </div>

            <Field label={t.amount}>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-24"
                />
                {QUICK_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setAmount(String(step))}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      amount === String(step)
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {step}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t.note}>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t.notePh}
              />
            </Field>

            <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-[13px]">
              <span className="text-muted-foreground">{t.after}</span>
              <span
                className={`font-mono font-semibold ${
                  resulting < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {resulting}
              </span>
            </div>

            <Button
              type="button"
              variant="gradient"
              disabled={!canAdjust}
              onClick={() =>
                run(
                  "stock",
                  async () => {
                    await adjustStock.mutateAsync({
                      shopProductId: row.id,
                      operation: direction,
                      quantity,
                      note: note.trim() || undefined,
                    });
                    setAmount("1");
                    setNote("");
                  },
                  t.applyAdjust,
                )
              }
            >
              {adjustStock.isPending ? t.saving : t.applyAdjust}
            </Button>
            {savedFlag === "stock" && (
              <p className="text-[13px] text-status-green">{t.saved}</p>
            )}
          </Section>

          <Section title={t.priceHeading}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t.sellPrice}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={sellPrice}
                  onChange={(event) => setSellPrice(event.target.value)}
                />
              </Field>
              <Field label={t.cost}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value)}
                />
              </Field>
              <Field label={t.threshold}>
                <Input
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={
                updatePricing.isPending ||
                sellPrice === "" ||
                // ทุนว่างแล้วบันทึก Number("") จะกลายเป็น 0 เงียบๆ
                // ซึ่งทำให้กำไรขั้นต้นบนแดชบอร์ดเพี้ยนตามโดยไม่มีใครรู้
                costPrice === ""
              }
              onClick={() =>
                run(
                  "price",
                  () =>
                    updatePricing.mutateAsync({
                      sellPrice: Number(sellPrice),
                      costPrice: Number(costPrice),
                      lowStockThreshold: Number(threshold || 0),
                    }),
                  t.savePrice,
                )
              }
            >
              {updatePricing.isPending ? t.saving : t.savePrice}
            </Button>
            {savedFlag === "price" && (
              <p className="text-[13px] text-status-green">{t.saved}</p>
            )}
          </Section>

          <Section title={t.catalogHeading}>
            <p className="text-xs text-muted-foreground">{t.catalogNote}</p>

            <Field label={t.productName}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t.category}>
                <Select
                  value={categoryId}
                  onValueChange={(value) => setCategoryId(String(value ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <span className="flex-1 truncate text-left">
                      {categoryLabel}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t.noCategory}</SelectItem>
                    {(categoriesQuery.data ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t.barcode}>
                <Input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder={t.barcodePh}
                  className="font-mono"
                />
              </Field>
            </div>

            {newCategoryOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder={t.newCategoryPh}
                  className="min-w-40 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newCategoryName.trim() || createCategory.isPending}
                  onClick={() => createCategory.mutate(newCategoryName.trim())}
                >
                  {t.createCategory}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setNewCategoryOpen(false)}
                >
                  {t.cancelCategory}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewCategoryOpen(true)}
                className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t.newCategory}
              </button>
            )}

            <Button
              type="button"
              variant="outline"
              disabled={updateCatalog.isPending || !name.trim()}
              onClick={() =>
                run(
                  "catalog",
                  () =>
                    updateCatalog.mutateAsync({
                      name: name.trim(),
                      categoryId: categoryId || null,
                      barcode: barcode.trim() || null,
                    }),
                  t.saveCatalog,
                )
              }
            >
              {updateCatalog.isPending ? t.saving : t.saveCatalog}
            </Button>
            {savedFlag === "catalog" && (
              <p className="text-[13px] text-status-green">{t.saved}</p>
            )}
          </Section>

          <Section title={t.removeHeading}>
            <p className="text-xs text-muted-foreground">{t.removeNote}</p>
            <p className="text-xs text-muted-foreground">{t.removeNote2}</p>
            <Button
              type="button"
              variant="destructive"
              className="self-start"
              disabled={removeFromShop.isPending}
              onClick={() => setConfirmRemove(true)}
            >
              {t.removeBtn}
            </Button>
          </Section>

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
        </div>

        <ConfirmDialog
          open={confirmRemove}
          destructive
          title={t.removeConfirmTitle}
          description={t.removeConfirmDesc}
          confirmLabel={t.removeConfirm}
          cancelLabel={t.removeCancel}
          pendingLabel={t.removePending}
          successLabel={t.removeSuccess}
          onConfirm={async () => {
            try {
              await removeFromShop.mutateAsync();
              return true;
            } catch (caught) {
              fail(caught, t.removeBtn);
              return false;
            }
          }}
          onClose={() => {
            setConfirmRemove(false);
            // ปิดกล่องแก้ไขตามไปด้วยเมื่อเอาออกสำเร็จ จะได้เห็นแถวเปลี่ยนสถานะทันที
            if (removeFromShop.isSuccess) onOpenChange(false);
          }}
        />

        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
