"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import QuotaMeter from "@/components/shared/QuotaMeter";
import QuotaStrip from "@/components/shared/QuotaStrip";
import Caption from "@/components/shared/Caption";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import { CategoryManagerDialog } from "@/components/shared/CategoryManagerDialog";
import { ProductScopeTabs } from "@/components/shared/ProductScopeTabs";
import AddProductDialog from "@/components/features/catalog/AddProductDialog";
import { ShopStockDialog } from "@/components/features/catalog/ShopStockDialog";
import { ApiError, api, withQuery } from "@/lib/api-client";
import {
  inventoryKeys,
  invalidateStockAndSales,
  useCategories,
  useMySubscription,
  useProducts,
  useShops,
  type Product,
} from "@/lib/hooks/use-inventory";
import { useUploadImage } from "@/lib/hooks/use-uploads";

/** หัวตารางกับช่องข้อมูลอ่านค่าจัดตำแหน่งจากที่เดียว ไม่งั้นเหลื่อมกัน */
const COLUMN_ALIGN = [
  "text-left",
  "text-left",
  "text-left",
  "text-right",
  "text-left",
  "text-right",
] as const;

const content = {
  th: {
    title: "แคตตาล็อกสินค้ากลาง",
    quotaLabel: "สินค้าในแคตตาล็อก",
    unlimited: "ไม่จำกัด",
    upgradeLink: "อัปเกรดเพื่อเพิ่มโควตา",
    searchPlaceholder: "ค้นหาด้วยชื่อหรือบาร์โค้ด…",
    allCategories: "ทุกหมวดหมู่",
    manageCategories: "จัดการหมวดหมู่",
    noCategory: "ไม่ระบุหมวดหมู่",
    allShops: "ทุกร้าน",
    addBtn: "เพิ่มสินค้าใหม่ →",
    columns: ["สินค้า", "หมวดหมู่", "บาร์โค้ด", "คงเหลือรวม", "ขายในร้าน", ""],
    notSelling: "ยังไม่ได้ลงร้าน",
    editStockTitle: "แก้สต็อกรายร้าน",
    editBtn: "แก้ไข",
    addToShopBtn: "เพิ่มเข้าร้าน",
    deleteBtn: "ลบ",
    loading: "กำลังโหลดข้อมูล…",
    empty: "ยังไม่มีสินค้าในแคตตาล็อก",
    caption:
      "สินค้าหนึ่งรายการในแคตตาล็อกกลางลงขายได้หลายร้าน แต่ละร้านตั้งราคาขายและนับสต็อกแยกกัน และนับโควตาเพียง 1 รายการ",
    dialogTitle: "แก้ไขสินค้า",
    dialogDesc: "ข้อมูลชุดนี้ใช้ร่วมกันทุกสาขาที่ขายสินค้าตัวนี้",
    productName: "ชื่อสินค้า",
    unit: "หน่วยนับ",
    unitPh: "เช่น ฟอง",
    category: "หมวดหมู่",
    barcode: "บาร์โค้ด",
    barcodePh: "เว้นว่างได้",
    newCategory: "＋ สร้างหมวดหมู่ใหม่",
    newCategoryPh: "ชื่อหมวดหมู่ เช่น ของสด",
    createCategory: "สร้าง",
    cancelCategory: "ยกเลิก",
    image: "รูปสินค้า",
    imageHint: "JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB",
    imagePick: "เลือกรูป",
    imageChange: "เปลี่ยนรูป",
    imageRemove: "เอารูปออก",
    imageUploading: "กำลังอัปโหลด…",
    save: "บันทึก",
    saving: "กำลังบันทึก…",
    saved: "บันทึกแล้ว",
    close: "ปิด",
    deleteHeading: "ลบออกจากคลังกลาง",
    deleteNote1:
      "สินค้าจะถูกปิดในทุกร้านที่ขายอยู่พร้อมกัน และหายจากแคตตาล็อกนี้",
    deleteNote2:
      "โควตาสินค้าจะคืนให้ทันที และบาร์โค้ดเดิมนำกลับมาใช้กับสินค้าตัวใหม่ได้",
    deleteNote3:
      "ประวัติการขายเก่ายังอ่านได้ตามปกติ เพราะบิลเก็บชื่อและราคา ณ ตอนขายไว้แล้ว",
    deleteConfirmTitle: "ลบสินค้าออกจากคลังกลาง?",
    deleteWarnSelling: (shops: string) => `ตอนนี้ยังขายอยู่ที่ ${shops} — ถ้ายังมีของเหลือบนชั้น ควรเคลียร์สต็อกก่อนลบ`,
    deleteConfirm: "ลบสินค้า",
    deleteCancel: "ยกเลิก",
    deletePending: "กำลังลบ…",
    deleteSuccess: "ลบสินค้าแล้ว",
  },
  en: {
    title: "Product Catalog",
    quotaLabel: "Products in catalog",
    unlimited: "unlimited",
    upgradeLink: "Upgrade to increase quota",
    searchPlaceholder: "Search by name or barcode…",
    allCategories: "All categories",
    manageCategories: "Manage categories",
    noCategory: "Uncategorised",
    allShops: "All shops",
    addBtn: "Add new product →",
    columns: ["Product", "Category", "Barcode", "Total stock", "Sold at", ""],
    notSelling: "Not in any shop",
    editStockTitle: "Edit stock by shop",
    editBtn: "Edit",
    addToShopBtn: "Add to shop",
    deleteBtn: "Delete",
    loading: "Loading…",
    empty: "No products in the catalog yet",
    caption:
      "One catalog item can be listed in many shops, each with its own price and stock, while counting once toward your quota.",
    dialogTitle: "Edit product",
    dialogDesc: "These fields are shared by every branch selling this product",
    productName: "Product name",
    unit: "Unit",
    unitPh: "e.g. piece",
    category: "Category",
    barcode: "Barcode",
    barcodePh: "Optional",
    newCategory: "＋ New category",
    newCategoryPh: "Category name, e.g. Fresh food",
    createCategory: "Create",
    cancelCategory: "Cancel",
    image: "Product image",
    imageHint: "JPG, PNG or WebP, up to 5 MB",
    imagePick: "Choose image",
    imageChange: "Change image",
    imageRemove: "Remove image",
    imageUploading: "Uploading…",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    close: "Close",
    deleteHeading: "Delete from the catalog",
    deleteNote1:
      "The product is delisted from every shop selling it and disappears from this catalog.",
    deleteNote2:
      "Your product quota is freed immediately, and the barcode becomes reusable for a new product.",
    deleteNote3:
      "Past sales history stays readable — each receipt already stores the name and price as sold.",
    deleteConfirmTitle: "Delete this product from the catalog?",
    deleteWarnSelling: (shops: string) => `It is still sold at ${shops} — clear the remaining stock first if there is any on the shelf.`,
    deleteConfirm: "Delete product",
    deleteCancel: "Cancel",
    deletePending: "Deleting…",
    deleteSuccess: "Product deleted",
  },
};

