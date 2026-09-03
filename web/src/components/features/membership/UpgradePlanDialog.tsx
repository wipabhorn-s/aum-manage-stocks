"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import {
  useCreateSubscriptionPaymentIntent,
  useMySubscription,
  usePayments,
  useSubscriptionPlans,
  type SubscriptionPlan,
} from "@/lib/hooks/use-inventory";

const content = {
  th: {
    title: "อัปเกรดแพ็กเกจ",
    heading: "เลือกแพ็กเกจที่ใช่สำหรับร้านคุณ",
    subheading: "อัปเกรดเพื่อเพิ่มร้าน สินค้า และปลดล็อกฟีเจอร์",
    lifelong: "ตลอดชีพ",
    perYear: "ต่อปี",
    recommended: "แนะนำ",
    currentPlanBtn: "แพ็กเกจปัจจุบัน",
    lowerPlan: "ลดแพ็กเกจไม่ได้",
    pendingNotice: "มีรายการชำระเงินค้างอยู่ — ปิดหน้าต่างนี้แล้วชำระให้เสร็จหรือกดยกเลิกในประวัติการชำระเงินก่อน",
    choosePlusBtn: "เลือก Plus →",
    chooseProBtn: "เลือก Pro →",
    footerNote:
      "ร้านและสินค้าที่มีอยู่แล้วจะถูกเก็บไว้เต็มจำนวนเมื่ออัปเกรดแพ็กเกจ ไม่มีการหักข้อมูลเก่าใดๆ",
    upgradeOnly: (amount: string) => `จ่ายเพิ่มเพียง ฿${amount}`,
    keepsExpiry: "วันหมดอายุเดิมไม่เปลี่ยน",
    fullPriceNote: "เริ่มนับอายุ 12 เดือนใหม่",
    unlimited: "ไม่จำกัด",
    featShops: "จำนวนร้านค้า",
    featProducts: "สินค้าสูงสุด",
    featStaff: "บัญชีพนักงาน",
    featManualStock: "บันทึกสต็อกแบบ manual",
    featStockHistory: "ประวัติการเคลื่อนไหวสต็อก",
    featBasicDashboard: "แดชบอร์ดพื้นฐาน",
    featBarcode: "สแกนบาร์โค้ดขายหน้าร้าน",
    featChatbot: "แชทบอทรับสต็อก (LINE)",
    featReports: "รายงานเชิงลึก",
    featAi: "คำแนะนำจาก AI",
  },
  en: {
    title: "Upgrade Plan",
    heading: "Choose the Right Plan for Your Shop",
    subheading: "Upgrade to add shops, products, and unlock features.",
    lifelong: "Lifetime",
    perYear: "per year",
    recommended: "Recommended",
    currentPlanBtn: "Current Plan",
    lowerPlan: "Downgrades are not available",
    pendingNotice: "You have an unfinished payment — close this window, then pay or cancel it in the payment history.",
    choosePlusBtn: "Choose Plus →",
    chooseProBtn: "Choose Pro →",
    footerNote:
      "Existing shops and products are kept in full when you upgrade — nothing is ever deducted.",
    upgradeOnly: (amount: string) => `Pay only ฿${amount} more`,
    keepsExpiry: "Your current expiry date stays the same",
    fullPriceNote: "Starts a fresh 12-month term",
    unlimited: "Unlimited",
    featShops: "Number of Shops",
    featProducts: "Max Products",
    featStaff: "Staff Accounts",
    featManualStock: "Manual Stock Entry",
    featStockHistory: "Stock Movement History",
    featBasicDashboard: "Basic Dashboard",
    featBarcode: "Barcode Scanning (POS)",
    featChatbot: "Stock Chatbot (LINE)",
    featReports: "Advanced Reports",
    featAi: "AI Recommendations",
  },
};

/** ลำดับแพ็กเกจ — ใช้ตัดสินว่าอันไหนเป็นการ "ลดระดับ" ซึ่ง SRS ไม่รองรับ */
const PLAN_RANK: Record<string, number> = { FREE: 0, PLUS: 1, PRO: 2 };

function Cell({ val }: { val: string }) {
  if (val === "✓")
    return <span className="text-base font-bold text-status-green">✓</span>;
  if (val === "✗")
    return <span className="text-base font-bold text-border">✗</span>;
  return <span className="font-mono text-[13px] font-semibold">{val}</span>;
}

