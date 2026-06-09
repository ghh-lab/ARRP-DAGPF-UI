import { MongoClient } from "mongodb";
import { mongoUri } from "@/lib/runtime-env";

const POOL_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  maxPoolSize: 25,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,
};

let pooledClient: MongoClient | null = null;
let pooledUri: string | null = null;
let connectPromise: Promise<MongoClient> | null = null;

export function isMongoConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name ?? "";
  if (name === "MongoNetworkError" || name === "MongoServerSelectionError") {
    return true;
  }
  const code = (error as { code?: string }).code;
  return code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND";
}

/**
 * Single shared MongoClient per process (reused across parallel API requests).
 */
export async function getSharedMongoClient(uriOverride?: string): Promise<MongoClient> {
  const uri = (uriOverride?.trim() || mongoUri()).trim();

  if (pooledClient && pooledUri === uri) {
    return pooledClient;
  }

  if (connectPromise && pooledUri === uri) {
    return connectPromise;
  }

  if (pooledClient && pooledUri !== uri) {
    const old = pooledClient;
    pooledClient = null;
    pooledUri = null;
    connectPromise = null;
    await old.close().catch(() => undefined);
  }

  pooledUri = uri;
  const client = new MongoClient(uri, POOL_OPTIONS);
  pooledClient = client;

  connectPromise = client
    .connect()
    .then(() => client)
    .catch((err) => {
      pooledClient = null;
      pooledUri = null;
      connectPromise = null;
      throw err;
    });

  return connectPromise;
}

export async function withSharedMongoClient<T>(
  fn: (client: MongoClient) => Promise<T>,
  uriOverride?: string
): Promise<T> {
  const client = await getSharedMongoClient(uriOverride);
  return fn(client);
}
