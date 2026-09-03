"use client";

import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CardPaymentDialog from "@/components/features/payment/CardPaymentDialog";
import UpgradePlanDialog from "@/components/features/membership/UpgradePlanDialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError } from "@/lib/api-client";
import {
  useCancelPayment,
  useCreateSubscriptionPaymentIntent,
  useMySubscription,
  usePayments,
  useRetrySubscriptionPaymentIntent,
} from "@/lib/hooks/use-inventory";

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const STATUS_BADGE = {
  ACTIVE: "success",
  EXPIRED: "error",
  CANCELLED: "neutral",
} as const;

const content = {
  th: {
    title: "สมาชิกและการชำระเงิน",
    statusHeading: "สถานะสมาชิก",
    loading: "กำลังโหลด…",
    activeLabel: "กำลังใช้งาน",
    expiredLabel: "หมดอายุแล้ว",
    cancelledLabel: "ยกเลิกแล้ว",
    readOnlyNote: "แพ็กเกจหมดอายุ ร้านค้าอยู่ในโหมดอ่านอย่างเดียว",
    renewBtn: "ต่ออายุตอนนี้ →",
    renewing: "กำลังต่ออายุ…",
    renewError: "ต่ออายุไม่สำเร็จ",
    buyExtraHeading: "เพิ่มโควต้าด้วยการอัปเกรดแพ็กเกจ",
    buyExtraSub: "ระบบไม่มีการซื้อโควต้าแยก แพ็กเกจที่สูงขึ้นจะเพิ่มสิทธิ์ร้านค้า สินค้า และพนักงานตามแผน",
    qtyLabel: "เลือกแพ็กเกจที่ต้องการ",
    payBtn: "ดูแพ็กเกจ →",
    historyHeading: "ประวัติการชำระเงิน",
    columns: ["วันที่", "รายการ", "จำนวน", "ยอด", "สถานะ"],
    paidLabel: "ชำระแล้ว",
    purposes: { NEW_SUBSCRIPTION: "ซื้อแพ็กเกจ", RENEWAL: "ต่ออายุแพ็กเกจ" } as Record<string, string>,
    statuses: { PAID: "ชำระแล้ว", PENDING: "รอชำระเงิน", FAILED: "ไม่สำเร็จ", CANCELLED: "ยกเลิกแล้ว", REFUNDED: "คืนเงินแล้ว" } as Record<string, string>,
    retryPayment: "ชำระอีกครั้ง",
    retryingPayment: "กำลังเปิดหน้าชำระเงิน…",
    retryError: "เปิดหน้าชำระเงินไม่สำเร็จ",
    payBefore: (at: string) => `ชำระภายใน ${at}`,
    paymentExpired: "หมดเวลาชำระแล้ว",
    historyEmpty: "ยังไม่มีประวัติการชำระเงิน",
    cancelPayment: "ยกเลิก",
    cancelling: "กำลังยกเลิก…",
    cancelError: "ยกเลิกรายการไม่สำเร็จ",
    pendingNotice: "มีรายการชำระเงินค้างอยู่ — ชำระให้เสร็จหรือกดยกเลิกก่อน จึงจะซื้อหรือต่ออายุใหม่ได้",
    renewNotDue: (days: number) => `ต่ออายุได้เมื่อเหลือไม่เกิน 30 วัน (ตอนนี้เหลือ ${days} วัน)`,
  },
  en: {
    title: "Membership & Billing",
    statusHeading: "Membership Status",
    loading: "Loading…",
    activeLabel: "Active",
    expiredLabel: "Expired",
    cancelledLabel: "Cancelled",
    readOnlyNote: "Subscription expired — shops are in read-only mode.",
    renewBtn: "Renew Now →",
    renewing: "Renewing…",
    renewError: "Failed to renew",
    buyExtraHeading: "Increase Quota with a Plan Upgrade",
    buyExtraSub: "There are no separate quota add-ons. Upgrade your plan to increase shop, product, and staff limits.",
    qtyLabel: "Choose a plan",
    payBtn: "View Plans →",
    historyHeading: "Payment History",
    columns: ["Date", "Item", "Qty", "Amount", "Status"],
    paidLabel: "Paid",
    purposes: { NEW_SUBSCRIPTION: "Plan purchase", RENEWAL: "Plan renewal" } as Record<string, string>,
    statuses: { PAID: "Paid", PENDING: "Awaiting payment", FAILED: "Failed", CANCELLED: "Cancelled", REFUNDED: "Refunded" } as Record<string, string>,
    retryPayment: "Pay again",
    retryingPayment: "Opening checkout…",
    retryError: "Could not open checkout",
    payBefore: (at: string) => `Pay before ${at}`,
    paymentExpired: "Payment window closed",
    historyEmpty: "No payments yet",
    cancelPayment: "Cancel",
    cancelling: "Cancelling…",
    cancelError: "Could not cancel this payment",
    pendingNotice: "You have an unfinished payment — pay it or cancel it before starting a new purchase or renewal.",
    renewNotDue: (days: number) => `Renewal opens when 30 days or fewer remain (${days} days left)`,
  },
};

