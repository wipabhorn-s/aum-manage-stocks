"use client";

import Link from "next/link";

import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/components/i18n/LocaleContext";

/**
 * ทุกอย่างในแอปผูกกับร้าน — สต็อก ราคา การขาย ประวัติ ล้วนเป็นค่าราย shop_products
 * บัญชีที่ยังไม่มีร้านจึงเปิดหน้าไหนก็เห็นตารางว่างเปล่าโดยไม่มีอะไรบอกว่าทำไม
 *
 * ดักที่ (main)/layout.tsx ที่เดียว ไม่ไล่เติม empty state ทีละหน้า เพราะ 5 หน้า
 * ที่ขาดอยู่จะกลายเป็นข้อความ 5 แบบ และหน้าใหม่ที่เกิดหลังจากนี้จะลืมอีก
 *
 * ต้องมี <TopBar /> ด้วย ไม่ใช่แค่ตัวการ์ด — กล่องนี้ถูกเรนเดอร์ "แทน" children
 * ทั้งก้อน และ TopBar เป็นของที่แต่ละหน้าเรนเดอร์เอง พอไม่มีหน้าไหนถูกเรนเดอร์
 * แถบบนจึงหายไปทั้งแถบ พาปุ่มออกจากระบบกับกระดิ่งแจ้งเตือนหายไปด้วย และบนจอ
 * มือถือหนักกว่านั้น เพราะปุ่มแฮมเบอร์เกอร์ที่เปิดเมนูข้างอยู่ในแถบนี้เจ้าเดียว
 * (ไซด์บาร์เป็น drawer ที่ซ่อนอยู่นอกจอจนกว่าจะถึง lg) ผู้ใช้ที่ยังไม่มีร้าน
 * จึงค้างอยู่หน้านี้ ไปไหนไม่ได้และออกจากระบบก็ไม่ได้
 *
 * แยกข้อความตามบทบาท — พนักงานสร้างร้านเองไม่ได้ (endpoint POST /shops ใช้
 * @OwnerId() ซึ่งพนักงานจะ resolve ไปเป็น owner ของตัวเอง แต่ปุ่มสร้างร้าน
 * ไม่ได้อยู่ในเมนูของพนักงานตั้งแต่แรก) บอกให้ไปสร้างร้านจึงเป็นทางตัน
 */

const content = {
  th: {
    owner: {
      title: "สร้างร้านแรกของคุณก่อน",
      body: "สต็อก ราคาขาย การขายหน้าร้าน และประวัติทั้งหมด เป็นข้อมูลราย “ร้าน” ต้องมีร้านอย่างน้อยหนึ่งร้านก่อนถึงจะเริ่มใช้งานได้",
      hint: "ใช้เวลาไม่ถึงนาที — ใส่แค่ชื่อร้าน แล้วค่อยเพิ่มสินค้าทีหลังได้",
      cta: "ไปสร้างร้าน",
      secondary: "ดูแพ็กเกจของฉัน",
      topBar: "เริ่มต้นใช้งาน",
    },
    staff: {
      title: "ยังไม่ได้รับมอบหมายร้าน",
      body: "บัญชีพนักงานของคุณยังไม่ถูกกำหนดให้ดูแลร้านไหน จึงยังไม่มีข้อมูลให้แสดง",
      hint: "ติดต่อเจ้าของร้านให้เพิ่มคุณเข้าร้านและกำหนดสิทธิ์ที่หน้า “พนักงานและสิทธิ์”",
      cta: "ไปหน้าโปรไฟล์",
      secondary: null,
      topBar: "บัญชีพนักงาน",
    },
  },
  en: {
    owner: {
      title: "Create your first shop",
      body: "Stock, prices, sales and history all belong to a shop. You need at least one before anything else works.",
      hint: "Takes under a minute — just a name. Products can come later.",
      cta: "Create a shop",
      secondary: "See my plan",
      topBar: "Getting started",
    },
    staff: {
      title: "No shop assigned yet",
      body: "Your staff account has not been assigned to a shop, so there is nothing to show.",
      hint: "Ask the shop owner to add you and grant permissions under “Staff & Permissions”.",
      cta: "Go to my profile",
      secondary: null,
      topBar: "Staff account",
    },
  },
};

export function ShopOnboardingGate({
  variant,
}: {
  variant: "owner" | "staff";
}) {
  const { locale } = useLocale();
  const t = content[locale][variant];
  const href = variant === "owner" ? "/shops" : "/profile";

  return (
    <>
      <TopBar title={t.topBar} />
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
        <Card className="w-full max-w-md gap-4 px-6 py-8 text-center">
          <div
            aria-hidden
            className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-2xl"
          >
            {variant === "owner" ? "🏪" : "🔑"}
          </div>
          {/* TopBar ถือ <h1> ของหน้าไปแล้ว หัวข้อในการ์ดจึงเป็นระดับรอง */}
          <h2 className="font-heading text-xl font-bold text-foreground">
            {t.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.body}</p>
          <p className="text-xs text-muted-foreground">{t.hint}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button variant="gradient" render={<Link href={href} />}>
              {t.cta}
            </Button>
            {t.secondary && (
              <Button variant="ghost" render={<Link href="/membership" />}>
                {t.secondary}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </>
  );
}