export default function ProductCatalogPage() {
  const { locale } = useLocale();
  const t = content[locale];

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stockFor, setStockFor] = useState<{
    id: string;
    name: string;
    unit: string;
  } | null>(null);
  const [shopFilter, setShopFilter] = useState("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const productsQuery = useProducts({ q: search || undefined, limit: 100 });
  const subscriptionQuery = useMySubscription();
  const categoriesQuery = useCategories();
  const shopsQuery = useShops();
  const queryClient = useQueryClient();

  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data]);
  const productQuota = subscriptionQuery.data?.quotas.product;

  /**
   * "ขายในร้านไหนบ้าง" ไม่มี endpoint เดียวที่ตอบได้ จึงถามทีละร้าน
   * ร้านมากสุด 5 ร้าน (แพ็กเกจ Pro) จึงไม่เกิน 5 คำขอ และแคชต่อร้านอยู่แล้ว
   */
  const shopProductQueries = useQueries({
    queries: shops.map((shop) => ({
      queryKey: ["catalog", "shop-products", shop.id],
      queryFn: () =>
        api.get<{
          items: { productId: string; status: string; stockQty: number }[];
        }>(
          withQuery(`/api/backend/shops/${shop.id}/products`, { limit: 100 }),
        ),
    })),
  });

  // คำนวณตรงๆ ไม่ต้อง useMemo — รายการไม่เกิน 100 x จำนวนร้าน และ
  // ผลลัพธ์ของ useQueries เปลี่ยน reference ทุก render อยู่แล้ว memo ไปก็ไม่ช่วย
  const soldAt = new Map<
    string,
    { id: string; name: string; stockQty: number }[]
  >();
  shopProductQueries.forEach((query, index) => {
    const shop = shops[index];
    if (!shop || !query.data) return;
    for (const item of query.data.items) {
      if (item.status !== "ACTIVE") continue;
      // ข้าม INACTIVE ไปแล้วด้านบน ยอดรวมจึงนับเฉพาะร้านที่ยังขายอยู่จริง
      soldAt.set(item.productId, [
        ...(soldAt.get(item.productId) ?? []),
        { id: shop.id, name: shop.name, stockQty: item.stockQty },
      ]);
    }
  });

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  const allProducts = useMemo(
    () => productsQuery.data?.items ?? [],
    [productsQuery.data],
  );

  // api รับแค่ q/categoryId ที่ระดับ products และไม่มีตัวกรอง "ขายในร้านไหน"
  // จึงกรองสองอย่างนี้ฝั่งนี้ ทำได้เพราะดึงมาทีเดียว 100 รายการ
  const products = allProducts.filter((product) => {
    const byCategory =
      categoryFilter === "all" ||
      (product.categoryId ?? "none") === categoryFilter;
    const byShop =
      shopFilter === "all" ||
      (soldAt.get(product.id) ?? []).some((shop) => shop.id === shopFilter);
    return byCategory && byShop;
  });

  const categoryFilterLabel =
    categoryFilter === "all"
      ? t.allCategories
      : categoryFilter === "none"
        ? t.noCategory
        : (categoryName.get(categoryFilter) ?? t.allCategories);
  const shopFilterLabel =
    shopFilter === "all"
      ? t.allShops
      : (shops.find((shop) => shop.id === shopFilter)?.name ?? t.allShops);

  const removeProduct = useMutation({
    mutationFn: (productId: string) =>
      api.delete(`/api/backend/products/${productId}`),
    onSuccess: () => {
      invalidateStockAndSales(queryClient);
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "me"] });
    },
  });

  const deletingShops = deleting
    ? (soldAt.get(deleting.id) ?? []).map((shop) => shop.name).join(", ")
    : "";

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <ProductScopeTabs active="all" />
          <QuotaStrip>
            <div className="flex-1">
              {/* allowed = null คือไม่จำกัด ส่งเป็น 0 จะกลายเป็นแถบเต็มตลอด */}
              <QuotaMeter
                label={t.quotaLabel}
                used={productQuota?.used ?? 0}
                total={productQuota?.allowed ?? productQuota?.used ?? 0}
              />
            </div>
            {productQuota?.allowed === null ? (
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {t.unlimited}
              </span>
            ) : (
              <Link
                href="/membership"
                className="text-xs font-semibold whitespace-nowrap text-primary"
              >
                {t.upgradeLink}
              </Link>
            )}
          </QuotaStrip>

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
              <SelectTrigger className="min-w-40">
                <span className="flex-1 truncate text-left">
                  {categoryFilterLabel}
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
            <Select
              value={shopFilter}
              onValueChange={(value) => setShopFilter(String(value ?? "all"))}
            >
              <SelectTrigger className="min-w-40">
                <span className="flex-1 truncate text-left">
                  {shopFilterLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allShops}</SelectItem>
                {shops.map((shop) => (
                  <SelectItem key={shop.id} value={shop.id}>
                    {shop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setCategoryManagerOpen(true)}
            >
              {t.manageCategories}
            </Button>
            <Button variant="dark" onClick={() => setAddOpen(true)}>
              {t.addBtn}
            </Button>
          </div>

          <Card className="overflow-x-auto p-0">
            {/*
              min-w ต้องมากกว่าผลรวมของคอลัมน์ที่กำหนดความกว้างตายตัว มิฉะนั้น
              table-fixed จะบีบทุกคอลัมน์ลงตามสัดส่วน แล้วคอลัมน์แรกที่ไม่ได้
              กำหนดความกว้าง (ชื่อสินค้า) จะเหลือแทบศูนย์ — ชื่อกลายเป็น "น้ำ."

              44+44+28+72+56 = 244 (976px) + เผื่อชื่อสินค้าอีก 76 (304px) = 320
              แก้ความกว้างคอลัมน์ไหนก็ต้องมาบวกใหม่ที่นี่ด้วย
            */}
            <table className="w-full min-w-320 table-fixed border-collapse text-sm">
              <colgroup>
                <col />
                <col className="w-44" />
                <col className="w-44" />
                <col className="w-28" />
                <col className="w-72" />
                <col className="w-56" />
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
                {productsQuery.isLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {t.loading}
                    </td>
                  </tr>
                )}
                {!productsQuery.isLoading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {t.empty}
                    </td>
                  </tr>
                )}
                {products.map((product) => {
                  const sellingShops = soldAt.get(product.id) ?? [];
                  const totalStock = sellingShops.reduce(
                    (sum, shop) => sum + shop.stockQty,
                    0,
                  );
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className={`px-4 py-3.5 font-medium ${COLUMN_ALIGN[0]}`}>
                        <span className="flex items-center gap-3">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-border"
                            />
                          ) : (
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                              🖼️
                            </span>
                          )}
                          <span className="min-w-0 truncate">
                            {product.name}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              / {product.unit}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td
                        className={`truncate px-4 py-3.5 text-muted-foreground ${COLUMN_ALIGN[1]}`}
                      >
                        {product.categoryId
                          ? (categoryName.get(product.categoryId) ?? t.noCategory)
                          : t.noCategory}
                      </td>
                      <td
                        className={`truncate px-4 py-3.5 font-mono text-[13px] text-foreground/70 ${COLUMN_ALIGN[2]}`}
                      >
                        {product.barcode ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap ${COLUMN_ALIGN[3]}`}
                      >
                        <button
                          type="button"
                          onClick={() => setStockFor(product)}
                          title={t.editStockTitle}
                          className="rounded-md px-1.5 py-0.5 underline decoration-dotted underline-offset-4 hover:bg-muted"
                        >
                          {sellingShops.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <span className="font-mono font-semibold">
                                {totalStock.toLocaleString()}
                              </span>
                              <span className="ml-1 text-xs text-muted-foreground">
                                {product.unit}
                              </span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className={`px-4 py-3.5 ${COLUMN_ALIGN[4]}`}>
                        {sellingShops.length === 0 ? (
                          <Badge variant="neutral">{t.notSelling}</Badge>
                        ) : (
                          /* เรียงเป็นแถวเต็มความกว้าง ไม่ใช่ pill ลอย ๆ ต่อกัน
                             ตัวเลขจะได้ชิดขอบขวาตรงกันทุกแถว กวาดตาเทียบร้านได้ทันที */
                          <span className="flex flex-col gap-1">
                            {sellingShops.map((shop) => (
                              <Badge
                                key={shop.id}
                                variant="success"
                                className="h-6 w-full justify-between gap-2"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {shop.name}
                                </span>
                                {/* min-w คงที่ ไม่ใช่ w-fit — ไม่งั้นเส้นคั่นจะขยับ
                                    ตามความกว้างของตัวเลข 100 กับ 45 เส้นจะไม่ตรงกัน */}
                                <span className="min-w-11 shrink-0 border-l border-status-green/30 pl-2 text-right font-mono font-semibold tabular-nums">
                                  {shop.stockQty.toLocaleString()}
                                </span>
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3.5 whitespace-nowrap ${COLUMN_ALIGN[5]}`}
                      >
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          className="mr-3 text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          {t.editBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStockFor(product)}
                          className="mr-3 text-[13px] font-semibold text-primary"
                        >
                          {t.addToShopBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(product)}
                          className="text-[13px] text-destructive underline underline-offset-4"
                        >
                          {t.deleteBtn}
                        </button>
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

      <ShopStockDialog
        product={stockFor}
        shops={shops}
        onClose={() => setStockFor(null)}
      />

      {/* [อั้ม] สร้างสินค้าได้จากที่นี่ที่เดียว — หน้าร้านรายสาขาไม่มีปุ่มนี้แล้ว */}
      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />

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

      <EditCatalogDialog
        key={editing?.id ?? "none"}
        product={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        destructive
        title={t.deleteConfirmTitle}
        description={[
          t.deleteNote1,
          t.deleteNote2,
          deletingShops ? t.deleteWarnSelling(deletingShops) : "",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel={t.deleteConfirm}
        cancelLabel={t.deleteCancel}
        pendingLabel={t.deletePending}
        successLabel={t.deleteSuccess}
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await removeProduct.mutateAsync(deleting.id);
            return true;
          } catch {
            return false;
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function EditCatalogDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories();

  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadImage();

  const updateProduct = useMutation({
    mutationFn: (input: {
      name: string;
      unit: string;
      categoryId: string | null;
      barcode: string | null;
      imageUrl: string | null;
    }) => api.patch(`/api/backend/products/${product?.id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
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

  if (!product) return null;

  const categoryLabel = categoryId
    ? ((categoriesQuery.data ?? []).find((c) => c.id === categoryId)?.name ??
      t.noCategory)
    : t.noCategory;

  const onSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await updateProduct.mutateAsync({
        name: name.trim(),
        unit: unit.trim(),
        categoryId: categoryId || null,
        barcode: barcode.trim() || null,
        imageUrl: imageUrl || null,
      });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.save);
    }
  };

  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle>
            {t.dialogTitle} — {product.name}
          </DialogTitle>
          <DialogDescription>{t.dialogDesc}</DialogDescription>
        </DialogHeader>

        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-1">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
              {t.productName}
            </Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
                {t.unit}
              </Label>
              <Input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder={t.unitPh}
                maxLength={20}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
                {t.barcode}
              </Label>
              <Input
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder={t.barcodePh}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
              {t.category}
            </Label>
            <Select
              value={categoryId}
              onValueChange={(value) => setCategoryId(String(value ?? ""))}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 truncate text-left">{categoryLabel}</span>
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

            {newCategoryOpen ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
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
                className="mt-1 self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t.newCategory}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-semibold tracking-[0.08em] uppercase">
              {t.image}
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border text-xl">
                  🖼️
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      // ล้างค่าทันที ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่ยิง onChange
                      event.target.value = "";
                      if (!file) return;
                      setError(null);
                      uploadImage.mutate(
                        { file, folder: "products" },
                        {
                          onSuccess: ({ url }) => setImageUrl(url),
                          onError: (caught) =>
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : String(caught),
                            ),
                        },
                      );
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadImage.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadImage.isPending
                      ? t.imageUploading
                      : imageUrl
                        ? t.imageChange
                        : t.imagePick}
                  </Button>
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImageUrl("")}
                    >
                      {t.imageRemove}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t.imageHint}</p>
              </div>
            </div>
          </div>

          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t.deleteNote3}
          </p>

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
          {saved && <p className="text-[13px] text-status-green">{t.saved}</p>}
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
          <Button
            type="button"
            variant="gradient"
            disabled={updateProduct.isPending || !name.trim() || !unit.trim()}
            onClick={onSave}
          >
            {updateProduct.isPending ? t.saving : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
