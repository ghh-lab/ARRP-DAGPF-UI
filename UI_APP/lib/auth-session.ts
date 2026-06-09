import {
  AUTH_SESSION_COOKIE,
  authCollections,
  ensureAuthReady,
  sha256Hex,
  withMongoAuthDb,
} from "@/lib/mongo-auth";

export type SessionRole = "admin" | "client";

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

export async function getSessionRoleFromCookies(
  cookieStore: CookieReader
): Promise<SessionRole | null> {
  return await getSessionRoleFromCookiesInternal(cookieStore, false);
}

export async function consumeSessionRoleFromCookies(
  cookieStore: CookieReader
): Promise<SessionRole | null> {
  return await getSessionRoleFromCookiesInternal(cookieStore, true);
}

async function getSessionRoleFromCookiesInternal(
  cookieStore: CookieReader,
  consume: boolean
): Promise<SessionRole | null> {
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const now = new Date();

  return withMongoAuthDb(async ({ db }) => {
    await ensureAuthReady(db);
    const { sessions } = authCollections(db);
    const session = await sessions.findOne({
      tokenHash,
      expiresAt: { $gt: now },
    });
    if (!session) return null;
    if (consume) {
      await sessions.deleteOne({ tokenHash });
    } else {
      await sessions.updateOne(
        { tokenHash },
        {
          $set: { updatedAt: now },
        }
      );
    }
    return session.role;
  });
}