function boolCell(value: boolean | undefined): string {
  return value ? "✓" : "✗";
}

function staffCell(plan: SubscriptionPlan | undefined): string {
  if (!plan) return "—";
  return plan.includedStaffQuota > 0 ? String(plan.includedStaffQuota) : "✗";
}

export type StartedPayment = {
  paymentId: string;
  clientSecret: string;
  amount: number;
};

/**
 * ตารางเทียบแพ็กเกจในกล่องป๊อปอัป — เดิมเป็นหน้าแยก /membership/upgrade
 *
 * การเปรียบเทียบแพ็กเกจเป็นการ "แวะดู" ระหว่างตัดสินใจ ไม่ใช่ปลายทางของตัวเอง
 * พาออกจากหน้าสมาชิกไปทั้งหน้าแล้วต้องกด back กลับมาดูโควตา/ประวัติ กล่องที่ปิด
 * ด้วยกากบาทแล้วเห็นของเดิมอยู่ที่เดิมตรงกับสิ่งที่ผู้ใช้กำลังทำมากกว่า
 *
 * ไม่เปิดกล่องจ่ายเงินเอง แต่ส่งใบที่เปิดได้กลับไปให้หน้าสมาชิกผ่าน
 * onCheckoutStarted แล้วปิดตัวเอง — ซ้อน dialog บน dialog อ่านยากบนจอมือถือ
 * และหน้าสมาชิกถือ CardPaymentDialog กับ logic หลังจ่ายสำเร็จอยู่แล้ว
 */
