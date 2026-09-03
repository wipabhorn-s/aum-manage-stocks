"use client";

import { useState } from "react";
import Link from "next/link";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Caption from "@/components/shared/Caption";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useSelectedShop } from "@/components/shared/SelectedShopContext";
import { ApiError } from "@/lib/api-client";
import { useMySubscription, useShops } from "@/lib/hooks/use-inventory";
import {
  useAiRecommendations,
  useDismissAiRecommendation,
  useGenerateAiRecommendations,
  type AiRecommendation,
  type AiRecommendationType,
} from "@/lib/hooks/use-ai-recommendations";

/**
 * [อั้ม] คำแนะนำจาก AI — Pro Plan เท่านั้น (ต่างจากแชทบอทที่ Plus ก็ใช้ได้)
 *
 * หน้านี้ "อ่าน" อย่างเดียวเป็นค่าเริ่มต้น — มันโหลดผลที่ generate ไว้แล้วจาก
 * ตาราง ai_recommendations ไม่ได้ยิง LLM ตอนเปิดหน้า การยิง LLM เกิดเฉพาะตอน
 * กดปุ่ม "วิเคราะห์ใหม่" เท่านั้น เพราะมันช้าและมีต้นทุนจริง
 *
 * ปุ่มวิเคราะห์ใหม่ "ลบคำแนะนำชุดเดิมทิ้งแล้วสร้างใหม่ทั้งชุด" ไม่ใช่เพิ่มต่อท้าย
 * เพราะคำแนะนำเก่าอ้างตัวเลขสต็อกที่เปลี่ยนไปแล้ว ปล่อยไว้จะทำให้ตัดสินใจผิด
 */

const TYPE_STYLE: Record<AiRecommendationType, string> = {
  RESTOCK: "bg-status-red/12 text-status-red",
  CLEARANCE: "bg-status-orange/15 text-brand-dark",
  PROMOTION: "bg-status-green/12 text-status-green",
};

const content = {
  th: {
    title: "คำแนะนำจาก AI",
    heading: "สิ่งที่ควรทำกับสต็อกตอนนี้",
    sub: "วิเคราะห์จากสต็อกคงเหลือ จุดแจ้งเตือน และยอดขายย้อนหลัง 30 วันของร้านนี้",
    generate: "วิเคราะห์ใหม่",
    generating: "กำลังวิเคราะห์…",
    generateHint:
      "จะลบคำแนะนำชุดเดิมที่ยังไม่ได้ปิดทิ้ง แล้วสร้างใหม่ทั้งชุดจากตัวเลขล่าสุด",
    dismiss: "ปิดรายการนี้",
    dismissing: "กำลังปิด…",
    showDismissed: "แสดงรายการที่ปิดไปแล้ว",
    hideDismissed: "ซ่อนรายการที่ปิดไปแล้ว",
    dismissed: "ปิดแล้ว",
    loading: "กำลังโหลด…",
    empty: "ยังไม่มีคำแนะนำ — กดวิเคราะห์ใหม่เพื่อให้ AI ดูตัวเลขร้านนี้",
    emptyAfter: "AI ดูแล้วไม่พบประเด็นที่ต้องรีบจัดการในตอนนี้",
    types: {
      RESTOCK: "ควรเติมสต็อก",
      CLEARANCE: "ควรระบายออก",
      PROMOTION: "ควรจัดโปร",
    } as Record<AiRecommendationType, string>,
    mStock: "คงเหลือ",
    mThreshold: "จุดแจ้งเตือน",
    mSold: "ขายได้ 30 วัน",
    mLastSale: "ขายล่าสุด",
    daysAgo: "วันก่อน",
    neverSold: "ไม่เคยขาย",
    today: "วันนี้",
    generatedAt: "วิเคราะห์เมื่อ",
    expired: "ตัวเลขที่อ้างอิงเก่าเกิน 7 วันแล้ว ควรวิเคราะห์ใหม่",
    noShop: "ยังไม่มีร้าน — สร้างร้านก่อน",
    createShop: "ไปสร้างร้าน",
    lockedBadge: "PRO",
    lockedHeading: "คำแนะนำจาก AI ใช้ได้เฉพาะแพ็กเกจ Pro",
    lockedBody:
      "ให้ AI ดูสต็อกคงเหลือกับยอดขายจริงของร้าน แล้วบอกว่าตัวไหนควรเติม ตัวไหนค้างสต็อกจนควรระบายออก โดยอ้างตัวเลขให้ดูทุกครั้ง",
    upgrade: "ดูแพ็กเกจทั้งหมด →",
    footer:
      "คำแนะนำเป็นเพียงข้อเสนอจากตัวเลข ไม่ได้แก้สต็อกให้เอง การตัดสินใจยังเป็นของคุณ",
  },
  en: {
    title: "AI Recommendations",
    heading: "What to do with your stock right now",
    sub: "Based on this shop's stock levels, alert thresholds and the last 30 days of sales.",
    generate: "Re-analyze",
    generating: "Analyzing…",
    generateHint:
      "Discards the current set that hasn't been dismissed and rebuilds it from the latest numbers.",
    dismiss: "Dismiss",
    dismissing: "Dismissing…",
    showDismissed: "Show dismissed",
    hideDismissed: "Hide dismissed",
    dismissed: "Dismissed",
    loading: "Loading…",
    empty: "Nothing yet — hit Re-analyze to let the AI look at this shop.",
    emptyAfter: "The AI found nothing urgent to act on right now.",
    types: {
      RESTOCK: "Restock",
      CLEARANCE: "Clear out",
      PROMOTION: "Promote",
    } as Record<AiRecommendationType, string>,
    mStock: "In stock",
    mThreshold: "Alert at",
    mSold: "Sold in 30d",
    mLastSale: "Last sold",
    daysAgo: "days ago",
    neverSold: "never sold",
    today: "today",
    generatedAt: "Analyzed",
    expired: "The numbers behind this are over 7 days old — re-analyze.",
    noShop: "No shop yet — create one first.",
    createShop: "Create a shop",
    lockedBadge: "PRO",
    lockedHeading: "AI Recommendations require the Pro plan",
    lockedBody:
      "Let the AI read your real stock levels and sales, then tell you what to restock and what has gone stale enough to clear out — always showing the numbers behind it.",
    upgrade: "See all plans →",
    footer:
      "These are suggestions drawn from your numbers. Nothing is changed automatically — the call is still yours.",
  },
};

