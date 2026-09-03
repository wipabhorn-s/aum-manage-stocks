"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import Caption from "@/components/shared/Caption";
import { FormError } from "@/components/features/auth/form-error";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError } from "@/lib/api-client";
import { useSetStaffPermissions } from "@/lib/hooks/use-inventory";
import {
  useAssignStaff,
  useStaffPermissions,
  useUnassignStaff,
} from "@/lib/hooks/use-staff";
import type {
  ShopSummary,
  StaffAccount,
  StaffPermissions,
} from "@/lib/types/staff";

const EMPTY_PERMISSIONS: StaffPermissions = {
  canManageProduct: false,
  canAdjustStockManual: false,
  canUseChatbot: false,
  canScanSale: false,
  canViewDashboard: false,
  canViewAiInsight: false,
};

const content = {
  th: {
    title: (name: string) => `สิทธิ์ของ ${name}`,
    intro:
      "สิทธิ์แยกตามร้าน — คนเดียวกันอาจมีสิทธิ์ในร้าน A แต่ไม่มีในร้าน B เลือกร้านก่อนแล้วค่อยเปิดสิทธิ์",
    shopLabel: "เลือกร้าน",
    noShop: "ยังไม่มีร้านค้า สร้างร้านก่อนจึงจะกำหนดสิทธิ์ได้",
    loading: "กำลังโหลดสิทธิ์…",
    notAssigned: "พนักงานคนนี้ยังไม่ได้สังกัดร้านนี้",
    assignBtn: "เพิ่มเข้าร้านนี้",
    assigning: "กำลังเพิ่ม…",
    unassignBtn: "ถอดออกจากร้านนี้",
    save: "บันทึกสิทธิ์",
    saving: "กำลังบันทึก…",
    saved: "บันทึกสิทธิ์แล้ว",
    close: "ปิด",
    planNote:
      "แชทบอทและบาร์โค้ดต้องอยู่ในแพ็กเกจ Plus ขึ้นไปด้วย เปิดสิทธิ์ให้อย่างเดียวยังใช้ไม่ได้",
    permissions: [
      { key: "canManageProduct", name: "จัดการสินค้า", desc: "เพิ่ม แก้ไข และถอดสินค้า" },
      { key: "canAdjustStockManual", name: "ปรับสต็อกแบบ manual", desc: "ค้นหาสินค้าแล้วบันทึกจำนวนทีละรายการ" },
      { key: "canUseChatbot", name: "เข้าถึงแชทบอทสต็อก", desc: "สั่งงานผ่านเว็บ และผ่าน LINE ถ้าผูกบัญชีแล้ว" },
      { key: "canScanSale", name: "ขายสินค้าหน้าร้าน", desc: "สแกนบาร์โค้ดขายและตัดสต็อกอัตโนมัติ" },
      { key: "canViewDashboard", name: "ดูแดชบอร์ด", desc: "เห็นภาพรวมของร้านที่สังกัด" },
      { key: "canViewAiInsight", name: "ดูคำแนะนำจาก AI", desc: "อ่านคำแนะนำเติม/ระบายสต็อก (Pro เท่านั้น)" },
    ],
    assignFailed: "เพิ่มเข้าร้านไม่สำเร็จ",
    unassignFailed: "ถอดออกจากร้านไม่สำเร็จ",
    saveFailed: "บันทึกสิทธิ์ไม่สำเร็จ",
  },
  en: {
    title: (name: string) => `Permissions for ${name}`,
    intro:
      "Permissions are per shop — the same person can have access in shop A but not shop B. Pick a shop first, then switch permissions on.",
    shopLabel: "Select a shop",
    noShop: "No shops yet. Create a shop before assigning permissions.",
    loading: "Loading permissions…",
    notAssigned: "This staff member is not assigned to this shop yet.",
    assignBtn: "Add to this shop",
    assigning: "Adding…",
    unassignBtn: "Remove from this shop",
    save: "Save permissions",
    saving: "Saving…",
    saved: "Permissions saved",
    close: "Close",
    planNote:
      "Chatbot and barcode also require a Plus plan or higher — granting the permission alone is not enough.",
    permissions: [
      { key: "canManageProduct", name: "Manage products", desc: "Add, edit and remove products" },
      { key: "canAdjustStockManual", name: "Manual stock entry", desc: "Search a product and record quantities" },
      { key: "canUseChatbot", name: "Use the stock chatbot", desc: "Via web, and via LINE once their account is linked" },
      { key: "canScanSale", name: "Sell at the counter", desc: "Scan barcodes and deduct stock automatically" },
      { key: "canViewDashboard", name: "View dashboard", desc: "See an overview of their assigned shops" },
      { key: "canViewAiInsight", name: "View AI recommendations", desc: "Read restock/clearance advice (Pro only)" },
    ],
    assignFailed: "Could not add them to the shop",
    unassignFailed: "Could not remove them from the shop",
    saveFailed: "Could not save permissions",
  },
};

const LABEL = "text-[11px] font-semibold uppercase";

