"""
merge_results.py
===============
Merge per-annotator export CSVs (annotations_<id>.csv from the web app) back into
the harness format that compute_construct_validity.py expects: the original
annotation_blinded.csv with the rater columns (R1_consistent_YES_NO, ...) filled.

Each annotator's file has columns: sample_id, annotator_id, consistent_YES_NO, notes.
This assigns annotators to R1..Rk in the order given on the command line.

Usage:
    python3 scripts/merge_results.py \
        --blinded ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv \
        --out     ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv \
        annotations_A.csv annotations_B.csv annotations_C.csv

Then run compute_construct_validity.py in the harness directory.
"""
import argparse, csv, os, sys

def load_annotator(path):
    rows = list(csv.DictReader(open(path)))
    if not rows or "sample_id" not in rows[0] or "consistent_YES_NO" not in rows[0]:
        sys.exit(f"{path}: not a valid annotator export (need sample_id, consistent_YES_NO).")
    who = rows[0].get("annotator_id", os.path.basename(path))
    return who, {r["sample_id"]: (r.get("consistent_YES_NO", "").strip(),
                                  r.get("notes", "").strip()) for r in rows}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blinded", required=True, help="original annotation_blinded.csv")
    ap.add_argument("--out", required=True, help="output (filled) CSV for the harness")
    ap.add_argument("files", nargs="+", help="annotator export CSVs, in R1,R2,... order")
    args = ap.parse_args()

    base = list(csv.DictReader(open(args.blinded)))
    base_cols = list(base[0].keys())
    rater_cols = [c for c in base_cols if c.startswith("R") and "consistent" in c.lower()]
    if len(args.files) > len(rater_cols):
        sys.exit(f"{len(args.files)} annotator files but only {len(rater_cols)} rater columns "
                 f"({rater_cols}). Re-sample with --raters {len(args.files)} or pass fewer files.")

    annotators, mapping = [], []
    for f in args.files:
        who, m = load_annotator(f); annotators.append(who); mapping.append(m)
    print(f"Annotators -> columns: " +
          ", ".join(f"{w}={rater_cols[i]}" for i, w in enumerate(annotators)))

    filled = blank = 0
    notes_merged = {}
    for row in base:
        sid = row["sample_id"]
        for i, m in enumerate(mapping):
            v, note = m.get(sid, ("", ""))
            row[rater_cols[i]] = v
            if v: filled += 1
            else: blank += 1
            if note:
                notes_merged.setdefault(sid, []).append(f"{annotators[i]}: {note}")
        if "rater_notes" in row and sid in notes_merged:
            row["rater_notes"] = " | ".join(notes_merged[sid])

    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=base_cols); w.writeheader(); w.writerows(base)
    print(f"Wrote {args.out}: {filled} filled rating cells, {blank} blank "
          f"(blank = annotator left it unrated).")
    print("Next: run compute_construct_validity.py in the harness directory.")

if __name__ == "__main__":
    main()
