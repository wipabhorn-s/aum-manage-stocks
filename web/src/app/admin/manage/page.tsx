"use client";

import { useState } from "react";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TableState from "@/components/shared/TableState";
import AddAdminDialog from "@/components/features/admin/AddAdminDialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import { useAdminUsers, useUpdateAdminRole } from "@/lib/hooks/use-admin";
import { useMe } from "@/lib/hooks/use-profile";
import type { AdminUser } from "@/lib/types/admin";

const content = {
  th: {
    title: "จัดการ Admin",
    intro:
      "Super Admin มีสิทธิ์เหมือน Admin และจัดการสิทธิ์ของ Admin คนอื่นเพิ่มเติม",
    addBtn: "เพิ่ม Admin",
    selfLabel: "บัญชีของคุณ",
    columns: ["Admin", "สถานะ", ""],
    activeLabel: "ปกติ",
    suspendedLabel: "ถูกระงับ",
    promoteBtn: "เลื่อนเป็น Super Admin",
    demoteBtn: "ลดเป็น Admin",
    roles: { ADMIN: "Admin", SUPER_ADMIN: "Super Admin" },
    loading: "กำลังโหลดรายชื่อ Admin…",
    empty: "ยังไม่มีบัญชี Admin ในระบบ",
    note: "การเปลี่ยนสิทธิ์ของตัวเองทำไม่ได้ และระบบจะบันทึกทุกการเปลี่ยนแปลงลงประวัติผู้ดูแล",
  },
  en: {
    title: "Manage Admins",
    intro:
      "Super Admin has all Admin rights plus the ability to manage other Admins' access.",
    addBtn: "Add admin",
    selfLabel: "Your account",
    columns: ["Admin", "Status", ""],
    activeLabel: "Normal",
    suspendedLabel: "Suspended",
    promoteBtn: "Promote to Super Admin",
    demoteBtn: "Demote to Admin",
    roles: { ADMIN: "Admin", SUPER_ADMIN: "Super Admin" },
    loading: "Loading admins…",
    empty: "No admin accounts yet",
    note: "You cannot change your own role, and every change is written to the admin audit log.",
  },
};

export default function AdminManagePage() {
  const { locale } = useLocale();
  const t = content[locale];

  // api กรอง role ได้ทีละค่า จึงต้องยิงสองก้อนแล้วรวมเอง
  const [adding, setAdding] = useState(false);
  const admins = useAdminUsers({ role: "ADMIN" });
  const superAdmins = useAdminUsers({ role: "SUPER_ADMIN" });
  const updateRole = useUpdateAdminRole();
  const { data: me } = useMe();

  const isPending = admins.isPending || superAdmins.isPending;
  const error = admins.error ?? superAdmins.error ?? updateRole.error ?? null;

  const rows: AdminUser[] = [
    ...(superAdmins.data?.items ?? []),
    ...(admins.data?.items ?? []),
  ].filter((user) => user.deletedAt === null);

  return (
    <>
      <TopBar title={t.title} notifications={false} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t.intro}</span>
            <Button variant="dark" onClick={() => setAdding(true)}>
              {t.addBtn}
            </Button>
          </div>

          <Card className="p-0 overflow-x-auto">
            <table className="w-full min-w-125 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {t.columns.map((h, i) => (
                    <th
                      key={i}
                      className="px-6 py-3 text-left text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={t.columns.length}
                  isLoading={isPending}
                  error={error}
                  isEmpty={rows.length === 0}
                  loadingLabel={t.loading}
                  emptyLabel={t.empty}
                />
                {rows.map((a, i) => {
                  const isSuper = a.role === "SUPER_ADMIN";
                  // api ปฏิเสธการเปลี่ยน role ของตัวเองด้วย 400 (admin.service.ts)
                  // ซ่อนปุ่มไปเลยแทนที่จะให้กดแล้วเด้ง error เหมือนหน้า /admin/users
                  const isSelf = a.id === me?.id;

                  return (
                    <tr
                      key={a.id}
                      className={
                        i < rows.length - 1 ? "border-b border-border" : ""
                      }
                    >
                      <td className="px-6 py-3.5">
                        <div className="font-semibold">
                          {a.firstName} {a.lastName}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {a.email ?? a.username ?? a.id}
                        </div>
                        <div className="mt-1">
                          <Badge variant={isSuper ? "warning" : "success"}>
                            {t.roles[isSuper ? "SUPER_ADMIN" : "ADMIN"]}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge
                          variant={
                            a.status === "SUSPENDED" ? "error" : "success"
                          }
                        >
                          {a.status === "SUSPENDED"
                            ? t.suspendedLabel
                            : t.activeLabel}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5">
                        {isSelf ? (
                          <span className="text-[13px] text-muted-foreground">
                            {t.selfLabel}
                          </span>
                        ) : (
                          <Button
                            variant={isSuper ? "outline" : "dark"}
                            size="sm"
                            disabled={updateRole.isPending}
                            onClick={() =>
                              updateRole.mutate({
                                id: a.id,
                                role: isSuper ? "ADMIN" : "SUPER_ADMIN",
                              })
                            }
                          >
                            {isSuper ? t.demoteBtn : t.promoteBtn}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <p className="text-[13px] text-muted-foreground">{t.note}</p>
        </div>
      </main>

      <AddAdminDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
