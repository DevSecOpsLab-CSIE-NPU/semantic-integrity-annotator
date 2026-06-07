"""
sheet_to_blinded.py
===================
Convert the Google Sheet export (long format, one row per annotator x item) into
the harness-ready blinded CSV with rater columns (R1..Rk filled), so
compute_construct_validity.py can score it directly.

This is the Sheet-collection counterpart to merge_results.py (which takes per-annotator
download CSVs). Use whichever collection path you ran.

Sheet export columns expected: updated_at, annotator_id, sample_id, consistent, note
(download from the Sheet: File > Download > CSV of the "responses" tab).

Annotators are assigned to R1..Rk in sorted order of annotator_id (stable, reproducible).

Usage:
    python3 scripts/sheet_to_blinded.py \
        --sheet   responses.csv \
        --blinded ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv \
        --out     ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv
"""
import argparse, csv, sys
from collections import defaultdict

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", required=True, help="Google Sheet 'responses' export (CSV)")
    ap.add_argument("--blinded", required=True, help="original annotation_blinded.csv")
    ap.add_argument("--out", required=True, help="output filled CSV for the harness")
    args = ap.parse_args()

    sheet = list(csv.DictReader(open(args.sheet)))
    need = {"annotator_id", "sample_id", "consistent"}
    if not sheet or not need.issubset(sheet[0].keys()):
        sys.exit(f"{args.sheet}: expected columns {need} (got {list(sheet[0].keys()) if sheet else 'empty'}).")

    # latest value per (annotator, sample) — the Sheet already upserts, but dedup defensively
    val = {}; note = {}
    for r in sheet:
        a, s = r["annotator_id"].strip(), r["sample_id"].strip()
        if not a or not s:
            continue
        val[(a, s)] = r.get("consistent", "").strip()
        # Fold the human-proposed correct label (when 'consistent'==NO) into the note,
        # so it is preserved for richer analysis without disturbing the YES/NO R-columns
        # the scoring harness reads.
        parts = []
        corr = r.get("corrected", "").strip()
        if corr: parts.append(f"→{corr}")        # e.g. ->negative
        if r.get("note", "").strip(): parts.append(r["note"].strip())
        if parts: note[(a, s)] = " ".join(parts)
    annotators = sorted({a for (a, _) in val})

    base = list(csv.DictReader(open(args.blinded)))
    cols = list(base[0].keys())
    rater_cols = [c for c in cols if c.startswith("R") and "consistent" in c.lower()]
    if len(annotators) > len(rater_cols):
        sys.exit(f"{len(annotators)} annotators in sheet but only {len(rater_cols)} rater columns "
                 f"({rater_cols}). Re-sample with more --raters.")
    print("Annotator -> column: " +
          ", ".join(f"{a}={rater_cols[i]}" for i, a in enumerate(annotators)))

    filled = 0
    for row in base:
        sid = row["sample_id"]; notes = []
        for i, a in enumerate(annotators):
            v = val.get((a, sid), "")
            row[rater_cols[i]] = v
            if v: filled += 1
            if (a, sid) in note: notes.append(f"{a}: {note[(a, sid)]}")
        if "rater_notes" in row and notes:
            row["rater_notes"] = " | ".join(notes)

    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(base)
    print(f"Wrote {args.out}: {filled} filled rating cells across {len(annotators)} annotators.")
    print("Next: run compute_construct_validity.py in the harness directory.")

if __name__ == "__main__":
    main()
