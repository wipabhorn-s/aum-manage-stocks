"use client";

import Link from "next/link";

import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/LocaleContext";

const content = {
  th: {
    title: "แชทบอทรับสต็อก",
    heading: "แชทบอทรับสต็อกใช้ได้เมื่อเข้าแพ็กเกจ Plus ขึ้นไป",
    body: 'พิมพ์คำสั่งอย่าง "เพิ่มโค้ก 10" จากหน้าเว็บหรือ LINE ของร้าน ระบบจะทวนความเข้าใจและสรุปให้คนยืนยันก่อนบันทึกจริง',
    previewUser: "เพิ่มโค้ก 10 ลบมามา 3",
    previewBot: "สรุปรายการที่จะบันทึก: โค้ก +10 (248 → 258)",
    upgradeBtn: "ดูแพ็กเกจทั้งหมด →",
    laterBtn: "เดี๋ยวหลัง",
  },
  en: {
    title: "Stock Chatbot",
    heading: "The stock chatbot requires the Plus plan or higher",
    body: 'Type a command like "add 10 coke" from the web or the shop\'s LINE account. The system confirms its understanding and summarizes before saving anything.',
    previewUser: "add 10 coke, remove 3 mama",
    previewBot: "Here's what will be recorded: coke +10 (248 → 258)",
    upgradeBtn: "See All Plans →",
    laterBtn: "Maybe later",
  },
};

export default function LockedChatbotPage() {
  const { locale } = useLocale();
  const t = content[locale];

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
              PLUS
            </span>
            <h2 className="mb-3 font-heading text-xl font-bold text-foreground">
              {t.heading}
            </h2>
            <p className="mx-auto mb-7 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t.body}
            </p>

            <div className="mb-7 flex flex-col gap-2.5 opacity-45">
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-[17px_17px_5px_17px] bg-brand-dark px-3.5 py-2.5 text-[13px] text-background">
                  {t.previewUser}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-[17px_17px_17px_5px] border border-border bg-background px-3.5 py-2.5 text-left text-[13px]">
                  {t.previewBot}
                </div>
              </div>
            </div>

            <Button variant="gradient" render={<Link href="/membership?upgrade=1" />}>
              {t.upgradeBtn}
            </Button>
            <div className="mt-3">
              <button className="text-[13px] text-muted-foreground/70">
                {t.laterBtn}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
