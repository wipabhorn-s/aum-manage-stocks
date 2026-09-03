"use client";

import { useState } from "react";
import Image from "next/image";
import { MessageCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError } from "@/lib/api-client";
import { useLineBotInvite } from "@/lib/hooks/use-chat";

const content = {
  th: {
    trigger: "ลบห้องแชทไปแล้ว? เพิ่มบอทกลับมา",
    title: "เพิ่มแชทบอทเป็นเพื่อนใน LINE",
    description:
      "สแกน QR จากมือถืออีกเครื่อง หรือกดปุ่มด้านล่างถ้ากำลังเปิดหน้านี้บนมือถืออยู่แล้ว",
    addFriend: "เพิ่มเพื่อนใน LINE",
    idHint: "หรือค้นด้วยไอดีนี้ในแอป LINE",
    loading: "กำลังโหลด...",
    error: "ยังโหลดข้อมูลบอทไม่ได้ กรุณาลองใหม่อีกครั้ง",
    keepsLink: "การเพิ่มบอทกลับมาไม่กระทบการผูกบัญชี ไม่ต้องผูก LINE ใหม่",
  },
  en: {
    trigger: "Deleted the chat? Add the bot back",
    title: "Add the chatbot as a LINE friend",
    description:
      "Scan the QR from another phone, or tap the button below if you are already on mobile",
    addFriend: "Add on LINE",
    idHint: "Or search this ID in the LINE app",
    loading: "Loading...",
    error: "Could not load the bot details. Please try again.",
    keepsLink: "Adding the bot back does not affect your account link",
  },
};

/**
 * [อั้ม] ทางกลับเข้าห้องแชทบอท สำหรับคนที่เผลอลบห้องทิ้ง
 *
 * ระบบชวนแอดบอท (bot_prompt=aggressive) เฉพาะตอนผูกบัญชีครั้งแรกเท่านั้น พอผูก
 * ไปแล้วลบห้องทิ้ง ก็ไม่มีขั้นตอนไหนในเว็บพากลับเข้าไปได้อีก — กล่องนี้คือทางนั้น
 *
 * **ต้องมีทั้ง QR และปุ่มเพิ่มเพื่อน** เพราะสองกรณีนี้ใช้แทนกันไม่ได้เลย: คนที่เปิด
 * เว็บบนคอมต้องสแกนด้วยมือถือ ส่วนคนที่เปิดบนมือถืออยู่แล้วสแกน QR ของจอตัวเอง
 * ไม่ได้ ถ้ามีแค่ QR อย่างเดียว คนกลุ่มหลังจะติดตายอยู่ตรงนี้
 */
export default function LineBotInviteDialog({
  className,
}: {
  className?: string;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const [open, setOpen] = useState(false);

  // ยิง api ต่อเมื่อผู้ใช้เปิดกล่องจริง ๆ ไม่ใช่ทุกครั้งที่เข้าหน้า
  const invite = useLineBotInvite(open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${className ?? ""}`}
      >
        <MessageCircle className="size-3.5" />
        {t.trigger}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>

          {invite.isPending ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.loading}
            </p>
          ) : invite.data ? (
            <div className="flex flex-col items-center gap-4">
              {/* api ส่ง QR มาเป็น data URL อยู่แล้ว จึงไม่ต้องผ่าน image optimizer */}
              <Image
                src={invite.data.qrCodeDataUrl}
                alt={t.title}
                width={180}
                height={180}
                unoptimized
                className="rounded-lg border border-border bg-white p-2"
              />

              <a
                href={invite.data.addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ className: "w-full" })}
              >
                {t.addFriend}
              </a>

              <div className="text-center">
                <div className="text-xs text-muted-foreground">{t.idHint}</div>
                <code className="mt-1 block font-mono text-sm text-foreground">
                  {invite.data.basicId}
                </code>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                {t.keepsLink}
              </p>
            </div>
          ) : (
            /*
              โชว์เหตุผลที่ api ส่งมาจริง ไม่ใช่ข้อความรวมๆ ของตัวเอง — api แยก
              ไว้แล้วว่า "ยังไม่ได้ตั้งค่าแชทบอท" (ขาด LINE_CHANNEL_ACCESS_TOKEN)
              กับ "ดึงข้อมูลจาก LINE ไม่สำเร็จ" ซึ่งคนละทางแก้กันคนละเรื่อง
              เคสแรกกดใหม่กี่ครั้งก็ไม่มีวันขึ้น การบอกให้ "ลองใหม่อีกครั้ง"
              จึงพาผู้ใช้ไปผิดทางตั้งแต่ต้น
            */
            <p className="py-8 text-center text-sm text-destructive">
              {invite.error instanceof ApiError
                ? invite.error.message
                : t.error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
