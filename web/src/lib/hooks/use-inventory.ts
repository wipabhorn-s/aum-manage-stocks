'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api, withQuery } from '@/lib/api-client';
import { staffKeys } from '@/lib/hooks/use-staff';

export type Shop = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  status: "ACTIVE" | "SUSPENDED";
  pausedAt?: string | null;
};

export type Product = {
  id: string;
  name: string;
  unit: string;
  categoryId: string | null;
  barcode: string | null;
  imageUrl: string | null;
};

export type ShopProduct = {
  id: string;
  shopId: string;
  productId: string;
  sellPrice: number | string;
  costPrice: number | string;
  stockQty: number;
  lowStockThreshold: number;
  status: 'ACTIVE' | 'INACTIVE';
  product: Pick<Product, 'id' | 'name' | 'barcode' | 'unit' | 'imageUrl' | 'categoryId'>;
};

export type ShopDashboard = {
  range: { from: string; to: string };
  sales: {
    totalAmount: number;
    saleCount: number;
    averageSaleAmount: number;
  };
  stock: { activeProducts: number; lowStock: number; outOfStock: number };
  generatedAt: string;
};

export type BestSeller = {
  rank: number;
  shopProductId: string;
  productName: string;
  quantitySold: number;
  totalAmount: number;
};

export type StockMovement = {
  id: string;
  shopProductId: string;
  actorId: string | null;
  movementType: 'MANUAL_ADJUSTMENT' | 'CHAT_ADJUSTMENT' | 'SALE' | 'SALE_VOID';
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  /**
   * ทุนต่อชิ้นของการเคลื่อนไหวครั้งนี้ — เป็น string เพราะฝั่ง api เก็บเป็น Decimal
   *
   * null = รายการที่เกิดก่อนมีระบบล็อตต้นทุน ต้องแสดงเป็น "—" ไม่ใช่ ฿0.00
   * เพราะ "ไม่มีข้อมูล" กับ "ทุนเป็นศูนย์" เป็นคนละเรื่องกัน (หลักเดียวกับที่
   * แดชบอร์ดแยกนับ itemsWithoutCost)
   */
  unitCost: string | null;
  source: 'WEB' | 'LINE';
  note: string | null;
  createdAt: string;
};

type Paginated<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

/**
 * ทุกอย่างที่ทำให้สต็อกหรือยอดขายเปลี่ยน ต้องล้างแคชสองก้อน ไม่ใช่ก้อนเดียว
 *
 * แดชบอร์ดใช้ queryKey ขึ้นต้นด้วย 'dashboard' คนละต้นไม้กับ inventoryKeys
 * และ QueryClient ตั้ง staleTime ไว้ 30 วินาที (query-provider.tsx) ถ้าล้างแค่
 * inventory ผู้ใช้ที่ขายของที่ POS แล้วกดไปหน้าแดชบอร์ดทันทีจะเห็นยอดเก่า
 * ค้างอยู่ครึ่งนาที เหมือนระบบไม่ได้บันทึกบิลให้
 *
 * เขียนเป็นฟังก์ชันกลางเพื่อไม่ให้ต้องจำว่าต้องล้างอะไรบ้างในทุก mutation
 * ที่จะเพิ่มเข้ามาทีหลัง — **ทุกที่ที่ทำให้สต็อกเปลี่ยนต้องเรียกตัวนี้**
 * ไม่ใช่ไล่ล้างเองทีละ key เพราะพอมี key ใหม่เพิ่มเข้ามาแล้วจะตกหล่นทันที
 * (เคยเกิดมาแล้วตอนเพิ่ม 'notifications' — hook อัปเดตแต่กล่องต่างๆ ไม่ได้ตาม)
 */
export function invalidateStockAndSales(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['catalog'] });
  /**
   * สต็อกที่ตกข้ามจุดแจ้งเตือนทำให้ api สร้าง LOW_STOCK ขึ้นมาเงียบๆ ฝั่งนี้
   * ไม่มีทางรู้ ถ้าไม่ล้างแคชกระดิ่งด้วย ตัวเลขจะค้างจนกว่าจะรีเฟรชหน้า
   */
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export const inventoryKeys = {
  all: ['inventory'] as const,
  shops: () => [...inventoryKeys.all, 'shops'] as const,
  products: (params: Record<string, string | number | undefined>) =>
    [...inventoryKeys.all, 'products', params] as const,
  shopProducts: (shopId: string, params: Record<string, string | number | undefined>) =>
    [...inventoryKeys.all, 'shop-products', shopId, params] as const,
};