/** ชื่อแพ็กเกจที่แสดงผล — รหัสเดียวกันทั้งไทยและอังกฤษ */
const PLAN_LABEL: Record<string, string> = {
  FREE: "Free",
  PLUS: "Plus",
  PRO: "Pro",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** ต้องตรงกับ RENEWAL_WINDOW_DAYS ฝั่ง api (payment-pricing.util.ts) */
const RENEWAL_WINDOW_DAYS = 30;

/** สถานะจาก api ตรงๆ ไม่ใช่เดาว่าจ่ายแล้วทุกแถว */
const PAYMENT_STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "error",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

/**
 * useSearchParams() บังคับให้ subtree ที่เรียกมันต้องมี Suspense ครอบ ไม่งั้น
 * next build ล้มเพราะหน้านี้ถูก prerender เป็น static — ตัวหน้าจริงจึงอยู่ใน
 * MembershipPageContent แล้วห่อไว้ตรงนี้ชั้นเดียว
 */
export default function MembershipPage() {
  return (
    <Suspense>
      <MembershipPageContent />
    </Suspense>
  );
}

function MembershipPageContent() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = content[locale];
  const subscriptionQuery = useMySubscription();
  const paymentsQuery = usePayments();
  const createPayment = useCreateSubscriptionPaymentIntent();
  const retryPayment = useRetrySubscriptionPaymentIntent();
  const cancelPayment = useCancelPayment();
  const [payment, setPayment] = useState<{ paymentId: string; clientSecret: string; amount: number } | null>(null);
  /**
   * ทางเข้าที่เคยชี้ไป /membership/upgrade (หน้าแรก, หน้าฟีเจอร์ที่ถูกล็อก, ลิงก์
   * ที่บุ๊กมาร์กไว้) เดี๋ยวนี้เด้งมาที่ /membership?upgrade=1 แล้วกล่องเปิดให้เลย
   *
   * ใช้เป็นค่าตั้งต้นของ state ไม่ใช่อ่านสดทุกรอบ — ผู้ใช้ต้องปิดกล่องได้ทั้งที่
   * param ยังคาอยู่ใน URL
   */
  const [upgradeOpen, setUpgradeOpen] = useState(
    () => searchParams.get("upgrade") === "1",
  );
  const [renewError, setRenewError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const subscription = subscriptionQuery.data;
  const statusLabel = locale === "th" ? "สถานะ" : "Status";
  const statusRows = subscription
    ? [
        [
          locale === "th" ? "แพ็กเกจ" : "Plan",
          // ใช้รหัสแพ็กเกจ (FREE / PLUS / PRO) เป็นชื่อที่แสดง ทั้งสองภาษา —
          // เป็นคำเดียวกับที่ขึ้นบนหน้าอัปเกรดและใน pricing ทำให้ผู้ใช้เทียบได้
          // ตรงๆ ส่วน nameTh ("ฟรี/พลัส/โปร") ไม่ถูกใช้แล้วเพื่อไม่ให้มีสองชื่อ
          // ของสิ่งเดียวกัน
          PLAN_LABEL[subscription.subscription.plan.code] ??
            subscription.subscription.plan.code,
        ],
        [statusLabel, subscription.subscription.status],
        [
          locale === "th" ? "วันหมดอายุ" : "Expires",
          subscription.subscription.expiresAt
            ? new Date(subscription.subscription.expiresAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-US")
            : locale === "th" ? "ไม่มีวันหมดอายุ" : "No expiry",
        ],
        [locale === "th" ? "สิทธิ์สร้างร้าน" : "Shop Slots", `${subscription.quotas.shop.used} / ${subscription.quotas.shop.allowed}`],
        [locale === "th" ? "สินค้า" : "Products", `${subscription.quotas.product.used} / ${subscription.quotas.product.allowed ?? "∞"}`],
      ]
    : [[locale === "th" ? "แพ็กเกจ" : "Plan", t.loading]];

  const statusBadge = subscription
    ? {
        variant: STATUS_BADGE[subscription.subscription.status as keyof typeof STATUS_BADGE] ?? "neutral",
        label:
          subscription.subscription.status === "ACTIVE"
            ? t.activeLabel
            : subscription.subscription.status === "EXPIRED"
              ? t.expiredLabel
              : t.cancelledLabel,
      }
    : { variant: "success" as const, label: t.activeLabel };

  const currentPlanCode = subscription?.subscription.plan.code;

  /**
   * ใบที่ยังค้าง — ตราบใดที่มี ห้ามเปิดรายการใหม่ (api บล็อกด้วย
   * PAYMENT_ALREADY_PENDING อยู่แล้ว หน้าเว็บแค่ไม่ล่อให้กดจนโดนปฏิเสธ)
   */
  const openPayment = (paymentsQuery.data ?? []).find((row) => row.cancellable);

  /**
   * ใบที่ถูกยกเลิกถูกตัดออกตั้งแต่ฝั่ง api แล้ว (listMyPayments) ไม่ได้กรองซ้ำ
   * ตรงนี้ — api ตัด 5 รายการล่าสุด "หลัง" กรองแล้ว ถ้ามากรองอีกทีข้างนอก
   * ตารางจะว่างเปล่าเมื่อผู้ใช้เพิ่งยกเลิกไปติดกัน 5 ครั้ง
   */
  const visiblePayments = paymentsQuery.data ?? [];

  /**
   * เหลือกี่วันก่อนหมดอายุ — ปุ่มต่ออายุขึ้นเมื่อเหลือ ≤ 30 วันเท่านั้น
   *
   * ตรึงเวลาไว้ตอน mount แทนการเรียก Date.now() ระหว่าง render (ฟังก์ชันไม่
   * บริสุทธิ์ที่ React Compiler ห้าม) — กฎจริงบังคับที่ api ด้วย RENEWAL_NOT_DUE
   * ตรงนี้เป็นแค่การซ่อนปุ่ม นาฬิกาเครื่องเพี้ยนจึงไม่ทำให้จ่ายผิดจังหวะได้
   */
  const [now] = useState(() => Date.now());
  const expiresAt = subscription?.subscription.expiresAt;
  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - now) / MS_PER_DAY)
    : null;
  const renewalDue = daysLeft !== null && daysLeft <= RENEWAL_WINDOW_DAYS;
  const canRenew =
    Boolean(currentPlanCode) && currentPlanCode !== "FREE" && renewalDue;

  const onRenew = () => {
    if (!currentPlanCode || currentPlanCode === "FREE" || createPayment.isPending) return;
    setRenewError(null);
    createPayment.mutate(currentPlanCode as "PLUS" | "PRO", {
      onSuccess: ({ paymentId, clientSecret, amountThb }) => {
        // ยอดมาจาก api เสมอ ไม่ใช่ราคาป้ายของแพ็กเกจ (ดู PaymentIntentResult)
        if (clientSecret) {
          setPayment({ paymentId, clientSecret, amount: amountThb });
        }
      },
      onError: (error) => {
        setRenewError(toMessage(error, t.renewError));
      },
    });
  };

  const onCancelPayment = (paymentId: string) => {
    if (cancelPayment.isPending) return;
    setCancelError(null);
    cancelPayment.mutate(paymentId, {
      // ยกเลิกแล้วทั้งประวัติและสิทธิ์กดซื้อรอบใหม่เปลี่ยนพร้อมกัน ดึงใหม่ทั้งคู่
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: (error) => setCancelError(toMessage(error, t.cancelError)),
    });
  };

  const onRetryPayment = (paymentId: string) => {
    if (retryPayment.isPending) return;
    setRetryError(null);
    retryPayment.mutate(paymentId, {
      onSuccess: ({ clientSecret, amountThb }) => {
        if (clientSecret) {
          setPayment({ paymentId, clientSecret, amount: amountThb });
        }
      },
      onError: (error) => setRetryError(toMessage(error, t.retryError)),
    });
  };

  return (
    <>
      <TopBar title={t.title} />
      <UpgradePlanDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        onCheckoutStarted={(started) => {
          // ปิดตารางเทียบก่อนเปิดฟอร์มบัตร ไม่ซ้อนกล่องบนกล่อง
          setUpgradeOpen(false);
          setPayment(started);
        }}
      />
      {payment && (
        <CardPaymentDialog
          clientSecret={payment.clientSecret}
          paymentId={payment.paymentId}
          amount={payment.amount}
          locale={locale}
          onClose={() => setPayment(null)}
          onSuccess={() => {
            // จ่ายเงินสำเร็จแล้วแพ็กเกจ/โควตา/ประวัติเปลี่ยนหมด ล้าง cache
            // ให้ดึงใหม่แทนการ reload ทั้งหน้า
            setPayment(null);
            void queryClient.invalidateQueries();
            router.push("/membership?status=success");
          }}
        />
      )}
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <div className="px-4">
                <div className="mb-3 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                  {t.statusHeading}
                </div>
                {statusRows.map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between py-2.75 ${
                      i < statusRows.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <span className="text-[13px] text-muted-foreground">
                      {label}
                    </span>
                    {label === statusLabel ? (
                      <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    ) : (
                      <span className="text-sm font-semibold">{value}</span>
                    )}
                  </div>
                ))}
                {subscription?.readOnly && (
                  <p className="mt-3 text-xs text-destructive">{t.readOnlyNote}</p>
                )}
                {renewError && (
                  <p className="mt-3 text-xs text-destructive">{renewError}</p>
                )}
                {canRenew && (
                  <div className="mt-4">
                    <Button
                      variant="gradient"
                      disabled={createPayment.isPending || Boolean(openPayment)}
                      onClick={onRenew}
                    >
                      {createPayment.isPending ? t.renewing : t.renewBtn}
                    </Button>
                  </div>
                )}
                {/* ยังไม่ถึงกำหนด — บอกว่าปุ่มจะมาเมื่อไหร่ ดีกว่าปล่อยว่างเฉยๆ */}
                {!canRenew &&
                  currentPlanCode !== undefined &&
                  currentPlanCode !== "FREE" &&
                  daysLeft !== null && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t.renewNotDue(daysLeft)}
                    </p>
                  )}
                {openPayment && (
                  <p className="mt-3 text-xs text-status-orange">{t.pendingNotice}</p>
                )}
              </div>
            </Card>

            <Card>
              <div className="px-4">
                <div className="mb-1 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                  {t.buyExtraHeading}
                </div>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  {t.buyExtraSub}
                </p>
                <div className="mb-3.5 text-[13px] text-muted-foreground">{t.qtyLabel}</div>
                <Button variant="dark" onClick={() => setUpgradeOpen(true)}>{t.payBtn}</Button>
              </div>
            </Card>
          </div>

          <div>
            <div className="mb-3 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
              {t.historyHeading}
            </div>
            <Card className="p-0">
              {/*
                api คืนประวัติมาทั้งหมด กล่องนี้สูงประมาณ 5 แถวแล้วเลื่อนดูที่เหลือ
                — ตัดให้เหลือ 5 รายการไปเลยแปลว่ารายการเก่ากว่านั้นหายไปจากสายตา
                ผู้ใช้ถาวร ทั้งที่เป็นหลักฐานการจ่ายเงินของเขาเอง
                หัวตารางต้องค้างไว้ (sticky) ไม่งั้นเลื่อนลงไปแล้วไม่รู้ว่าคอลัมน์
                ไหนคืออะไร และต้องทึบด้วย ไม่งั้นแถวจะไหลทะลุขึ้นมาซ้อน
              */}
              <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-125 border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-secondary shadow-[inset_0_-1px_0_var(--border)]">
                  <tr className="border-b border-border">
                    {t.columns.map((h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-medium text-muted-foreground uppercase ${
                          i === 2 || i === 3 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3.5 font-mono text-[13px] text-muted-foreground">{new Date(row.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-US")}</td>
                      {/*
                        ห้ามใช้ row.subscription.plan — นั่นคือแพ็กเกจ "ปัจจุบัน" ของผู้ใช้
                        ไม่ใช่แพ็กเกจที่จ่ายในรายการนั้น คนที่ยังอยู่ Free แล้วกดซื้อ Plus
                        ค้างไว้จะเห็นเป็น "ฟรี ฿2,499" ซึ่งอ่านแล้วงง
                      */}
                      <td className="px-5 py-3.5">{t.purposes[row.purpose] ?? row.purpose}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px]">1</td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] font-semibold">฿{Number(row.amountThb).toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={PAYMENT_STATUS_VARIANT[row.status] ?? "neutral"}>
                          {t.statuses[row.status] ?? row.status}
                        </Badge>
                      </td>
                      {/*
                        ปุ่มขึ้นตาม row.retryable ที่ api คำนวณให้ ไม่ใช่ตามสถานะ —
                        ใบชำระเงินมีอายุ 24 ชม. พ้นกำหนดแล้วต้องเริ่มรายการใหม่
                        จากหน้าอัปเกรด เพราะ PaymentIntent ฝั่ง Stripe ถูกยกเลิกไปแล้ว
                      */}
                      <td className="px-5 py-3.5 text-right">
                        {row.retryable ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="gradient"
                                disabled={retryPayment.isPending}
                                onClick={() => onRetryPayment(row.id)}
                              >
                                {retryPayment.isPending ? t.retryingPayment : t.retryPayment}
                              </Button>
                              {/*
                                ยกเลิกได้เฉพาะใบที่ยังค้างจริง (cancellable จาก api)
                                — เป็นทางเดียวที่จะเปิดรายการใหม่ได้ก่อนครบ 24 ชม.
                              */}
                              {row.cancellable && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={cancelPayment.isPending}
                                  onClick={() => onCancelPayment(row.id)}
                                >
                                  {cancelPayment.isPending ? t.cancelling : t.cancelPayment}
                                </Button>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {t.payBefore(
                                new Date(row.expiresAt).toLocaleString(
                                  locale === "th" ? "th-TH" : "en-US",
                                  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
                                ),
                              )}
                            </span>
                          </div>
                        ) : row.status === "PENDING" || row.status === "FAILED" ? (
                          <span className="text-xs text-muted-foreground">{t.paymentExpired}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(retryError ?? cancelError) && (
                    <tr>
                      <td colSpan={t.columns.length + 1} className="px-5 py-3 text-sm text-destructive">
                        {retryError ?? cancelError}
                      </td>
                    </tr>
                  )}
                  {paymentsQuery.isSuccess && visiblePayments.length === 0 && (
                    <tr>
                      <td colSpan={t.columns.length + 1} className="px-5 py-8 text-center text-sm text-muted-foreground">
                        {t.historyEmpty}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
