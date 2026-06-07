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

/* Open in a browser:
 *   …/exec                 -> per-annotator counts + total rows (JSON)
 *   …/exec?annotator=AUG   -> just AUG's answered count (JSON)
 *   …/exec?action=view     -> ALL results as an HTML table (human-readable)
 *   …/exec?action=results  -> ALL results as JSON
 * Counts rows whose `consistent` cell is non-empty. */
function doGet(e) {
  try {
    const sh = sheet_();
    const data = sh.getDataRange().getValues();        // [header, ...rows]
    const header = data[0] || ['updated_at','annotator_id','sample_id','consistent','note'];
    const rows = data.slice(1);
    const action = e && e.parameter && e.parameter.action;

    // counts (non-empty 'consistent')
    const counts = {};
    rows.forEach(r => {
      const who = String(r[1] || ''), c = String(r[3] || '').trim();
      if (who && c) counts[who] = (counts[who] || 0) + 1;
    });

    if (action === 'view') return _html(header, rows, counts);
    if (action === 'results') {
      const objs = rows.map(r => { const o = {}; header.forEach((h, i) => o[h] = r[i]); return o; });
      return _json({ ok: true, by_annotator: counts, total_rows: rows.length, rows: objs });
    }
    const who = e && e.parameter && e.parameter.annotator;
    if (who) return _json({ ok: true, annotator: who, count: counts[who] || 0 });
    return _json({ ok: true, service: 'semantic-integrity-annotator',
                   by_annotator: counts, total_rows: rows.length });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _html(header, rows, counts) {
  const summary = Object.keys(counts).sort().map(k => `${_esc(k)}: <b>${counts[k]}</b>`).join(' &nbsp;|&nbsp; ')
    || '(no answered rows yet)';
  const th = header.map(h => `<th>${_esc(h)}</th>`).join('');
  const trs = rows.map(r => '<tr>' + r.map(c => `<td>${_esc(c)}</td>`).join('') + '</tr>').join('');
  const html =
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>SI Annotator — Results</title><style>' +
    'body{font:14px system-ui,"Noto Sans TC",sans-serif;margin:18px;color:#222}' +
    'h2{margin:0 0 6px}.sum{margin:8px 0 14px;color:#333}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}' +
    'th{background:#2563eb;color:#fff;position:sticky;top:0}tr:nth-child(even){background:#f7f8fa}' +
    'td:nth-child(4){font-weight:700}</style></head><body>' +
    '<h2>Semantic Integrity Annotator — Results</h2>' +
    `<div class="sum">已答（非空）：${summary} &nbsp;|&nbsp; 總列數：<b>${rows.length}</b> / 目標 210/人</div>` +
    `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('SI Annotator Results');
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