export function useShops() {
  return useQuery({
    queryKey: inventoryKeys.shops(),
    queryFn: () => api.get<Shop[]>('/api/backend/shops'),
  });
}

export type ShopInput = {
  name: string;
  description?: string;
  imageUrl?: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export function useCreateShop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ShopInput) => api.post<Shop>('/api/backend/shops', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] });
    },
  });
}

export function useUpdateShop(shopId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ShopInput) => api.patch<Shop>(`/api/backend/shops/${shopId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useDeleteShop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shopId: string) => api.delete(`/api/backend/shops/${shopId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['subscriptions', 'me'] });
    },
  });
}

// เจ้าของพักร้านชั่วคราวเอง — คนละความหมายกับ status=SUSPENDED ที่ Admin
// เป็นคนตั้งเท่านั้น (ดู shops.service.ts) เอนด์พอยต์นี้ปฏิเสธพนักงานเสมอ
export function usePauseShop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shopId: string) => api.patch<Shop>(`/api/backend/shops/${shopId}/pause`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useResumeShop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shopId: string) => api.patch<Shop>(`/api/backend/shops/${shopId}/resume`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useProducts(params: { q?: string; categoryId?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: inventoryKeys.products(params),
    queryFn: () => api.get<Paginated<Product>>(withQuery('/api/backend/products', params)),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      unit: string;
      barcode?: string;
      categoryId?: string;
      imageUrl?: string;
    }) => api.post<Product>('/api/backend/products', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useShopProducts(
  shopId: string | undefined,
  params: { q?: string; status?: 'ACTIVE' | 'INACTIVE'; page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: inventoryKeys.shopProducts(shopId ?? 'none', params),
    queryFn: () =>
      api.get<Paginated<ShopProduct>>(
        withQuery(`/api/backend/shops/${shopId}/products`, params),
      ),
    enabled: Boolean(shopId),
  });
}

export function useAddShopProduct(shopId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productId: string;
      sellPrice: number;
      costPrice: number;
      lowStockThreshold: number;
    }) => api.post(`/api/backend/shops/${shopId}/products`, input),
    /**
     * เพิ่มสินค้าเข้าร้าน = สต็อกของร้านนั้นเปลี่ยน ต้องใช้ตัวล้างกลางเหมือน
     * mutation อื่นที่แตะสต็อก — เดิมล้างแค่ inventoryKeys.all ซึ่งไม่แตะ
     * ['catalog','shop-products',shopId] ที่หน้าแคตตาล็อกใช้อ่าน สินค้าที่เพิ่ง
     * เพิ่มจึงไม่โผล่จนกว่าจะรีเฟรชหน้า (บั๊กแบบเดียวกับสิทธิ์พนักงาน)
     */
    onSuccess: () => invalidateStockAndSales(queryClient),
  });
}

export function useShopDashboard(shopId: string | undefined) {
  return useQuery({
    queryKey: [...inventoryKeys.all, 'dashboard', shopId ?? 'none'],
    queryFn: () => api.get<ShopDashboard>(`/api/backend/shops/${shopId}/dashboard`),
    enabled: Boolean(shopId),
  });
}

export function useBestSellers(shopId: string | undefined) {
  return useQuery({
    queryKey: [...inventoryKeys.all, 'best-sellers', shopId ?? 'none'],
    queryFn: () => api.get<{ items: BestSeller[] }>(`/api/backend/shops/${shopId}/dashboard/best-sellers`),
    enabled: Boolean(shopId),
  });
}

export type MovementFilters = {
  /** ISO string — api รับเป็น z.coerce.date() แล้วกรอง createdAt >= from */
  from?: string;
  to?: string;
  shopProductId?: string;
  actorId?: string;
  movementType?: StockMovement['movementType'];
  limit?: number;
};

export function useStockMovements(
  shopId: string | undefined,
  filters: MovementFilters = {},
) {
  return useQuery({
    // filters อยู่ใน key ด้วย เปลี่ยนตัวกรองแล้วต้องยิงใหม่ ไม่ใช่อ่าน cache เดิม
    queryKey: [...inventoryKeys.all, 'movements', shopId ?? 'none', filters],
    queryFn: () =>
      api.get<{ items: StockMovement[]; nextCursor: string | null }>(
        withQuery(`/api/backend/shops/${shopId}/stock/movements`, {
          limit: filters.limit ?? 50,
          from: filters.from,
          to: filters.to,
          shopProductId: filters.shopProductId,
          actorId: filters.actorId,
          movementType: filters.movementType,
        }),
      ),
    enabled: Boolean(shopId),
  });
}

