"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import TopBar from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/features/auth/PasswordInput";
import TwoFactorCard from "@/components/features/auth/TwoFactorCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// [อั้ม] ทางกลับเข้าห้องแชทบอทสำหรับคนที่ลบห้องทิ้ง (feature/chatbot-resource)
import LineBotInviteDialog from "@/components/features/chatbot/LineBotInviteDialog";
import { buttonVariants } from "@/components/ui/button";
import Caption from "@/components/shared/Caption";
import { FormError } from "@/components/features/auth/form-error";
import { useLocale } from "@/components/i18n/LocaleContext";
import {
  useChangePassword,
  useMe,
  useSetEmailChange,
  useSetFirstPassword,
  useUnlinkGoogle,
  useUnlinkLine,
  useUpdateProfile,
} from "@/lib/hooks/use-profile";
import { useMySubscription } from "@/lib/hooks/use-inventory";
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from "@/lib/validations/profile";
import { setPasswordSchema, type SetPasswordValues } from "@/lib/validations/profile";

const content = {
  th: {
    title: "โปรไฟล์ของฉัน",
    loading: "กำลังโหลดข้อมูลโปรไฟล์…",
    personalHeading: "ข้อมูลส่วนตัว",
    firstName: "ชื่อ",
    lastName: "นามสกุล",
    username: "Username",
    usernamePlaceholder: "กรอก username อย่างน้อย 6 ตัวอักษร",
    usernameHint: "อย่างน้อย 6 ตัวอักษร และต้องไม่ซ้ำกับผู้ใช้อื่น",
    email: "อีเมล",
    emailPlaceholder: "กรอกอีเมล",
    emailHint: "กรอกอีเมลใหม่แล้วกดบันทึก ระบบจะส่งลิงก์ให้ยืนยันก่อนเปลี่ยนจริง",
    emailPassword: "รหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนอีเมล",
    emailPasswordPlaceholder: "กรอกรหัสผ่านปัจจุบัน",
    emailChangeSent: "ส่งลิงก์ยืนยันไปยังอีเมลใหม่แล้ว กรุณากดยืนยันในอีเมล",
    noEmail: "บัญชีนี้ไม่มีอีเมล",
    saveBtn: "บันทึกข้อมูล",
    saving: "กำลังบันทึก...",
    saved: "บันทึกข้อมูลเรียบร้อยแล้ว",
    staffNotice:
      "บัญชีพนักงานแก้ไขข้อมูลและรหัสผ่านเองไม่ได้ ต้องให้เจ้าของร้านเป็นคนแก้ให้ (SRS §126)",
    pwHeading: "เปลี่ยนรหัสผ่าน",
    oldPw: "รหัสผ่านเดิม",
    oldPwPh: "ยืนยันรหัสผ่านเดิมก่อนเสมอ",
    newPw: "รหัสผ่านใหม่",
    newPwPh: "กรอกรหัสผ่านใหม่",
    confirmPw: "ยืนยันรหัสผ่านใหม่",
    confirmPwPh: "กรอกรหัสผ่านใหม่อีกครั้ง",
    changePwBtn: "เปลี่ยนรหัสผ่าน",
    changingPw: "กำลังเปลี่ยน...",
    pwChanged: "เปลี่ยนรหัสผ่านแล้ว กำลังพากลับไปเข้าสู่ระบบใหม่…",
    forgotPw: "ลืมรหัสผ่าน? ส่งลิงก์ไปอีเมล",
    noPasswordNotice:
      "บัญชีนี้สมัครผ่าน LINE/Google จึงยังไม่มีรหัสผ่าน ตั้งรหัสผ่านครั้งแรกได้ที่หน้าลืมรหัสผ่าน",
    connHeading: "การเชื่อมต่อบัญชี",
    lineLinked: "ผูกแล้ว — ใช้ AI Chat ได้ทั้งหน้าเว็บและฝั่ง LINE",
    lineNotLinked: "ยังไม่ผูก — ผูกแล้วถึงจะใช้ AI Chat ฝั่ง LINE ได้",
    googleLinked: "ผูกแล้ว — เข้าสู่ระบบด้วย Google ได้",
    googleNotLinked: "ยังไม่ผูก — ผูกแล้วเข้าสู่ระบบด้วย Google ได้เลย",
    linked: "ผูกแล้ว",
    notLinked: "ยังไม่ผูก",
    unlinkBtn: "ถอดการผูก",
    unlinking: "กำลังถอด...",
    linkBtn: "เชื่อม LINE",
    linkGoogleBtn: "เชื่อม Google",
    connCaption:
      "ระบบจะปฏิเสธการผูกบัญชี Google หรือ LINE ที่ผูกกับบัญชีอื่นอยู่แล้วในระบบ",
    connCaptionStaff:
      "บัญชีพนักงานผูกได้เฉพาะ LINE — ระบบจะปฏิเสธบัญชี LINE ที่ผูกกับบัญชีอื่นอยู่แล้ว",
    unlinkWarning: "กรุณากำหนดรหัสผ่านก่อนยกเลิกการเชื่อมต่อ ช่องทางนี้เป็นวิธีเข้าสู่ระบบเดียวของคุณ",
  },
  en: {
    title: "My Profile",
    loading: "Loading your profile…",
    personalHeading: "Personal Information",
    firstName: "First Name",
    lastName: "Last Name",
    username: "Username",
    usernamePlaceholder: "Enter your username",
    usernameHint: "At least 6 characters and must be unique",
    email: "Email",
    emailPlaceholder: "Enter your email",
    emailHint: "Enter a new email and save. We will send a verification link before changing it.",
    emailPassword: "Current password to confirm this email change",
    emailPasswordPlaceholder: "Enter your current password",
    emailChangeSent: "A verification link was sent to the new email. Confirm it to complete the change.",
    noEmail: "This account has no email",
    saveBtn: "Save Changes",
    saving: "Saving...",
    saved: "Your changes have been saved",
    staffNotice:
      "Staff accounts cannot edit their own details or password — the shop owner does it for them (SRS §126).",
    pwHeading: "Change Password",
    oldPw: "Current Password",
    oldPwPh: "Always confirm your current password first",
    newPw: "New Password",
    newPwPh: "Enter your new password",
    confirmPw: "Confirm New Password",
    confirmPwPh: "Enter your new password again",
    changePwBtn: "Change Password",
    changingPw: "Changing...",
    pwChanged: "Password changed — taking you back to sign in…",
    forgotPw: "Forgot your password? Email me a reset link",
    noPasswordNotice:
      "This account signed up through LINE/Google and has no password yet. Set one from the forgot-password page.",
    connHeading: "Account Connections",
    lineLinked: "Linked — AI Chat works on both web and LINE",
    lineNotLinked: "Not linked — link it to use AI Chat on LINE",
    googleLinked: "Linked — you can sign in with Google",
    googleNotLinked: "Not linked — link it to sign in with Google too",
    linked: "Linked",
    notLinked: "Not Linked",
    unlinkBtn: "Unlink",
    unlinking: "Unlinking...",
    linkBtn: "Connect LINE",
    linkGoogleBtn: "Connect Google",
    connCaption:
      "Linking will be rejected if that Google or LINE account is already linked elsewhere in the system.",
    connCaptionStaff:
      "Staff accounts can link LINE only — linking is rejected if that LINE account is already used elsewhere.",
    unlinkWarning: "Please set a password before unlinking. This is your only sign-in method.",
  },
};

