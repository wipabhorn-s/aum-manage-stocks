"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/features/auth/form-error";
import { PasswordInput } from "@/components/features/auth/PasswordInput";
import { getAuthCopy } from "@/components/features/auth/auth-copy";
import { useLocale } from "@/components/i18n/LocaleContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SocialButtons from "@/components/features/auth/SocialButtons";
import { resolveApiError } from "@/lib/api-error";
import { registerSchema, type RegisterValues } from "@/lib/validations/auth";

export default function RegisterForm() {
  const { locale } = useLocale();
  const text = getAuthCopy(locale).register;
  const fields = [
    { name: "firstName", label: text.firstName, placeholder: text.firstNamePlaceholder, type: "text" },
    { name: "lastName", label: text.lastName, placeholder: text.lastNamePlaceholder, type: "text" },
    { name: "email", label: text.email, placeholder: text.emailPlaceholder, type: "email" },
    { name: "password", label: text.password, placeholder: text.passwordPlaceholder, type: "password" },
    { name: "confirmPassword", label: text.confirmPassword, placeholder: text.confirmPlaceholder, type: "password" },
  ] as const;
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // api บอกมาว่าสร้างบัญชีสำเร็จแต่ส่งเมลไม่ออก — ต้องบอกผู้ใช้ ไม่งั้นเขาจะนั่งรอ
  // เมลที่ไม่มีวันมา แล้วเข้าใจว่าสมัครไม่ผ่านจนไปสมัครซ้ำ
  const [mailFailed, setMailFailed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null);

    // confirmPassword ใช้เทียบฝั่งนี้อย่างเดียว api ไม่ได้รับฟิลด์นี้
    // และ ValidationPipe เปิด whitelist ไว้ ส่งไปก็ถูกตัดทิ้งอยู่ดี
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      }),
    });
    const result = await res.json().catch(() => null);

    if (!res.ok) {
      setFormError(resolveApiError(result, locale === "th" ? "สมัครสมาชิกไม่สำเร็จ" : "Unable to sign up"));
      return;
    }

    // ยังเข้าสู่ระบบไม่ได้จนกว่าจะกดลิงก์ยืนยันในอีเมล (SRS §111 ฝั่ง api
    // บล็อก login ของบัญชีที่ยังไม่ยืนยัน) จึงไม่พาไปหน้าอื่นให้สับสน
    setMailFailed(result?.emailSent === false);
    setSentTo(values.email);
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant={mailFailed ? "destructive" : "info"}>
          <AlertDescription className={mailFailed ? undefined : "text-foreground/80"}>
            {mailFailed ? (
              <>
                {text.sentFailedTitle} <strong>{sentTo}</strong>{" "}
                {text.sentFailedBody}
              </>
            ) : (
              <>
                {text.sentTitle} <strong>{sentTo}</strong>{text.sentBody}
              </>
            )}
          </AlertDescription>
        </Alert>

        <p className="text-[13px] text-muted-foreground">
          {mailFailed ? text.sentFailedHint : text.sentHint}
        </p>

        <Link href="/login">
          <Button variant="gradient" className="w-full py-5">
            {text.goLogin}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-1">
          <Label
            htmlFor={field.name}
            className="text-[11px] font-semibold tracking-[0.08em] uppercase"
          >
            {field.label}
          </Label>
          {field.type === "password" ? <PasswordInput
            id={field.name}
            placeholder={field.placeholder}
            {...register(field.name)}
            showLabel={locale === "th" ? "แสดงรหัสผ่าน" : "Show password"}
            hideLabel={locale === "th" ? "ซ่อนรหัสผ่าน" : "Hide password"}
          /> : <Input
            id={field.name}
            type={field.type}
            placeholder={field.placeholder}
            {...register(field.name)}
          />}
          {field.name === "email" && (
            <p className="text-xs text-muted-foreground">{text.emailHint}</p>
          )}
          {field.name === "password" && (
            <p className="text-xs text-muted-foreground">{text.passwordHint}</p>
          )}
          {errors[field.name] && (
            <p className="text-xs text-destructive">
              {errors[field.name]?.message}
            </p>
          )}
        </div>
      ))}

      <FormError message={formError} />

      <Button
        type="submit"
        variant="gradient"
        className="w-full py-5"
        disabled={isSubmitting}
      >
        {isSubmitting ? text.submitting : text.submit}
      </Button>

      <SocialButtons mode="register" />

      <div className="text-center text-[13px] text-muted-foreground">
        {text.haveAccount}{" "}
        <Link href="/login" className="font-bold text-primary">
          {text.login}
        </Link>
      </div>
    </form>
  );
}