export default function UpgradePlanDialog({
  open,
  onClose,
  onCheckoutStarted,
}: {
  open: boolean;
  onClose: () => void;
  onCheckoutStarted: (payment: StartedPayment) => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const createPayment = useCreateSubscriptionPaymentIntent();
  const plansQuery = useSubscriptionPlans();
  const subscriptionQuery = useMySubscription();
  const paymentsQuery = usePayments();

  /**
   * ใบที่ยังค้างอยู่ — api ปฏิเสธการเปิดใบใหม่ด้วย PAYMENT_ALREADY_PENDING
   * อยู่แล้ว ตรงนี้แค่ปิดปุ่มไว้ก่อน จะได้ไม่ต้องให้ผู้ใช้กดแล้วเจอ error
   */
  const hasOpenPayment = (paymentsQuery.data ?? []).some((row) => row.cancellable);

  const plans = plansQuery.data ?? [];
  const freePlan = plans.find((p) => p.code === "FREE");
  const plusPlan = plans.find((p) => p.code === "PLUS");
  const proPlan = plans.find((p) => p.code === "PRO");
  const currentSubscription = subscriptionQuery.data?.subscription;
  const currentPlanCode = currentSubscription?.plan.code;

  /**
   * ลำดับแพ็กเกจ — เสนอได้เฉพาะแพ็กเกจที่สูงกว่าของปัจจุบันเท่านั้น
   *
   * กฎเดียวกับ createSubscriptionPaymentIntent() ฝั่ง api ที่ปฏิเสธการซื้อ
   * แพ็กเกจที่โควตาไม่มากกว่าเดิม (SRS ไม่มีเส้นทางลดแพ็กเกจ) — ก่อนหน้านี้
   * คนที่อยู่ PRO ยังเห็นปุ่ม "เลือก Plus" ซึ่งกดแล้วได้ error กลับมาเท่านั้น
   */
  const currentRank = PLAN_RANK[currentPlanCode ?? "FREE"] ?? 0;
  const isCurrentPlan = (code: string) => currentPlanCode === code;
  const isBelowCurrent = (code: string) =>
    currentPlanCode !== undefined && (PLAN_RANK[code] ?? 0) < currentRank;

  /**
   * กฎเดียวกับ resolveUpgradeCharge() ฝั่ง api — จ่ายแค่ส่วนต่างได้ก็ต่อเมื่อ
   * แพ็กเกจปัจจุบันเป็นแบบเสียเงินและยังไม่หมดอายุ
   *
   * ใช้ readOnly ที่ api คำนวณมาให้ ไม่เทียบวันที่เอง — นอกจากจะได้ผลตรงกับ
   * เซิร์ฟเวอร์แน่นอนแล้ว การเรียก Date.now() ระหว่าง render ยังเป็นฟังก์ชัน
   * ไม่บริสุทธิ์ที่ React Compiler ห้ามไว้
   *
   * ตัวเลขนี้เป็นแค่ตัวอย่างให้เห็นก่อนกด ยอดจริงยึดตามที่ api ตอบกลับมาเสมอ
   */
  const keepsExpiry =
    currentSubscription !== undefined &&
    currentSubscription.plan.code !== "FREE" &&
    subscriptionQuery.data?.readOnly === false;

  const upgradePriceFor = (plan: SubscriptionPlan | undefined) => {
    if (!plan || !keepsExpiry) return null;
    const difference = Number(plan.priceThb) - Number(currentSubscription?.plan.priceThb ?? 0);
    return difference > 0 ? difference : null;
  };

  // เขียนเป็นฟังก์ชันคืน JSX ไม่ใช่คอมโพเนนต์ที่ประกาศระหว่าง render
  // (react-hooks/static-components) — คอมโพเนนต์ที่สร้างใหม่ทุกรอบจะถูก
  // React ถอด/ใส่ใหม่ทั้งต้นไม้ทุกครั้งที่หน้านี้ re-render
  const upgradeHint = (plan: SubscriptionPlan | undefined) => {
    const difference = upgradePriceFor(plan);
    if (difference === null) {
      return (
        <p className="mt-2 text-[11px] text-muted-foreground">{t.fullPriceNote}</p>
      );
    }
    return (
      <p className="mt-2 text-[11px] leading-snug">
        <span className="font-mono font-semibold text-status-green">
          {t.upgradeOnly(difference.toLocaleString())}
        </span>
        <br />
        <span className="text-muted-foreground">{t.keepsExpiry}</span>
      </p>
    );
  };

  const features = [
    {
      label: t.featShops,
      free: String(freePlan?.includedShopQuota ?? "—"),
      plus: String(plusPlan?.includedShopQuota ?? "—"),
      pro: String(proPlan?.includedShopQuota ?? "—"),
    },
    {
      label: t.featProducts,
      free: freePlan?.maxActiveProducts?.toLocaleString() ?? t.unlimited,
      plus: plusPlan?.maxActiveProducts?.toLocaleString() ?? t.unlimited,
      pro: proPlan?.maxActiveProducts?.toLocaleString() ?? t.unlimited,
    },
    {
      label: t.featStaff,
      free: staffCell(freePlan),
      plus: staffCell(plusPlan),
      pro: staffCell(proPlan),
    },
    { label: t.featManualStock, free: "✓", plus: "✓", pro: "✓" },
    { label: t.featStockHistory, free: "✓", plus: "✓", pro: "✓" },
    { label: t.featBasicDashboard, free: "✓", plus: "✓", pro: "✓" },
    {
      label: t.featBarcode,
      free: boolCell(freePlan?.barcodeEnabled),
      plus: boolCell(plusPlan?.barcodeEnabled),
      pro: boolCell(proPlan?.barcodeEnabled),
    },
    {
      label: t.featChatbot,
      free: boolCell(freePlan?.chatbotEnabled),
      plus: boolCell(plusPlan?.chatbotEnabled),
      pro: boolCell(proPlan?.chatbotEnabled),
    },
    // "รายงานเชิงลึก" ไม่มี flag แยกในฐานข้อมูล — อนุมานจาก isFree ตามที่
    // AGENTS.md ระบุว่า Advanced Reports เป็นสิทธิ์ของ Plus/Pro เท่านั้น
    {
      label: t.featReports,
      free: boolCell(freePlan ? !freePlan.isFree : false),
      plus: boolCell(plusPlan ? !plusPlan.isFree : false),
      pro: boolCell(proPlan ? !proPlan.isFree : false),
    },
    {
      label: t.featAi,
      free: boolCell(freePlan?.aiRecommendationEnabled),
      plus: boolCell(plusPlan?.aiRecommendationEnabled),
      pro: boolCell(proPlan?.aiRecommendationEnabled),
    },
  ];


  const startCheckout = (planCode: "PLUS" | "PRO") => {
    if (createPayment.isPending) return;
    createPayment.mutate(planCode, {
      onSuccess: ({ paymentId, clientSecret, amountThb }) => {
        // amountThb คือยอดที่ Stripe จะตัดจริง — อัปเกรดจากแพ็กเกจที่ยังไม่
        // หมดอายุจะเก็บแค่ส่วนต่าง ราคาป้ายจึงใช้แทนกันไม่ได้
        if (clientSecret) {
          onCheckoutStarted({ paymentId, clientSecret, amount: amountThb });
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/*
        overflow-hidden ที่ตัวกล่อง แล้วให้ส่วนที่ยาวเลื่อนข้างในแทน — ปุ่มกากบาท
        ของ DialogContent วางแบบ absolute เทียบกับกล่อง ถ้าปล่อยให้กล่องเป็นตัว
        เลื่อนเอง กากบาทจะไหลหายขึ้นไปพร้อมเนื้อหาทันทีที่ผู้ใช้เลื่อนดูตาราง
      */}
      <DialogContent className="overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{t.heading}</DialogTitle>
          <DialogDescription>{t.subheading}</DialogDescription>
        </DialogHeader>

        <div className="-mx-4 max-h-[65vh] overflow-y-auto px-4">
          <div className="overflow-hidden rounded-3xl bg-secondary">
            <div className="overflow-x-auto">
              <table className="w-full min-w-125 border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-1/3 px-6 py-6 text-left" />
                  <th className="px-4 py-6 text-center align-bottom">
                    <div className="mb-1.5 text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
                      FREE
                    </div>
                    <div className="font-mono text-2xl font-bold tracking-[-0.02em]">
                      ฿{Number(freePlan?.priceThb ?? 0).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.lifelong}
                    </div>
                  </th>
                  <th className="relative bg-primary/7 px-4 py-6 text-center align-bottom">
                    <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-linear-to-br from-brand-orange to-brand-orange/70 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">
                      {t.recommended}
                    </span>
                    <div className="mt-3 mb-1.5 text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
                      PLUS
                    </div>
                    <div className="font-mono text-2xl font-bold tracking-[-0.02em]">
                      ฿{Number(plusPlan?.priceThb ?? 0).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.perYear}
                    </div>
                  </th>
                  <th className="px-4 py-6 text-center align-bottom">
                    <div className="mb-1.5 text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
                      PRO
                    </div>
                    <div className="font-mono text-2xl font-bold tracking-[-0.02em]">
                      ฿{Number(proPlan?.priceThb ?? 0).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.perYear}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.label} className="border-t border-border">
                    <td className="px-6 py-3.5 text-foreground">{f.label}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Cell val={f.free} />
                    </td>
                    <td className="bg-primary/7 px-4 py-3.5 text-center">
                      <Cell val={f.plus} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Cell val={f.pro} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-6 py-5" />
                  <td className="px-4 py-5 text-center">
                    {isCurrentPlan("FREE") ? (
                      <Button variant="secondary" disabled className="opacity-50">
                        {t.currentPlanBtn}
                      </Button>
                    ) : currentPlanCode !== undefined ? (
                      <span className="text-[13px] text-muted-foreground">
                        {t.lowerPlan}
                      </span>
                    ) : null}
                  </td>
                  <td className="bg-primary/7 px-4 py-5 text-center">
                    {isCurrentPlan("PLUS") ? (
                      <Button variant="secondary" disabled className="opacity-50">
                        {t.currentPlanBtn}
                      </Button>
                    ) : isBelowCurrent("PLUS") ? (
                      <span className="text-[13px] text-muted-foreground">
                        {t.lowerPlan}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="gradient"
                          disabled={createPayment.isPending || hasOpenPayment}
                          onClick={() => startCheckout("PLUS")}
                        >
                          {t.choosePlusBtn}
                        </Button>
                        {hasOpenPayment ? (
                          <p className="mt-2 text-[11px] text-status-orange">{t.pendingNotice}</p>
                        ) : (
                          upgradeHint(plusPlan)
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {isCurrentPlan("PRO") ? (
                      <Button variant="secondary" disabled className="opacity-50">
                        {t.currentPlanBtn}
                      </Button>
                    ) : isBelowCurrent("PRO") ? (
                      <span className="text-[13px] text-muted-foreground">
                        {t.lowerPlan}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="dark"
                          disabled={createPayment.isPending || hasOpenPayment}
                          onClick={() => startCheckout("PRO")}
                        >
                          {t.chooseProBtn}
                        </Button>
                        {hasOpenPayment ? (
                          <p className="mt-2 text-[11px] text-status-orange">{t.pendingNotice}</p>
                        ) : (
                          upgradeHint(proPlan)
                        )}
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t.footerNote}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
