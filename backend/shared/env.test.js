const { validateEnv } = require("./env");

describe("Environment Validation", () => {
  const baseValidEnv = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost:5432/medguide_test",
    JWT_SECRET: "a_very_long_secure_secret_key_with_at_least_32_characters",
  };

  test("passes when all required variables are valid", () => {
    expect(() => validateEnv(baseValidEnv)).not.toThrow();
  });

  test("fails fast when JWT_SECRET is shorter than 32 characters", () => {
    const invalidEnv = { ...baseValidEnv, JWT_SECRET: "too_short" };
    expect(() => validateEnv(invalidEnv)).toThrow(/Environment validation failed/);
  });

  test("fails fast when DATABASE_URL is missing", () => {
    const invalidEnv = { ...baseValidEnv };
    delete invalidEnv.DATABASE_URL;
    expect(() => validateEnv(invalidEnv)).toThrow(/Environment validation failed/);
  });
});
