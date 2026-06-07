/* Semantic Integrity Annotator — collection endpoint (Google Apps Script).
 *
 * Receives one POST per answer (incremental) from the static web annotator and
 * UPSERTs it into a Google Sheet, keyed on (annotator_id, sample_id) — so
 * re-answers and re-syncs overwrite in place rather than duplicating.
 *
 * SETUP
 *   1. Create a Google Sheet (this will hold the responses).
 *   2. Extensions > Apps Script. Paste this file. Save.
 *   3. Deploy > New deployment > type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone        <-- required so annotators can POST
 *   4. Copy the Web app URL (ends with /exec) into assets/config.js:
 *        window.SIA_ENDPOINT = "https://script.google.com/macros/s/XXXX/exec";
 *   5. (Optional) open the URL in a browser — doGet returns {"ok":true} health check.
 *
 * The sheet "responses" gets columns: updated_at, annotator_id, sample_id, consistent, note.
 * Each annotator labels every item, so final rows = (#annotators) x (#items).
 */
const SHEET_NAME = 'responses';

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['updated_at', 'annotator_id', 'sample_id', 'consistent', 'note']);
  }
  return sh;
}

function _key(a, b) { return JSON.stringify([String(a), String(b)]); }

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d.annotator_id || !d.sample_id) {
      return _json({ ok: false, error: 'annotator_id and sample_id required' });
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = sheet_();
      const data = sh.getDataRange().getValues();
      const key = _key(d.annotator_id, d.sample_id);
      let row = -1;
      for (let i = 1; i < data.length; i++) {
        if (_key(data[i][1], data[i][2]) === key) { row = i + 1; break; }
      }
      const vals = [new Date(), d.annotator_id, d.sample_id, d.consistent || '', d.note || ''];
      if (row > 0) sh.getRange(row, 1, 1, 5).setValues([vals]);
      else sh.appendRow(vals);
    } finally {
      lock.releaseLock();
    }
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/* Progress query (open in a browser):
 *   …/exec                 -> per-annotator counts + total rows
 *   …/exec?annotator=AUG   -> just AUG's answered count
 * Counts rows whose `consistent` cell is non-empty. */
function doGet(e) {
  try {
    const sh = sheet_();
    const data = sh.getDataRange().getValues();        // [header, ...rows]
    const counts = {};
    for (let i = 1; i < data.length; i++) {
      const who = String(data[i][1] || '');
      const consistent = String(data[i][3] || '').trim();
      if (!who || !consistent) continue;
      counts[who] = (counts[who] || 0) + 1;
    }
    const who = e && e.parameter && e.parameter.annotator;
    if (who) return _json({ ok: true, annotator: who, count: counts[who] || 0 });
    return _json({ ok: true, service: 'semantic-integrity-annotator',
                   by_annotator: counts, total_rows: data.length - 1 });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