export default function InsightsPage() {
  const { locale } = useLocale();
  const t = content[locale];

  const shopsQuery = useShops();
  const shops = shopsQuery.data ?? [];
  const { selectedShopId } = useSelectedShop();
  // ร้านที่เคยเลือกอาจถูกลบไปแล้ว — ตกกลับไปร้านแรกเหมือนหน้าอื่น
  const shopId =
    selectedShopId && shops.some((shop) => shop.id === selectedShopId)
      ? selectedShopId
      : shops[0]?.id;

  const [includeDismissed, setIncludeDismissed] = useState(false);

  const subscriptionQuery = useMySubscription();
  const plan = subscriptionQuery.data?.subscription.plan;
  const readOnly = subscriptionQuery.data?.readOnly ?? false;

  const listQuery = useAiRecommendations(shopId, { includeDismissed });
  const generate = useGenerateAiRecommendations(shopId);
  const dismiss = useDismissAiRecommendation();

  const items = listQuery.data ?? [];

  /**
   * กันหน้าจอไว้ตั้งแต่ฝั่ง client เพื่อไม่ให้ผู้ใช้เจอ error สีแดงเปล่า ๆ
   * แต่นี่เป็นแค่ UX — ด่านจริงอยู่ที่ api (ai-access.service.ts) ซึ่งเช็ค
   * ทั้งสิทธิ์พนักงานและแพ็กเกจ ไม่ได้พึ่งหน้านี้
   */
  const locked = plan ? !plan.aiRecommendationEnabled : false;

  if (!shopsQuery.isLoading && shops.length === 0) {
    return (
      <>
        <TopBar title={t.title} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
          <Card>
            <div className="flex flex-col items-start gap-3 px-5 py-4">
              <p className="text-sm text-muted-foreground">{t.noShop}</p>
              <Button render={<Link href="/shops" />} variant="dark" size="sm">
                {t.createShop}
              </Button>
            </div>
          </Card>
        </main>
      </>
    );
  }

  if (locked) {
    return (
      <>
        <TopBar title={t.title} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
          <div className="flex justify-center">
            <div className="max-w-xl rounded-3xl bg-secondary px-10 py-12 text-center">
              <div className="mx-auto mb-5 flex size-18 items-center justify-center rounded-full bg-primary text-3xl">
                🔒
              </div>
              <span className="mb-4 inline-block rounded-full bg-primary px-3.5 py-1 text-[11px] font-bold tracking-widest text-primary-foreground">
                {t.lockedBadge}
              </span>
              <h2 className="mb-3 font-heading text-xl font-bold text-foreground">
                {t.lockedHeading}
              </h2>
              <p className="mx-auto mb-7 max-w-md text-sm leading-relaxed text-muted-foreground">
                {t.lockedBody}
              </p>
              <Button render={<Link href="/membership?upgrade=1" />} variant="dark">
                {t.upgrade}
              </Button>
            </div>
          </div>
        </main>
      </>
    );
  }

  const listError = listQuery.error as ApiError | null;

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5">
              <div className="min-w-0">
                <div className="font-heading text-base font-bold text-foreground">
                  {t.heading}
                </div>
                <Caption className="mt-1">{t.sub}</Caption>
              </div>

              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="dark"
                  size="sm"
                  disabled={!shopId || generate.isPending || readOnly}
                  onClick={() => generate.mutate()}
                >
                  {generate.isPending ? t.generating : t.generate}
                </Button>
                <span className="max-w-56 text-right text-[11px] leading-snug text-muted-foreground">
                  {t.generateHint}
                </span>
              </div>
            </div>
          </Card>

          {(listError || generate.error) && (
            <p className="rounded-md border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
              {(listError ?? (generate.error as ApiError)).message}
            </p>
          )}

          {listQuery.isLoading ? (
            <Card>
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {t.loading}
              </p>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {/* แยกสองข้อความ — "ยังไม่เคยกด" กับ "กดแล้วแต่ไม่มีประเด็น" ไม่เหมือนกัน */}
                {generate.isSuccess ? t.emptyAfter : t.empty}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  t={t}
                  locale={locale}
                  disabled={readOnly}
                  dismissing={
                    dismiss.isPending && dismiss.variables === item.id
                  }
                  onDismiss={() => dismiss.mutate(item.id)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIncludeDismissed((open) => !open)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {includeDismissed ? t.hideDismissed : t.showDismissed}
            </button>
            <Caption className="text-right">{t.footer}</Caption>
          </div>
        </div>
      </main>
    </>
  );
}

function RecommendationCard({
  item,
  t,
  locale,
  disabled,
  dismissing,
  onDismiss,
}: {
  item: AiRecommendation;
  t: (typeof content)["th"];
  locale: "th" | "en";
  disabled: boolean;
  dismissing: boolean;
  onDismiss: () => void;
}) {
  const stale = item.validUntil !== null && new Date(item.validUntil) < new Date();

  const lastSale =
    item.metrics === null
      ? null
      : item.metrics.daysSinceLastSale === null
        ? t.neverSold
        : item.metrics.daysSinceLastSale === 0
          ? t.today
          : `${item.metrics.daysSinceLastSale} ${t.daysAgo}`;

  return (
    <Card className={item.isDismissed ? "opacity-55" : undefined}>
      <div className="flex flex-col gap-2.5 px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${TYPE_STYLE[item.type]}`}
          >
            {t.types[item.type]}
          </span>
          {item.isDismissed && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {t.dismissed}
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {t.generatedAt}{" "}
            {new Date(item.generatedAt).toLocaleString(
              locale === "th" ? "th-TH" : "en-GB",
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </span>
        </div>

        <div className="font-heading text-[15px] font-bold text-foreground">
          {item.title}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.content}
        </p>

        {/*
          ตัวเลขที่คำแนะนำอ้างตอนถูกสร้าง — ไม่ใช่ค่าปัจจุบัน จงใจแสดงของเก่า
          เพื่อให้ตรวจได้ว่า AI ตัดสินจากอะไร ถ้าดึงค่าสดมาแสดงจะกลายเป็นคนละเรื่อง
        */}
        {item.metrics && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-secondary px-3 py-2 font-mono text-[12px]">
            <span>
              {t.mStock}{" "}
              <b className="text-foreground">{item.metrics.stockQty}</b>
            </span>
            <span className="text-muted-foreground">
              {t.mThreshold} {item.metrics.lowStockThreshold}
            </span>
            <span className="text-muted-foreground">
              {t.mSold} {item.metrics.soldLast30Days}
            </span>
            <span className="text-muted-foreground">
              {t.mLastSale} {lastSale}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {stale ? (
            <span className="text-[11px] text-status-orange">{t.expired}</span>
          ) : (
            <span />
          )}

          {!item.isDismissed && (
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled || dismissing}
              onClick={onDismiss}
            >
              {dismissing ? t.dismissing : t.dismiss}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