const FIELD_LABEL_CLASS = "text-[11px] font-semibold uppercase";

export default function ProfilePage() {
  const { locale } = useLocale();
  const t = content[locale];
  const router = useRouter();

  const { data: me, isPending, error } = useMe();
  const subscriptionQuery = useMySubscription();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const setFirstPassword = useSetFirstPassword();
  const emailChange = useSetEmailChange();
  const unlinkLine = useUnlinkLine();
  const unlinkGoogle = useUnlinkGoogle();

  const isStaff = me?.role === "SHOP_STAFF";
  /**
   * ใช้ flag ของแพ็กเกจที่ api ส่งมา ไม่ใช่เทียบรหัสแพ็กเกจเอง — สิทธิ์ของแต่ละ
   * แพ็กเกจเป็นข้อมูลในตาราง subscription_plans ถ้ามาฮาร์ดโค้ด "PLUS"/"PRO" ไว้
   * ในหน้าเว็บ วันที่ทีมปรับสิทธิ์ในฐานข้อมูล หน้านี้จะเป็นที่เดียวที่ไม่เปลี่ยนตาม
   */
  const canUseChatbot =
    subscriptionQuery.data?.subscription.plan.chatbotEnabled ?? false;
  const loginMethodCount =
    Number(Boolean(me?.hasPassword)) +
    Number(Boolean(me?.lineUserId)) +
    Number(Boolean(me?.googleId));
  const canUnlinkOAuth = loginMethodCount > 1;

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    // `values` ไม่ใช่ `defaultValues` — ฟอร์มจะเติมค่าเองเมื่อ query โหลดเสร็จ
    values: {
      firstName: me?.firstName ?? "",
      lastName: me?.lastName ?? "",
      username: me?.username ?? "",
      email: me?.email ?? "",
    },
  });

  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });
  const setPasswordForm = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
  });

  const onSaveProfile = (values: ProfileValues) => {
    updateProfile.reset();
    emailChange.reset();
    const emailChanged = values.email.trim().toLowerCase() !== (me?.email ?? "").toLowerCase();
    const saveDetails = () => updateProfile.mutate({
      firstName: values.firstName,
      lastName: values.lastName,
      // ส่ง username ไปเฉพาะตอนที่กรอกจริง ไม่งั้น api จะเจอ string ว่างแล้วตีเป็น invalid
      ...(values.username ? { username: values.username } : {}),
    });
    if (emailChanged) {
      // ตรวจ email และส่งลิงก์ยืนยันก่อน จึงค่อยบันทึกข้อมูลส่วนตัว
      // ป้องกันกรณีขึ้นว่าบันทึกสำเร็จทั้งที่ email ซ้ำ
      emailChange.mutate(
        { email: values.email, currentPassword: values.currentPassword ?? "" },
        { onSuccess: saveDetails },
      );
    } else {
      saveDetails();
    }
  };

  const onSetFirstPassword = (values: SetPasswordValues) => {
    setFirstPassword.mutate(
      { newPassword: values.newPassword },
      { onSuccess: () => setPasswordForm.reset() },
    );
  };

  const onChangePassword = (values: ChangePasswordValues) => {
    changePassword.mutate(
      { oldPassword: values.oldPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          passwordForm.reset();
          // api revoke session ทั้งหมดหลังเปลี่ยนรหัสผ่าน ต้องให้ล็อกอินใหม่
          setTimeout(() => router.push("/login"), 1200);
        },
      },
    );
  };

  return (
    <>
      <TopBar title={t.title} />
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t.loading}</p>
        ) : error ? (
          <FormError message={error.message} />
        ) : (
          <div className="flex flex-col gap-5">
            {isStaff && <Caption>{t.staffNotice}</Caption>}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <form
                  className="px-4"
                  onSubmit={profileForm.handleSubmit(onSaveProfile)}
                >
                  <div className="mb-4 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                    {t.personalHeading}
                  </div>
                  <div className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-1">
                      <Label className={FIELD_LABEL_CLASS}>{t.firstName}</Label>
                      <Input
                        disabled={isStaff}
                        {...profileForm.register("firstName")}
                      />
                      {profileForm.formState.errors.firstName && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.firstName.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className={FIELD_LABEL_CLASS}>{t.lastName}</Label>
                      <Input
                        disabled={isStaff}
                        {...profileForm.register("lastName")}
                      />
                      {profileForm.formState.errors.lastName && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.lastName.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className={FIELD_LABEL_CLASS}>{t.username}</Label>
                      <Input
                        disabled={isStaff}
                        placeholder={t.usernamePlaceholder}
                        {...profileForm.register("username")}
                      />
                      <Caption>{t.usernameHint}</Caption>
                      {profileForm.formState.errors.username && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.username.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className={FIELD_LABEL_CLASS}>{t.email}</Label>
                      <Input
                        type="email"
                        placeholder={t.emailPlaceholder}
                        disabled={isStaff}
                        {...profileForm.register("email")}
                      />
                      <Caption>{t.emailHint}</Caption>
                      {me?.hasPassword && (
                        <div className="mt-1 flex flex-col gap-1">
                          <Label className={FIELD_LABEL_CLASS}>{t.emailPassword}</Label>
                          <PasswordInput
                            placeholder={t.emailPasswordPlaceholder}
                            disabled={isStaff}
                            {...profileForm.register("currentPassword")}
                          />
                        </div>
                      )}
                    </div>

                    <FormError message={updateProfile.error?.message ?? null} />
                    {emailChange.isSuccess && (
                      <p className="text-sm text-status-green">{t.emailChangeSent}</p>
                    )}
                    <FormError message={emailChange.error?.message ?? null} />
                    {!emailChange.isSuccess && updateProfile.isSuccess && (
                      <p className="text-sm text-status-green">{t.saved}</p>
                    )}

                    <div>
                      <Button
                        type="submit"
                        variant="dark"
                        className="leading-none"
                        disabled={isStaff || updateProfile.isPending || emailChange.isPending}
                      >
                        {updateProfile.isPending ? t.saving : t.saveBtn}
                      </Button>
                    </div>
                  </div>
                </form>
              </Card>

              <Card>
                <form
                  className="px-4"
                  onSubmit={passwordForm.handleSubmit(onChangePassword)}
                >
                  <div className="mb-4 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                    {t.pwHeading}
                  </div>

                  {me?.hasPassword === false ? (
                    <div className="flex flex-col gap-3.5">
                      <Caption>{t.noPasswordNotice}</Caption>
                      <div className="flex flex-col gap-1">
                        <Label className={FIELD_LABEL_CLASS}>{t.newPw}</Label>
                        <PasswordInput
                          placeholder={t.newPwPh}
                          disabled={isStaff}
                          {...setPasswordForm.register("newPassword")}
                        />
                        {setPasswordForm.formState.errors.newPassword && (
                          <p className="text-xs text-destructive">{setPasswordForm.formState.errors.newPassword.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className={FIELD_LABEL_CLASS}>{t.confirmPw}</Label>
                        <PasswordInput
                          placeholder={t.confirmPwPh}
                          disabled={isStaff}
                          {...setPasswordForm.register("confirmPassword")}
                        />
                        {setPasswordForm.formState.errors.confirmPassword && (
                          <p className="text-xs text-destructive">{setPasswordForm.formState.errors.confirmPassword.message}</p>
                        )}
                      </div>
                      <FormError message={setFirstPassword.error?.message ?? null} />
                      {setFirstPassword.isSuccess && <p className="text-sm text-status-green">{t.saved}</p>}
                      <Button type="button" variant="dark" className="leading-none" disabled={setFirstPassword.isPending} onClick={() => void setPasswordForm.handleSubmit(onSetFirstPassword)()}>
                        {setFirstPassword.isPending ? t.changingPw : t.changePwBtn}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      <div className="flex flex-col gap-1">
                        <Label className={FIELD_LABEL_CLASS}>{t.oldPw}</Label>
                        <Input
                          type="password"
                          placeholder={t.oldPwPh}
                          disabled={isStaff}
                          {...passwordForm.register("oldPassword")}
                        />
                        {passwordForm.formState.errors.oldPassword && (
                          <p className="text-xs text-destructive">
                            {passwordForm.formState.errors.oldPassword.message}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className={FIELD_LABEL_CLASS}>{t.newPw}</Label>
                        <Input
                          type="password"
                          placeholder={t.newPwPh}
                          disabled={isStaff}
                          {...passwordForm.register("newPassword")}
                        />
                        {passwordForm.formState.errors.newPassword && (
                          <p className="text-xs text-destructive">
                            {passwordForm.formState.errors.newPassword.message}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className={FIELD_LABEL_CLASS}>
                          {t.confirmPw}
                        </Label>
                        <Input
                          type="password"
                          placeholder={t.confirmPwPh}
                          disabled={isStaff}
                          {...passwordForm.register("confirmPassword")}
                        />
                        {passwordForm.formState.errors.confirmPassword && (
                          <p className="text-xs text-destructive">
                            {
                              passwordForm.formState.errors.confirmPassword
                                .message
                            }
                          </p>
                        )}
                      </div>

                      <FormError
                        message={changePassword.error?.message ?? null}
                      />
                      {changePassword.isSuccess && (
                        <p className="text-sm text-status-green">
                          {t.pwChanged}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        variant="dark"
                        className="leading-none"
                        disabled={isStaff || changePassword.isPending}
                        >
                          {changePassword.isPending
                            ? t.changingPw
                            : t.changePwBtn}
                        </Button>
                        <button
                          type="button"
                          className="text-[13px] text-muted-foreground"
                          onClick={() => router.push("/forgot-password")}
                        >
                          {t.forgotPw}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              </Card>
            </div>

            {/* SRS §39 — 2FA เป็นตัวเลือก เปิดเองได้ทุก role ไม่มีการบังคับ */}
            <TwoFactorCard
              enabled={Boolean(me?.twoFactorEnabled)}
              hasPassword={Boolean(me?.hasPassword)}
            />

            <Card>
              <div className="px-4">
                <div className="mb-4 font-heading text-xs font-bold tracking-[0.12em] text-foreground uppercase">
                  {t.connHeading}
                </div>
                {!canUnlinkOAuth && (me?.lineUserId || me?.googleId) && (
                  <Alert variant="info" className="mb-3">
                    <AlertDescription className="text-status-orange">
                      {t.unlinkWarning}
                    </AlertDescription>
                  </Alert>
                )}

                {/*
                  เส้นคั่นอยู่ที่บล็อกเชิญบอทด้านล่าง ถ้าบล็อกนั้นถูกซ่อน (Free)
                  แถว LINE กับ Google จะติดกันเป็นพืดจนอ่านไม่ออกว่าคนละอัน
                */}
                <div
                  className={`flex items-center justify-between py-3.5 ${
                    canUseChatbot ? "" : "border-b border-border"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold">LINE</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {me?.lineUserId ? t.lineLinked : t.lineNotLinked}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge className="w-20 justify-center" variant={me?.lineUserId ? "success" : "neutral"}>
                      {me?.lineUserId ? t.linked : t.notLinked}
                    </Badge>
                    {me?.lineUserId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-28 justify-center"
                        disabled={unlinkLine.isPending || !canUnlinkOAuth}
                        onClick={() => unlinkLine.mutate()}
                      >
                        {unlinkLine.isPending ? t.unlinking : t.unlinkBtn}
                      </Button>
                    ) : (
                      <a
                        href="/api/users/link-line/start"
                        className={buttonVariants({ variant: "outline", size: "sm", className: "w-28 justify-center" })}
                      >
                        {t.linkBtn}
                      </a>
                    )}
                  </div>
                </div>

                {/*
                  แชทบอทเป็นสิทธิ์ของ Plus/Pro — บัญชี Free กดเข้าไปก็ใช้บอทไม่ได้
                  ทางลัดกลับเข้าห้องแชทจึงไม่ควรโผล่ให้เห็นตั้งแต่แรก
                  (AGENTS.md: AI Chat = Plus และ Pro ส่วน AI Recommendations = Pro
                  อย่างเดียว คนละ flag กัน อย่าเอามาปนกัน)
                */}
                {canUseChatbot && (
                  <div className="border-b border-border pb-3.5">
                    <LineBotInviteDialog />
                  </div>
                )}

                {/*
                  บัญชีพนักงานผูก Google ไม่ได้ — POST /users/me/link-google ถูกกั้น
                  ด้วย @Roles(SHOP_OWNER) ฝั่ง api อยู่แล้ว ถ้าปล่อยปุ่มไว้พนักงาน
                  จะกดแล้วเจอ 403 เฉยๆ ซ่อนทั้งแถวจึงตรงกับสิ่งที่ทำได้จริง
                */}
                {!isStaff && (
                <div className="flex items-center justify-between py-3.5">
                  <div>
                    <div className="text-sm font-semibold">Google</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {me?.googleId ? t.googleLinked : t.googleNotLinked}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge className="w-20 justify-center" variant={me?.googleId ? "success" : "neutral"}>
                      {me?.googleId ? t.linked : t.notLinked}
                    </Badge>
                    {me?.googleId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-28 justify-center"
                        disabled={unlinkGoogle.isPending || !canUnlinkOAuth}
                        onClick={() => unlinkGoogle.mutate()}
                      >
                        {unlinkGoogle.isPending ? t.unlinking : t.unlinkBtn}
                      </Button>
                    ) : (
                      <a
                        href="/api/users/link-google/start"
                        className={buttonVariants({ variant: "outline", size: "sm", className: "w-28 justify-center" })}
                      >
                        {t.linkGoogleBtn}
                      </a>
                    )}
                  </div>
                </div>
                )}

                <FormError message={unlinkLine.error?.message ?? unlinkGoogle.error?.message ?? null} />

                <div className="mt-2.5">
                  <Caption>{isStaff ? t.connCaptionStaff : t.connCaption}</Caption>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
