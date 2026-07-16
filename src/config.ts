import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const smtpUser = requireEnv('SMTP_USER');

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  wayforpay: {
    merchantAccount: requireEnv('WFP_MERCHANT_ACCOUNT'),
    merchantKey: requireEnv('WFP_MERCHANT_KEY'),
  },
  liqpay: {
    privateKey: requireEnv('LIQPAY_PRIVATE_KEY'),
  },
  hutko: {
    merchantId: requireEnv('HUTKO_MERCHANT_ID'),
    secretKey: requireEnv('HUTKO_SECRET_KEY'),
  },
  apiBaseUrl: requireEnv('API_BASE_URL'),
  smtp: {
    host: requireEnv('SMTP_HOST'),
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    user: smtpUser,
    pass: requireEnv('SMTP_PASS'),
    from: process.env['SMTP_FROM'] ?? smtpUser,
  },
  consultationEmail: requireEnv('CONSULTATION_EMAIL'),
} as const;

export type Config = typeof config;
export type SmtpConfig = Config['smtp'];
