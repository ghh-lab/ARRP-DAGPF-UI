"""
Read Backend/3_Mongo_Spectral_Stac/vectors_with_mongo_stac.csv and emit
cluster_ranking.json and vectors_clusters.geojson.
Each feature is a 10m x 10m square in WGS84 aligned N-S / E-W, centered on
step2_vector_lon and step2_vector_lat (Qdrant export / spectral step2), i.e. the
same coordinates used when filtering vectors inside DAG parcels in
export_qdrant_by_parcel.py.

Do NOT use vl_cell_center_* from Mongo Vector_Lookup for map geometry: those
often follow the full image tile grid and fall outside parcel polygons while
step2_vector_* stays inside the DAG parcel (verified 100% vs DAG for current CSV).

Spatial check uses DATA/DAG.16_07_2025.json (same reference as the backend export).
ASCII only. Run from repo root: python UI_APP/scripts/build_cluster_geojson.py
"""
from __future__ import annotations

import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path

# Square side length in meters (cluster cell footprint)
CELL_SIZE_M = 10.0
M_PER_DEG_LAT = 111320.0


def point_in_ring(lon: float, lat: float, ring: list) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        yi = ring[i][1]
        yj = ring[j][1]
        xi = ring[i][0]
        xj = ring[j][0]
        crosses = (yi > lat) != (yj > lat)
        if crosses:
            xinters = (xj - xi) * (lat - yi) / (yj - yi + 1e-30) + xi
            if lon < xinters:
                inside = not inside
        j = i
    return inside


def point_in_polygon_coords(lon: float, lat: float, coords: list) -> bool:
    if not coords or not isinstance(coords[0], list):
        return False
    outer = coords[0]
    if not point_in_ring(lon, lat, outer):
        return False
    for hole in coords[1:]:
        if isinstance(hole, list) and point_in_ring(lon, lat, hole):
            return False
    return True


def point_in_geom(lon: float, lat: float, geom: dict) -> bool:
    t = geom.get("type")
    coords = geom.get("coordinates")
    if t == "Polygon" and coords:
        return point_in_polygon_coords(lon, lat, coords)
    if t == "MultiPolygon" and coords:
        for poly in coords:
            if isinstance(poly, list) and point_in_polygon_coords(lon, lat, poly):
                return True
    return False


