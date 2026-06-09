import { createHash, randomBytes } from "crypto";
import type { Db } from "mongodb";
import { getSharedMongoClient } from "@/lib/mongo-client-pool";

export const AUTH_SESSION_COOKIE = "dag_session";

export type Role = "admin" | "client";

const DEFAULT_AUTH_DB_NAME = "DAG";
const DEFAULT_MONGO_URI = "mongodb://192.168.1.155:43203";
const CODES_COLLECTION = "auth_codes";
const SESSIONS_COLLECTION = "auth_sessions";
const LOGS_COLLECTION = "auth_connection_logs";
const IP_BLOCKS_COLLECTION = "auth_ip_blocks";

function requireMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (uri && uri.trim() !== "") return uri.trim();
  return DEFAULT_MONGO_URI;
}

export function authDbName(): string {
  const db = process.env.MONGO_AUTH_DB;
  return db && db.trim() !== "" ? db.trim() : DEFAULT_AUTH_DB_NAME;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

let authSchemaReady: Promise<void> | null = null;

export async function ensureAuthReady(db: Db): Promise<void> {
  if (!authSchemaReady) {
    authSchemaReady = (async () => {
      await ensureAuthCollections(db);
      await seedDefaultCodesIfNeeded(db);
    })();
  }
  await authSchemaReady;
}

export async function withMongoAuthDb<T>(
  fn: (ctx: { db: Db; close: () => Promise<void> }) => Promise<T>
): Promise<T> {
  const client = await getSharedMongoClient(requireMongoUri());
  const db = client.db(authDbName());
  const noopClose = async () => undefined;
  return fn({ db, close: noopClose });
}

export async function ensureAuthCollections(db: Db): Promise<void> {
  const codes = db.collection(CODES_COLLECTION);
  const sessions = db.collection(SESSIONS_COLLECTION);
  const logs = db.collection(LOGS_COLLECTION);
  const ipBlocks = db.collection(IP_BLOCKS_COLLECTION);

  await Promise.all([
    codes.createIndex({ role: 1, name: 1 }, { unique: true }),
    codes.createIndex({ role: 1, isActive: 1 }),
    codes.createIndex({ expiresAt: 1 }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    logs.createIndex({ createdAt: -1 }),
    logs.createIndex({ ip: 1, createdAt: -1 }),
    ipBlocks.createIndex({ ip: 1 }, { unique: true }),
  ]);
}

export async function seedDefaultCodesIfNeeded(db: Db): Promise<void> {
  const adminCode = process.env.ADMIN_ACCESS_CODE;
  const clientCode = process.env.CLIENT_ACCESS_CODE;
  if (!adminCode || !clientCode) {
    throw new Error(
      "ADMIN_ACCESS_CODE et CLIENT_ACCESS_CODE sont requis dans .env.local"
    );
  }

  const now = new Date();
  const codes = db.collection(CODES_COLLECTION);
  await Promise.all([
    codes.updateOne(
      { role: "admin", name: "Code admin initial" },
      {
        $set: {
          codeHash: sha256Hex(adminCode),
          isActive: true,
          expiresAt: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          lastUsedAt: null,
        },
      },
      { upsert: true }
    ),
    codes.updateOne(
      { role: "client", name: "Code client initial" },
      {
        $set: {
          codeHash: sha256Hex(clientCode),
          isActive: true,
          expiresAt: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          lastUsedAt: null,
        },
      },
      { upsert: true }
    ),
  ]);
}

export function authCollections(db: Db) {
  return {
    codes: db.collection<{
      role: Role;
      name: string;
      codeHash: string;
      isActive: boolean;
      expiresAt: Date | null;
      lastUsedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>(CODES_COLLECTION),
    sessions: db.collection<{
      tokenHash: string;
      role: Role;
      ip: string;
      createdAt: Date;
      updatedAt: Date;
      expiresAt: Date;
    }>(SESSIONS_COLLECTION),
    logs: db.collection<{
      ip: string;
      role: Role | "unknown";
      success: boolean;
      reason: string;
      createdAt: Date;
    }>(LOGS_COLLECTION),
    ipBlocks: db.collection<{
      ip: string;
      failCount: number;
      blocked: boolean;
      blockedAt?: Date;
      lastFailedAt?: Date;
      updatedAt: Date;
    }>(IP_BLOCKS_COLLECTION),
  };
}
