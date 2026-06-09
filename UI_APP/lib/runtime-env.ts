const DEV_SAFE_MONGO_URI = "mongodb://192.168.1.155:43203";
const DEV_SAFE_STAC_BASE = "http://127.0.0.1:39055";

function readEnvTrimmed(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function inferStacBaseFromMongoUri(uri: string | null): string | null {
  if (!uri) return null;
  const m = uri.match(/^[a-zA-Z0-9+.-]+:\/\/(?:[^@/]+@)?([^/:?,]+|\[[^\]]+\])/);
  const host = m?.[1]?.trim();
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return DEV_SAFE_STAC_BASE;
  }
  return `http://${host.replace(/^\[(.*)\]$/, "$1")}:39055`;
}

export function mongoUri(): string {
  const configured = readEnvTrimmed("MONGO_URI");
  if (configured) return configured;
  return DEV_SAFE_MONGO_URI;
}

export function mongoDbName(): string {
  return readEnvTrimmed("MONGO_DB") ?? "ARRPSAT";
}

export function mongoAiCollectionName(): string {
  return readEnvTrimmed("MONGO_AI_COLLECTION") ?? "AI";
}

export function mongoStacCollectionName(): string {
  return readEnvTrimmed("MONGO_STAC_COLLECTION") ?? "stac_items";
}

export function stacApiBase(): string {
  const configured =
    readEnvTrimmed("STAC_API_BASE") || readEnvTrimmed("NEXT_PUBLIC_STAC_API_URL");
  if (configured) return configured.replace(/\/$/, "");
  const inferredFromMongo = inferStacBaseFromMongoUri(mongoUri());
  if (inferredFromMongo) return inferredFromMongo;
  return DEV_SAFE_STAC_BASE;
}
