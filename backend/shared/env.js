const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string({
      required_error: "DATABASE_URL is required to start the MEDGUIDE backend",
    })
    .min(1, "DATABASE_URL cannot be empty"),
  JWT_SECRET: z
    .string({
      required_error: "JWT_SECRET is required to secure authentication tokens",
    })
    .min(32, "JWT_SECRET must be at least 32 characters long to prevent forgery"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),
  AI_SERVICE_BASE_URL: z.string().default("http://localhost:8001"),
  AI_SERVICE_API_KEY: z.string().default("medguide_ai_secret_key_32_chars_long_dev"),
  SMS_PROVIDER: z.enum(["console", "msg91", "twilio"]).default("console"),
  STORAGE_PROVIDER: z.enum(["local", "s3", "minio"]).default("local"),
  NATIONAL_EMERGENCY_NUMBER: z.string().default("112"),
  NATIONAL_AMBULANCE_NUMBER: z.string().default("108"),
  TELE_MANAS_HELPLINE: z.string().default("14416"),
});

function validateEnv(customEnv = process.env) {
  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    if (process.env.NODE_ENV === "test") {
      throw new Error(`Environment validation failed: ${JSON.stringify(result.error.issues)}`);
    }
    console.error("❌ CRITICAL: Environment configuration validation failed:");
    result.error.issues.forEach((issue) => {
      console.error(`   - [${issue.path.join(".")}] ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

let env;
try {
  env = validateEnv();
} catch (e) {
  if (process.env.NODE_ENV !== "test") {
    throw e;
  }
  env = {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/medguide_test",
    JWT_SECRET: process.env.JWT_SECRET || "default_test_jwt_secret_with_32_characters_minimum",
    JWT_EXPIRES_IN: "7d",
    REFRESH_TOKEN_EXPIRES_IN: "30d",
    REDIS_URL: "redis://localhost:6379",
    CORS_ORIGINS: "http://localhost:3000",
    AI_SERVICE_BASE_URL: "http://localhost:8001",
    AI_SERVICE_API_KEY: "test_ai_key_32_characters_minimum_length_ci",
    SMS_PROVIDER: "console",
    STORAGE_PROVIDER: "local",
    NATIONAL_EMERGENCY_NUMBER: "112",
    NATIONAL_AMBULANCE_NUMBER: "108",
    TELE_MANAS_HELPLINE: "14416",
  };
}

module.exports = { env, validateEnv, envSchema };
