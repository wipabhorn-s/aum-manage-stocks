"use client";

import { useMemo, useState } from "react";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useSelectedShop } from "@/components/shared/SelectedShopContext";
import { useMe } from "@/lib/hooks/use-profile";
import {
  useShopStaff,
  useShopProducts,
  useShops,
  useStockMovements,
  type MovementFilters,
  type StockMovement,
} from "@/lib/hooks/use-inventory";

/**
 * หน้านี้เคยล็อกร้านไว้ที่ shops[0] ตายตัว ซึ่ง api เรียงร้านด้วย createdAt desc
 * ร้านแรกในลิสต์จึงเป็น "ร้านที่สร้างล่าสุด" ไม่ใช่ร้านที่กำลังดูอยู่ — ใครมีหลายร้าน
 * จะเห็นหน้านี้ว่างเปล่าตลอดทั้งที่ในฐานข้อมูลมี movement อยู่จริง
 * ตอนนี้ผูกกับร้านเดียวกับที่เลือกไว้ใน sidebar ผ่าน SelectedShopContext แล้ว
 *
 * ตัวกรองส่งขึ้น api จริงทั้งหมด (movementQuerySchema รองรับอยู่แล้ว):
 *   from / to / shopProductId / actorId / movementType
 * ไม่กรองฝั่ง client เพราะ api ตัดมาแค่ limit แถว การกรองทีหลังจะได้ผลไม่ครบ
 */

const MOVEMENT_TYPES = [
  "MANUAL_ADJUSTMENT",
  "CHAT_ADJUSTMENT",
  "SALE",
  "SALE_VOID",
] as const;

type MovementType = (typeof MOVEMENT_TYPES)[number];

const TYPE_BADGE: Record<MovementType, "neutral" | "warning" | "success" | "error"> = {
  MANUAL_ADJUSTMENT: "neutral",
  CHAT_ADJUSTMENT: "warning",
  SALE: "success",
  SALE_VOID: "error",
};

const PAGE_LIMIT = 100;

type Draft = {
  from: string;
  to: string;
  shopProductId: string;
  actorId: string;
  movementType: string;
};

const EMPTY_DRAFT: Draft = {
  from: "",
  to: "",
  shopProductId: "",
  actorId: "",
  movementType: "",
};

const content = {
  th: {
    title: "ประวัติการเคลื่อนไหวสต็อก",
    shop: "ร้าน",
    noShop: "ยังไม่มีร้านค้า",
    from: "ตั้งแต่",
    to: "ถึง",
    productLabel: "สินค้า",
    personLabel: "ผู้ทำรายการ",
    typeColumn: "ประเภท",
    allProducts: "ทุกสินค้า",
    allPeople: "ทุกคน",
    allTypes: "ทุกประเภท",
    typeLabel: {
      MANUAL_ADJUSTMENT: "ปรับด้วยมือ",
      CHAT_ADJUSTMENT: "แชทบอท",
      SALE: "ขายออก",
      SALE_VOID: "ยกเลิกบิล",
    } as Record<MovementType, string>,
    filterBtn: "กรอง",
    clearBtn: "ล้างตัวกรอง",
    statIn: "รับเข้า",
    statOut: "จ่ายออก",
    statNet: "สุทธิ",
    statUnit: "ชิ้น",
    statCost: "มูลค่าต้นทุนสุทธิ",
    statNote: (n: number) => `จาก ${n} รายการที่แสดงอยู่`,
    statCostNote: (n: number) =>
      n > 0 ? `${n} รายการยังไม่มีข้อมูลทุน` : "จากรายการที่แสดงอยู่",
    columns: [
      "วันเวลา",
      "สินค้า",
      "เปลี่ยนแปลง",
      "ต้นทุน/ชิ้น",
      "ประเภท",
      "ผู้ทำรายการ",
      "หมายเหตุ",
    ],
    loading: "กำลังโหลดข้อมูล…",
    empty: "ยังไม่มีประวัติสต็อกของร้านนี้",
    emptyFiltered: "ไม่พบรายการตามตัวกรองที่เลือก",
    capped: `แสดง ${PAGE_LIMIT} รายการล่าสุด — ใช้ตัวกรองวันที่เพื่อดูช่วงก่อนหน้า`,
    system: "ระบบ",
    me: "คุณ",
  },
  en: {
    title: "Stock Movement History",
    shop: "Shop",
    noShop: "No shop yet",
    from: "From",
    to: "To",
    productLabel: "Product",
    personLabel: "By",
    typeColumn: "Type",
    allProducts: "All products",
    allPeople: "Everyone",
    allTypes: "All types",
    typeLabel: {
      MANUAL_ADJUSTMENT: "Manual",
      CHAT_ADJUSTMENT: "Chatbot",
      SALE: "Sale",
      SALE_VOID: "Void",
    } as Record<MovementType, string>,
    filterBtn: "Filter",
    clearBtn: "Clear filters",
    statIn: "Stock in",
    statOut: "Stock out",
    statNet: "Net",
    statUnit: "units",
    statCost: "Net cost value",
    statNote: (n: number) => `across ${n} shown movements`,
    statCostNote: (n: number) =>
      n > 0 ? `${n} movements have no cost recorded` : "across shown movements",
    columns: [
      "Date/Time",
      "Product",
      "Change",
      "Unit cost",
      "Type",
      "By",
      "Note",
    ],
    loading: "Loading…",
    empty: "No stock history for this shop yet",
    emptyFiltered: "No movements match these filters",
    capped: `Showing the latest ${PAGE_LIMIT} — narrow the date range to see older ones`,
    system: "System",
    me: "You",
  },
};

