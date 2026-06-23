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

The collection sheet may hold rows from more than one study (e.g. CV* construct-validity
and RA* repair-log-audit items share one sheet). Use --id-prefix to process just one:
the prefix must match the blinded template's sample_ids.

Usage:
    # construct-validity study (CV* items):
    python3 scripts/sheet_to_blinded.py --id-prefix CV \
        --sheet   responses.csv \
        --blinded ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv \
        --out     ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv

    # repair-log audit (RA* items, E10):
    python3 scripts/sheet_to_blinded.py --id-prefix RA \
        --sheet   responses.csv \
        --blinded ../ill-posed-AffectTrace/SCRIPTS/experiments/results/repair_log_audit/audit_blinded_raters.csv \
        --out     ../ill-posed-AffectTrace/SCRIPTS/experiments/results/repair_log_audit/audit_blinded_raters.csv
"""
import argparse, csv, sys
from collections import defaultdict

# Annotator IDs that must NOT be counted as independent raters for inter-rater
# reliability. AUG_rubricB is AUG re-annotating under a second rubric: it is the
# SAME human, so including it would inflate agreement (it is an intra-rater retest,
# not an independent rater). Its rows stay in the Sheet (a useful rubric-robustness /
# test-retest signal) but are dropped from the κ/PABAK scoring built here.
EXCLUDE_ANNOTATORS = {"AUG_rubricB"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", required=True, help="Google Sheet 'responses' export (CSV)")
    ap.add_argument("--blinded", required=True, help="original annotation_blinded.csv")
    ap.add_argument("--out", required=True, help="output filled CSV for the harness")
    ap.add_argument("--exclude", default="", help="comma-separated annotator_ids to drop, "
                    f"in addition to the built-in default {sorted(EXCLUDE_ANNOTATORS)}")
    ap.add_argument("--id-prefix", default="", help="only process rows whose sample_id starts "
                    "with this prefix (e.g. RA for the repair-log audit, CV for construct "
                    "validity); empty = all rows. Must match the --blinded template's ids.")
    args = ap.parse_args()
    exclude = set(EXCLUDE_ANNOTATORS) | {x.strip() for x in args.exclude.split(",") if x.strip()}

    sheet = list(csv.DictReader(open(args.sheet)))
    need = {"annotator_id", "sample_id", "consistent"}
    if not sheet or not need.issubset(sheet[0].keys()):
        sys.exit(f"{args.sheet}: expected columns {need} (got {list(sheet[0].keys()) if sheet else 'empty'}).")

    # latest value per (annotator, sample) — the Sheet already upserts, but dedup defensively
    val = {}; note = {}; skipped = defaultdict(int); n_prefix_skip = 0
    for r in sheet:
        a, s = r["annotator_id"].strip(), r["sample_id"].strip()
        if not a or not s:
            continue
        if args.id_prefix and not s.startswith(args.id_prefix):
            n_prefix_skip += 1
            continue
        if a in exclude:
            skipped[a] += 1
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
    if args.id_prefix:
        print(f"Filtered to sample_id prefix '{args.id_prefix}': kept {len(val)} cells, "
              f"skipped {n_prefix_skip} rows from other studies.")
    if skipped:
        print("Excluded (not independent raters): " +
              ", ".join(f"{a} ({n} rows)" for a, n in sorted(skipped.items())))

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
