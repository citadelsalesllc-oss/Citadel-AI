export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://citadel:citadel_dev_password@localhost:5432/citadel_ai_test';
