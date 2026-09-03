import { ServiceUnavailableException } from '@nestjs/common';

import { MailService } from './mail.service';

type Env = Record<string, string | undefined>;

function makeService(env: Env) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConstructorParameters<typeof MailService>[0];

  return new MailService(configService);
}

const BASE_ENV: Env = {
  FRONTEND_URL: 'https://aum-manage-stock.vercel.app/',
  BREVO_API_KEY: 'brevo-key',
  MAIL_FROM: 'noreply@example.com',
};

/** อ่าน body ที่ถูกส่งเข้า fetch ออกมาเป็น object เพื่อ assert ทีละฟิลด์ */
function sentBody(fetchMock: jest.Mock): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('MailService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock;
  });

  it('ยิงไปที่ HTTP API ของ Brevo ไม่ใช่ SMTP — Railway ปิด port SMTP ไว้', async () => {
    await makeService(BASE_ENV).sendEmailVerification(
      'staff@example.com',
      'tok',
    );

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('brevo-key');
  });

  // FRONTEND_URL ที่ลงท้ายด้วย / เคยทำให้ลิงก์กลายเป็น //verify-email
  it('ประกอบลิงก์ยืนยันจาก FRONTEND_URL โดยไม่ให้มี / ซ้อน', async () => {
    await makeService(BASE_ENV).sendEmailVerification(
      'staff@example.com',
      'a b',
    );

    expect(sentBody(fetchMock).htmlContent).toContain(
      'https://aum-manage-stock.vercel.app/verify-email?token=a%20b',
    );
  });

  it('ส่ง MAIL_FROM ที่เป็นอีเมลเปล่าๆ ไปตรงๆ', async () => {
    await makeService(BASE_ENV).sendPasswordResetEmail('u@example.com', 'tok');

    expect(sentBody(fetchMock).sender).toEqual({
      email: 'noreply@example.com',
      name: 'Aum Manage Stocks',
    });
  });

  // Brevo รับอีเมลผู้ส่งเป็นค่าเปล่าๆ ถ้าส่ง `ชื่อ <a@b.com>` ไปทั้งก้อนจะได้ 400
  it('แยกชื่อกับอีเมลออกจาก MAIL_FROM รูปแบบ `ชื่อ <a@b.com>`', async () => {
    await makeService({
      ...BASE_ENV,
      MAIL_FROM: '"ร้านอั้ม" <noreply@example.com>',
    }).sendPasswordResetEmail('u@example.com', 'tok');

    expect(sentBody(fetchMock).sender).toEqual({
      email: 'noreply@example.com',
      name: 'ร้านอั้ม',
    });
  });

  it('MAIL_FROM_NAME ทับชื่อที่แกะมาจาก MAIL_FROM', async () => {
    await makeService({
      ...BASE_ENV,
      MAIL_FROM: 'เดิม <noreply@example.com>',
      MAIL_FROM_NAME: 'ชื่อใหม่',
    }).sendPasswordResetEmail('u@example.com', 'tok');

    expect(sentBody(fetchMock).sender).toEqual({
      email: 'noreply@example.com',
      name: 'ชื่อใหม่',
    });
  });

  it('ไม่ได้ตั้ง BREVO_API_KEY ต้องได้ 503 ที่บอกชื่อ env ไม่ใช่เงียบไป', async () => {
    const service = makeService({ ...BASE_ENV, BREVO_API_KEY: undefined });

    await expect(
      service.sendEmailVerification('u@example.com', 'tok'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // เงียบตรงนี้คือสิ่งที่ทำให้ทีมงมอยู่หลายวันว่าทำไมเมลไม่เคยมา
  it('Brevo ตอบไม่ 2xx ต้อง throw พร้อมเหตุผลที่เขาส่งกลับมา', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"message":"sender not valid"}'),
    });

    await expect(
      makeService(BASE_ENV).sendEmailVerification('u@example.com', 'tok'),
    ).rejects.toThrow('sender not valid');
  });
});
