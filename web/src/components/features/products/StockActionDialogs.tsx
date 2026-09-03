"use client";

import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useLocale } from "@/components/i18n/LocaleContext";
import {
  ApiErrorNotice,
  toApiFailure,
  type ApiFailure,
} from "@/components/shared/ApiErrorNotice";
import { api, withQuery } from "@/lib/api-client";
import {
  invalidateStockAndSales,
  type Shop,
  type ShopProduct,
} from "@/lib/hooks/use-inventory";

/**
 * สองการกระทำที่ปุ่ม +/− เดิมทำแทนไม่ได้ เพราะมันเปลี่ยนแค่จำนวนโดยไม่บอกสาเหตุ
 *
 * ขายออก — ยิง POST /shops/:id/sales ไม่ใช่ stock/adjust เพราะการขายต้องมีบิล
 * เส้นนี้สร้าง Sale + SaleItem + ตัดสต็อกให้เองผ่าน movementType 'SALE' ครบในทีเดียว
 * ห้ามยิง stock/adjust ตามหลัง สต็อกจะถูกหักสองรอบ ยอดคิดจาก sellPrice ปัจจุบัน
 *
 * ย้ายสต็อก — ยิง POST /shops/:id/stock/transfer คำขอเดียว ฝั่ง api ลดต้นทางกับ
 * เพิ่มปลายทางในทรานแซกชันเดียว ทั้งคู่เป็น MANUAL_ADJUSTMENT จึงไม่แตะยอดขาย
 * ของร้านไหนเลย ตรงตามที่ควรเป็น ของแค่ย้ายที่ ไม่ได้ขาย
 *
 * ปรับสต็อก — รับของเข้า / ตัดของเสีย / แก้ตัวเลขให้ตรงกับที่นับได้จริง ยิง
 * stock/adjust ตรง ๆ ไม่ใช่การขาย จึงไม่แตะยอดรายได้
 *
 * เดิมหน้านี้ยิง stock/adjust สองครั้งเองพร้อม compensating rollback ฝั่ง client
 * ซึ่งแปลว่าถ้าปิดแท็บหรือเน็ตหลุดคาระหว่างสองคำขอ ของจะหายจากต้นทางโดยไม่ถึง
 * ปลายทาง และไม่มีอะไรตามเก็บเพราะตัวที่ต้องคืนของอยู่ในเบราว์เซอร์ที่ตายไปแล้ว
 * ตอนนี้ย้ายไปทำที่ api หมดแล้ว หน้านี้จึงไม่ต้องรู้เรื่อง rollback อีก
 *
 * ⚠️ setSaving(false) ต้องอยู่ใน finally เสมอ ห้ามอยู่แค่ใน catch
 * ทั้งสามกล่องถูก mount ค้างไว้ในหน้า /products ตลอดเวลา (page.tsx ท้ายไฟล์)
 * การปิดคือส่ง row = null ไม่ใช่การ unmount — state ทั้งหมดจึงอยู่ต่อ
 * ถ้าปลดเฉพาะตอน error ทางที่บันทึกสำเร็จจะทิ้ง saving = true ค้างไว้ แล้วครั้ง
 * ต่อไปที่เปิดกล่องเดิมจะเจอปุ่ม "กำลังบันทึก…" ที่กดไม่ได้ ปิดก็ไม่ได้
 * (ทั้ง onOpenChange และปุ่มยกเลิกถูก !saving กันไว้หมด) ต้องรีเฟรชหน้าอย่างเดียว
 */

type ShopProductRow = {
  id: string;
  productId: string;
  status: string;
  stockQty: number;
};

