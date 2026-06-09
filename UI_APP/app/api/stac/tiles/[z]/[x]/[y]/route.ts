import { NextRequest } from "next/server";
import { requireClientRole, sanitizeErrorResponse } from "@/lib/api-security";
import { stacApiBase } from "@/lib/runtime-env";
import {
  fetchWithRetry,
  isUpstreamConnectivityError,
  upstreamUnavailableResponse,
} from "@/lib/upstream-fetch";
import type { StacTileStyle } from "@/lib/stac";

const MAX_ZOOM = 30;
const MAX_COG_URL_LENGTH = 4096;
const MIN_BITS_PER_PIXEL = 1;
const MAX_BITS_PER_PIXEL = 32;
const ALLOWED_STYLES = new Set<StacTileStyle>(["natural", "ndvi", "urban"]);

function parseUInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseBitsPerPixel(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_BITS_PER_PIXEL || n > MAX_BITS_PER_PIXEL) return null;
  return n;
}

function parseCogUrl(raw: string | null): string | null {
  if (!raw || raw.length > MAX_COG_URL_LENGTH) return null;
  // Keep compatibility with STAC servers returning local container paths.
  if (raw.startsWith("/")) {
    if (!raw.startsWith("/app/cogs/")) return null;
    if (/\s/.test(raw)) return null;
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const auth = await requireClientRole();
  if (!auth.ok) return auth.response;

  const { z: zRaw, x: xRaw, y: yRaw } = await params;
  const z = parseUInt(zRaw);
  const x = parseUInt(xRaw);
  const y = parseUInt(yRaw);
  if (z == null || x == null || y == null) {
    return Response.json({ error: "invalid_tile_coordinates" }, { status: 400 });
  }
  if (z > MAX_ZOOM) {
    return Response.json({ error: "invalid_tile_zoom" }, { status: 400 });
  }
  const maxIndex = Math.pow(2, z) - 1;
  if (x > maxIndex || y > maxIndex) {
    return Response.json({ error: "invalid_tile_coordinates" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const cogUrl = parseCogUrl(sp.get("url"));
  if (!cogUrl) {
    return Response.json({ error: "invalid_url" }, { status: 400 });
  }

  const styleRaw = (sp.get("style") ?? "natural").trim() as StacTileStyle;
  if (!ALLOWED_STYLES.has(styleRaw)) {
    return Response.json({ error: "invalid_style" }, { status: 400 });
  }

  const bitsPerPixel = parseBitsPerPixel(sp.get("bits_per_pixel"));
  if (sp.has("bits_per_pixel") && bitsPerPixel == null) {
    return Response.json({ error: "invalid_bits_per_pixel" }, { status: 400 });
  }

  const target = new URL(`${stacApiBase()}/tiles/${z}/${x}/${y}`);
  target.searchParams.set("url", cogUrl);
  target.searchParams.set("style", styleRaw);
  if (bitsPerPixel != null) {
    target.searchParams.set("bits_per_pixel", String(bitsPerPixel));
  }

  try {
    const upstream = await fetchWithRetry(
      target.toString(),
      {
        headers: { Accept: "image/*,*/*" },
        cache: "no-store",
      },
      { attempts: 3, backoffMs: [60, 180], timeoutMs: 15000 }
    );
    const headers = new Headers();
    for (const name of [
      "Content-Type",
      "Cache-Control",
      "ETag",
      "Last-Modified",
      "Content-Length",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    if (isUpstreamConnectivityError(e)) {
      console.error("[stac-tiles] upstream unavailable", stacApiBase(), e);
      return upstreamUnavailableResponse("stac_upstream_unavailable");
    }
    return sanitizeErrorResponse("stac-tiles.GET", e, 502);
  }
}