/** input[type=date] ให้ "YYYY-MM-DD" — ต่อเวลาท้องถิ่นก่อนแปลงเป็น ISO
 *  ไม่งั้น new Date("2026-08-10") จะถูกอ่านเป็นเที่ยงคืน UTC = 07:00 น. บ้านเรา
 *  แล้วรายการช่วงเช้าของวันนั้นจะหลุดออกจากผลลัพธ์ */
function toIso(date: string, endOfDay: boolean): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * ทุนมาเป็น string (Decimal ฝั่ง api) — แปลงเป็นตัวเลข หรือ null ถ้ายังไม่มีข้อมูล
 *
 * รับ undefined ด้วยเพราะ pr ฝั่งเว็บกับฝั่ง api อาจขึ้นไม่พร้อมกัน ถ้าเว็บขึ้นก่อน
 * แถวที่ได้จะไม่มีฟิลด์นี้เลย ซึ่งถ้าไม่กันไว้จะกลายเป็น ฿NaN เต็มตาราง
 */
function toCost(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** ทุนต่อชิ้นต้องเห็นสตางค์ ไม่งั้น 12.67 กับ 12.99 จะดูเท่ากันหมด */
function baht(value: number, locale: string): string {
  return `฿${value.toLocaleString(locale === "th" ? "th-TH" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** ติดลบใช้ − (U+2212) ให้ตรงกับตัวเลขจำนวนชิ้นด้านบน ไม่ใช่ยัดไว้หลัง ฿ */
function signedBaht(value: number, locale: string): string {
  return `${value < 0 ? "−" : ""}${baht(Math.abs(value), locale)}`;
}

function displayName(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email || user.id;
}

export default function StockHistoryPage() {
  const { locale } = useLocale();
  const t = content[locale];

  const shopsQuery = useShops();
  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data]);
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  // ร้านที่เคยเลือกอาจถูกลบไปแล้ว — ตกกลับไปร้านแรกเหมือนที่ layout ทำ
  const shopId =
    (selectedShopId && shops.some((shop) => shop.id === selectedShopId)
      ? selectedShopId
      : shops[0]?.id) ?? "";
  const shopName = shops.find((shop) => shop.id === shopId)?.name ?? t.noShop;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<Draft>(EMPTY_DRAFT);

  const filters: MovementFilters = useMemo(
    () => ({
      limit: PAGE_LIMIT,
      from: toIso(applied.from, false),
      to: toIso(applied.to, true),
      shopProductId: applied.shopProductId || undefined,
      actorId: applied.actorId || undefined,
      movementType: (applied.movementType || undefined) as
        | StockMovement["movementType"]
        | undefined,
    }),
    [applied],
  );

  const movementsQuery = useStockMovements(shopId || undefined, filters);
  const shopProductsQuery = useShopProducts(shopId || undefined, { limit: 100 });
  const staffQuery = useShopStaff(shopId || undefined);
  const meQuery = useMe();

  const rows = useMemo(
    () => movementsQuery.data?.items ?? [],
    [movementsQuery.data],
  );

  const shopProducts = useMemo(
    () => shopProductsQuery.data?.items ?? [],
    [shopProductsQuery.data],
  );

  const productNames = useMemo(
    () => new Map(shopProducts.map((item) => [item.id, item.product.name])),
    [shopProducts],
  );

  /**
   * actorId เป็น user id — ประกอบชื่อจากพนักงานของร้าน บวกตัวเจ้าของเองที่ไม่อยู่ในลิสต์พนักงาน
   *
   * ห้ามอ้าง t.* ในนี้ — React Compiler อ่าน dependency ของ `t.me` เป็น `t` ทั้งก้อน
   * ซึ่งกว้างกว่าที่ประกาศไว้ มันจะทิ้ง memo ทั้ง component แล้วฟ้อง
   * react-hooks/preserve-manual-memoization ตอน lint
   */
  const actorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of staffQuery.data ?? []) {
      map.set(entry.user.id, displayName(entry.user));
    }
    const me = meQuery.data;
    if (me) map.set(me.id, displayName(me));
    return map;
  }, [staffQuery.data, meQuery.data]);

  const people = useMemo(() => [...actorNames.entries()], [actorNames]);

  const totals = useMemo(() => {
    let stockIn = 0;
    let stockOut = 0;
    let costValue = 0;
    let withoutCost = 0;
    for (const row of rows) {
      if (row.quantityDelta >= 0) stockIn += row.quantityDelta;
      else stockOut += -row.quantityDelta;

      /**
       * ทุนที่เป็น null คือ "ยังไม่มีข้อมูล" ไม่ใช่ 0 — ถ้านับเป็น 0 เข้าไปในผลรวม
       * มูลค่าจะต่ำกว่าความจริงโดยไม่มีอะไรบอก จึงนับแยกแล้วเอาไปบอกใต้ตัวเลขแทน
       */
      const cost = toCost(row.unitCost);
      if (cost === null) withoutCost += 1;
      else costValue += cost * row.quantityDelta;
    }
    return {
      stockIn,
      stockOut,
      net: stockIn - stockOut,
      costValue,
      withoutCost,
    };
  }, [rows]);

  const hasFilters = Object.values(applied).some((value) => value !== "");
  const draftDirty = MOVEMENT_KEYS.some((key) => draft[key] !== applied[key]);

  const patch = (next: Partial<Draft>) =>
    setDraft((previous) => ({ ...previous, ...next }));

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={t.statIn}
              value={`+${totals.stockIn.toLocaleString()}`}
              unit={t.statUnit}
              tone="text-status-green"
              note={t.statNote(rows.length)}
            />
            <StatTile
              label={t.statOut}
              value={`−${totals.stockOut.toLocaleString()}`}
              unit={t.statUnit}
              tone="text-destructive"
              note={t.statNote(rows.length)}
            />
            <StatTile
              label={t.statNet}
              value={`${totals.net > 0 ? "+" : ""}${totals.net.toLocaleString()}`}
              unit={t.statUnit}
              tone={totals.net < 0 ? "text-destructive" : "text-foreground"}
              note={shopName}
            />
            <StatTile
              label={t.statCost}
              value={signedBaht(totals.costValue, locale)}
              unit=""
              tone={
                totals.costValue < 0 ? "text-destructive" : "text-foreground"
              }
              note={t.statCostNote(totals.withoutCost)}
            />
          </div>

          <Card className="p-0">
            <div className="flex flex-wrap items-end gap-2.5 px-5 py-4">
              <Field label={t.shop}>
                {/* Base UI ให้ <Select.Value /> แสดง "ค่า" ไม่ใช่ข้อความใน SelectItem
                    ถ้าใช้ตรงๆ จะได้ UUID โผล่มา จึงเรนเดอร์ชื่อเอง */}
                <Select
                  value={shopId}
                  onValueChange={(value) => {
                    if (value) setSelectedShopId(String(value));
                  }}
                >
                  <SelectTrigger className="min-w-44">
                    <span className="flex-1 truncate text-left">{shopName}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((shop) => (
                      <SelectItem key={shop.id} value={shop.id}>
                        {shop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t.from}>
                <input
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) => patch({ from: event.target.value })}
                  className="h-8 rounded-lg border border-border bg-background px-3 font-mono text-[13px]"
                />
              </Field>

              <Field label={t.to}>
                <input
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) => patch({ to: event.target.value })}
                  className="h-8 rounded-lg border border-border bg-background px-3 font-mono text-[13px]"
                />
              </Field>

              <Field label={t.productLabel}>
                <Select
                  value={draft.shopProductId}
                  onValueChange={(value) =>
                    patch({ shopProductId: String(value ?? "") })
                  }
                >
                  <SelectTrigger className="min-w-44">
                    <span className="flex-1 truncate text-left">
                      {draft.shopProductId
                        ? (productNames.get(draft.shopProductId) ?? t.allProducts)
                        : t.allProducts}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t.allProducts}</SelectItem>
                    {shopProducts.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t.personLabel}>
                <Select
                  value={draft.actorId}
                  onValueChange={(value) => patch({ actorId: String(value ?? "") })}
                >
                  <SelectTrigger className="min-w-36">
                    <span className="flex-1 truncate text-left">
                      {draft.actorId
                        ? (actorNames.get(draft.actorId) ?? t.allPeople)
                        : t.allPeople}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t.allPeople}</SelectItem>
                    {people.map(([id, label]) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t.typeColumn}>
                <Select
                  value={draft.movementType}
                  onValueChange={(value) =>
                    patch({ movementType: String(value ?? "") })
                  }
                >
                  <SelectTrigger className="min-w-32">
                    <span className="flex-1 truncate text-left">
                      {draft.movementType
                        ? t.typeLabel[draft.movementType as MovementType]
                        : t.allTypes}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t.allTypes}</SelectItem>
                    {MOVEMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t.typeLabel[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Button
                variant="dark"
                size="sm"
                disabled={!draftDirty}
                onClick={() => setApplied(draft)}
              >
                {t.filterBtn}
              </Button>
              {(hasFilters || draftDirty) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(EMPTY_DRAFT);
                    setApplied(EMPTY_DRAFT);
                  }}
                >
                  {t.clearBtn}
                </Button>
              )}
            </div>

            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-190 border-collapse text-sm">
                <colgroup>
                  <col className="w-40" />
                  <col />
                  <col className="w-44" />
                  <col className="w-40" />
                  <col className="w-28" />
                  <col className="w-36" />
                  <col className="w-48" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    {t.columns.map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-5 py-3 text-xs font-medium tracking-[0.05em] whitespace-nowrap text-muted-foreground uppercase ${
                          index === 2 || index === 3
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-10 text-center text-muted-foreground"
                      >
                        {movementsQuery.isLoading
                          ? t.loading
                          : hasFilters
                            ? t.emptyFiltered
                            : t.empty}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const positive = row.quantityDelta >= 0;
                    const type = row.movementType;
                    const cost = toCost(row.unitCost);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString(
                            locale === "th" ? "th-TH" : "en-US",
                            {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </td>
                        <td className="truncate px-5 py-3.5 font-medium">
                          {productNames.get(row.shopProductId) ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <span
                            className={`font-mono text-[13px] font-semibold ${
                              positive ? "text-status-green" : "text-destructive"
                            }`}
                          >
                            {positive ? "+" : ""}
                            {row.quantityDelta}
                          </span>
                          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                            ({row.quantityBefore} → {row.quantityAfter})
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          {cost === null ? (
                            <span className="font-mono text-[13px] text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <>
                              <span className="font-mono text-[13px]">
                                {baht(cost, locale)}
                              </span>
                              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                                ({baht(cost * Math.abs(row.quantityDelta), locale)}
                                )
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={TYPE_BADGE[type]}>
                            {t.typeLabel[type]}
                          </Badge>
                        </td>
                        <td className="truncate px-5 py-3.5 text-muted-foreground">
                          {row.actorId
                            ? (actorNames.get(row.actorId) ?? "—")
                            : t.system}
                        </td>
                        <td className="truncate px-5 py-3.5 text-[13px] text-muted-foreground">
                          {row.note ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length >= PAGE_LIMIT && (
              <div className="border-t border-border bg-secondary px-5 py-2.5 text-xs text-muted-foreground">
                {t.capped}
              </div>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}

const MOVEMENT_KEYS = [
  "from",
  "to",
  "shopProductId",
  "actorId",
  "movementType",
] as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  tone,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  tone: string;
  note: string;
}) {
  return (
    <Card className="gap-1 px-5 py-4">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-2xl font-bold ${tone}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{note}</div>
    </Card>
  );
}
