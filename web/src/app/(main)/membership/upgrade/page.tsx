import { redirect } from "next/navigation";

/**
 * ตารางเทียบแพ็กเกจย้ายไปเป็นกล่องป๊อปอัปบนหน้าสมาชิกแล้ว
 * (components/features/membership/UpgradePlanDialog.tsx)
 *
 * เก็บ route ไว้เป็น redirect แทนการลบทิ้ง — ลิงก์เก่าและบุ๊กมาร์กจะได้ไม่ตาย
 * `?upgrade=1` เป็นตัวบอกให้หน้าสมาชิกเปิดกล่องให้ทันทีที่ไปถึง
 */
export default function UpgradePlanRedirectPage() {
  redirect("/membership?upgrade=1");
}
