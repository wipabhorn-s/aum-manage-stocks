"use client";

import Link from "next/link";
import { MessageCircle, Monitor, ScanBarcode, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useMe } from "@/lib/hooks/use-profile";
import { useMySubscription } from "@/lib/hooks/use-inventory";

type PlanCode = "FREE" | "PLUS" | "PRO";

const copy = {
  th: {
    eyebrow: "RETAIL SHOP STOCK MANAGEMENT", hero: <>จัดการสต็อกให้เป็นระบบ<br />ให้ <span className="text-primary">AumStocks</span> ดูแลแทน</>, intro: <>แพลตฟอร์มหลังบ้านสำหรับร้านค้าและมินิมาร์ท<br />บันทึกสต็อกได้ทั้งหน้าเว็บ แชท LINE และสแกนบาร์โค้ด</>, start: "เริ่มใช้งาน", dashboard: "ไปแดชบอร์ด", channels: "3 ช่องทาง 1 สต็อก", featureTitle: "ครบสต็อกในหน้าจอเดียวตลอดเวลา", featureIntro: "ทุกการเปลี่ยนแปลงถูกบันทึกเป็นประวัติเดียวกัน พร้อมที่มาและผู้ทำรายการ ตรวจสอบย้อนหลังได้ทุกรายการ",
    features: [["🖥️", "จัดการผ่านเว็บ", "ค้นหาสินค้าด้วยชื่อหรือสแกน แล้วบันทึกจำนวนทีละรายการ"], ["💬", "แชทสั่งงาน", "พิมพ์คำสั่งจากหน้าเว็บหรือ LINE แล้วให้คนยืนยันก่อนบันทึกจริง"], ["📷", "สแกนบาร์โค้ด", "สแกนสินค้าขาย ระบบบันทึกการขายและตัดสต็อกอัตโนมัติ"]], pricing: "เลือกแพ็กเกจที่ใช่สำหรับร้านคุณ", pricingIntro: "เริ่มฟรีไม่มีวันหมดอายุ อัปเกรดเมื่อร้านค้าโตขึ้น", free: ["1 ร้านค้า", "สินค้าสูงสุด 100 รายการ", "บันทึกสต็อกแบบ manual", "ประวัติการเคลื่อนไหวสต็อก", "แดชบอร์ดพื้นฐาน", "บันทึกสต็อกผ่านแชทบอท", "สแกนบาร์โค้ด", "คำแนะนำจาก AI"], plus: ["3 ร้านค้า", "สินค้าสูงสุด 3,000 รายการ", "พนักงาน 6 บัญชี", "สแกนบาร์โค้ด + แชทบอท", "เชื่อมต่อบัญชี LINE", "รายงานเชิงลึก"], pro: ["5 ร้านค้า", "สินค้าสูงสุด 5,000 รายการ", "พนักงาน 10 บัญชี", "ทุกอย่างของแพ็กเกจ Plus", "คำแนะนำจาก AI", "รายงานขั้นสูง"], freeTime: "ตลอดชีพ", perYear: "ต่อปี", recommended: "แนะนำ", signup: "สมัครสมาชิก", current: "แพ็กเกจปัจจุบัน", downgrade: "ไม่รองรับการลดแพ็กเกจ", upgrade: (p: string) => `อัปเกรดเป็น ${p}`, goDashboard: "ไปแดชบอร์ด", footer: "Aum Manage Stocks — Retail Shop Stock Management Platform",
  },
  en: {
    eyebrow: "Retail shop stock management", hero: <>Keep your stock organized<br />Let <span className="text-primary">AumStocks</span> handle it</>, intro: <>Back-office inventory management for retail shops and minimarts<br />Track stock on the web, through LINE chat, or by barcode scanning</>, start: "Get started", dashboard: "Go to Dashboard", channels: "3 channels, 1 stock", featureTitle: "Your complete stock view in one place", featureIntro: "Every change is recorded in one history with its source and actor, so you can review every movement.", features: [["🖥️", "Web management", "Search by name or scan a product, then record quantities one item at a time"], ["💬", "Chat commands", "Send a command from the web or LINE and confirm it before saving"], ["📷", "Barcode scanning", "Scan a sale and update the stock automatically"]], pricing: "Choose the right plan for your shop", pricingIntro: "Start free with no expiry and upgrade as your shop grows.", free: ["1 shop", "Up to 100 products", "Manual stock adjustments", "Stock movement history", "Basic dashboard", "Stock chatbot", "Barcode scanning", "AI recommendations"], plus: ["3 shops", "Up to 3,000 products", "6 staff accounts", "Barcode scanning + chatbot", "LINE account connection", "Advanced reports"], pro: ["5 shops", "Up to 5,000 products", "10 staff accounts", "Everything in Plus", "AI recommendations", "Advanced reports"], freeTime: "Lifetime", perYear: "per year", recommended: "Recommended", signup: "Sign up", current: "Current plan", downgrade: "Downgrade unavailable", upgrade: (p: string) => `Upgrade to ${p}`, goDashboard: "Go to Dashboard", footer: "Aum Manage Stocks — Retail Shop Stock Management Platform",
  },
} as const;

type LandingCopy = (typeof copy)[keyof typeof copy];
const featureIcons: LucideIcon[] = [Monitor, MessageCircle, ScanBarcode];

