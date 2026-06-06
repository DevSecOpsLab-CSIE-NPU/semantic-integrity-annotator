"""
build_items.py
==============
Convert the blinded annotation sample (annotation_blinded.csv, produced by the
JDIQ construct-validity harness) into data/items.json for the static web annotator.

Only the annotator-visible fields are exported: sample_id, source_text,
repaired_label. The framework verdict / truth (framework_key.csv) is NEVER bundled
into the website — it stays held out for scoring.

Usage:
    python3 scripts/build_items.py /path/to/annotation_blinded.csv
"""
import csv, json, sys, os

DEFAULT_SRC = os.path.join(
    os.path.dirname(__file__),
    "../../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv",
)
OUT = os.path.join(os.path.dirname(__file__), "../data/items.json")

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        sys.exit(f"blinded CSV not found: {src}\nPass the path as an argument.")
    rows = list(csv.DictReader(open(src)))
    items = [{"sample_id": r["sample_id"],
              "source_text": r["source_text"],
              "repaired_label": r["repaired_label"]} for r in rows]
    # guard: refuse to leak any verdict columns if present in the source
    leaked = {"framework_flagged", "was_distorted", "true_label", "s2_estimated"} & set(rows[0].keys())
    if leaked:
        print(f"NOTE: source has held-out columns {leaked}; they are NOT exported (annotator-blind).")
    json.dump({"items": items, "n": len(items)}, open(OUT, "w"), ensure_ascii=False, indent=2)
    print(f"Wrote {len(items)} blinded items -> {OUT}")

if __name__ == "__main__":
    main()