const content = {
  th: {
    sellTitle: "ขายออก",
    sellDesc:
      "บันทึกการขายที่ไม่ได้ผ่านหน้า POS — ระบบจะเปิดบิลจริงและตัดสต็อกให้",
    transferTitle: "ย้ายสต็อกไปอีกร้าน",
    transferDesc:
      "ของแค่ย้ายที่ ไม่ได้ขาย ยอดขายของทั้งสองร้านจึงไม่ขยับ",
    qty: "จำนวน",
    available: (n: number, unit: string) => `มีอยู่ ${n} ${unit}`,
    remaining: (n: number) => `เหลือ ${n}`,
    amount: "เป็นเงิน",
    destination: "ย้ายไปร้าน",
    pickShop: "เลือกร้านปลายทาง",
    noDestination:
      "ไม่มีร้านอื่นที่ขายสินค้าตัวนี้ — ต้องลงสินค้าเข้าร้านปลายทางก่อนถึงจะย้ายได้",
    confirmSell: "บันทึกการขาย",
    confirmTransfer: "ย้ายสต็อก",
    saving: "กำลังบันทึก…",
    cancel: "ยกเลิก",
    tooMany: "จำนวนเกินของที่มีอยู่",
    sellNote: "ขายหน้าร้าน (บันทึกจากหน้าสินค้า)",
    adjustTitle: "ปรับสต็อก",
    adjustDesc:
      "รับของเข้า ตัดของเสีย หรือแก้ตัวเลขให้ตรงกับที่นับได้จริง — ไม่นับเป็นยอดขาย",
    directionIn: "รับเข้า",
    directionOut: "ตัดออก",
    resulting: (n: number) => `จะเหลือ ${n}`,
    adjustNoteLabel: "หมายเหตุ (ไม่บังคับ)",
    adjustNotePh: "เช่น รับของจากซัพพลายเออร์ / ของหมดอายุ / นับสต็อกใหม่",
    confirmAdjust: "บันทึก",
    defaultAdjustNote: "ปรับจากหน้าสินค้า",
    negative: "ตัดออกมากกว่าของที่มีอยู่",
    unitCostLabel: "ทุนต่อชิ้นของล็อตนี้ (ไม่บังคับ)",
    unitCostPh: (n: string) => `ปล่อยว่าง = ใช้ทุนเดิม ${n}`,
    unitCostHint:
      "ถ้าล็อตนี้รับมาราคาไม่เท่าเดิม ใส่ทุนใหม่ไว้ ระบบจะเก็บแยกล็อตแล้วตัดของเก่าก่อนตอนขาย — ทุนของเก่าจะไม่ถูกตีเป็นราคาใหม่",
    unitCostInvalid: "ทุนต้องไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง",
  },
  en: {
    sellTitle: "Record a sale",
    sellDesc:
      "For sales that did not go through POS — this creates a real bill and takes the stock out.",
    transferTitle: "Move stock to another shop",
    transferDesc:
      "Stock only changes place — neither shop's revenue moves.",
    qty: "Quantity",
    available: (n: number, unit: string) => `${n} ${unit} on hand`,
    remaining: (n: number) => `${n} left`,
    amount: "Amount",
    destination: "Move to",
    pickShop: "Pick a destination shop",
    noDestination:
      "No other shop sells this product yet — list it there first, then you can move stock.",
    confirmSell: "Record sale",
    confirmTransfer: "Move stock",
    saving: "Saving…",
    cancel: "Cancel",
    tooMany: "More than what is on hand",
    sellNote: "Counter sale (recorded from the products page)",
    adjustTitle: "Adjust stock",
    adjustDesc:
      "Receiving goods, writing off damage, or correcting the count — never counted as revenue.",
    directionIn: "Receive",
    directionOut: "Write off",
    resulting: (n: number) => `${n} after this`,
    adjustNoteLabel: "Note (optional)",
    adjustNotePh: "e.g. delivery from supplier / expired / recount",
    confirmAdjust: "Save",
    defaultAdjustNote: "Adjusted from the products page",
    negative: "More than what is on hand",
    unitCostLabel: "Unit cost for this batch (optional)",
    unitCostPh: (n: string) => `Leave empty to keep ${n}`,
    unitCostHint:
      "If this batch cost a different amount, enter it here. It is stored as its own batch and older stock is sold first, so the old cost is not overwritten.",
    unitCostInvalid: "Cost must be zero or more, with at most 2 decimals",
  },
};


