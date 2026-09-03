"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import TopBar from "@/components/layout/TopBar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import Caption from "@/components/shared/Caption";
import { FormError } from "@/components/features/auth/form-error";
import { PasswordInput } from "@/components/features/auth/PasswordInput";
import StaffFormDialog from "@/components/features/staff/StaffFormDialog";
import StaffPermissionsDialog from "@/components/features/staff/StaffPermissionsDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError } from "@/lib/api-client";
import { useShops } from "@/lib/hooks/use-inventory";
import {
  useDeleteStaff,
  useResetStaffPassword,
  useStaffList,
  useStaffQuota,
  useUnlinkStaffLine,
} from "@/lib/hooks/use-staff";
import {
  resetStaffPasswordSchema,
  type ResetStaffPasswordInput,
} from "@/lib/validations/staff";
import type { StaffAccount } from "@/lib/types/staff";

const AVATAR_COLORS = ["#F5A31C", "#5C9A54", "#D65745", "#17161A"];

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const content = {
  th: {
    title: "พนักงานและสิทธิ์",
    staffListHeading: "พนักงานในร้าน",
    addBtn: "+ เพิ่มพนักงาน",
    quota: (used: number, allowed: number) =>
      `ใช้ไปแล้ว ${used} จาก ${allowed} ที่นั่ง`,
    quotaFull: "โควตาพนักงานเต็มแล้ว ต้องอัปเกรดแพ็กเกจถึงจะเพิ่มได้",
    emptyStaff: "ยังไม่มีพนักงาน กด “เพิ่มพนักงาน” เพื่อสร้างบัญชีแรก",
    editPermBtn: "แก้ไขสิทธิ์",
    resetPwBtn: "รีเซ็ตรหัสผ่าน",
    deleteBtn: "ลบบัญชี",
    lineLinked: "ผูก LINE แล้ว",
    lineNotLinked: "ยังไม่ผูก LINE",
    unlinkLineBtn: "ยกเลิกการผูก LINE",
    lineHint:
      "เจ้าของร้านผูก LINE ให้แทนไม่ได้ — พนักงานต้องเข้าสู่ระบบด้วยบัญชีตัวเอง แล้วกดผูก LINE ที่หน้าโปรไฟล์",
    lineUnlinked: "ยกเลิกการผูก LINE แล้ว",
    noShop: "ยังไม่มีร้าน สร้างร้านก่อนจึงจะกำหนดสิทธิ์ให้พนักงานได้",
    resetPwTitle: (name: string) => `ตั้งรหัสผ่านใหม่ให้ ${name}`,
    resetPwIntro:
      "ตั้งรหัสใหม่แล้วส่งให้พนักงานเอง ระบบจะไม่ส่งอีเมลแจ้ง และพนักงานจะถูกออกจากระบบทุกอุปกรณ์",
    newPasswordLabel: "รหัสผ่านใหม่",
    fieldConfirmPassword: "ยืนยันรหัสผ่าน",
    phPassword: "กรอกรหัสผ่าน",
    showPassword: "แสดงรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
    passwordReset: "ตั้งรหัสผ่านใหม่ให้พนักงานแล้ว พนักงานจะถูกออกจากระบบทุกอุปกรณ์",
    saving: "กำลังบันทึก…",
    cancelBtn: "ยกเลิก",
    confirmDeleteTitle: "ลบบัญชีพนักงาน",
    confirmDeleteDesc: (name: string) =>
      `บัญชีของ ${name} จะถูกลบและออกจากระบบทันที ประวัติการขายและสต็อกที่เคยทำไว้ยังอยู่ครบ`,
    confirmBtn: "ตกลง",
    working: "กำลังดำเนินการ…",
    deleteSuccess: "ลบบัญชีแล้ว",
  },
  en: {
    title: "Staff & Permissions",
    staffListHeading: "Shop staff",
    addBtn: "+ Add staff",
    quota: (used: number, allowed: number) =>
      `${used} of ${allowed} seats used`,
    quotaFull: "Staff quota is full — upgrade your plan to add more.",
    emptyStaff: 'No staff yet. Tap "Add staff" to create the first account.',
    editPermBtn: "Edit permissions",
    resetPwBtn: "Reset password",
    deleteBtn: "Delete account",
    lineLinked: "LINE linked",
    lineNotLinked: "LINE not linked",
    unlinkLineBtn: "Unlink LINE",
    lineHint:
      "Owners cannot link LINE on someone's behalf — the staff member has to sign in themselves and link LINE from their profile.",
    lineUnlinked: "LINE account unlinked",
    noShop: "No shops yet. Create a shop before assigning permissions.",
    resetPwTitle: (name: string) => `Reset password for ${name}`,
    resetPwIntro:
      "Set a new password and pass it on yourself — no email is sent, and they will be signed out on every device.",
    newPasswordLabel: "New password",
    fieldConfirmPassword: "Confirm password",
    phPassword: "Enter your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    passwordReset:
      "The staff password has been reset. They will be signed out on every device.",
    saving: "Saving…",
    cancelBtn: "Cancel",
    confirmDeleteTitle: "Delete staff account",
    confirmDeleteDesc: (name: string) =>
      `${name}'s account will be deleted and signed out immediately. Their sales and stock history stays intact.`,
    confirmBtn: "Confirm",
    working: "Working…",
    deleteSuccess: "Account deleted",
  },
};

