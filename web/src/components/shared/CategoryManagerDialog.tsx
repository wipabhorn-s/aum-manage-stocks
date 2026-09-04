"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useLocale } from "@/components/i18n/LocaleContext";
import { ApiError, api, withQuery } from "@/lib/api-client";
import {
  inventoryKeys,
  useCategories,
  type Category,
} from "@/lib/hooks/use-inventory";

/**
 * กล่องจัดการหมวดหมู่ที่ใช้ร่วมกันทุกหน้า — /products, /catalog,
 * หน้าสินค้า หน้าแคตตาล็อก และกล่องเพิ่มสินค้า เรียกตัวเดียวกันหมด แก้ที่นี่ที่เดียวเปลี่ยนทุกหน้า
 *
 * หมวดหมู่เป็นของ CategoriesModule (อั้ม) ตรงนี้แค่เรียก endpoint ของเขา
 * ไม่ได้แตะโค้ดฝั่ง api เลย
 *
 * เรื่องที่ต้องระวังตอนลบ — schema ตั้ง Product.categoryId เป็น onDelete: SetNull
 * ลบหมวดแล้วสินค้าที่อยู่ในหมวดนั้นจะไม่ถูกลบตาม แต่ categoryId จะกลายเป็น null
 * เงียบ ๆ กู้คืนไม่ได้ จึงนับจำนวนสินค้าที่จะโดนก่อนแล้วบอกในกล่องยืนยัน
 * นับจาก meta.total ของ GET /products?categoryId=… ไม่ใช่นับจากรายการที่โหลดมา
 * เพราะรายการถูกตัดที่ limit อยู่แล้ว จะได้ตัวเลขน้อยกว่าความจริง
 */

const content = {
  th: {
    title: "จัดการหมวดหมู่",
    description:
      "แก้ชื่อหรือลบได้จากตรงนี้เลย ไม่ต้องออกไปหน้าอื่น — หมวดหมู่ใช้ร่วมกันทุกร้านของบัญชีนี้",
    newPlaceholder: "ชื่อหมวดหมู่ใหม่ เช่น เครื่องดื่ม",
    add: "เพิ่ม",
    adding: "กำลังเพิ่ม…",
    edit: "แก้ไข",
    save: "บันทึก",
    saving: "กำลังบันทึก…",
    cancel: "ยกเลิก",
    remove: "ลบ",
    close: "ปิด",
    empty: "ยังไม่มีหมวดหมู่ พิมพ์ชื่อด้านบนแล้วกดเพิ่มได้เลย",
    loading: "กำลังโหลด…",
    confirmTitle: (name: string) => `ลบหมวดหมู่ "${name}"?`,
    confirmNone: "ยังไม่มีสินค้าอยู่ในหมวดนี้ ลบได้เลย",
    confirmSome: (n: number) =>
      `สินค้า ${n} รายการอยู่ในหมวดนี้ — สินค้าจะไม่ถูกลบ แต่จะกลายเป็น "ไม่ระบุหมวดหมู่" และย้อนกลับไม่ได้ ต้องมาตั้งหมวดให้ใหม่ทีละตัว`,
    confirmCounting: "กำลังนับสินค้าที่จะได้รับผลกระทบ…",
    confirmLabel: "ลบหมวดหมู่",
    confirmPending: "กำลังลบ…",
    confirmSuccess: "ลบแล้ว",
  },
  en: {
    title: "Manage categories",
    description:
      "Rename or delete right here — categories are shared across every shop on this account.",
    newPlaceholder: "New category name, e.g. Beverages",
    add: "Add",
    adding: "Adding…",
    edit: "Edit",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    remove: "Delete",
    close: "Close",
    empty: "No categories yet — type a name above and press Add.",
    loading: "Loading…",
    confirmTitle: (name: string) => `Delete category "${name}"?`,
    confirmNone: "No products use this category. Safe to delete.",
    confirmSome: (n: number) =>
      `${n} product(s) use this category. They will not be deleted, but they become "Uncategorised" and this cannot be undone — you would have to re-assign each one.`,
    confirmCounting: "Counting affected products…",
    confirmLabel: "Delete category",
    confirmPending: "Deleting…",
    confirmSuccess: "Deleted",
  },
};