/** เงินสองตำแหน่งเสมอ — ฿12 กับ ฿12.50 วางเรียงกันแล้วอ่านยากถ้าไม่เท่ากัน */
function baht(value: number): string {
  return `฿${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ------------------------------------------------------------------ ขายออก */

export function SellStockDialog({
  row,
  shopId,
  onClose,
}: {
  row: ShopProduct | null;
  shopId: string | undefined;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();

  const [qty, setQty] = useState("1");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = row ? Number(qty || 0) * Number(row.sellPrice) : 0;
  const quantity = Number(qty || 0);
  const tooMany = row ? quantity > row.stockQty : false;
  const canSubmit =
    row !== null && Number.isInteger(quantity) && quantity > 0 && !tooMany;

  const close = () => {
    setQty("1");
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!row || !shopId || !canSubmit || saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/backend/shops/${shopId}/sales`, {
        items: [{ shopProductId: row.id, quantity }],
        note: t.sellNote,
      });
      invalidateStockAndSales(queryClient);
      close();
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      // ต้องปลดทุกทาง ไม่ใช่แค่ตอน error — ดูหมายเหตุหัวไฟล์
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(next) => !next && !saving && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.sellTitle}
            {row && (
              <span className="ml-2 font-normal text-muted-foreground">
                — {row.product.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{t.sellDesc}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.qty}
          </span>
          <Input
            type="number"
            min={1}
            max={row?.stockQty}
            value={qty}
            autoFocus
            onChange={(event) => setQty(event.target.value)}
            className="text-right font-mono"
          />
          <span className="text-xs text-muted-foreground">
            {row ? t.available(row.stockQty, row.product.unit) : ""}
            {row && canSubmit
              ? ` · ${t.remaining(row.stockQty - quantity)}`
              : ""}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-2.5">
          <span className="text-[13px] text-muted-foreground">{t.amount}</span>
          <span className="font-mono text-lg font-bold">
            ฿
            {amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {(tooMany || error) && (
          <ApiErrorNotice error={error} fallback={t.tooMany} />
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={close}>
            {t.cancel}
          </Button>
          <Button
            variant="gradient"
            size="sm"
            disabled={!canSubmit || saving}
            onClick={submit}
          >
            {saving ? t.saving : t.confirmSell}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ ปรับสต็อก */

export function AdjustStockDialog({
  row,
  shopId,
  onClose,
}: {
  row: ShopProduct | null;
  shopId: string | undefined;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);

  const quantity = Number(qty || 0);
  const resulting = row
    ? row.stockQty + (direction === "INCREASE" ? quantity : -quantity)
    : 0;
  const negative = resulting < 0;

  /**
   * ทุนกรอกได้เฉพาะตอนรับเข้า — ตอนตัดออกไม่มีความหมาย เพราะของที่ตัดออก
   * ใช้ทุนของล็อตที่ถูกตัดจริง ไม่ใช่ตัวเลขที่ผู้ใช้พิมพ์
   *
   * เงื่อนไขตรงกับฝั่ง api (adjust-stock.dto.ts) — ไม่ติดลบ ทศนิยมไม่เกิน 2
   * เช็คที่นี่ด้วยเพื่อบอกผู้ใช้ก่อนยิง ไม่ใช่ปล่อยให้ไปเจอ 400 กลับมา
   */
  const costTouched = direction === "INCREASE" && unitCost.trim() !== "";
  const costValue = Number(unitCost);
  const costInvalid =
    costTouched &&
    (!Number.isFinite(costValue) ||
      costValue < 0 ||
      !Number.isInteger(Math.round(costValue * 100)) ||
      Math.round(costValue * 100) / 100 !== costValue);

  const canSubmit =
    row !== null &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    !negative &&
    !costInvalid;

  const close = () => {
    setDirection("INCREASE");
    setQty("1");
    setUnitCost("");
    setNote("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!row || !shopId || !canSubmit || saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/backend/shops/${shopId}/stock/adjust`, {
        shopProductId: row.id,
        operation: direction,
        quantity,
        note: note.trim() || t.defaultAdjustNote,
        // ไม่ส่งฟิลด์นี้เลยเมื่อผู้ใช้ไม่ได้กรอก api จะใช้ทุนเดิมของสินค้าแทน
        ...(costTouched ? { unitCost: costValue } : {}),
      });
      invalidateStockAndSales(queryClient);
      close();
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      // ต้องปลดทุกทาง ไม่ใช่แค่ตอน error — ดูหมายเหตุหัวไฟล์
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(next) => !next && !saving && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.adjustTitle}
            {row && (
              <span className="ml-2 font-normal text-muted-foreground">
                — {row.product.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{t.adjustDesc}</DialogDescription>
        </DialogHeader>

        <span className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["INCREASE", t.directionIn],
              ["DECREASE", t.directionOut],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                direction === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </span>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.qty}
          </span>
          <Input
            type="number"
            min={1}
            value={qty}
            autoFocus
            onChange={(event) => setQty(event.target.value)}
            className="text-right font-mono"
          />
          <span className="text-xs text-muted-foreground">
            {row ? t.available(row.stockQty, row.product.unit) : ""}
            {row && quantity > 0 && !negative
              ? ` · ${t.resulting(resulting)}`
              : ""}
          </span>
        </div>

        {direction === "INCREASE" && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {t.unitCostLabel}
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              placeholder={row ? t.unitCostPh(baht(Number(row.costPrice))) : ""}
              className="text-right font-mono"
            />
            <span
              className={`text-xs ${costInvalid ? "text-destructive" : "text-muted-foreground"}`}
            >
              {costInvalid ? t.unitCostInvalid : t.unitCostHint}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t.adjustNoteLabel}
          </span>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.adjustNotePh}
            maxLength={500}
          />
        </div>

        {(negative || error) && (
          <ApiErrorNotice error={error} fallback={t.negative} />
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={close}>
            {t.cancel}
          </Button>
          <Button
            variant="dark"
            size="sm"
            disabled={!canSubmit || saving}
            onClick={submit}
          >
            {saving ? t.saving : t.confirmAdjust}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------- ย้ายสต็อก */

export function TransferStockDialog({
  row,
  shopId,
  shops,
  onClose,
}: {
  row: ShopProduct | null;
  shopId: string | undefined;
  shops: Shop[];
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();

  const [qty, setQty] = useState("1");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);

  const others = useMemo(
    () => shops.filter((shop) => shop.id !== shopId),
    [shops, shopId],
  );

  /** ปลายทางต้องมี shopProductId ของสินค้าตัวนี้อยู่แล้ว ถึงจะเพิ่มสต็อกให้ได้ */
  const destinationQueries = useQueries({
    queries: others.map((shop) => ({
      queryKey: ["catalog", "shop-products", shop.id],
      queryFn: () =>
        api.get<{ items: ShopProductRow[] }>(
          withQuery(`/api/backend/shops/${shop.id}/products`, { limit: 100 }),
        ),
      enabled: row !== null,
    })),
  });

  const candidates = useMemo(() => {
    const list: { shop: Shop; shopProductId: string }[] = [];
    if (!row) return list;
    destinationQueries.forEach((query, index) => {
      const shop = others[index];
      if (!shop || !query.data) return;
      const match = query.data.items.find(
        (item) =>
          item.productId === row.product.id && item.status === "ACTIVE",
      );
      if (match) list.push({ shop, shopProductId: match.id });
    });
    return list;
  }, [destinationQueries, others, row]);

  const picked = candidates.find((item) => item.shop.id === destination);
  const quantity = Number(qty || 0);
  const tooMany = row ? quantity > row.stockQty : false;
  const canSubmit =
    row !== null &&
    picked !== undefined &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    !tooMany;

  const close = () => {
    setQty("1");
    setDestination("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!row || !shopId || !picked || !canSubmit || saving) return;
    setError(null);
    setSaving(true);

    try {
      // คำขอเดียว ทรานแซกชันเดียวฝั่ง api — ถ้าล้ม Postgres คืนค่าให้ทั้งสองขาเอง
      await api.post(`/api/backend/shops/${shopId}/stock/transfer`, {
        shopProductId: row.id,
        toShopId: picked.shop.id,
        quantity,
      });

      invalidateStockAndSales(queryClient);
      close();
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      // ต้องปลดทุกทาง ไม่ใช่แค่ตอน error — ดูหมายเหตุหัวไฟล์
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(next) => !next && !saving && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.transferTitle}
            {row && (
              <span className="ml-2 font-normal text-muted-foreground">
                — {row.product.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{t.transferDesc}</DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            {t.noDestination}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {t.destination}
              </span>
              {/* Base UI ให้ <Select.Value /> แสดง "ค่า" ไม่ใช่ข้อความใน SelectItem
                  ถ้าใช้ตรง ๆ จะได้ UUID โผล่มา จึงเรนเดอร์ชื่อร้านเอง */}
              <Select
                value={destination}
                onValueChange={(value) => setDestination(String(value ?? ""))}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 truncate text-left">
                    {picked?.shop.name ?? t.pickShop}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((item) => (
                    <SelectItem key={item.shop.id} value={item.shop.id}>
                      {item.shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {t.qty}
              </span>
              <Input
                type="number"
                min={1}
                max={row?.stockQty}
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className="text-right font-mono"
              />
              <span className="text-xs text-muted-foreground">
                {row ? t.available(row.stockQty, row.product.unit) : ""}
                {row && quantity > 0 && !tooMany
                  ? ` · ${t.remaining(row.stockQty - quantity)}`
                  : ""}
              </span>
            </div>
          </>
        )}

        {(tooMany || error) && (
          <ApiErrorNotice error={error} fallback={t.tooMany} />
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={close}>
            {t.cancel}
          </Button>
          <Button
            variant="dark"
            size="sm"
            disabled={!canSubmit || saving}
            onClick={submit}
          >
            {saving ? t.saving : t.confirmTransfer}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
