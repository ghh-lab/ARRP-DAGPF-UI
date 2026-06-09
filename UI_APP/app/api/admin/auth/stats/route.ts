import { NextResponse } from "next/server";
import { sanitizeErrorResponse } from "@/lib/api-security";
import { requireAdminRole } from "@/lib/auth-admin";
import {
  authCollections,
  ensureAuthReady,
  withMongoAuthDb,
} from "@/lib/mongo-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminRole();
  if (!auth.ok) return auth.response;
  try {
    return await withMongoAuthDb(async ({ db }) => {
      await ensureAuthReady(db);
      const { logs, ipBlocks } = authCollections(db);

      const now = new Date();
      const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const [recentLogs, dailyRows, todayTotal, todaySuccess, blockedIpsCount] =
        await Promise.all([
          logs.find({}).sort({ createdAt: -1 }).limit(100).toArray(),
          logs
            .aggregate<{
              day: string;
              total: number;
              success: number;
              failed: number;
              uniqueIps: number;
            }>([
              { $match: { createdAt: { $gte: since7 } } },
              {
                $group: {
                  _id: {
                    day: {
                      $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                    },
                    ip: "$ip",
                  },
                  total: { $sum: 1 },
                  success: { $sum: { $cond: ["$success", 1, 0] } },
                  failed: { $sum: { $cond: ["$success", 0, 1] } },
                },
              },
              {
                $group: {
                  _id: "$_id.day",
                  total: { $sum: "$total" },
                  success: { $sum: "$success" },
                  failed: { $sum: "$failed" },
                  uniqueIps: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
              {
                $project: {
                  _id: 0,
                  day: "$_id",
                  total: 1,
                  success: 1,
                  failed: 1,
                  uniqueIps: 1,
                },
              },
            ])
            .toArray(),
          logs.countDocuments({ createdAt: { $gte: startOfDay } }),
          logs.countDocuments({ createdAt: { $gte: startOfDay }, success: true }),
          ipBlocks.countDocuments({ blocked: true }),
        ]);

      return NextResponse.json({
        ok: true as const,
        summary: {
          todayTotal,
          todaySuccess,
          todayFailed: Math.max(0, todayTotal - todaySuccess),
          blockedIpsCount,
        },
        daily: dailyRows,
        recentLogs: recentLogs.map((r) => ({
          ip: r.ip,
          role: r.role,
          success: r.success,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    });
  } catch (e) {
    return sanitizeErrorResponse("admin-auth-stats.GET", e);
  }
}
