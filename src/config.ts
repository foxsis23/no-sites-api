import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
} as const;

export type Config = typeof config;
