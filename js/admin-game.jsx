/* ===== Template & import soal game (tanpa library eksternal) ===== */
const GameImportKit = (() => {
/* =========================================================================
 * Template & import soal game — tanpa library eksternal.
 * .xlsx ditulis/dibaca langsung (zip + XML); CSV (koma / titik koma / tab) juga didukung.
 * ========================================================================= */
const GAME_TRUE_WORD = '\u0635\u064E\u062D\u0650\u064A\u062D\u064C';   // صَحِيحٌ
const GAME_FALSE_WORD = '\u062E\u064E\u0637\u064E\u0623\u064C';         // خَطَأٌ
const GAME_IMPORT_MAX_ROWS = 500;
const GAME_IMPORT_MAX_BYTES = 3 * 1024 * 1024;
const GAME_TYPE_ALIASES = {
  mcq: 'mcq', pg: 'mcq', pilihanganda: 'mcq', pilihan: 'mcq',
  true_false: 'true_false', truefalse: 'true_false', benarsalah: 'true_false', bs: 'true_false',
  vocab: 'vocab', kosakata: 'vocab',
  letters: 'letters', susunhuruf: 'letters', huruf: 'letters',
  sentence: 'sentence', susunkalimat: 'sentence', kalimat: 'sentence',
};
const GAME_HEADER_ALIASES = {
  no: ['no', 'nomor'],
  prompt: ['pertanyaan', 'petunjuk', 'soal'],
  type: ['jenissoal', 'jenis', 'tipe'],
  options: ['pilihan', 'opsi', 'hurufacak', 'kataacak', 'tokenacak', 'huruf'],
  answer: ['jawabanbenar', 'jawaban', 'kunci'],
  left: ['kartu1', 'kartupertama', 'kiri'],
  right: ['kartu2', 'kartupasangan', 'kanan', 'pasangan'],
  media: ['urlgambar', 'gambar', 'media'],
  expl: ['pembahasan', 'penjelasan'],
  points: ['bobotskor', 'bobot', 'skor', 'poin'],
};

/* ------------------------------- definisi template ------------------------------- */
const GAME_TEMPLATE_DEFS = {
  who_am_i: {
    label: 'Tebak kosakata (مَنْ أَنَا؟)',
    head: ['No', 'Pertanyaan', 'Pilihan (tepat 4, pisahkan dengan |)', 'Jawaban benar (salah satu pilihan)', 'URL gambar (opsional)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 42, 44, 26, 28, 34, 11],
    sample: [
      ['contoh', 'Apa bahasa Arab dari "buku"?', 'قَلَمٌ | كِتَابٌ | بَيْتٌ | مَدْرَسَةٌ', 'كِتَابٌ', '', 'Kitab artinya buku.', 10],
      ['contoh', 'Apa bahasa Arab dari "rumah"?', 'بَيْتٌ | بَابٌ | نَافِذَةٌ | كُرْسِيٌّ', 'بَيْتٌ', '', '', 10],
    ],
    rules: ['Setiap soal harus punya tepat 4 pilihan, dipisahkan dengan tanda | (garis tegak).', 'Kolom "Jawaban benar" harus sama persis dengan salah satu pilihan (termasuk harakat).'],
  },
  letters: {
    label: 'Susun huruf (رَتِّبِ الْحُرُوفَ)',
    head: ['No', 'Pertanyaan', 'Huruf acak (pisahkan dengan |)', 'Jawaban benar (urutan benar, pisahkan dengan |)', 'URL gambar (opsional)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 42, 32, 36, 28, 34, 11],
    sample: [
      ['contoh', 'Susun huruf menjadi kata "buku"', 'ا | ب | ك | ت', 'ك | ت | ا | ب', '', '', 10],
      ['contoh', 'Susun huruf menjadi kata "rumah"', 'ت | ي | ب', 'ب | ي | ت', '', '', 10],
    ],
    rules: ['Isi "Huruf acak" dengan huruf yang sudah diacak, dipisahkan dengan |.', 'Isi "Jawaban benar" dengan huruf yang sama dalam urutan yang benar. Jumlah dan isinya harus sama dengan huruf acak.'],
  },
  memory: {
    label: 'Memory card (لُعْبَةُ الذَّاكِرَةِ)',
    head: ['No', 'Petunjuk (opsional)', 'Kartu 1 (mis. kata Arab)', 'Kartu 2 (pasangan: arti atau URL gambar)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 36, 28, 34, 34, 11],
    sample: [
      ['contoh', '', 'كِتَابٌ', 'Buku', '', 10],
      ['contoh', '', 'قَلَمٌ', 'Pena', '', 10],
    ],
    rules: ['Satu baris = satu pasang kartu. Kolom "Kartu 1" dan "Kartu 2" wajib diisi.', '"Petunjuk" boleh dikosongkan; akan diisi otomatis.'],
  },
  sentence: {
    label: 'Susun kalimat (بِنَاءُ الْجُمْلَةِ)',
    head: ['No', 'Pertanyaan', 'Kata acak (pisahkan dengan |)', 'Jawaban benar (urutan kata, pisahkan dengan |)', 'URL gambar (opsional)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 42, 44, 46, 28, 34, 11],
    sample: [
      ['contoh', 'Susun menjadi kalimat yang benar', 'الْمَدْرَسَةِ | إِلَى | أَذْهَبُ | أَنَا', 'أَنَا | أَذْهَبُ | إِلَى | الْمَدْرَسَةِ', '', '', 10],
      ['contoh', 'Susun menjadi kalimat yang benar', 'كِتَابًا | أَقْرَأُ | أَنَا', 'أَنَا | أَقْرَأُ | كِتَابًا', '', '', 10],
    ],
    rules: ['Isi "Kata acak" dengan kata-kata yang sudah diacak, dipisahkan dengan |.', 'Isi "Jawaban benar" dengan kata yang sama dalam urutan yang benar.'],
  },
  true_false: {
    label: 'Benar atau salah (صَحِيحٌ أَمْ خَطَأٌ؟)',
    head: ['No', 'Pertanyaan', 'Jawaban benar (صَحِيحٌ / خَطَأٌ, atau Benar / Salah)', 'URL gambar (opsional)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 52, 40, 28, 34, 11],
    sample: [
      ['contoh', '"قَلَمٌ" artinya pensil.', 'Benar', '', 'Qalam berarti pena/pensil.', 10],
      ['contoh', '"بَابٌ" artinya jendela.', 'Salah', '', 'Bab berarti pintu.', 10],
    ],
    rules: ['Kolom "Jawaban benar" boleh diisi صَحِيحٌ / خَطَأٌ, atau cukup Benar / Salah (B / S juga bisa).'],
  },
  competition: {
    label: 'Kompetisi (مُسَابَقَةُ اللُّغَةِ الْعَرَبِيَّةِ)',
    head: ['No', 'Pertanyaan', 'Jenis soal (pilihan ganda / benar salah / kosakata / susun huruf / susun kalimat)', 'Pilihan / token acak (pisahkan dengan |)', 'Jawaban benar', 'URL gambar (opsional)', 'Pembahasan (opsional)', 'Bobot skor'],
    widths: [8, 42, 36, 40, 36, 28, 34, 11],
    sample: [
      ['contoh', 'Apa bahasa Arab dari "buku"?', 'pilihan ganda', 'قَلَمٌ | كِتَابٌ | بَيْتٌ', 'كِتَابٌ', '', '', 10],
      ['contoh', '"بَابٌ" artinya pintu.', 'benar salah', '', 'Benar', '', '', 10],
      ['contoh', 'Susun huruf menjadi kata "buku"', 'susun huruf', 'ا | ب | ك | ت', 'ك | ت | ا | ب', '', '', 10],
    ],
    rules: ['Kolom "Jenis soal" wajib: pilihan ganda, benar salah, kosakata, susun huruf, atau susun kalimat.', 'Pilihan ganda/kosakata: isi pilihan (minimal 2) dan jawaban benar yang sama dengan salah satu pilihan.', 'Benar salah: kolom pilihan dikosongkan. Susun huruf/kalimat: isi token acak dan urutan jawaban yang benar.'],
  },
};

/* ------------------------------- zip & xlsx (tulis) ------------------------------- */
const GAME_CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function gameCrc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = GAME_CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function gameZipStore(files) {
  const enc = new TextEncoder(); const u16 = (v) => [v & 255, (v >> 8) & 255]; const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const chunks = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const crc = gameCrc32(f.data); const size = f.data.length;
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
    chunks.push(local, name, f.data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end]; const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0)); let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
const gameXmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function gameColName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function gameSheetXml(rows, widths, frozen) {
  const cols = widths && widths.length ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
  const view = frozen ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const body = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
    if (v === '' || v === null || v === undefined) return '';
    const ref = gameColName(ci) + (ri + 1); const st = ri === 0 && frozen ? 1 : 2;
    if (typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${gameXmlEsc(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + view + '<sheetFormatPr defaultRowHeight="18"/>' + cols + '<sheetData>' + body + '</sheetData></worksheet>';
}
function gameBuildXlsx(sheets) {
  const enc = new TextEncoder(); const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'; const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + RNS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + `<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>` + sheets.map((s, i) => `<sheet name="${gameXmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${RNS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', X + `<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, gameSheetXml(s.rows, s.widths, !!s.frozen)]),
  ];
  return gameZipStore(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
}
function buildGameTemplateXlsx(template) {
  const def = GAME_TEMPLATE_DEFS[template] || GAME_TEMPLATE_DEFS.who_am_i;
  const guide = [
    ['Petunjuk pengisian template: ' + def.label],
    [''],
    ['1. Isi soal di sheet "Soal", satu soal per baris. Jangan mengubah atau menghapus nama kolom di baris pertama.'],
    ['2. Baris yang kolom "No"-nya bertuliskan "contoh" tidak ikut diimport. Hapus atau biarkan, lalu isi soal Anda di baris berikutnya.'],
    ['3. Pisahkan pilihan atau token dengan tanda | (garis tegak). Teks Arab boleh langsung diketik lengkap dengan harakat.'],
    ['4. Bobot skor boleh dikosongkan (otomatis 10). URL gambar dan pembahasan boleh dikosongkan.'],
    ...def.rules.map((r, i) => [`${5 + i}. ${r}`]),
    [`${5 + def.rules.length}. Simpan sebagai .xlsx (atau CSV UTF-8), lalu klik "Import soal" di halaman Manajemen Game. Pastikan jenis game di halaman itu sama dengan jenis template ini.`],
    [`${6 + def.rules.length}. Soal yang berhasil dibaca akan muncul di editor dan masih bisa diedit sebelum disimpan. Baris yang salah ditampilkan lengkap dengan nomor barisnya.`],
  ];
  return gameBuildXlsx([
    { name: 'Soal', rows: [def.head, ...def.sample], widths: def.widths, frozen: true },
    { name: 'Petunjuk', rows: guide, widths: [120], frozen: false },
  ]);
}

/* ------------------------------- zip & xlsx (baca) ------------------------------- */
async function gameInflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung baca .xlsx. Simpan file sebagai CSV UTF-8, atau perbarui browser.');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function gameUnzipIndex(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
  if (e < 0) throw new Error('Berkas bukan file .xlsx yang valid.');
  const total = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const dec = new TextDecoder(); const out = {};
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true); const nlen = dv.getUint16(p + 28, true); const elen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true); const lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/^\/+/, '');
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nlen + elen + clen;
  }
  return out;
}
async function gameEntryText(index, name) {
  const ent = index[name]; if (!ent) return null;
  const raw = ent.method === 0 ? ent.data : await gameInflateRaw(ent.data);
  return new TextDecoder('utf-8').decode(raw);
}
const gameXmlUnesc = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => {
  if (g === 'amp') return '&'; if (g === 'lt') return '<'; if (g === 'gt') return '>'; if (g === 'quot') return '"'; if (g === 'apos') return "'";
  const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); try { return String.fromCodePoint(code); } catch (e) { return ''; }
});
const gameXmlAttrs = (s) => { const o = {}; s.replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = gameXmlUnesc(v); return m; }); return o; };
const gameXmlText = (s) => { let out = ''; s.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (m, t) => { out += gameXmlUnesc(t); return m; }); return out; };
function gameColIndex(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
async function gameReadXlsxGrid(buf) {
  const index = gameUnzipIndex(buf);
  const wb = await gameEntryText(index, 'xl/workbook.xml'); if (!wb) throw new Error('Berkas bukan file .xlsx yang valid.');
  const sheets = []; wb.replace(/<sheet\b([^>]*?)\/>/g, (m, a) => { const at = gameXmlAttrs(a); sheets.push({ name: at.name || '', rid: at['r:id'] }); return m; });
  if (!sheets.length) throw new Error('File Excel tidak memiliki sheet.');
  const rels = {}; const relXml = (await gameEntryText(index, 'xl/_rels/workbook.xml.rels')) || '';
  relXml.replace(/<Relationship\b([^>]*?)\/>/g, (m, a) => { const at = gameXmlAttrs(a); rels[at.Id] = String(at.Target || '').replace(/^\/+/, ''); return m; });
  const pick = sheets.find((s) => s.name.trim().toLowerCase() === 'soal') || sheets[0];
  let target = rels[pick.rid]; if (!target) throw new Error('Sheet soal tidak ditemukan di file.');
  if (!target.startsWith('xl/')) target = 'xl/' + target;
  const sheetXml = await gameEntryText(index, target); if (!sheetXml) throw new Error('Sheet soal tidak dapat dibaca.');
  const sst = []; const sstXml = await gameEntryText(index, 'xl/sharedStrings.xml');
  if (sstXml) sstXml.replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (m, b) => { sst.push(gameXmlText(b.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))); return m; });
  const grid = [];
  sheetXml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, a, inner) => {
    const at = gameXmlAttrs(a); const ref = /^([A-Z]+)(\d+)$/.exec(at.r || ''); if (!ref || !inner) return m;
    const c = gameColIndex(ref[1]); const r = parseInt(ref[2], 10) - 1; const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); let val = '';
    if (at.t === 's') val = vm ? (sst[parseInt(vm[1], 10)] || '') : '';
    else if (at.t === 'inlineStr') val = gameXmlText(inner);
    else if (at.t === 'str') val = vm ? gameXmlUnesc(vm[1]) : '';
    else if (at.t === 'b') val = vm && vm[1] === '1' ? 'TRUE' : 'FALSE';
    else val = vm ? vm[1] : '';
    if (r > 20000 || c > 60) return m;
    while (grid.length <= r) grid.push([]);
    while (grid[r].length <= c) grid[r].push('');
    grid[r][c] = val; return m;
  });
  return grid;
}
function gameParseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); let first = (text.split(/\r?\n/, 1)[0] || '');
  if (/^sep=.$/i.test(first)) { text = text.slice(first.length).replace(/^\r?\n/, ''); first = (text.split(/\r?\n/, 1)[0] || ''); }
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function readGameGrid(file) {
  if (!file) throw new Error('Pilih file terlebih dahulu.');
  if (file.size > GAME_IMPORT_MAX_BYTES) throw new Error('Ukuran file maksimal 3 MB.');
  const name = String(file.name || '').toLowerCase(); const buf = await file.arrayBuffer();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return gameReadXlsxGrid(buf);
  if (name.endsWith('.xls')) throw new Error('Format .xls lama tidak didukung. Buka di Excel, lalu "Simpan sebagai" .xlsx atau CSV UTF-8.');
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
    const text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) throw new Error('Teks file tidak terbaca (bukan UTF-8). Simpan ulang sebagai "CSV UTF-8" atau gunakan .xlsx.');
    return gameParseCsv(text);
  }
  throw new Error('Format file tidak dikenali. Gunakan template .xlsx atau CSV UTF-8.');
}

/* ------------------------------- validasi & konversi ------------------------------- */
const gameNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const gameStripArabic = (s) => String(s || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();
const gameSplitPipe = (s) => String(s || '').split('|').map((x) => x.trim()).filter(Boolean);
function gameParseTrueFalse(raw) {
  const t = gameStripArabic(raw).toLowerCase().replace(/[.\s]+/g, '');
  if (['benar', 'b', 'true', 't', 'ya', '\u0635\u062D\u064A\u062D'].includes(t)) return GAME_TRUE_WORD;
  if (['salah', 's', 'false', 'f', 'tidak', '\u062E\u0637\u0627', '\u062E\u0637\u0623'].includes(t)) return GAME_FALSE_WORD;
  return null;
}
function parseGameRows(grid, template) {
  const result = { questions: [], errors: [], skipped: 0 };
  const hi = grid.findIndex((r) => (r || []).filter((c) => String(c || '').trim()).length >= 2);
  if (hi < 0) { result.errors.push('File kosong atau tidak memiliki baris judul kolom.'); return result; }
  const map = {};
  (grid[hi] || []).forEach((h, ci) => {
    const key = gameNorm(h); if (!key) return;
    for (const field of Object.keys(GAME_HEADER_ALIASES)) { if (map[field] === undefined && GAME_HEADER_ALIASES[field].some((a) => key === a || key.startsWith(a))) { map[field] = ci; break; } }
  });
  const need = template === 'memory' ? ['left', 'right'] : (template === 'true_false' ? ['prompt', 'answer'] : (template === 'competition' ? ['prompt', 'type', 'answer'] : ['prompt', 'options', 'answer']));
  const labels = { prompt: 'Pertanyaan', type: 'Jenis soal', options: 'Pilihan / token acak', answer: 'Jawaban benar', left: 'Kartu 1', right: 'Kartu 2' };
  const missing = need.filter((f) => map[f] === undefined);
  if (missing.length) { result.errors.push('Kolom wajib tidak ditemukan: ' + missing.map((f) => labels[f]).join(', ') + '. Gunakan template dari tombol "Unduh template" untuk jenis game ini.'); return result; }
  const get = (row, f) => (map[f] === undefined ? '' : String(row[map[f]] === undefined || row[map[f]] === null ? '' : row[map[f]]).trim());
  for (let i = hi + 1; i < grid.length; i++) {
    const row = grid[i] || []; const n = i + 1;
    if (!row.some((c) => String(c || '').trim())) continue;
    if (gameNorm(get(row, 'no')) === 'contoh') { result.skipped++; continue; }
    if (result.questions.length >= GAME_IMPORT_MAX_ROWS) { result.errors.push(`Baris ${n}: jumlah soal melebihi batas ${GAME_IMPORT_MAX_ROWS}. Baris ini dan sesudahnya tidak diimport.`); break; }
    const err = (msg) => result.errors.push(`Baris ${n}: ${msg}`);
    const media = get(row, 'media'); const expl = get(row, 'expl'); const ptsRaw = get(row, 'points').replace(',', '.');
    let points = 10; if (ptsRaw !== '') { points = Number(ptsRaw); if (!Number.isFinite(points) || points < 0 || points > 1000) { err('bobot skor harus angka 0–1000.'); continue; } }
    if (media && !/^https?:\/\//i.test(media)) { err('URL gambar harus diawali http:// atau https://.'); continue; }
    const base = { explanation: expl, media_url: media, points: String(points), pair_left: '', pair_right: '' };
    let prompt = get(row, 'prompt');
    if (template === 'memory') {
      const left = get(row, 'left'); const right = get(row, 'right');
      if (!left || !right) { err('kolom Kartu 1 dan Kartu 2 wajib diisi.'); continue; }
      result.questions.push({ ...base, prompt: prompt || 'Pasangkan kartu yang sesuai.', question_type: 'mcq', optionsText: '', correctText: 'pair', pair_left: left, pair_right: right });
      continue;
    }
    if (!prompt) { err('kolom Pertanyaan wajib diisi.'); continue; }
    let type = template;
    if (template === 'competition') {
      type = GAME_TYPE_ALIASES[gameNorm(get(row, 'type'))];
      if (!type) { err('Jenis soal tidak dikenali. Gunakan: pilihan ganda, benar salah, kosakata, susun huruf, atau susun kalimat.'); continue; }
    }
    const answerRaw = get(row, 'answer'); const options = gameSplitPipe(get(row, 'options'));
    if (type === 'true_false') {
      const tf = gameParseTrueFalse(answerRaw);
      if (!tf) { err('Jawaban benar harus صَحِيحٌ / خَطَأٌ atau Benar / Salah.'); continue; }
      result.questions.push({ ...base, prompt, question_type: template === 'competition' ? 'true_false' : 'mcq', optionsText: '', correctText: tf });
      continue;
    }
    if (type === 'letters' || type === 'sentence') {
      const noun = type === 'letters' ? 'huruf' : 'kata'; const answer = gameSplitPipe(answerRaw);
      if (!options.length) { err(`isi ${noun} acak (pisahkan dengan |).`); continue; }
      if (!answer.length) { err(`isi jawaban benar berupa urutan ${noun} (pisahkan dengan |).`); continue; }
      if (answer.length !== options.length) { err(`jumlah ${noun} pada jawaban benar (${answer.length}) harus sama dengan ${noun} acak (${options.length}).`); continue; }
      if ([...options].sort().join('\u0001') !== [...answer].sort().join('\u0001')) { err(`isi jawaban benar harus memakai ${noun} yang sama dengan ${noun} acak (hanya urutannya yang berbeda).`); continue; }
      result.questions.push({ ...base, prompt, question_type: template === 'competition' ? type : 'mcq', optionsText: options.join(' | '), correctText: answer.join(' | ') });
      continue;
    }
    // pilihan ganda: who_am_i atau kompetisi mcq/vocab
    if (template === 'who_am_i' && options.length !== 4) { err(`game ini memerlukan tepat 4 pilihan (terbaca ${options.length}). Pisahkan pilihan dengan |.`); continue; }
    if (options.length < 2) { err('isi minimal 2 pilihan (pisahkan dengan |).'); continue; }
    if (new Set(options).size !== options.length) { err('ada pilihan yang sama. Setiap pilihan harus berbeda.'); continue; }
    if (!answerRaw) { err('kolom Jawaban benar wajib diisi.'); continue; }
    if (!options.includes(answerRaw)) { err('Jawaban benar harus sama persis dengan salah satu pilihan (termasuk harakat).'); continue; }
    result.questions.push({ ...base, prompt, question_type: template === 'competition' ? type : 'mcq', optionsText: options.join(' | '), correctText: answerRaw });
  }
  return result;
}

return { buildTemplate: buildGameTemplateXlsx, readGrid: readGameGrid, parseRows: parseGameRows, defs: GAME_TEMPLATE_DEFS, maxRows: GAME_IMPORT_MAX_ROWS };
})();

const GAME_TEMPLATES = [
  ['who_am_i', 'مَنْ أَنَا؟ · Tebak kosakata'], ['letters', 'رَتِّبِ الْحُرُوفَ · Susun huruf'],
  ['memory', 'لُعْبَةُ الذَّاكِرَةِ · Memory card'], ['sentence', 'بِنَاءُ الْجُمْلَةِ · Susun kalimat'],
  ['true_false', 'صَحِيحٌ أَمْ خَطَأٌ؟ · Benar atau salah'], ['competition', 'مُسَابَقَةُ اللُّغَةِ الْعَرَبِيَّةِ · Kompetisi'],
];
const newGameQuestion = () => ({ prompt: '', question_type: 'mcq', optionsText: '', correctText: '', explanation: '', media_url: '', pair_left: '', pair_right: '', points: '10' });
const defaultGameForm = () => ({ title: '', description: '', template: 'who_am_i', subject_id: '', chapter: '', material: '', difficulty: 'Sedang', status: 'DRAFT', duration: '600', question_count: '1', max_attempts: '1', modes: ['individual', 'live'], show_explanation: true, show_leaderboard: true, shuffle_questions: true, shuffle_options: true, speed_bonus: false });

function AdminGamePage() {
  const { backend } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [catalog, setCatalog] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [classes, setClasses] = useState([]); const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(defaultGameForm); const [editingId,setEditingId]=useState(null);
  const [importReplace, setImportReplace] = useState(false); const [importInfo, setImportInfo] = useState(null);
  const [questions, setQuestions] = useState([newGameQuestion()]); const [assignForm, setAssignForm] = useState({ game_id: '', class_id: '', start_at: '', end_at: '', modes: ['individual', 'live'], max_attempts: '1' });
  const load = async () => { setLoading(true); setError(''); try { const [g,c,s] = await Promise.all([backend.listTeacherGames(), backend.list('classes'), backend.list('subjects')]); setCatalog(g); setClasses(c); setSubjects(s); } catch(e) { setError(e.message || 'Game gagal dimuat.'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [backend]);
  const set = (key, value) => setForm((v) => Object.assign({}, v, { [key]: value }));
  const updateQ = (index, key, value) => setQuestions((old) => old.map((q,i) => i === index ? Object.assign({}, q, { [key]: value }) : q));
  const downloadTemplate = () => {
    try {
      const bytes = GameImportKit.buildTemplate(form.template);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'template-soal-' + form.template + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast.success('Template diunduh. Isi di Excel, simpan, lalu klik Import soal.');
    } catch (e) { setError(e.message || 'Template gagal dibuat.'); }
  };
  const importFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!file || busy) return;
    setBusy(true); setError(''); setImportInfo(null);
    try {
      const res = GameImportKit.parseRows(await GameImportKit.readGrid(file), form.template);
      if (!res.questions.length) { setImportInfo({ file: file.name, ok: 0, errors: res.errors, skipped: res.skipped }); return; }
      const hasContent = questions.some((q) => (q.prompt || '').trim() || (q.pair_left || '').trim());
      const replaced = importReplace && hasContent; const merged = (importReplace || !hasContent) ? res.questions : questions.concat(res.questions);
      if (merged.length > GameImportKit.maxRows) throw new Error('Total soal tidak boleh lebih dari ' + GameImportKit.maxRows + '. Hapus sebagian soal atau centang "Ganti soal yang sudah ada".');
      setQuestions(merged); set('question_count', String(merged.length));
      setImportInfo({ file: file.name, ok: res.questions.length, errors: res.errors, skipped: res.skipped, total: merged.length, replaced });
      toast.success(res.questions.length + ' soal diimport.');
    } catch (e) { setError(e.message || 'File gagal dibaca.'); } finally { setBusy(false); }
  };
  const saveGame = async (status) => {
    if (busy) return; setBusy(true); setError('');
    try {
      const normalized = questions.filter((q) => q.prompt.trim()).map((q) => {
        const type=form.template==='competition'?q.question_type:form.template; let correct_answer;
        if (type === 'letters' || type === 'sentence') correct_answer = q.correctText.split('|').map((x) => x.trim()).filter(Boolean);
        else if (type === 'true_false') correct_answer = q.correctText.trim();
        else if (type === 'memory') correct_answer = q.correctText.trim();
        else correct_answer = q.correctText.trim();
        return { id:q.id, prompt: q.prompt, question_type:type, options: q.optionsText.split('|').map((x) => x.trim()).filter(Boolean), correct_answer, explanation: q.explanation, media_url: q.media_url, pair_left: q.pair_left, pair_right: q.pair_right, pair_left_id:q.pair_left_id, pair_right_id:q.pair_right_id, points: Number(q.points) || 10 };
      });
      if (!normalized.length) throw new Error('Tambahkan sekurangnya satu soal sebelum menyimpan.');
      if (form.template === 'memory') normalized.forEach((q) => { q.pair_map = { pair: 'pair' }; });
      const result = await backend.saveGameDefinition({ game_id:editingId, game: { title: form.title, description: form.description, template: form.template, subject_id: form.subject_id, chapter: form.chapter, material: form.material, difficulty: form.difficulty, status, settings: { modes: form.modes, duration_seconds: Number(form.duration) || 0, question_count: Number(form.question_count) || normalized.length, max_attempts: Number(form.max_attempts) || 0, show_explanation: form.show_explanation, show_leaderboard: form.show_leaderboard, shuffle_questions: form.shuffle_questions, shuffle_options: form.shuffle_options, speed_bonus: form.speed_bonus } }, questions: normalized });
      toast.success(status === 'PUBLISHED' ? 'Game diterbitkan dan siap ditugaskan.' : 'Game draft disimpan.'); setEditingId(null); setForm(defaultGameForm()); setQuestions([newGameQuestion()]); await load();
    } catch(e) { setError(e.message || 'Game gagal disimpan.'); } finally { setBusy(false); }
  };
  const editGame=async(game)=>{setBusy(true);setError('');try{const data=await backend.getTeacherGameEditor(game.id);const g=data.game;setEditingId(g.id);setForm({title:g.title||'',description:g.description||'',template:g.template,subject_id:g.subject_id||'',chapter:g.chapter||'',material:g.material||'',difficulty:g.difficulty||'Sedang',status:g.status,duration:String(g.settings.duration_seconds||0),question_count:String(g.settings.question_count||data.questions.length||1),max_attempts:String(g.settings.max_attempts??1),modes:g.settings.modes||['individual'],show_explanation:g.settings.show_explanation!==false,show_leaderboard:g.settings.show_leaderboard!==false,shuffle_questions:g.settings.shuffle_questions!==false,shuffle_options:g.settings.shuffle_options!==false,speed_bonus:g.settings.speed_bonus===true});setQuestions(data.questions.map((q)=>({id:q.id,prompt:q.prompt,question_type:q.question_type||g.template,optionsText:(q.options||[]).join(' | '),correctText:Array.isArray(q.correct_answer)?q.correct_answer.join(' | '):String(q.correct_answer??''),explanation:q.explanation||'',media_url:q.media_url||'',pair_left:q.pair_left||'',pair_right:q.pair_right||'',pair_left_id:q.pair_left_id,pair_right_id:q.pair_right_id,points:String(q.points||10)})));window.scrollTo({top:0,behavior:'smooth'});}catch(e){setError(e.message||'Data game gagal dibuka.');}finally{setBusy(false);}};
  const assign = async (e) => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await backend.createGameAssignment({ game_id: assignForm.game_id, class_id: assignForm.class_id, start_at: assignForm.start_at ? new Date(assignForm.start_at).toISOString() : null, end_at: assignForm.end_at ? new Date(assignForm.end_at).toISOString() : null, max_attempts: assignForm.max_attempts, modes: assignForm.modes }); toast.success('Game ditugaskan ke kelas.'); setAssignForm((v) => Object.assign({}, v, { class_id: '', start_at: '', end_at: '' })); await load(); } catch(x) { setError(x.message || 'Penugasan gagal dibuat.'); } finally { setBusy(false); } };
  const removeGame = async (g) => {
    if (busy) return;
    const n = (g.assignments || []).length;
    const ok = await confirm({ title: 'Hapus game?', confirmText: 'Hapus game', danger: true,
      message: `Game "${g.title}" akan dihapus permanen beserta soal${n ? ', penugasan di ' + n + ' kelas' : ''}, ruang permainan, dan semua hasil siswa. Nilai game ini di Rekap Nilai juga ikut terhapus. Tindakan ini tidak dapat dibatalkan.` });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      await backend.deleteTeacherGame(g.id);
      if (editingId === g.id) { setEditingId(null); setForm(defaultGameForm()); setQuestions([newGameQuestion()]); }
      toast.success('Game dihapus.'); await load();
    } catch (e) { setError(e.message || 'Game gagal dihapus.'); } finally { setBusy(false); }
  };
  const toggleMode = (key) => setForm((v) => Object.assign({}, v, { modes: v.modes.includes(key) ? v.modes.filter((m) => m !== key) : [...v.modes, key] }));
  const toggleAssignMode = (key) => setAssignForm((v) => Object.assign({}, v, { modes: v.modes.includes(key) ? v.modes.filter((m) => m !== key) : [...v.modes, key] }));
  const selected = catalog.find((g) => g.id === assignForm.game_id);
  return <>
    <PageHead title="Manajemen Game" desc={'Kelola enam template, bank soal, pengaturan, dan penugasan kelas.' + (backend.mode === 'demo' ? ' Soal dan skor dikelola oleh backend DEMO lokal.' : '')} actions={<button className="btn btn-outline" onClick={load} disabled={loading}><Icon name="RefreshCw" size={16}/>Perbarui</button>} />
    {backend.mode === 'demo' && <Alert tone="warn" title="Batas DEMO lokal">Game, soal, akun, dan hasil tersimpan hanya pada browser ini. Jangan gunakan kredensial atau nilai produksi. Hasil lintas perangkat tidak tersinkron otomatis.</Alert>}
    {error && <Alert tone="err" title="Tidak dapat memproses game">{error}</Alert>}
    <div className="card card-pad"><div className="card-title mb-12">{editingId?'Edit game dan bank soal':'Buat game dan bank soal'}</div>
      <div className="game-form-grid">
        <Field label="Nama game" required><input className="input" value={form.title} onChange={(e)=>set('title',e.target.value)} /></Field>
        <Field label="Template permainan" required><select className="input" value={form.template} onChange={(e)=>set('template',e.target.value)}>{GAME_TEMPLATES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Mata pelajaran"><select className="input" value={form.subject_id} onChange={(e)=>set('subject_id',e.target.value)}><option value="">Pilih mapel</option>{subjects.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Kesulitan"><select className="input" value={form.difficulty} onChange={(e)=>set('difficulty',e.target.value)}>{['Mudah','Sedang','Sulit'].map((x)=><option key={x}>{x}</option>)}</select></Field>
        <Field label="BAB"><input className="input" value={form.chapter} onChange={(e)=>set('chapter',e.target.value)} placeholder="Contoh: BAB 1" /></Field>
        <Field label="Materi"><input className="input" value={form.material} onChange={(e)=>set('material',e.target.value)} /></Field>
        <Field label="Deskripsi"><input className="input" value={form.description} onChange={(e)=>set('description',e.target.value)} /></Field>
        <Field label="Durasi (detik, 0 = tanpa batas)"><input className="input" type="number" min="0" value={form.duration} onChange={(e)=>set('duration',e.target.value)} /></Field>
        <Field label="Jumlah soal yang dipakai"><input className="input" type="number" min="1" value={form.question_count} onChange={(e)=>set('question_count',e.target.value)} /></Field>
        <Field label="Batas percobaan individu (0 = tanpa batas)"><input className="input" type="number" min="0" value={form.max_attempts} onChange={(e)=>set('max_attempts',e.target.value)} /></Field>
      </div>
      <div className="row-wrap mt-12">{[['individual','Individu'],['live','Live Game Room']].map(([id,label])=><label className="game-check" key={id}><input type="checkbox" checked={form.modes.includes(id)} onChange={()=>toggleMode(id)}/>{label}</label>)}{[['shuffle_questions','Acak soal'],['shuffle_options','Acak pilihan'],['show_explanation','Tampilkan pembahasan'],['show_leaderboard','Leaderboard sesi'],['speed_bonus','Bonus kecepatan']].map(([id,label])=><label className="game-check" key={id}><input type="checkbox" checked={form[id]} onChange={(e)=>set(id,e.target.checked)}/>{label}</label>)}</div>
      <div className="card-title mt-16 mb-8">Soal</div>
      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
        <div className="row-wrap" style={{ alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={downloadTemplate} disabled={busy}>Unduh template (.xlsx)</button>
          <label className="btn btn-outline btn-sm" style={{ cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>Import soal dari file<input type="file" accept=".xlsx,.csv,.txt,.tsv" style={{ display: 'none' }} onChange={importFile} disabled={busy} /></label>
          <label className="game-check"><input type="checkbox" checked={importReplace} onChange={(e) => setImportReplace(e.target.checked)} />Ganti soal yang sudah ada</label>
        </div>
        <div className="small muted mt-8">Template mengikuti jenis game yang dipilih ({(GameImportKit.defs[form.template] || {}).label}). Isi di Excel, simpan sebagai .xlsx atau CSV UTF-8, lalu import. Soal muncul di bawah dan masih bisa diedit sebelum disimpan.</div>
        {importInfo && <div className="mt-8"><Alert tone={importInfo.ok ? (importInfo.errors.length ? 'warn' : 'ok') : 'err'} title={importInfo.ok ? importInfo.ok + ' soal diimport dari ' + importInfo.file : 'Tidak ada soal yang diimport'}>
          {importInfo.ok > 0 && <div>Total soal sekarang {importInfo.total}{importInfo.replaced ? ' (soal lama diganti)' : ''}. "Jumlah soal yang dipakai" diatur ke {importInfo.total}; ubah jika game hanya memakai sebagian soal. Periksa dulu, lalu klik Simpan draft atau Terbitkan.</div>}
          {importInfo.ok === 0 && !importInfo.errors.length && <div>Tidak ada baris soal yang terbaca{importInfo.skipped ? ' (' + importInfo.skipped + ' baris contoh dilewati)' : ''}. Isi soal Anda di baris di bawah baris contoh.</div>}
          {importInfo.errors.length > 0 && <><div>{importInfo.errors.length} baris tidak diimport:</div><ul>{importInfo.errors.slice(0, 20).map((m, i) => <li key={i}>{m}</li>)}</ul>{importInfo.errors.length > 20 && <div>…dan {importInfo.errors.length - 20} lainnya.</div>}</>}
        </Alert></div>}
      </div>
      {questions.map((q,i)=><div className="game-question-editor" key={i}><div className="row between"><b>Soal {i+1}</b>{questions.length>1&&<button className="btn btn-ghost btn-sm" type="button" onClick={()=>setQuestions((v)=>v.filter((_,j)=>j!==i))}>Hapus</button>}</div>
        <Field label="Pertanyaan / petunjuk"><textarea className="input" rows="2" value={q.prompt} onChange={(e)=>updateQ(i,'prompt',e.target.value)} /></Field>
        {form.template==='competition'&&<Field label="Jenis soal kompetisi"><select className="input" value={q.question_type} onChange={(e)=>updateQ(i,'question_type',e.target.value)}>{[['mcq','Pilihan ganda'],['true_false','Benar/salah'],['vocab','Kosakata'],['letters','Susun huruf'],['sentence','Susun kalimat']].map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></Field>}
        {form.template==='memory'?<div className="game-form-grid"><Field label="Kartu pertama (mis. Arab)"><input className="input" dir="auto" value={q.pair_left} onChange={(e)=>updateQ(i,'pair_left',e.target.value)}/></Field><Field label="Kartu pasangan (arti/gambar URL)"><input className="input" dir="auto" value={q.pair_right} onChange={(e)=>updateQ(i,'pair_right',e.target.value)}/></Field><Field label="Kunci pasangan"><input className="input" value={q.correctText||'pair'} onChange={(e)=>updateQ(i,'correctText',e.target.value)} placeholder="pair"/></Field></div> : <div className="game-form-grid">{['who_am_i','competition'].includes(form.template)&&!['true_false','letters','sentence'].includes(form.template==='competition'?q.question_type:form.template)&&<Field label="Pilihan dipisahkan dengan |"><input className="input" dir="auto" value={q.optionsText} onChange={(e)=>updateQ(i,'optionsText',e.target.value)} placeholder="قَلَمٌ | كِتَابٌ | بَيْتٌ | مَدْرَسَةٌ"/></Field>}{['letters','sentence'].includes(form.template==='competition'?q.question_type:form.template)&&<Field label="Huruf/kata acak dipisahkan dengan |"><input className="input" dir="auto" value={q.optionsText} onChange={(e)=>updateQ(i,'optionsText',e.target.value)} placeholder="ك | ت | ا | ب"/></Field>}<Field label={['letters','sentence'].includes(form.template==='competition'?q.question_type:form.template)?'Jawaban benar, urutkan token dengan |':'Jawaban benar'}><input className="input" dir="auto" value={q.correctText} onChange={(e)=>updateQ(i,'correctText',e.target.value)} placeholder={(form.template==='true_false'||q.question_type==='true_false')?'صَحِيحٌ atau خَطَأٌ':form.template==='letters'||q.question_type==='letters'?'ك | ت | ا | ب':form.template==='sentence'||q.question_type==='sentence'?'أَنَا | أَذْهَبُ | إِلَى | الْمَدْرَسَةِ':''}/></Field></div>}
        <div className="game-form-grid mt-8"><Field label="URL gambar (opsional)"><input className="input" type="url" value={q.media_url} onChange={(e)=>updateQ(i,'media_url',e.target.value)}/></Field><Field label="Pembahasan"><input className="input" dir="auto" value={q.explanation} onChange={(e)=>updateQ(i,'explanation',e.target.value)}/></Field><Field label="Bobot skor"><input className="input" type="number" min="0" value={q.points} onChange={(e)=>updateQ(i,'points',e.target.value)}/></Field></div>
      </div>)}
      <div className="row-wrap mt-12"><button className="btn btn-outline" type="button" onClick={()=>setQuestions((v)=>[...v,newGameQuestion()])}><Icon name="Plus" size={15}/>Tambah soal</button>{editingId&&<button className="btn btn-outline" type="button" disabled={busy} onClick={()=>{setEditingId(null);setForm(defaultGameForm());setQuestions([newGameQuestion()]);}}>Batal edit</button>}<button className="btn btn-outline" type="button" disabled={busy} onClick={()=>saveGame('DRAFT')}>{busy&&<Spinner/>}Simpan draft</button><button className="btn btn-primary" type="button" disabled={busy} onClick={()=>saveGame('PUBLISHED')}>{busy&&<Spinner/>}{editingId?'Simpan dan terbitkan':'Terbitkan game'}</button></div>
    </div>
    <section className="card card-pad mt-16"><div className="card-title mb-12">Tugaskan game terbit</div><form className="game-form-grid" onSubmit={assign}><Field label="Game"><select className="input" required value={assignForm.game_id} onChange={(e)=>setAssignForm((v)=>Object.assign({},v,{game_id:e.target.value}))}><option value="">Pilih game</option>{catalog.filter((g)=>g.status==='PUBLISHED').map((g)=><option key={g.id} value={g.id}>{g.title}</option>)}</select></Field><Field label="Kelas sasaran"><select className="input" required value={assignForm.class_id} onChange={(e)=>setAssignForm((v)=>Object.assign({},v,{class_id:e.target.value}))}><option value="">Pilih kelas</option>{classes.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Mulai (opsional)"><input className="input" type="datetime-local" value={assignForm.start_at} onChange={(e)=>setAssignForm((v)=>Object.assign({},v,{start_at:e.target.value}))}/></Field><Field label="Berakhir (opsional)"><input className="input" type="datetime-local" value={assignForm.end_at} onChange={(e)=>setAssignForm((v)=>Object.assign({},v,{end_at:e.target.value}))}/></Field><Field label="Batas percobaan individu"><input className="input" type="number" min="0" value={assignForm.max_attempts} onChange={(e)=>setAssignForm((v)=>Object.assign({},v,{max_attempts:e.target.value}))}/></Field><div className="row-wrap">{[['individual','Individu'],['live','Live']].map(([id,label])=><label className="game-check" key={id}><input type="checkbox" checked={assignForm.modes.includes(id)} onChange={()=>toggleAssignMode(id)}/>{label}</label>)}</div><div><button className="btn btn-primary" disabled={busy||!selected}>{busy&&<Spinner/>}Tugaskan</button></div></form></section>
    <div className="card-title mt-16">Game Anda</div>
    {loading?<div className="card card-pad"><LoadingState/></div>:!catalog.length?<div className="card card-pad"><EmptyState icon="Gamepad2" title="Belum ada game" text="Buat game dengan soal lalu terbitkan untuk mulai menugaskan."/></div>:<div className="student-card-list">{catalog.map((g)=><article className="card card-pad" key={g.id}><div className="row between"><div><div className="eyebrow">{(GAME_TEMPLATES.find((x)=>x[0]===g.template)||[])[1]||g.template} · {g.subject_name}</div><h3>{g.title}</h3></div><Badge tone={g.status==='PUBLISHED'?'green':'amber'}>{g.status==='PUBLISHED'?'Terbit':'Draft'}</Badge></div><p>{g.description||'—'} · {g.question_count} soal · {g.assignments.length} kelas ditugaskan</p>{g.assignments.map((a)=><div className="small muted" key={a.id}>{a.class_name} · {a.enabled===false?'Nonaktif':'Aktif'} · {(a.modes||[]).join(', ')}</div>)}<button className="btn btn-outline btn-sm mt-8" type="button" onClick={()=>editGame(g)} disabled={busy}>Edit game / soal</button> <button className="btn btn-outline btn-sm mt-8" type="button" style={{ color: 'var(--red)' }} onClick={()=>removeGame(g)} disabled={busy}><Icon name="Trash2" size={15}/>Hapus</button></article>)}</div>}
  </>;
}
Object.assign(window,{AdminGamePage});