export function useAdjustStock(shopId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      shopProductId: string;
      operation: 'INCREASE' | 'DECREASE';
      quantity: number;
      note?: string;
    }) => api.post(`/api/backend/shops/${shopId}/stock/adjust`, input),
    onSuccess: () => invalidateStockAndSales(queryClient),
  });
}

export type SellableProduct = {
  shopProductId: string;
  name: string;
  unitPrice: number | string;
};

// สแกนอย่างเดียวยังไม่เปิดบิล ไม่มีอะไรเปลี่ยนในฐานข้อมูล จึงไม่ต้องล้างแคช
export function useScanSale(shopId: string | undefined) {
  return useMutation({
    mutationFn: (barcode: string) =>
      api.post<SellableProduct>(`/api/backend/shops/${shopId}/sales/scan`, { barcode }),
  });
}

export function useCreateSale(shopId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { items: { shopProductId: string; quantity: number }[] }) =>
      api.post(`/api/backend/shops/${shopId}/sales`, input),
    onSuccess: () => invalidateStockAndSales(queryClient),
  });
}

export type SubscriptionPlan = {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  priceThb: number | string;
  includedShopQuota: number;
  maxActiveProducts: number | null;
  includedStaffQuota: number;
  isFree: boolean;
  chatbotEnabled: boolean;
  barcodeEnabled: boolean;
  aiRecommendationEnabled: boolean;
};

export type SubscriptionSummary = {
  subscription: { status: string; expiresAt: string | null; plan: SubscriptionPlan };
  readOnly: boolean;
  quotas: {
    shop: { used: number; allowed: number; remaining: number; canCreateShop: boolean };
    product: { allowed: number | null; used: number; remaining: number | null };
    staff: { allowed: number; used: number; remaining: number };
  };
};

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/api/backend/subscription-plans'),
  });
}

export function useMySubscription() {
  return useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: () => api.get<SubscriptionSummary>('/api/backend/subscriptions/me'),
  });
}

/**
 * ยอดที่ต้องจ่ายจริงมาจาก api เท่านั้น ห้ามเอาราคาป้ายของแพ็กเกจมาแสดงแทน
 * เพราะการอัปเกรดจากแพ็กเกจที่ยังไม่หมดอายุจะเก็บแค่ส่วนต่าง (เช่น PLUS -> PRO
 * = 1,000 ไม่ใช่ 3,499) ถ้าหน้าเว็บโชว์ราคาป้ายจะไม่ตรงกับที่ Stripe ตัดจริง
 */
export type PaymentIntentResult = {
  paymentId: string;
  clientSecret: string;
  amountThb: number;
  fullPriceThb: number;
  /** true = จ่ายเฉพาะส่วนต่าง วันหมดอายุเดิมไม่ขยับ */
  prorated: boolean;
  expiresAt: string;
};

export function useCreateSubscriptionPaymentIntent() {
  return useMutation({
    mutationFn: (planCode: 'PLUS' | 'PRO') =>
      api.post<PaymentIntentResult>(
        '/api/backend/payments/subscription-intent',
        { planCode },
      ),
  });
}

export function useRetrySubscriptionPaymentIntent() {
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.post<PaymentIntentResult>(
        `/api/backend/payments/${paymentId}/retry-intent`,
      ),
  });
}

export function useConfirmSubscriptionPayment() {
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.post<{ message: string }>(`/api/backend/payments/${paymentId}/confirm`),
  });
}

export type Payment = {
  id: string;
  amountThb: number | string;
  status: string;
  purpose: string;
  createdAt: string;
  /** เวลาที่ใบนี้หมดอายุ (createdAt + 24 ชม.) */
  expiresAt: string;
  /**
   * api เป็นคนตัดสินว่ายังกด "ชำระอีกครั้ง" ได้ไหม ไม่ใช่หน้าเว็บ — ถ้าคำนวณ
   * จาก createdAt เองที่นี่ นาฬิกาเครื่องผู้ใช้ที่เพี้ยนจะทำให้ปุ่มโผล่ทั้งที่
   * api ปฏิเสธไปแล้ว (หรือหายไปทั้งที่ยังจ่ายได้)
   */
  retryable: boolean;
  /** ใบที่ยังค้างและยังไม่หมดอายุ — เป็นใบเดียวที่บล็อกการซื้อรอบใหม่ */
  cancellable: boolean;
  subscription?: { plan?: { nameTh?: string } };
};

export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get<Payment[]>('/api/backend/payments'),
  });
}

export function useCancelPayment() {
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.post<{ message: string }>(`/api/backend/payments/${paymentId}/cancel`),
  });
}

export type Category = { id: string; name: string; displayOrder: number };

