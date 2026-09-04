import { redirect } from "next/navigation";

/**
 * ฟอร์มเพิ่มสินค้าไม่ใช่หน้าอีกต่อไป — เป็น modal บนหน้าแคตตาล็อกกลาง
 *
 * เดิม route นี้ redirect ไป /catalog/new ซึ่งตอนนี้ถูกลบทิ้งแล้ว จึงต้องชี้มาที่
 * /catalog แทน ไม่งั้นลิงก์เก่าและบุ๊กมาร์กจะเด้งไป 404
 */
export default function AddProductRedirectPage() {
  redirect("/catalog");
}
