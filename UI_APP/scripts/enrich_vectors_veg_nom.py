"""
Add veg_cat_nom and veg_cat_manual_nom to vectors CSV using code -> nom map from
Public_Data/classes_plantations_polynesie.json.

The canonical CSV used by the Next.js app is normally:
  Backend/3_Mongo_Spectral_Stac/vectors_with_mongo_stac.csv
(env JUNGLE_VECTORS_CSV can override that path in UI_APP.)

A copy under Backend/4_jungle_clusters/ may be an older export without veg_cat;
use the 3_Mongo file if you need veg_cat / veg_cat_manual.

ASCII only. From repo root:
  python UI_APP/scripts/enrich_vectors_veg_nom.py
  python UI_APP/scripts/enrich_vectors_veg_nom.py -i Backend/4_jungle_clusters/vectors_with_mongo_stac.csv -o out.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


def load_nom_map(repo_root: Path) -> dict[int, str]:
    p = repo_root / "Public_Data" / "classes_plantations_polynesie.json"
    with p.open(encoding="utf-8") as f:
        data = json.load(f)
    out: dict[int, str] = {}
    for c in data.get("classes", []):
        code = c.get("code")
        nom = c.get("nom")
        if isinstance(code, int) and isinstance(nom, str):
            out[code] = nom
    return out


def parse_int_cell(s: str) -> int | None:
    t = (s or "").strip()
    if not t:
        return None
    try:
        return int(float(t))
    except ValueError:
        return None


def parse_bool_cell(s: str) -> bool:
    t = (s or "").strip().lower()
    return t in {"true", "1", "yes"}


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    default_in = repo_root / "Backend" / "3_Mongo_Spectral_Stac" / "vectors_with_mongo_stac.csv"
    ap = argparse.ArgumentParser()
    ap.add_argument("-i", "--input", type=Path, default=default_in)
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=repo_root / "Backend" / "3_Mongo_Spectral_Stac" / "vectors_with_mongo_stac_veg_nom.csv",
    )
    args = ap.parse_args()
    nom_map = load_nom_map(repo_root)
    if not args.input.is_file():
        print(f"missing input: {args.input}", file=sys.stderr)
        return 1
    with args.input.open(newline="", encoding="utf-8") as fin:
        reader = csv.DictReader(fin)
        if reader.fieldnames is None:
            print("empty csv", file=sys.stderr)
            return 1
        fieldnames = list(reader.fieldnames)
        extra = ["veg_cat_nom", "veg_cat_manual_nom"]
        for c in extra:
            if c not in fieldnames:
                fieldnames.append(c)
        if "veg_cat" not in fieldnames:
            print(
                "warning: column veg_cat missing; veg_cat_nom will be empty for all rows",
                file=sys.stderr,
            )
        if "veg_cat_manual" not in fieldnames:
            print(
                "warning: column veg_cat_manual missing; veg_cat_manual_nom will be empty",
                file=sys.stderr,
            )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", newline="", encoding="utf-8") as fout:
            writer = csv.DictWriter(fout, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for row in reader:
                vc = parse_int_cell(row.get("veg_cat", "") or "")
                vm = parse_int_cell(row.get("veg_cat_manual", "") or "")
                manual_flag = parse_bool_cell(row.get("veg_cat_manual", "") or "")
                manual_code = vm if vm is not None else (vc if manual_flag else None)
                row["veg_cat_nom"] = nom_map.get(vc, "") if vc is not None else ""
                row["veg_cat_manual_nom"] = (
                    nom_map.get(manual_code, "") if manual_code is not None else ""
                )
                writer.writerow(row)
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
