export interface ApiConfig {
  port: number;
  corsOrigins: string[];
  rateLimitMax: number;
  bodyLimitBytes: number;
}

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(raw)}`);
  }
  return value;
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const corsOrigins = (env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.some((origin) => origin === "*" || !/^https?:\/\//.test(origin))) {
    throw new Error("CORS_ORIGINS must contain one or more explicit http(s) origins; wildcard is not allowed");
  }
  return {
    port: positiveInteger("API_PORT", env.API_PORT, 4000),
    corsOrigins,
    rateLimitMax: positiveInteger("API_RATE_LIMIT_MAX", env.API_RATE_LIMIT_MAX, 300),
    bodyLimitBytes: positiveInteger("API_BODY_LIMIT_BYTES", env.API_BODY_LIMIT_BYTES, 1_048_576),
  };
}
