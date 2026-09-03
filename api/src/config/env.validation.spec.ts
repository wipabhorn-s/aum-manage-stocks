import { validate } from './env.validation';

/** ค่าที่ต้องมีครบทุกตัว ไม่งั้น api boot ไม่ขึ้นตั้งแต่แรก */
const REQUIRED: Record<string, string> = {
  FRONTEND_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  ACCESS_TOKEN_SECRET: 'x'.repeat(32),
  ACCESS_TOKEN_EXPIRES_IN: '900',
  REFRESH_TOKEN_EXPIRES_IN: '2592000',
  LINE_LOGIN_CHANNEL_ID: 'id',
  LINE_LOGIN_CHANNEL_SECRET: 'secret',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  MAIL_FROM: 'noreply@example.com',
  TWO_FACTOR_ENCRYPTION_KEY: 'a'.repeat(64),
  TWO_FACTOR_CHALLENGE_SECRET: 'y'.repeat(32),
  RESET_TOKEN_EXPIRES_IN: '3600',
  EMAIL_VERIFICATION_TOKEN_EXPIRES_IN: '86400',
  CLOUDINARY_CLOUD_NAME: 'name',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
};

/** ตัวที่ไม่ใส่ก็ boot ขึ้น — และต้องใส่เป็นค่าว่างได้ด้วย (ดูเทสต์ข้างล่าง) */
const OPTIONAL_KEYS = [
  'BREVO_API_KEY',
  'MAIL_FROM_NAME',
  'STRIPE_SECRET_KEY',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'OLLAMA_HOST',
  'OLLAMA_API_KEY',
  'OLLAMA_MODEL',
  'SALES_MOCK_MODE',
];

describe('env validation', () => {
  it('ผ่านเมื่อมีเฉพาะค่าที่จำเป็น', () => {
    expect(() => validate({ ...REQUIRED })).not.toThrow();
  });

  it('ไม่ผ่านเมื่อขาดค่าที่จำเป็น', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = REQUIRED;
    expect(() => validate(withoutDatabase)).toThrow();
  });

  /**
   * dotenv อ่านบรรทัด `KEY=` ออกมาเป็นสตริงว่าง ไม่ใช่ undefined — และ
   * .env.example ก็แจกไฟล์ที่มีบรรทัดแบบนั้นเต็มไปหมด ถ้า schema ไม่แปลง
   * ค่าว่างให้เป็น "ไม่ได้ตั้ง" ตัวที่เป็น optional จะพัง .min(1) แล้ว api
   * boot ไม่ขึ้น ทั้งที่ผู้ใช้แค่ยังไม่ได้กรอกค่าที่ไม่จำเป็นต้องมี
   */
  it.each(OPTIONAL_KEYS)('ปล่อย %s ว่างไว้ได้เหมือนไม่ได้ตั้ง', (key) => {
    expect(() => validate({ ...REQUIRED, [key]: '' })).not.toThrow();
    expect(validate({ ...REQUIRED, [key]: '' })[key]).toBeUndefined();
  });

  it('ปล่อยค่า optional ว่างพร้อมกันทั้งไฟล์ก็ยังผ่าน', () => {
    const blanks = Object.fromEntries(OPTIONAL_KEYS.map((k) => [k, '']));
    expect(() => validate({ ...REQUIRED, ...blanks })).not.toThrow();
  });

  it('เก็บค่า optional ที่กรอกจริงไว้ ไม่ได้ตัดทิ้งไปด้วย', () => {
    const parsed = validate({ ...REQUIRED, OLLAMA_MODEL: 'qwen3:1.7b' });
    expect(parsed.OLLAMA_MODEL).toBe('qwen3:1.7b');
  });

  it('PENDING_ACTION_TTL_MINUTES ใช้ค่าตั้งต้น 15 เมื่อไม่ได้ตั้ง', () => {
    expect(validate({ ...REQUIRED }).PENDING_ACTION_TTL_MINUTES).toBe(15);
  });

  // sales.module.ts อ่านตัวนี้ผ่าน ConfigService แต่เดิมไม่มีใน schema เลย
  // มันจึงรอดมาได้เพราะ ConfigService ตกไปอ่าน process.env ต่อเองเท่านั้น
  it('รู้จัก SALES_MOCK_MODE', () => {
    expect(
      validate({ ...REQUIRED, SALES_MOCK_MODE: 'true' }).SALES_MOCK_MODE,
    ).toBe('true');
  });
});
