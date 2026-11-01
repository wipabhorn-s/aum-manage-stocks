"use client";

import Link from "next/link";
import { ChartNoAxesColumnIncreasing, History, Package, Shield, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import LogoutButton from "@/components/layout/LogoutButton";
import LanguageToggle from "@/components/layout/LanguageToggle";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useMe } from "@/lib/hooks/use-profile";
import { cn } from "@/lib/utils";

const labels = {
  th: { dashboard: "แดชบอร์ด", products: "สินค้า", stock: "สต็อก", shops: "ร้านค้า", admin: "ผู้ดูแลระบบ", profile: "แก้ไขโปรไฟล์", logout: "ออกจากระบบ", features: "ฟีเจอร์", pricing: "ราคา", login: "เข้าสู่ระบบ", register: "สมัครสมาชิก" },
  en: { dashboard: "Dashboard", products: "Products", stock: "Stock", shops: "Shops", admin: "Admin", profile: "Edit profile", logout: "Log out", features: "Features", pricing: "Pricing", login: "Log in", register: "Sign up" },
};

export default function LandingNav() {
  const { locale } = useLocale();
  const t = labels[locale];
  // ใช้ useMe() ตัวเดียวกับที่ทั้งแอปใช้ จะได้แชร์ cache กับ LandingPageContent
  // ไม่ยิง /api/users/me ซ้ำสองรอบในหน้าเดียว
  const { data, isPending } = useMe();
  const user = data ?? null;
  const resolved = !isPending;
  // แอดมินไม่มีร้าน เมนูฝั่งร้านค้าทุกอันตอบ 403 — โชว์ทางเข้า /admin อย่างเดียว
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const userInitial = (user?.firstName || user?.username || "A").charAt(0).toUpperCase();

    /*
    บนจอแคบ โลโก้ + ปุ่มเข้าสู่ระบบ/สมัคร + ตัวสลับภาษา รวมกันกว้างกว่าแคปซูล
    อยู่ราว 60px ของพวกนี้ย่อไม่ได้เลย — ปุ่มเป็น shrink-0 + whitespace-nowrap
    ส่วนตัวสลับภาษาเป็น w-20 shrink-0 ตายตัว

    ให้ห่อลงบรรทัดใหม่แทนการไล่บีบขนาดทีละอัน — บีบแล้วพอดีเป๊ะที่ 375px
    ก็ยังพังอยู่ดีบนเครื่องที่แคบกว่านั้น ส่วนตั้งแต่ sm ขึ้นไปพื้นที่เหลือเฟือ
    กลับไปเป็นแคปซูลแถวเดียวเหมือนเดิม

    **flex-wrap ต้องมีสองชั้น** — ชั้น nav ห่อได้แค่ "โลโก้ vs กลุ่มปุ่ม" ถ้ากลุ่มปุ่ม
    ข้างในไม่ห่อด้วย มันจะกลายเป็นก้อนเดียวที่กว้างเกินแคปซูล แล้วตัวสลับภาษา
    ซึ่งอยู่ท้ายสุดจะทะลุขอบมนออกไป ตอนแรกใส่ flex-wrap ไว้แค่ชั้น nav จึงยังพังอยู่
  */
  return <div className="sticky top-0 z-40 flex justify-center px-3 py-4 sm:px-6"><nav className={cn("flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-3xl bg-background px-5 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.10)] sm:flex-nowrap sm:justify-start sm:rounded-full sm:px-7", locale === "th" ? "font-nav-th" : "font-nav")}><Link href="/" aria-label="AumStocks" className="font-logo shrink-0 text-lg font-bold tracking-[-0.01em]"><span className="text-foreground">Aum</span><span className="text-primary">Stocks</span></Link>
    {!resolved ? <div className="ml-auto h-8 w-20" /> : user ? <><div className="mr-auto hidden items-center gap-1 md:flex">{isAdmin ? <Link href="/admin" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Shield className="size-4" />{t.admin}</Link> : <><Link href="/dashboard" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChartNoAxesColumnIncreasing className="size-4" />{t.dashboard}</Link><Link href="/products" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Package className="size-4" />{t.products}</Link><Link href="/stock-history" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><History className="size-4" />{t.stock}</Link><Link href="/shops" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Store className="size-4" />{t.shops}</Link></>}</div><div className="flex items-center gap-2"><Link href="/profile" aria-label={t.profile} title={t.profile} className="rounded-full outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary"><Avatar size="sm"><AvatarFallback className="bg-primary font-heading font-bold text-primary-foreground">{userInitial}</AvatarFallback></Avatar></Link><LogoutButton label={t.logout} /></div><LanguageToggle onDark={false} /></> : <><div className="ml-4 mr-auto hidden items-center gap-5 md:flex"><a href="#features" className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground">{t.features}</a><a href="#pricing" className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground">{t.pricing}</a></div><div className="flex flex-wrap items-center justify-center gap-2.5"><Button variant="outline" size="sm" render={<Link href="/login" />}>{t.login}</Button><Button variant="gradient" size="sm" render={<Link href="/register" />}>{t.register}</Button><LanguageToggle onDark={false} /></div></>}
  </nav></div>;
}
