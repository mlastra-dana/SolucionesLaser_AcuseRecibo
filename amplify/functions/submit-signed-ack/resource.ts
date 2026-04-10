import { defineFunction } from '@aws-amplify/backend';

const getRequiredEnv = () => {
  const names = ['ACK_BUCKET_NAME', 'ACK_BUCKET_REGION', 'ALLOWED_ORIGIN', 'FROM_EMAIL', 'PORTAL_BASE_URL'] as const;

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
  environment: getRequiredEnv()
});