export type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  status: string;
  lineUserId?: string | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  /** ใช้สลับร้านให้ตรงตอนกดเปิดรายการ — api ส่งมาอยู่แล้ว */
  shopId: string | null;
};

export type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  pendingActionId: string | null;
};

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/api/backend/categories'),
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/api/backend/staff'),
  });
}

export function useStaffQuota() {
  return useQuery({
    queryKey: ['staff', 'quota'],
    queryFn: () => api.get<{ allowed: number; used: number; remaining: number }>('/api/backend/staff/quota'),
  });
}

export type StaffPermission = {
  canManageProduct: boolean;
  canAdjustStockManual: boolean;
  canUseChatbot: boolean;
  canScanSale: boolean;
  canViewDashboard: boolean;
  canViewAiInsight: boolean;
};

export function useShopStaff(shopId: string | undefined) {
  return useQuery({
    queryKey: ['staff', 'shop', shopId],
    queryFn: () => api.get<Array<{ id: string; user: StaffMember; permission: StaffPermission }>>(`/api/backend/shops/${shopId}/staff`),
    enabled: Boolean(shopId),
  });
}

export function useSetStaffPermissions(shopId: string | undefined, staffId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissions: StaffPermission) =>
      api.put(`/api/backend/shops/${shopId}/staff/${staffId}/permissions`, permissions),
    /**
     * ต้องล้างทั้งซับทรี ['staff'] ไม่ใช่แค่ ['staff','shop',shopId]
     *
     * TanStack จับคู่ queryKey แบบ prefix ตามลำดับ — ['staff','shop',id] จึงไม่
     * แตะ ['staff','permissions',shopId,staffId] ที่ useStaffPermissions ใน
     * use-staff.ts ใช้อ่านค่า (ตำแหน่งที่ 2 คนละคำกัน) ผลคือหน้าจอสิทธิ์อ่าน
     * ค่าเก่าจาก cache ต่อ สวิตช์เด้งกลับหลังกดบันทึกจนกว่าจะรีเฟรชทั้งหน้า
     *
     * PUT เขียนทับทั้งชุดอยู่แล้ว จึงเขียน cache ทับให้ทันทีก่อน เพื่อไม่ให้
     * สวิตช์กระพริบกลับไปค่าเดิมระหว่างรอ refetch
     */
    onSuccess: (_data, permissions) => {
      queryClient.setQueryData(staffKeys.permissions(shopId, staffId), permissions);
      void queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

/**
 * `enabled` มีไว้ปิดตอนอยู่หน้า admin — บัญชี admin ไม่มีร้าน @OwnerId() ฝั่ง api
 * จึงตอบ 403 ทุกครั้ง ยิงไปก็ได้แค่ error แดงใน console
 */
/**
 * ดึงซ้ำทุกนาที เพราะการแจ้งเตือนเกิดที่ฝั่งเซิร์ฟเวอร์และไม่มี push channel
 * (socket.io ในโปรเจกต์ทำเฉพาะ ai-recommendations)
 *
 * การ invalidate ตอน mutation ช่วยได้เฉพาะแท็บที่เป็นคนกดขายเอง แต่เคสจริงคือ
 * พนักงานขายอยู่หน้าร้านแล้วเจ้าของร้านเปิดจออีกเครื่อง ซึ่งเป็นตอนที่การแจ้งเตือน
 * มีประโยชน์ที่สุด — แท็บนั้นต้องรู้เองโดยไม่มีใครมาบอก
 *
 * TanStack ตั้ง refetchIntervalInBackground เป็น false อยู่แล้ว แท็บที่ไม่ได้
 * เปิดอยู่จึงไม่ยิง
 */
const NOTIFICATION_POLL_MS = 60_000;

export function useNotifications(unreadOnly = false, enabled = true) {
  return useQuery({
    enabled,
    refetchInterval: NOTIFICATION_POLL_MS,
    queryKey: ['notifications', { unreadOnly }],
    queryFn: () =>
      api.get<{ items: Notification[]; meta: unknown }>(
        withQuery('/api/backend/notifications', { unreadOnly: unreadOnly ? 'true' : undefined }),
      ),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/api/backend/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/api/backend/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useChatMessages(shopId: string | undefined) {
  return useQuery({
    queryKey: ['chat', shopId],
    queryFn: () =>
      api.get<ChatMessage[]>(withQuery(`/api/backend/shops/${shopId}/chat/messages`, { limit: 50 })),
    enabled: Boolean(shopId),
  });
}

export function useSendChatMessage(shopId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post<{ pendingAction: unknown; reply: string }>(
        `/api/backend/shops/${shopId}/chat/messages`,
        { content },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', shopId] }),
  });
}