export default function StaffManager() {
  const { locale } = useLocale();
  const t = content[locale];

  const staffQuery = useStaffList();
  const quotaQuery = useStaffQuota();
  const shopsQuery = useShops();

  const staff = staffQuery.data ?? [];
  const shops = shopsQuery.data ?? [];
  const quota = quotaQuery.data ?? { allowed: 0, used: 0, remaining: 0 };
  const isQuotaFull = quota.remaining <= 0;

  const [isAdding, setIsAdding] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<StaffAccount | null>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<StaffAccount | null>(
    null,
  );
  const [deleting, setDeleting] = useState<StaffAccount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const deleteStaff = useDeleteStaff();
  const unlinkLine = useUnlinkStaffLine();

  const onDeleteStaff = async (): Promise<boolean> => {
    if (!deleting) return false;
    setActionError(null);
    try {
      await deleteStaff.mutateAsync(deleting.id);
      return true;
    } catch (error) {
      setActionError(toMessage(error, "ลบบัญชีไม่สำเร็จ"));
      return false;
    }
  };

  const onUnlinkLine = async (member: StaffAccount) => {
    setActionError(null);
    setNotice(null);
    try {
      await unlinkLine.mutateAsync(member.id);
      setNotice(t.lineUnlinked);
    } catch (error) {
      setActionError(toMessage(error, "ยกเลิกการผูก LINE ไม่สำเร็จ"));
    }
  };

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="px-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                    {t.staffListHeading}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.quota(quota.used, quota.allowed)}
                  </p>
                </div>
                <Button
                  variant="dark"
                  disabled={isQuotaFull}
                  onClick={() => setIsAdding(true)}
                >
                  {t.addBtn}
                </Button>
              </div>

              {isQuotaFull && (
                <p className="mt-3 text-xs text-status-red">{t.quotaFull}</p>
              )}
              {shops.length === 0 && (
                <p className="mt-3 text-xs text-status-orange">{t.noShop}</p>
              )}

              <div className="mt-4">
                {staff.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t.emptyStaff}
                  </p>
                ) : (
                  staff.map((member, index) => (
                    <div
                      key={member.id}
                      className={`flex flex-wrap items-center gap-3 py-3.5 ${
                        index < staff.length - 1
                          ? "border-b border-border"
                          : ""
                      }`}
                    >
                      <Avatar>
                        <AvatarFallback
                          className="font-heading font-bold text-white"
                          style={{
                            backgroundColor:
                              AVATAR_COLORS[index % AVATAR_COLORS.length],
                          }}
                        >
                          {member.firstName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-40 flex-1">
                        <div className="text-sm font-semibold">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {member.username}
                        </div>
                      </div>

                      {/*
                        เจ้าของร้านผูก LINE แทนพนักงานไม่ได้ — การผูกใช้ LINE OAuth
                        ของเจ้าตัว (POST /users/me/link-line) จึงมีได้แค่ปุ่ม
                        "ยกเลิกการผูก" ส่วนกรณียังไม่ผูกต้องอธิบายว่าต้องทำยังไง
                        ไม่ใช่แสดงป้ายเฉยๆ แล้วปล่อยให้ผู้ใช้หาปุ่มที่ไม่มีอยู่จริง
                      */}
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={member.lineUserId ? "success" : "neutral"}
                        >
                          {member.lineUserId ? t.lineLinked : t.lineNotLinked}
                        </Badge>
                        {member.lineUserId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={unlinkLine.isPending}
                            onClick={() => onUnlinkLine(member)}
                          >
                            {t.unlinkLineBtn}
                          </Button>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="dark"
                          size="sm"
                          onClick={() => setPermissionsFor(member)}
                        >
                          {t.editPermBtn}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNotice(null);
                            setActionError(null);
                            setResetPasswordFor(member);
                          }}
                        >
                          {t.resetPwBtn}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleting(member)}
                        >
                          {t.deleteBtn}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {staff.some((member) => !member.lineUserId) && (
                <div className="mt-3">
                  <Caption>{t.lineHint}</Caption>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                <FormError message={actionError} />
                {notice && (
                  <p className="rounded-md border border-status-green/30 bg-status-green/10 px-3 py-2 text-sm text-status-green">
                    {notice}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </main>

      <StaffFormDialog open={isAdding} onClose={() => setIsAdding(false)} />

      <StaffPermissionsDialog
        staff={permissionsFor}
        shops={shops}
        onClose={() => setPermissionsFor(null)}
      />

      <ResetPasswordDialog
        staff={resetPasswordFor}
        onClose={() => setResetPasswordFor(null)}
        onDone={() => {
          setResetPasswordFor(null);
          setNotice(t.passwordReset);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t.confirmDeleteTitle}
        description={
          deleting
            ? t.confirmDeleteDesc(`${deleting.firstName} ${deleting.lastName}`)
            : undefined
        }
        confirmLabel={t.confirmBtn}
        cancelLabel={t.cancelBtn}
        pendingLabel={t.working}
        successLabel={t.deleteSuccess}
        destructive
        onConfirm={onDeleteStaff}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function ResetPasswordDialog({
  staff,
  onClose,
  onDone,
}: {
  staff: StaffAccount | null;
  onClose: () => void;
  onDone: () => void;
}) {
  // ถอดออกจาก tree ตอนปิด ฟอร์มจะได้ว่างทุกครั้งที่เปิดใหม่
  if (!staff) return null;

  return (
    <ResetPasswordDialogContent
      staff={staff}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function ResetPasswordDialogContent({
  staff,
  onClose,
  onDone,
}: {
  staff: StaffAccount;
  onClose: () => void;
  onDone: () => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];
  const resetStaffPassword = useResetStaffPassword();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetStaffPasswordInput>({
    resolver: zodResolver(resetStaffPasswordSchema),
  });

  const onSubmit = async (values: ResetStaffPasswordInput) => {
    setError(null);
    try {
      await resetStaffPassword.mutateAsync({
        staffId: staff.id,
        newPassword: values.newPassword,
      });
      onDone();
    } catch (caught) {
      setError(toMessage(caught, "รีเซ็ตรหัสผ่านไม่สำเร็จ"));
    }
  };

  const busy = isSubmitting || resetStaffPassword.isPending;
  const name = `${staff.firstName} ${staff.lastName}`;

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
        aria-label={t.resetPwTitle(name)}
        className="w-full max-w-105 rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="font-heading text-base font-bold text-foreground">
          {t.resetPwTitle(name)}
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {t.resetPwIntro}
        </p>

        <div className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-semibold uppercase">
              {t.newPasswordLabel}
            </Label>
            <PasswordInput
              autoFocus
              placeholder={t.phPassword}
              showLabel={t.showPassword}
              hideLabel={t.hidePassword}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-semibold uppercase">
              {t.fieldConfirmPassword}
            </Label>
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

          <FormError message={error} />
        </div>

        <div className="mt-4 flex justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t.cancelBtn}
          </Button>
          <Button type="submit" variant="dark" disabled={busy}>
            {busy ? t.saving : t.resetPwBtn}
          </Button>
        </div>
      </form>
    </div>
  );
}
