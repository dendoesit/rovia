import { serialToIso } from "./cells.js";
export const MAX_ROWS = 50_000, MAX_COLS = 80;

const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";

const trimRow = (row) => {
  let end = row.length;
  while (end && (row[end - 1] === "" || row[end - 1] == null)) end--;
  return row.slice(0, end);
};

const hasValue = (cell) => !!cell && cell.t !== "z" && cell.v != null && cell.v !== "";

/* celulele devin text, număr sau dată ISO (AAAA-LL-ZZ) — restul importului nu mai știe de formatul fișierului;
   rândurile și coloanele pornesc de la A1, ca numerele din previzualizare să fie cele din Excel */
export function sheetsFromWorkbook(XLSX, wb) {
  const date1904 = !!wb.Workbook?.WBProps?.date1904;
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws?.["!ref"]) return { name, rows: [], truncated: false };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const dense = ws["!data"];
    const cellAt = (r, c) => (dense ? dense[r]?.[c] : ws[XLSX.utils.encode_cell({ r, c })]);
    const lastRow = Math.min(range.e.r, MAX_ROWS - 1, dense ? dense.length - 1 : Infinity), lastCol = Math.min(range.e.c, MAX_COLS - 1);
    const rows = [];
    for (let r = 0; r <= lastRow; r++) {
      const row = [];
      for (let c = 0; c <= lastCol; c++) {
        const cell = cellAt(r, c);
        let v = "";
        if (!cell || cell.t === "e" || cell.t === "z") v = "";
        else if (cell.t === "d") v = new Date(cell.v).toISOString().slice(0, 10);
        else if (cell.t === "n") v = cell.z && XLSX.SSF.is_date(cell.z) ? serialToIso(cell.v, date1904) : cell.v;
        else if (cell.t === "b") v = cell.v ? "da" : "nu";
        else v = String(cell.v ?? cell.w ?? "").trim();
        row.push(v);
      }
      rows.push(row);
    }
    for (const m of ws["!merges"] || []) {
      const top = rows[m.s.r]?.[m.s.c];
      for (let r = m.s.r + 1; r <= m.e.r; r++) if (rows[r]?.[m.s.c] === "") rows[r][m.s.c] = top;
    }
    const truncated = dense
      ? dense.some((cells, r) => !!(r > lastRow ? cells : cells?.slice(lastCol + 1))?.some(hasValue))
      : range.e.r > lastRow || range.e.c > lastCol;
    return { name, rows: rows.map(trimRow), truncated };
  });
}

const BOMS = [["utf-8", [0xef, 0xbb, 0xbf]], ["utf-16le", [0xff, 0xfe]], ["utf-16be", [0xfe, 0xff]]];

/* „Text Unicode" din Excel e UTF-16 cu BOM; CSV-urile din Excel pe Windows vin des în Windows-1250, nu în UTF-8 */
export function decodeText(bytes) {
  const bom = BOMS.find(([, mark]) => mark.every((b, i) => bytes[i] === b));
  if (bom) return new TextDecoder(bom[0]).decode(bytes).replace(/^\ufeff/, "");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1250").decode(bytes); }
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const kids = (el, name) => [...el.childNodes].filter((n) => n.localName === name && n.namespaceURI === W);
const wAttr = (el, name) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const prop = (el, container, name) => {
  const box = kids(el, container)[0];
  return box ? kids(box, name)[0] : null;
};

function paragraphText(p) {
  let out = "";
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.namespaceURI !== W) continue;
      if (n.localName === "t") out += n.textContent;
      else if (n.localName === "tab") out += " ";
      else if (n.localName === "br" || n.localName === "cr") out += " / ";
      else if (n.localName !== "tbl") walk(n);
    }
  };
  walk(p);
  return out.replace(/\s+/g, " ").trim();
}

/* rândurile, celulele și paragrafele pot sta și în controale de conținut (w:sdt) */
const within = (el, name) => [...el.childNodes].flatMap((n) =>
  n.namespaceURI !== W ? [] : n.localName === name ? [n] : n.localName === "sdt" ? kids(n, "sdtContent").flatMap((c) => within(c, name)) : []);

export function docxTables(xml, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(xml, "application/xml");
  const tables = [...doc.getElementsByTagNameNS(W, "tbl")].filter((t) => {
    for (let p = t.parentNode; p; p = p.parentNode) if (p.localName === "tbl") return false;
    return true;
  });
  return tables.map((tbl, i) => {
    const rows = [];
    for (const tr of within(tbl, "tr")) {
      const row = [];
      const before = +wAttr(prop(tr, "trPr", "gridBefore"), "val") || 0;
      for (let k = 0; k < before; k++) row.push("");
      for (const tc of within(tr, "tc")) {
        const span = +wAttr(prop(tc, "tcPr", "gridSpan"), "val") || 1;
        const vMerge = prop(tc, "tcPr", "vMerge");
        const col = row.length;
        let text = within(tc, "p").map(paragraphText).filter(Boolean).join(" / ");
        if (vMerge && wAttr(vMerge, "val") !== "restart" && !text) text = rows[rows.length - 1]?.[col] ?? "";
        row.push(text);
        for (let k = 1; k < span; k++) row.push("");
      }
      rows.push(trimRow(row));
    }
    return { name: `Tabel ${i + 1}`, rows };
  }).filter((t) => t.rows.length);
}

export async function readDocx(bytes, DOMParserImpl) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  if (!files["word/document.xml"]) throw new Error("fișierul Word nu conține un document valid");
  return docxTables(strFromU8(files["word/document.xml"]), DOMParserImpl);
}

export async function readWorkbook(bytes, ext) {
  const XLSX = await import("xlsx");
  const wb = ["csv", "txt", "tsv"].includes(ext)
    ? XLSX.read(decodeText(bytes), { type: "string", raw: true, dense: true })
    : XLSX.read(bytes, { type: "array", dense: true, cellNF: true });
  return sheetsFromWorkbook(XLSX, wb);
}

const SPREADSHEETS = ["xlsx", "xlsm", "xlsb", "xls", "ods", "fods", "csv", "tsv", "txt", ""];

/* File din browser → foi de calcul (pentru Word: fiecare tabel e o foaie) */
export async function readFile(file) {
  const ext = extOf(file.name);
  if (ext === "doc") throw new Error("formatul .doc vechi nu se poate citi — salvează fișierul ca .docx sau .xlsx");
  if (ext === "pdf") throw new Error("PDF-urile nu se pot citi — exportă tabelul în Excel sau Word (.docx)");
  if (ext !== "docx" && !SPREADSHEETS.includes(ext)) throw new Error(`fișierele .${ext} nu se pot importa — alege un tabel Excel (.xlsx, .xls, .ods, .csv) sau Word (.docx)`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheets;
  try {
    sheets = ext === "docx" ? await readDocx(bytes) : await readWorkbook(bytes, ext);
  } catch (e) {
    if (/password|encrypt/i.test(e.message)) throw new Error(`„${file.name}” e protejat cu parolă — salvează-l fără parolă și încearcă din nou`);
    throw new Error(`nu am putut citi „${file.name}” (${e.message || "format necunoscut"})`);
  }
  const usable = sheets.filter((s) => s.rows.some((r) => r.length));
  if (!usable.length) throw new Error(ext === "docx" ? "documentul Word nu conține niciun tabel" : "fișierul nu conține date");
  return usable;
}
