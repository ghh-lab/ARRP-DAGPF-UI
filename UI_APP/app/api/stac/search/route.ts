import { NextRequest } from "next/server";
import {
  parsePositiveIntBounded,
  requireClientRole,
  sanitizeErrorResponse,
} from "@/lib/api-security";
import { stacApiBase } from "@/lib/runtime-env";
import {
  fetchWithRetry,
  isUpstreamConnectivityError,
  upstreamUnavailableResponse,
} from "@/lib/upstream-fetch";

export async function GET(req: NextRequest) {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const bbox = sp.get("bbox");
  const parsedLimit = parsePositiveIntBounded(sp.get("limit"), 25, 1, 200);
  if (parsedLimit == null) {
    return Response.json({ error: "invalid_limit" }, { status: 400 });
  }
  const datetime = sp.get("datetime");
  const parsedPage = parsePositiveIntBounded(sp.get("page"), 1, 1, 10_000);
  if (parsedPage == null) {
    return Response.json({ error: "invalid_page" }, { status: 400 });
  }
  if (datetime && datetime.length > 128) {
    return Response.json({ error: "invalid_datetime" }, { status: 400 });
  }
  if (bbox) {
    const coords = bbox.split(",").map((x) => Number(x.trim()));
    if (
      coords.length !== 4 ||
      coords.some((x) => !Number.isFinite(x)) ||
      coords[0]! < -180 ||
      coords[2]! > 180 ||
      coords[1]! < -90 ||
      coords[3]! > 90
    ) {
      return Response.json({ error: "invalid_bbox" }, { status: 400 });
    }
  }

  const target = new URL(`${stacApiBase()}/search`);
  if (bbox) target.searchParams.set("bbox", bbox);
  target.searchParams.set("limit", String(parsedLimit));
  if (datetime) target.searchParams.set("datetime", datetime);
  target.searchParams.set("page", String(parsedPage));

  try {
    const res = await fetchWithRetry(
      target.toString(),
      {
        headers: { Accept: "application/geo+json, application/json" },
        cache: "no-store",
      },
      { attempts: 3, backoffMs: [80, 200], timeoutMs: 15000 }
    );
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (e) {
    if (isUpstreamConnectivityError(e)) {
      console.error("[stac-search] upstream unavailable", stacApiBase(), e);
      return upstreamUnavailableResponse("stac_upstream_unavailable");
    }
    return sanitizeErrorResponse("stac-search.GET", e, 502);
  }
}
