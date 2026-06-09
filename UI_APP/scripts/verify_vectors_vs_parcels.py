"""
Check CSV vector positions against parcel polygons keyed by step2_dag_feature_id.

Default: step2_vector_lon / step2_vector_lat vs DATA/DAG.16_07_2025.json (same as
Qdrant export filter). Optional second mode: vl_cell_center_* (Mongo tile grid),
often largely outside parcels while step2 stays inside.

ASCII only. Usage (repo root):
  python UI_APP/scripts/verify_vectors_vs_parcels.py
  python UI_APP/scripts/verify_vectors_vs_parcels.py --mongo-centers
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray casting; ring open or closed."""
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


def point_in_polygon_poly(lon: float, lat: float, coords: list) -> bool:
    if not coords or not isinstance(coords[0], list):
        return False
    outer = coords[0]
    if not point_in_ring(lon, lat, outer):
        return False
    for hole in coords[1:]:
        if isinstance(hole, list) and point_in_ring(lon, lat, hole):
            return False
    return True


def load_dag_list_or_fc(path: Path) -> tuple[dict[str, dict], int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    by_id: dict[str, dict] = {}
    if isinstance(data, list):
        iterable = data
    else:
        iterable = data.get("features") or []
    for feat in iterable:
        if not isinstance(feat, dict):
            continue
        fid = feat.get("_id")
        geom = feat.get("geometry")
        if isinstance(fid, str) and fid.strip() and isinstance(geom, dict):
            by_id[fid.strip()] = geom
    return by_id, len(iterable)


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    csv_path = root / "Backend" / "3_Mongo_Spectral_Stac" / "vectors_with_mongo_stac.csv"
    dag_path = root / "DATA" / "DAG.16_07_2025.json"
    use_mongo_centers = "--mongo-centers" in sys.argv

    if not csv_path.is_file():
        print("missing %s" % csv_path, file=sys.stderr)
        return 1
    if not dag_path.is_file():
        print("missing %s" % dag_path, file=sys.stderr)
        return 1

    parcel_geom_by_id, n_parcel_feats = load_dag_list_or_fc(dag_path)
    print(
        "DAG.16_07_2025.json features: %d, indexed _id: %d"
        % (n_parcel_feats, len(parcel_geom_by_id))
    )
    print(
        "mode: %s"
        % (
            "vl_cell_center_* (Mongo)"
            if use_mongo_centers
            else "step2_vector_lon/lat (Qdrant parcel filter)"
        )
    )

    n_rows = 0
    n_missing_parcel = 0
    n_no_geom = 0
    n_inside = 0
    n_outside = 0
    sample_out: list[tuple[str, float, float, str]] = []

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dag = (row.get("step2_dag_feature_id") or "").strip()
            if use_mongo_centers:
                raw_cx = (row.get("vl_cell_center_x") or "").strip()
                raw_cy = (row.get("vl_cell_center_y") or "").strip()
            else:
                raw_cx = (row.get("step2_vector_lon") or "").strip()
                raw_cy = (row.get("step2_vector_lat") or "").strip()
            if not dag or not raw_cx or not raw_cy:
                continue
            try:
                cx = float(raw_cx)
                cy = float(raw_cy)
            except ValueError:
                continue
            n_rows += 1

            geom = parcel_geom_by_id.get(dag)
            if geom is None:
                n_missing_parcel += 1
                if len(sample_out) < 5:
                    sample_out.append((dag, cx, cy, "no_parcel_id"))
                continue

            coords = geom.get("coordinates")
            if geom.get("type") == "Polygon" and coords:
                inside = point_in_polygon_poly(cx, cy, coords)
            elif geom.get("type") == "MultiPolygon" and coords:
                inside = False
                for poly in coords:
                    if isinstance(poly, list) and point_in_polygon_poly(cx, cy, poly):
                        inside = True
                        break
            else:
                n_no_geom += 1
                continue

            if inside:
                n_inside += 1
            else:
                n_outside += 1
                if len(sample_out) < 25:
                    sample_out.append((dag, cx, cy, "outside"))

    print("CSV rows with dag + center: %d" % n_rows)
    print("missing dag_feature_id in DAG json: %d" % n_missing_parcel)
    print("parcel geom unusable: %d" % n_no_geom)
    print(
        "center INSIDE DAG parcel polygon: %d (%.2f%%)"
        % (n_inside, 100.0 * n_inside / max(n_rows, 1))
    )
    print(
        "center OUTSIDE DAG parcel polygon: %d (%.2f%%)"
        % (n_outside, 100.0 * n_outside / max(n_rows, 1))
    )
    print("sample issues (dag, lon, lat, reason):")
    for t in sample_out[:20]:
        print("  %s" % (t,))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