def load_dag_parcel_geometries(dag_path: Path) -> dict[str, dict]:
    """Load parcel polygons keyed by _id. Supports GeoJSON FeatureCollection or a raw list of features."""
    if not dag_path.is_file():
        return {}
    data = json.loads(dag_path.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    if isinstance(data, list):
        iterable = data
    else:
        iterable = data.get("features") or []
    for feat in iterable:
        if not isinstance(feat, dict):
            continue
        fid = feat.get("_id")
        if not isinstance(fid, str) or not fid.strip():
            continue
        geom = feat.get("geometry") or {}
        if geom:
            out[fid.strip()] = geom
    return out


def center_in_parcel(
    lon: float, lat: float, dag_id: str, by_id: dict[str, dict]
) -> bool:
    geom = by_id.get(dag_id.strip())
    if not geom:
        return False
    return point_in_geom(lon, lat, geom)


def square_around_center(lon: float, lat: float, size_m: float) -> dict:
    half = 0.5 * size_m
    lat_rad = math.radians(lat)
    cos_lat = math.cos(lat_rad)
    m_per_deg_lon = M_PER_DEG_LAT * max(cos_lat, 1e-8)
    dlat = half / M_PER_DEG_LAT
    dlon = half / m_per_deg_lon
    ring = [
        [lon - dlon, lat - dlat],
        [lon + dlon, lat - dlat],
        [lon + dlon, lat + dlat],
        [lon - dlon, lat + dlat],
        [lon - dlon, lat - dlat],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    csv_path = root / "Backend" / "3_Mongo_Spectral_Stac" / "vectors_with_mongo_stac.csv"
    out_dir = root / "UI_APP" / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_rank = out_dir / "cluster_ranking.json"
    out_geo = out_dir / "vectors_clusters.geojson"
    dag_path = root / "DATA" / "DAG.16_07_2025.json"
    parcel_by_id = load_dag_parcel_geometries(dag_path)
    print(
        "loaded DAG parcel geometries for spatial check: %d ids"
        % len(parcel_by_id),
        file=sys.stderr,
    )

    if not csv_path.is_file():
        print("missing csv: %s" % csv_path, file=sys.stderr)
        return 1

    counts: Counter[int] = Counter()
    features: list[dict] = []
    n_skip = 0
    n_inside_parcel = 0
    n_outside_parcel = 0

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_cid = row.get("step2_cluster_id") or ""
            raw_cid = raw_cid.strip()
            if raw_cid == "":
                n_skip += 1
                continue
            try:
                cid = int(float(raw_cid))
            except ValueError:
                n_skip += 1
                continue

            raw_lon = (row.get("step2_vector_lon") or "").strip()
            raw_lat = (row.get("step2_vector_lat") or "").strip()
            if raw_lon == "" or raw_lat == "":
                n_skip += 1
                continue
            try:
                lon = float(raw_lon)
                lat = float(raw_lat)
            except ValueError:
                n_skip += 1
                continue

            geom = square_around_center(lon, lat, CELL_SIZE_M)

            counts[cid] += 1
            vid = row.get("step2_vector_id") or ""
            dag = row.get("step2_dag_feature_id") or ""
            in_parcel = 1 if center_in_parcel(lon, lat, dag, parcel_by_id) else 0
            if in_parcel:
                n_inside_parcel += 1
            else:
                n_outside_parcel += 1

            vl_cx = row.get("vl_cell_center_x") or ""
            vl_cy = row.get("vl_cell_center_y") or ""
            cog_id = (row.get("step2_cog_id") or "").strip()
            acq_date = (row.get("acquisition_date") or "").strip()

            features.append(
                {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "cluster_id": cid,
                        "step2_vector_id": str(vid),
                        "step2_dag_feature_id": str(dag),
                        "step2_cog_id": cog_id,
                        "acquisition_date": acq_date,
                        "vector_lon": lon,
                        "vector_lat": lat,
                        "mongo_vl_cell_center_x": vl_cx,
                        "mongo_vl_cell_center_y": vl_cy,
                        "cell_size_m": CELL_SIZE_M,
                        "center_in_parcel": in_parcel,
                    },
                }
            )

    ranking = sorted(
        [{"clusterId": k, "count": v} for k, v in counts.items()],
        key=lambda x: (-x["count"], x["clusterId"]),
    )

    n_tot = n_inside_parcel + n_outside_parcel
    pct_in = round(100.0 * n_inside_parcel / max(n_tot, 1), 2)

    out_rank.write_text(
        json.dumps(
            {
                "generated_from": str(csv_path.relative_to(root)),
                "cell_size_m": CELL_SIZE_M,
                "geometry_source": "step2_vector_lon_lat_square",
                "dag_json_for_spatial_check": str(dag_path.relative_to(root)),
                "spatial_diagnostic": {
                    "square_center_coords": (
                        "step2_vector_lon / step2_vector_lat from CSV "
                        "(spectral pipeline = Qdrant payload after "
                        "export_qdrant_by_parcel DAG polygon filter)"
                    ),
                    "step2_center_vs_dag_parcel_polygon": {
                        "n_inside": n_inside_parcel,
                        "n_outside": n_outside_parcel,
                        "pct_inside": pct_in,
                    },
                    "mongo_vl_cell_center_warning": (
                        "vl_cell_center_x/y from Mongo Vector_Lookup describe "
                        "tile/cell geometry on the image footprint and often "
                        "differ from step2_vector_*; do not use Mongo VL coords "
                        "for parcel-only vegetation mapping."
                    ),
                },
                "rows_used": len(features),
                "rows_skipped": n_skip,
                "ranking": ranking,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    fc = {"type": "FeatureCollection", "features": features}
    out_geo.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")

    print("wrote %s (%d clusters)" % (out_rank, len(ranking)))
    print("wrote %s (%d features)" % (out_geo, len(features)))
    print(
        "spatial: step2 centers inside DAG parcel polygon: %d / %d (%.2f%%)"
        % (n_inside_parcel, n_tot, pct_in),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