interface CategoryManagerDialogProps {
  open: boolean;
  onClose: () => void;
  /** เรียกเมื่อหมวดถูกลบ ให้หน้าที่เปิดกล่องนี้ล้างตัวกรอง/ค่าที่เลือกไว้ได้ */
  onCategoryDeleted?: (categoryId: string) => void;
}

export function CategoryManagerDialog({
  open,
  onClose,
  onCategoryDeleted,
}: CategoryManagerDialogProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const queryClient = useQueryClient();

  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [affectedCount, setAffectedCount] = useState<number | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    // สินค้าถือ categoryId อยู่ด้วย ลบ/เปลี่ยนชื่อหมวดแล้วต้องให้ตารางสินค้าโหลดใหม่
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  };

  const readError = (caught: unknown) =>
    caught instanceof ApiError || caught instanceof Error
      ? caught.message
      : String(caught);

  const createCategory = useMutation({
    mutationFn: (name: string) =>
      api.post<Category>("/api/backend/categories", { name }),
    onSuccess: () => {
      setNewName("");
      setError(null);
      refresh();
    },
    onError: (caught) => setError(readError(caught)),
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Category>(`/api/backend/categories/${id}`, { name }),
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
      setError(null);
      refresh();
    },
    onError: (caught) => setError(readError(caught)),
  });

  const startDelete = async (category: Category) => {
    setError(null);
    setPendingDelete(category);
    setAffectedCount(null);
    try {
      const page = await api.get<{ meta: { total: number } }>(
        withQuery("/api/backend/products", {
          categoryId: category.id,
          limit: 1,
        }),
      );
      setAffectedCount(page.meta.total);
    } catch {
      // นับไม่ได้ก็ไม่ควรบล็อกการลบ แต่ต้องไม่แสดงเลข 0 หลอกตา
      setAffectedCount(null);
    }
  };

  const confirmDelete = async (): Promise<boolean> => {
    if (!pendingDelete) return false;
    try {
      await api.delete(`/api/backend/categories/${pendingDelete.id}`);
      onCategoryDeleted?.(pendingDelete.id);
      refresh();
      return true;
    } catch (caught) {
      setError(readError(caught));
      return false;
    }
  };

  const closeAll = () => {
    setEditingId(null);
    setEditingName("");
    setNewName("");
    setError(null);
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeAll();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newName.trim()) {
                  event.preventDefault();
                  createCategory.mutate(newName.trim());
                }
              }}
              placeholder={t.newPlaceholder}
              maxLength={100}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              disabled={!newName.trim() || createCategory.isPending}
              onClick={() => createCategory.mutate(newName.trim())}
            >
              {createCategory.isPending ? t.adding : t.add}
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            {categoriesQuery.isLoading && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t.loading}
              </p>
            )}
            {!categoriesQuery.isLoading && categories.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t.empty}
              </p>
            )}
            {categories.map((category, index) => {
              const isEditing = editingId === category.id;
              return (
                <div
                  key={category.id}
                  className={`flex items-center gap-2 px-3 py-2.5 ${
                    index < categories.length - 1
                      ? "border-b border-border"
                      : ""
                  }`}
                >
                  {isEditing ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && editingName.trim()) {
                            event.preventDefault();
                            renameCategory.mutate({
                              id: category.id,
                              name: editingName.trim(),
                            });
                          }
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        maxLength={100}
                        autoFocus
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          !editingName.trim() || renameCategory.isPending
                        }
                        onClick={() =>
                          renameCategory.mutate({
                            id: category.id,
                            name: editingName.trim(),
                          })
                        }
                      >
                        {renameCategory.isPending ? t.saving : t.save}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        {t.cancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {category.name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                          setError(null);
                        }}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void startDelete(category)}
                      >
                        {t.remove}
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={closeAll}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t.confirmTitle(pendingDelete.name) : ""}
        description={
          affectedCount === null
            ? t.confirmCounting
            : affectedCount === 0
              ? t.confirmNone
              : t.confirmSome(affectedCount)
        }
        confirmLabel={t.confirmLabel}
        cancelLabel={t.cancel}
        pendingLabel={t.confirmPending}
        successLabel={t.confirmSuccess}
        destructive
        onConfirm={confirmDelete}
        onClose={() => {
          setPendingDelete(null);
          setAffectedCount(null);
        }}
      />
    </>
  );
}
