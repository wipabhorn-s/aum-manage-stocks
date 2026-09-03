import { EnvVariable } from '@/config/env.validation';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Brevo transactional email API — HTTPS ล้วน ไม่ใช่ SMTP */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const SEND_TIMEOUT_MS = 10_000;

/**
 * ใช้ HTTP API ของ Brevo แทน SMTP เพราะ Railway ปิด outbound SMTP
 * (port 25/465/587) ทุกแพลนยกเว้น Pro — nodemailer จึงต่อ smtp.gmail.com
 * ไม่ติดบน production แล้วเมลยืนยันไม่เคยถูกส่งออกเลย
 *
 * ตัว key เป็น optional แบบเดียวกับ StripeService: คนที่ไม่ได้ทำงานกับเมล
 * ไม่ต้องหา key มาใส่ก็ boot ขึ้น แต่ถ้ามีการส่งจริงโดยไม่ได้ตั้งค่าจะได้ 503
 * พร้อมบอกว่าขาด env ตัวไหน แทนที่จะเงียบไปเฉยๆ
 */
@Injectable()
export class MailService {
  constructor(
    private readonly configService: ConfigService<EnvVariable, true>,
  ) {}

  private get frontendUrl(): string {
    return this.configService
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/$/, '');
  }

  /**
   * Brevo ต้องการอีเมลผู้ส่งเป็นค่าเปล่าๆ ในฟิลด์ของมันเอง แต่ MAIL_FROM ที่
   * ทีมตั้งกันไว้อาจอยู่ในรูป `ชื่อ <a@b.com>` ตามธรรมเนียมของ SMTP
   * จึงต้องแยกออกจากกันก่อนส่ง ไม่งั้น Brevo ตอบ 400 ว่าอีเมลไม่ถูกต้อง
   */
  private get sender(): { email: string; name: string } {
    const raw = this.configService.get('MAIL_FROM', { infer: true }).trim();
    const configuredName = this.configService.get('MAIL_FROM_NAME', {
      infer: true,
    });

    const angled = /^(.*)<\s*([^>]+)\s*>$/.exec(raw);
    const email = angled ? angled[2].trim() : raw;
    const name =
      configuredName ??
      angled?.[1].trim().replace(/^"|"$/g, '') ??
      'Aum Manage Stocks';

    return { email, name: name || 'Aum Manage Stocks' };
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.get('BREVO_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'ยังไม่ได้ตั้งค่า BREVO_API_KEY จึงส่งอีเมลไม่ได้',
      );
    }

    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      // ตัวเนื้อ error ของ Brevo บอกสาเหตุตรงๆ (key ผิด, sender ยังไม่ verify,
      // โควตาวันนี้เต็ม) จึงพาไปด้วยเพื่อไม่ต้องเดาจาก status code เปล่าๆ
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Brevo ตอบกลับ ${response.status}: ${detail.slice(0, 500)}`,
      );
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    await this.send(
      to,
      'ตั้งรหัสผ่านใหม่ — Aum Manage Stocks',
      `<p>กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>ลิงก์นี้จะหมดอายุในไม่ช้า หากคุณไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>`,
    );
  }

  async sendEmailVerification(to: string, verificationToken: string) {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    await this.send(
      to,
      'ยืนยันอีเมลของคุณ — Aum Manage Stocks',
      `<p>ขอบคุณที่สมัครใช้งาน Aum Manage Stocks</p><p>กดลิงก์ด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>หากคุณไม่ได้เป็นผู้สมัคร กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>`,
    );
  }

  async sendEmailChangeVerification(to: string, verificationToken: string) {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    await this.send(
      to,
      'ยืนยันอีเมลใหม่ — Aum Manage Stocks',
      `<p>มีคำขอเปลี่ยนอีเมลใน Aum Manage Stocks</p><p>กดลิงก์ด้านล่างเพื่อยืนยันอีเมลใหม่นี้</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    );
  }
}
