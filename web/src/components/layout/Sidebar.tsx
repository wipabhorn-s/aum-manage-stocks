"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

import NavItem from "@/components/layout/NavItem";
import LanguageToggle from "@/components/layout/LanguageToggle";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useMobileNav } from "@/components/layout/MobileNavContext";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/components/layout/nav-config";

interface SidebarProps {
  sections: NavSection[];
  shopSelector?: ReactNode;
  footer?: ReactNode;
}

// Generic, config-driven — this component has no idea what a "role" or
// "plan" is. `sections`/`shopSelector`/`footer` are handed to it fully
// formed by whoever renders it (currently the route-group layouts, backed
// by nav-config.ts's hardcoded role switch — see the TODO there).
export default function Sidebar({
  sections,
  shopSelector,
  footer,
}: SidebarProps) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { isOpen, close } = useMobileNav();

  // Drawer is a route change away from being stale — close it whenever the
  // user navigates, otherwise it stays open over the new page on mobile.
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
        />
      )}
      <aside
        className={cn(
          /*
            บนมือถือกว้าง 288 ไม่ใช่ 250 — แถวหัวมี 3 อย่างเรียงกัน (โลโก้ +
            ปุ่มสลับภาษา + กากบาทปิด) ซึ่งรวมแล้ว 269px ยัดใน 250 ไม่ลง เลยดัน
            ให้เกิดแถบเลื่อนแนวนอนทั้งแผง ส่วนบนจอใหญ่กากบาทถูกซ่อน (lg:hidden)
            250 จึงพอดีอยู่แล้ว
            overflow-x-hidden ปิดท้ายไว้ด้วย: overflow-y-auto อย่างเดียวทำให้
            แกน x กลายเป็น auto ตามสเปก CSS ของใหม่ที่ยาวเกินในอนาคตจะได้ตัด
            ทิ้งแทนที่จะแอบสร้างแถบเลื่อนขึ้นมาอีก
          */
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-brand-dark transition-transform duration-200 lg:static lg:z-auto lg:w-62.5 lg:translate-x-0 lg:transition-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/*
          gap-3 + px-4 ไม่ใช่ gap-5 + px-6 — บนจอใหญ่แผงกว้าง 250 หัก px-6
          สองข้างเหลือ 202px แต่โลโก้ (~112) + gap 20 + ปุ่มสลับภาษา (w-20 = 80)
          ต้องการ 212px ชื่อ AumStocks เลยโดน truncate เหลือ "AumSto..."
          ลดลงมาแล้วเหลือที่ว่าง 218px พอใส่ครบทั้งสามชิ้นโดยไม่ต้องตัดคำ
        */}
        <div className="flex items-center gap-3 px-4 pt-7 pb-5">
          {/* โลโก้กลับหน้าแรกเสมอ ไม่ว่าจะอยู่หน้าไหนของแอป */}
          <Link href="/" className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-heading text-xl font-bold tracking-[-0.02em] text-brand-orange">
              AumStocks
            </span>
          </Link>
          <div className="shrink-0">
            <LanguageToggle />
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="text-white/60 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {shopSelector && <div className="mx-4 mb-6">{shopSelector}</div>}

        <nav className="flex-1 px-3">
          {sections.map((section) => (
            <div key={section.label.en} className="mb-5">
              <div className="px-3 pb-2 text-[10px] tracking-[0.12em] text-white/40 uppercase">
                {section.label[locale]}
              </div>
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={
                    pathname === item.href ||
                    (item.matches?.some((prefix) =>
                      pathname.startsWith(prefix),
                    ) ??
                      false)
                  }
                />
              ))}
            </div>
          ))}
        </nav>

        {footer && <div className="mx-4 mt-auto mb-3">{footer}</div>}
        <div className={cn("mx-4", !footer && "mt-auto", "mb-6")} />
      </aside>
    </>
  );
}