function PricingAction({ plan, currentPlan, loggedIn, variant, t }: { plan: PlanCode; currentPlan: PlanCode | null; loggedIn: boolean; variant: "outline" | "gradient" | "dark"; t: LandingCopy }) {
  if (!loggedIn) return <Button variant={variant} className="mt-5.5 w-full" render={<Link href="/register" />}>{t.signup}</Button>;
  if (currentPlan === plan) return <Button variant="outline" className="mt-5.5 w-full" disabled>{t.current}</Button>;
  const downgrade = currentPlan !== "FREE" && (plan === "FREE" || (currentPlan === "PRO" && plan === "PLUS"));
  if (downgrade) return <Button variant="outline" className="mt-5.5 w-full" disabled>{t.downgrade}</Button>;
  if (plan === "FREE") return <Button variant="outline" className="mt-5.5 w-full" render={<Link href="/dashboard" />}>{t.goDashboard}</Button>;
  return <Button variant={variant} className="mt-5.5 w-full" render={<Link href={`/membership?upgrade=1`} />}>{t.upgrade(plan)}</Button>;
}

export default function LandingPageContent() {
  const { locale } = useLocale();
  const t = copy[locale];
  const me = useMe();
  const loggedIn = Boolean(me.data);
  // บัญชีที่ล็อกอินแล้วแต่ยังไม่มี subscription นับเป็น Free
  const subscription = useMySubscription();
  const code = subscription.data?.subscription.plan.code;
  const plan: PlanCode | null = !loggedIn ? null : code === "PLUS" || code === "PRO" ? code : "FREE";
  return <div className={locale === "en" ? "font-english" : "font-thai"}>
    <section className="px-6 pt-12 pb-4 text-center sm:pt-14"><div className="mb-5 text-[11px] font-bold tracking-[0.18em] text-primary uppercase">{t.eyebrow}</div><h1 className="mx-auto mb-6 max-w-3xl font-heading text-4xl leading-[1.15] font-bold text-foreground sm:text-5xl">{t.hero}</h1><p className="mx-auto mb-9 max-w-2xl text-base leading-loose text-muted-foreground">{t.intro}</p><div className="mb-8 flex justify-center"><Button variant="gradient" size="lg" render={<Link href={loggedIn ? "/dashboard" : "/register"} />}>{loggedIn ? t.dashboard : t.start}</Button></div></section>
    <section id="features" className="px-6 pt-10 pb-14 text-center sm:pt-12"><div className="mb-3.5 text-[11px] font-bold tracking-[0.18em] text-primary uppercase">{t.channels}</div><h2 className="mb-3 font-heading text-3xl font-bold text-foreground sm:text-4xl">{t.featureTitle}</h2><p className="mx-auto mb-10 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{t.featureIntro}</p><div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">{t.features.map(([, title, desc], index) => { const Icon = featureIcons[index]; return <div key={title} className="rounded-3xl bg-secondary p-8"><div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-brand-dark shadow-[0_8px_20px_rgba(245,163,28,0.25)]"><Icon className="size-8" strokeWidth={1.8} /></div><div className="mb-2.5 font-heading text-base font-bold tracking-[0.05em] text-foreground">{title}</div><p className="text-sm leading-relaxed text-muted-foreground">{desc}</p></div>; })}</div></section>
    <section id="pricing" className="mx-6 rounded-3xl bg-[#FAF8F4] px-6 py-14 text-center"><div className="mb-3.5 text-[11px] font-bold tracking-[0.08em] text-primary">Pricing</div><h2 className="mb-3 font-heading text-3xl font-bold text-foreground sm:text-4xl">{t.pricing}</h2><p className="mb-10 text-sm text-muted-foreground">{t.pricingIntro}</p><div className="mx-auto grid max-w-4xl grid-cols-1 items-stretch gap-5 sm:grid-cols-3"><PlanCard name="FREE" price="฿0" features={t.free} included={5} subtitle={t.freeTime}><PricingAction plan="FREE" currentPlan={plan} loggedIn={loggedIn} variant="outline" t={t} /></PlanCard><PlanCard name="PLUS" price="฿2,499" features={t.plus} included={t.plus.length} subtitle={t.perYear} recommended={t.recommended}><PricingAction plan="PLUS" currentPlan={plan} loggedIn={loggedIn} variant="gradient" t={t} /></PlanCard><PlanCard name="PRO" price="฿3,499" features={t.pro} included={t.pro.length} subtitle={t.perYear}><PricingAction plan="PRO" currentPlan={plan} loggedIn={loggedIn} variant="dark" t={t} /></PlanCard></div></section>
    <footer className="border-t border-border px-6 py-8 text-center"><div className="text-xs text-muted-foreground">{t.footer}</div></footer>
  </div>;
}

function PlanCard({ name, price, subtitle, features, included, recommended, children }: { name: string; price: string; subtitle: string; features: readonly string[]; included: number; recommended?: string; children: React.ReactNode }) {
  return <div className={`relative flex h-full flex-col rounded-3xl p-8 text-left ${name === "PLUS" ? "-translate-y-2 border-[1.5px] border-primary bg-background pt-10 shadow-[0_12px_48px_rgba(245,163,28,0.20)]" : "bg-secondary"}`}>{recommended && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-[10px] font-bold whitespace-nowrap text-primary-foreground">{recommended}</span>}<div className="mb-2.5 text-[11px] font-bold tracking-[0.14em] text-primary uppercase">{name}</div><div className="mb-0.5 font-mono text-4xl font-bold tracking-[-0.03em] text-foreground">{price}</div><div className="mb-6 text-xs text-muted-foreground">{subtitle}</div>{features.map((feature, index) => <div key={feature} className={`flex items-center gap-2 border-b border-border py-1.5 text-[13px] ${index >= included ? "text-muted-foreground/60" : "text-foreground/80"}`}><span className={`font-bold ${index >= included ? "text-border" : "text-status-green"}`}>{index >= included ? "✗" : "✓"}</span>{feature}</div>)}<div className="mt-auto pt-6">{children}</div></div>;
}
