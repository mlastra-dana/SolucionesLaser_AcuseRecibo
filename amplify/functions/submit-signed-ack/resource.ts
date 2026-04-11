import { defineFunction } from '@aws-amplify/backend';

const getRequiredEnv = () => {
  const names = ['ACK_BUCKET_NAME', 'ACK_BUCKET_REGION', 'ALLOWED_ORIGIN'] as const;

  return names.reduce<Record<(typeof names)[number], string>>((accumulator, name) => {
    const value = process.env[name];

    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }

    accumulator[name] = value;
    return accumulator;
  }, {} as Record<(typeof names)[number], string>);
};

export const submitSignedAck = defineFunction({
  name: 'submit-signed-ack',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    ...getRequiredEnv(),
    DANA_BASE_URL: process.env.DANA_BASE_URL || '',
    DANA_TRIGGER_URL: process.env.DANA_TRIGGER_URL || '',
    DANA_USERNAME: process.env.DANA_USERNAME || '',
    DANA_PASSWORD: process.env.DANA_PASSWORD || ''
  }
});
