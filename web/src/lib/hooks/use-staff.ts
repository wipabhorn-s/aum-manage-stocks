'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api-client';
import type {
  StaffAccount,
  StaffAssignment,
  StaffPermissions,
  StaffQuota,
} from '@/lib/types/staff';

/**
 * [อั้ม] hook ของ StaffModule — แยกไฟล์จาก use-inventory.ts ที่เป็นของแพรว
 * เพื่อไม่ให้สองคนแก้ไฟล์เดียวกันแล้ว conflict ทุกรอบ
 *
 * ใช้ queryKey ขึ้นต้นด้วย 'staff' เหมือน useShopStaff ใน use-inventory.ts
 * เวลา invalidate ฝั่งไหนก็ตาม อีกฝั่งจะโหลดใหม่ตามไปด้วย
 */
export const staffKeys = {
  all: ['staff'] as const,
  list: () => [...staffKeys.all, 'list'] as const,
  quota: () => [...staffKeys.all, 'quota'] as const,
  shops: (staffId: string | undefined) =>
    [...staffKeys.all, 'shops', staffId ?? 'none'] as const,
  permissions: (shopId: string | undefined, staffId: string | undefined) =>
    [...staffKeys.all, 'permissions', shopId ?? 'none', staffId ?? 'none'] as const,
};

export function useStaffList() {
  return useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => api.get<StaffAccount[]>('/api/backend/staff'),
  });
}

export function useStaffQuota() {
  return useQuery({
    queryKey: staffKeys.quota(),
    queryFn: () => api.get<StaffQuota>('/api/backend/staff/quota'),
  });
}

export function useStaffShops(staffId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.shops(staffId),
    queryFn: () => api.get<StaffAssignment[]>(`/api/backend/staff/${staffId}/shops`),
    enabled: Boolean(staffId),
  });
}

/**
 * สิทธิ์ผูกกับคู่ (พนักงาน, ร้าน) ไม่ใช่กับพนักงานอย่างเดียว
 *
 * api ตอบ 404 เมื่อพนักงานยังไม่สังกัดร้านนั้น ซึ่งเป็นสถานะปกติของงาน ไม่ใช่
 * ความผิดพลาด จึงแปลงเป็น null แทนการโยน error — และปิด retry ไว้ เพราะ 404
 * ยิงกี่ครั้งก็ได้ผลเดิม
 */
export function useStaffPermissions(
  shopId: string | undefined,
  staffId: string | undefined,
) {
  return useQuery({
    queryKey: staffKeys.permissions(shopId, staffId),
    queryFn: async () => {
      try {
        return await api.get<StaffPermissions>(
          `/api/backend/shops/${shopId}/staff/${staffId}/permissions`,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(shopId && staffId),
  });
}

export function useAssignStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ staffId, shopId }: { staffId: string; shopId: string }) =>
      api.post(`/api/backend/staff/${staffId}/assign`, { shopId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

export function useUnassignStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ staffId, shopId }: { staffId: string; shopId: string }) =>
      api.delete(`/api/backend/staff/${staffId}/assign/${shopId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

/**
 * สร้าง/ลบ/รีเซ็ตรหัส อยู่ที่ /users ไม่ใช่ /staff เพราะเป็น endpoint ของ
 * UsersModule (แพรว) — หน้า /staff จึงต้องยิงสองโมดูล
 */
export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      firstName: string;
      lastName: string;
      username: string;
      password: string;
    }) => api.post<StaffAccount>('/api/backend/users', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (staffId: string) =>
      api.delete(`/api/backend/users/${staffId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

/**
 * เจ้าของร้าน "ยกเลิก" การผูก LINE ของพนักงานได้ แต่ผูกให้แทนไม่ได้
 *
 * การผูกต้องใช้ LINE OAuth ของเจ้าตัวเอง (POST /users/me/link-line) เจ้าของร้าน
 * จึงทำแทนไม่ได้ตามหลักการ — พนักงานต้องเข้าสู่ระบบเองแล้วผูกที่หน้าโปรไฟล์
 */
export function useUnlinkStaffLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (staffId: string) =>
      api.delete(`/api/backend/users/${staffId}/unlink-line`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
  });
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: ({
      staffId,
      newPassword,
    }: {
      staffId: string;
      newPassword: string;
    }) =>
      api.post(`/api/backend/users/${staffId}/reset-password`, { newPassword }),
  });
}
