/**
 * HTTP endpoints that the browser is allowed to reach through the authenticated
 * backend proxy. OAuth callbacks and server-to-server webhooks deliberately
 * stay on their dedicated route handlers.
 */
export const backendEndpointRules = [
  { methods: ["POST"] as const, pattern: /^users$/ },
  { methods: ["GET", "PATCH", "DELETE"] as const, pattern: /^users\/[^/]+$/ },
  { methods: ["POST"] as const, pattern: /^users\/[^/]+\/reset-password$/ },
  { methods: ["DELETE"] as const, pattern: /^users\/[^/]+\/unlink-line$/ },
  { methods: ["GET", "PATCH"] as const, pattern: /^users\/me$/ },
  { methods: ["PATCH"] as const, pattern: /^users\/me\/password$/ },
  { methods: ["POST"] as const, pattern: /^users\/me\/password\/set$/ },
  { methods: ["POST"] as const, pattern: /^users\/me\/link-(?:line|google)$/ },
  { methods: ["DELETE"] as const, pattern: /^users\/me\/unlink-line$/ },
  { methods: ["DELETE"] as const, pattern: /^users\/me\/unlink-google$/ },
  { methods: ["GET", "PATCH"] as const, pattern: /^admin\/(?:users|shops)(?:\/[^/]+\/(?:suspend|reactivate))?$/ },
  { methods: ["POST"] as const, pattern: /^admin\/admins$/ },
  { methods: ["PATCH"] as const, pattern: /^admin\/admins\/[^/]+\/role$/ },
  { methods: ["GET"] as const, pattern: /^admin\/overview$/ },
  { methods: ["GET"] as const, pattern: /^payments(?:\/[^/]+)?$/ },
  { methods: ["POST"] as const, pattern: /^payments\/subscription-intent$/ },
  { methods: ["POST"] as const, pattern: /^payments\/[^/]+\/retry-intent$/ },
  { methods: ["POST"] as const, pattern: /^payments\/[^/]+\/confirm$/ },
  // ปุ่ม "ยกเลิก" ในประวัติการชำระเงินเรียกตัวนี้ ตกหล่นจากรายการมาตั้งแต่แรก
  // ผู้ใช้จึงกดยกเลิกแล้วได้ 404 "ไม่อนุญาตให้เรียก endpoint นี้ผ่านเว็บ" และ
  // ติดอยู่กับใบค้าง 24 ชม. โดยเปิดรายการใหม่ไม่ได้เลย
  { methods: ["POST"] as const, pattern: /^payments\/[^/]+\/cancel$/ },
  { methods: ["GET"] as const, pattern: /^(?:subscription-plans|subscriptions\/me)$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"] as const, pattern: /^shops(?:\/[^/]+(?:\/(?:pause|resume))?)?$/ },
  { methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] as const, pattern: /^shops\/[^/]+\/(?:staff(?:\/[^/]+\/permissions)?|products(?:\/[^/]+)?|stock(?:\/adjust|\/transfer|\/recent|\/movements|\/chat-command(?:\/[^/]+(?:\/confirm)?)?)?|sales(?:\/scan|\/[^/]+(?:\/void)?)?|chat\/messages|ai\/recommendations(?:\/generate)?|dashboard(?:\/best-sellers|\/dead-stock|\/reports\/(?:sales-trend|by-category))?)$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"] as const, pattern: /^staff(?:\/quota|\/[^/]+(?:\/assign(?:\/[^/]+)?|\/shops)?)?$/ },
  // [อั้ม] ข้อมูลเพิ่มบอท LINE เป็นเพื่อน (QR) — อ่านอย่างเดียว ไม่ผูกกับร้าน
  { methods: ["GET"] as const, pattern: /^line\/bot-invite$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"] as const, pattern: /^categories(?:\/[^/]+)?$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"] as const, pattern: /^products(?:\/search|\/[^/]+)?$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"] as const, pattern: /^stock(?:\/.*)?$/ },
  { methods: ["GET", "PATCH"] as const, pattern: /^notifications(?:\/[^/]+\/read|\/read-all)?$/ },
  { methods: ["GET", "POST"] as const, pattern: /^dashboard\/summary$/ },
  { methods: ["GET", "POST", "PATCH"] as const, pattern: /^ai\/recommendations\/[^/]+\/dismiss$/ },
] as const;

export function isAllowedBackendEndpoint(method: string, path: string) {
  return backendEndpointRules.some(
    (rule) =>
      rule.methods.some((allowedMethod) => allowedMethod === method) &&
      rule.pattern.test(path),
  );
}
