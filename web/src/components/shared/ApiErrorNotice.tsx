"use client";

import Link from "next/link";

import { ApiError } from "@/lib/api-client";
import { useLocale } from "@/components/i18n/LocaleContext";

/**
 * แถบ error ที่พาไปแก้ต้นเหตุได้ ไม่ใช่แค่บอกว่าพัง
 *
 * ข้อความภาษาไทยมาจาก MESSAGE_TH ใน lib/api-error.ts อยู่แล้ว (api-client แปลง
 * ทุก error ผ่านตรงนั้นก่อนโยนเป็น ApiError) ที่นี่จึงไม่แปลซ้ำ — หน้าที่เดียว
 * คือดู `code` แล้วเติมทางออกให้ถูกเรื่อง
 *
 * SHOP_PAUSED เป็นเคสที่ผู้ใช้แก้เองได้ใน 2 คลิก แต่ต้องรู้ก่อนว่าไปกดที่ไหน
 * บอกแค่ "ร้านนี้ถูกพักอยู่" แล้วปล่อยให้ไปหาเองคือการผลักภาระให้ผู้ใช้
 *
 * เกณฑ์ว่า code ไหนควรมีลิงก์: **ผู้ใช้แก้เองได้จากหน้าใดหน้าหนึ่งในเว็บ**
 * โควตาเต็มและแพ็กเกจหมดอายุแก้ได้ที่ /membership ทั้งหมด จึงอยู่ในตารางนี้
 *
 * ที่จงใจไม่ใส่คือกลุ่มที่กดไปแล้วก็ทำอะไรไม่ได้ —
 * ACCOUNT_SUSPENDED / SHOP_SUSPENDED ต้องให้แอดมินปลดให้ ส่วน *_PERMISSION_DENIED
 * ต้องให้เจ้าของร้านเปิดสิทธิ์ให้ ไม่มีหน้าไหนที่พาไปแล้วช่วยได้
 */

export type ApiFailure = { message: string; code?: string };

export function toApiFailure(caught: unknown): ApiFailure {
  if (caught instanceof ApiError) {
    return { message: caught.message, code: caught.code };
  }
  return {
    message: caught instanceof Error ? caught.message : String(caught),
  };
}

const content = {
  th: {
    resume: "ไปเปิดร้าน →",
    renew: "ต่ออายุแพ็กเกจ →",
    upgrade: "อัปเกรดแพ็กเกจ →",
  },
  en: {
    resume: "Resume the shop →",
    renew: "Renew your plan →",
    upgrade: "Upgrade your plan →",
  },
};

type ActionKey = keyof (typeof content)["th"];

const ACTION_BY_CODE: Record<string, { href: string; label: ActionKey }> = {
  SHOP_PAUSED: { href: "/shops", label: "resume" },
  SUBSCRIPTION_READ_ONLY: { href: "/membership", label: "renew" },
  PRODUCT_QUOTA_EXCEEDED: { href: "/membership", label: "upgrade" },
  SHOP_QUOTA_EXCEEDED: { href: "/membership", label: "upgrade" },
  PLAN_UPGRADE_REQUIRED: { href: "/membership", label: "upgrade" },
  CHATBOT_NOT_IN_PLAN: { href: "/membership", label: "upgrade" },
  AI_NOT_IN_PLAN: { href: "/membership", label: "upgrade" },
};

export function ApiErrorNotice({
  error,
  fallback,
}: {
  error: ApiFailure | null;
  /** ข้อความที่หน้านั้นตรวจเองได้ก่อนยิง api เช่น "จำนวนเกินของที่มีอยู่" */
  fallback?: string;
}) {
  const { locale } = useLocale();
  const t = content[locale];

  if (!error && !fallback) return null;

  const action = error?.code ? ACTION_BY_CODE[error.code] : undefined;

  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error?.message ?? fallback}
      {action && (
        <Link
          href={action.href}
          className="ml-2 font-semibold whitespace-nowrap underline underline-offset-4"
        >
          {t[action.label]}
        </Link>
      )}
    </p>
  );
}
