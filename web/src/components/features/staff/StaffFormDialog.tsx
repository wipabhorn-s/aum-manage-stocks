"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Caption from "@/components/shared/Caption";
import { FormError } from "@/components/features/auth/form-error";
import { PasswordInput } from "@/components/features/auth/PasswordInput";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError } from "@/lib/api-client";
import { useCreateStaff } from "@/lib/hooks/use-staff";
import { createStaffSchema, type CreateStaffInput } from "@/lib/validations/staff";

const content = {
  th: {
    title: "เพิ่มบัญชีพนักงาน",
    intro:
      "บัญชีนี้เจ้าของร้านสร้างให้เท่านั้น มี username และรหัสผ่านคู่เสมอ และเริ่มต้นยังไม่มีสิทธิ์ใดเปิดให้เลย",
    firstName: "ชื่อ",
    lastName: "นามสกุล",
    username: "Username",
    password: "รหัสผ่าน",
    confirmPassword: "ยืนยันรหัสผ่าน",
    phFirstName: "กรอกชื่อ",
    phLastName: "กรอกนามสกุล",
    phUsername: "กรอกชื่อผู้ใช้",
    phPassword: "กรอกรหัสผ่าน",
    showPassword: "แสดงรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
    passwordHint: "ส่งรหัสนี้ให้พนักงาน แล้วบอกให้เปลี่ยนเองที่หน้าโปรไฟล์",
    nextStep: "สร้างเสร็จแล้วกด “แก้ไขสิทธิ์” เพื่อเลือกร้านและเปิดสิทธิ์ให้",
    submit: "สร้างบัญชี",
    submitting: "กำลังสร้าง…",
    cancel: "ยกเลิก",
    failed: "สร้างบัญชีพนักงานไม่สำเร็จ",
  },
  en: {
    title: "Add a staff account",
    intro:
      "Only the shop owner can create this account. It always comes with a username/password pair and starts with every permission off.",
    firstName: "First name",
    lastName: "Last name",
    username: "Username",
    password: "Password",
    confirmPassword: "Confirm password",
    phFirstName: "Enter your first name",
    phLastName: "Enter your last name",
    phUsername: "Enter your username",
    phPassword: "Enter your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    passwordHint: "Send it to them and ask them to change it from their profile.",
    nextStep:
      "After creating the account, use “Edit permissions” to pick a shop and turn permissions on.",
    submit: "Create account",
    submitting: "Creating…",
    cancel: "Cancel",
    failed: "Could not create the staff account",
  },
};

const LABEL = "text-[11px] font-semibold uppercase";

export default function StaffFormDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // ถอดออกจาก tree ตอนปิด ฟอร์มจะได้เริ่มจากค่าว่างทุกครั้งที่เปิดใหม่
  // (แบบเดียวกับ AddAdminDialog)
  if (!open) return null;

  return <StaffFormDialogContent onClose={onClose} />;
}

function StaffFormDialogContent({ onClose }: { onClose: () => void }) {
  const { locale } = useLocale();
  const t = content[locale];
  const createStaff = useCreateStaff();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({ resolver: zodResolver(createStaffSchema) });

  const onSubmit = async (values: CreateStaffInput) => {
    setError(null);
    try {
      await createStaff.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        username: values.username,
        password: values.password,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.failed);
    }
  };

  const busy = isSubmitting || createStaff.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="max-h-[90vh] w-full max-w-115 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="font-heading text-base font-bold text-foreground">
          {t.title}
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{t.intro}</p>

        <div className="mt-4 flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className={LABEL}>{t.firstName}</Label>
              <Input
                autoFocus
                placeholder={t.phFirstName}
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className={LABEL}>{t.lastName}</Label>
              <Input placeholder={t.phLastName} {...register("lastName")} />
              {errors.lastName && (
                <p className="text-xs text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className={LABEL}>{t.username}</Label>
            <Input placeholder={t.phUsername} {...register("username")} />
            {errors.username && (
              <p className="text-xs text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className={LABEL}>{t.password}</Label>
              <PasswordInput
                placeholder={t.phPassword}
                showLabel={t.showPassword}
                hideLabel={t.hidePassword}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className={LABEL}>{t.confirmPassword}</Label>
              <PasswordInput
                placeholder={t.phPassword}
                showLabel={t.showPassword}
                hideLabel={t.hidePassword}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>

          <Caption>{t.passwordHint}</Caption>
          <Caption>{t.nextStep}</Caption>
          <FormError message={error} />
        </div>

        <div className="mt-4 flex justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t.cancel}
          </Button>
          <Button type="submit" variant="dark" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}