export default function StaffPermissionsDialog({
  staff,
  shops,
  onClose,
}: {
  staff: StaffAccount | null;
  shops: ShopSummary[];
  onClose: () => void;
}) {
  // ถอดออกจาก tree ตอนปิด เพื่อล้างร้านที่เลือกและ draft ทิ้งทุกครั้ง
  if (!staff) return null;

  return (
    <StaffPermissionsDialogContent
      staff={staff}
      shops={shops}
      onClose={onClose}
    />
  );
}

function StaffPermissionsDialogContent({
  staff,
  shops,
  onClose,
}: {
  staff: StaffAccount;
  shops: ShopSummary[];
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const t = content[locale];

  const [selectedShopIdState, setSelectedShopId] = useState("");
  const [draft, setDraft] = useState<StaffPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shopId = selectedShopIdState || (shops[0]?.id ?? "");

  const permissionsQuery = useStaffPermissions(shopId, staff.id);
  const setPermissions = useSetStaffPermissions(shopId, staff.id);
  const assignStaff = useAssignStaff();
  const unassignStaff = useUnassignStaff();

  // null = ยังไม่สังกัดร้านนี้ (api ตอบ 404) ซึ่งเป็นสถานะปกติ ไม่ใช่ error
  const isAssigned = permissionsQuery.data != null;
  const permissions =
    draft ??
    (permissionsQuery.data
      ? { ...EMPTY_PERMISSIONS, ...permissionsQuery.data }
      : null);

  const busy =
    setPermissions.isPending ||
    assignStaff.isPending ||
    unassignStaff.isPending;

  const onSelectShop = (value: string) => {
    // เปลี่ยนร้าน = สิทธิ์คนละชุด ต้องทิ้ง draft ของร้านเดิม ไม่งั้นจะเผลอ
    // บันทึกค่าที่ตั้งไว้สำหรับอีกร้านทับ
    setSelectedShopId(value);
    setDraft(null);
    setError(null);
    setNotice(null);
  };

  const onAssign = async () => {
    setError(null);
    try {
      await assignStaff.mutateAsync({ staffId: staff.id, shopId });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.assignFailed);
    }
  };

  const onUnassign = async () => {
    setError(null);
    setNotice(null);
    try {
      await unassignStaff.mutateAsync({ staffId: staff.id, shopId });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.unassignFailed);
    }
  };

  const onSave = async () => {
    if (!permissions) return;
    setError(null);
    setNotice(null);
    try {
      // PUT เขียนทับทั้งชุด ต้องส่งครบทุกฟิลด์ ไม่ใช่เฉพาะตัวที่เปลี่ยน
      await setPermissions.mutateAsync(permissions);
      setDraft(null);
      setNotice(t.saved);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.saveFailed);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title(`${staff.firstName} ${staff.lastName}`)}
        className="max-h-[90vh] w-full max-w-135 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="font-heading text-base font-bold text-foreground">
          {t.title(`${staff.firstName} ${staff.lastName}`)}
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{t.intro}</p>

        {shops.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t.noShop}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-1">
              <Label htmlFor="permShopId" className={LABEL}>
                {t.shopLabel}
              </Label>
              <select
                id="permShopId"
                value={shopId}
                onChange={(event) => onSelectShop(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>

            {permissionsQuery.isPending ? (
              <p className="py-4 text-sm text-muted-foreground">{t.loading}</p>
            ) : !isAssigned ? (
              <div className="mt-4 flex flex-col items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">{t.notAssigned}</p>
                <Button
                  variant="dark"
                  size="sm"
                  disabled={busy}
                  onClick={onAssign}
                >
                  {assignStaff.isPending ? t.assigning : t.assignBtn}
                </Button>
              </div>
            ) : (
              permissions && (
                <>
                  <div className="mt-4">
                    {t.permissions.map((permission, index) => (
                      <div
                        key={permission.key}
                        className={`flex items-center justify-between gap-4 py-3 ${
                          index < t.permissions.length - 1
                            ? "border-b border-border"
                            : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {permission.name}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {permission.desc}
                          </div>
                        </div>
                        <Switch
                          checked={
                            permissions[permission.key as keyof StaffPermissions]
                          }
                          onCheckedChange={(value: boolean) =>
                            setDraft((previous) => ({
                              ...EMPTY_PERMISSIONS,
                              ...(previous ?? permissions),
                              [permission.key]: value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <Caption>{t.planNote}</Caption>
                </>
              )
            )}
          </>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <FormError message={error} />
          {notice && (
            <p className="rounded-md border border-status-green/30 bg-status-green/10 px-3 py-2 text-sm text-status-green">
              {notice}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2.5">
          {isAssigned && (
            <Button
              variant="outline"
              className="mr-auto"
              disabled={busy}
              onClick={onUnassign}
            >
              {t.unassignBtn}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t.close}
          </Button>
          {isAssigned && (
            <Button variant="dark" disabled={busy} onClick={onSave}>
              {setPermissions.isPending ? t.saving : t.save}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
