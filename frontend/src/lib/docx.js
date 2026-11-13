// A Word document (.docx) turned into HTML that looks the same: fonts, sizes,
// colours, highlights, spacing, line spacing, indents, alignment, borders,
// numbered and bulleted lists, tables (merged cells, shading, borders, table
// designs), pictures, links, text boxes and footnotes. Everything is written
// as inline styles, so the blog shows the document as it was written. The
// backend keeps only the styles it allows (backend/src/lib/docHtml.js).
import JSZip from 'jszip';

const round = (n) => Math.round(n * 100) / 100;
const pt = (n) => `${round(n)}pt`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el, name) => (el ? [...el.children].find((c) => c.localName === name) || null : null);
const deep = (el, name) => (el ? [...el.getElementsByTagName('*')].filter((c) => c.localName === name) : []);
const val = (el, name = 'val') => (el ? el.getAttribute(`w:${name}`) : null);
const yes = (v) => v === '1' || v === 'true' || v === 'on';
// A switch such as <w:b/> is on unless it says otherwise.
const on = (el) => !['0', 'false', 'off', 'none'].includes(val(el) ?? 'true');
const hex = (v) => (v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : null);
const css = (map) =>
  Object.entries(map)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
const TAMIL = /[஀-௿]/;
const EMU_PX = 9525;

const HIGHLIGHT = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
};
// Symbol and Wingdings characters, as the plain characters they look like.
const SYMBOLS = {
  '': '•', '·': '•', '': '▪', '§': '▪', '': '➢', '': '✓', 'ü': '✓',
  '': '❖', '': '■', '': '□', '': '❑', '': '➢', '': '⇨', '': '→',
  '': '➔', '': '✗', '': '☑', '': '●', '': '○', '': '◆', '': '◆',
};
const symbol = (ch, font = '') => {
  if (ch === 'o' && /courier/i.test(font)) return '◦';
  if (SYMBOLS[ch]) return SYMBOLS[ch];
  const code = ch.charCodeAt(0);
  return code >= 0xf000 && code <= 0xf0ff ? '•' : ch;
};

const SERIF = /times|cambria|georgia|garamond|book antiqua|palatino|century|baskerville|caladea|serif/i;
function fontStack(name, tamil) {
  const clean = String(name || '').replace(/[^\w -]/g, '').trim();
  const parts = clean ? [`'${clean}'`] : [];
  if (/^calibri/i.test(clean)) parts.push("'Carlito'");
  if (/^cambria/i.test(clean)) parts.push("'Caladea'");
  // Aptos (Word's newer default) is rarely on a visitor's device; these look closest.
  if (/^aptos/i.test(clean)) parts.push("'Segoe UI'", "'Helvetica Neue'", "'Arial'");
  if (tamil) parts.push("'Nirmala UI'", "'Latha'", "'Noto Sans Tamil'");
  const generic = /mono|courier|consolas/i.test(clean) ? 'monospace' : SERIF.test(clean) && !/sans/i.test(clean) ? 'serif' : 'sans-serif';
  return [...parts, generic].join(', ');
}

function border(c) {
  const v = val(c);
  if (!v || v === 'nil' || v === 'none') return 'none';
  const width = Math.max(0.25, (Number(val(c, 'sz')) || 4) / 8);
  const style = v === 'double' ? 'double' : v.startsWith('dot') ? 'dotted' : v.startsWith('dash') ? 'dashed' : 'solid';
  const color = hex(val(c, 'color')) || '#000000';
  // A double line needs room for two lines and the gap between them.
  return `${pt(style === 'double' ? Math.max(width * 3, 2.25) : width)} ${style} ${color}`;
}
function readBorders(el) {
  const out = {};
  for (const c of el?.children || []) {
    const edge = { start: 'left', end: 'right' }[c.localName] || c.localName;
    out[edge] = border(c);
  }
  return out;
}
function readMargins(el) {
  const out = {};
  for (const c of el?.children || []) {
    const edge = { start: 'left', end: 'right' }[c.localName] || c.localName;
    const w = Number(val(c, 'w'));
    if (!Number.isNaN(w) && (val(c, 'type') || 'dxa') === 'dxa') out[edge] = w / 20;
  }
  return out;
}

const LETTERS = (n) => {
  const letter = String.fromCharCode(65 + ((n - 1) % 26));
  return letter.repeat(Math.floor((n - 1) / 26) + 1);
};
const ROMAN = (n) => {
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
};
function numberText(n, format) {
  switch (format) {
    case 'lowerLetter': return LETTERS(n).toLowerCase();
    case 'upperLetter': return LETTERS(n);
    case 'lowerRoman': return ROMAN(n).toLowerCase();
    case 'upperRoman': return ROMAN(n);
    case 'decimalZero': return n < 10 ? `0${n}` : String(n);
    case 'none': return '';
    default: return String(n);
  }
}

// Turns a .docx file into { html, text, notes }. `upload(blob)` stores one
// picture and returns its address. `onProgress(text)` reports the step.
export async function docxToHtml(file, { upload, onProgress = () => {} } = {}) {
  if (!/\.docx$/i.test(file.name || '') && file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error(/\.doc$/i.test(file.name || '') ? 'This is an older Word file (.doc). In Word, choose File → Save As → Word Document (.docx), then upload that.' : 'Please choose a Word document (.docx).');
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This Word document could not be opened. Save it again in Word as a .docx and try once more.');
  }
  const xml = async (path) => {
    const part = zip.file(path);
    return part ? new DOMParser().parseFromString(await part.async('string'), 'application/xml') : null;
  };
  const relsOf = async (path) => {
    const rels = {};
    const doc = await xml(path);
    for (const r of doc ? [...doc.getElementsByTagName('Relationship')] : []) {
      rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' };
    }
    return rels;
  };

  const main = await xml('word/document.xml');
  if (!main) throw new Error('This file is not a Word document.');
  const notes = new Set(); // what could not be kept, said once each

  // ---- Theme fonts ----
  const theme = { major: '', minor: '', tamil: '' };
  const themeDoc = await xml('word/theme/theme1.xml');
  if (themeDoc) {
    const latin = (tag) => themeDoc.getElementsByTagName(tag)[0]?.getElementsByTagName('a:latin')[0]?.getAttribute('typeface') || '';
    theme.major = latin('a:majorFont');
    theme.minor = latin('a:minorFont');
    const minor = themeDoc.getElementsByTagName('a:minorFont')[0];
    theme.tamil = [...(minor?.getElementsByTagName('a:font') || [])].find((f) => f.getAttribute('script') === 'Taml')?.getAttribute('typeface') || '';
  }
  const themeFont = (name) => (!name ? '' : name.startsWith('major') ? theme.major : name.startsWith('minor') ? theme.minor : '');

  // ---- Reading properties ----
  function readRPr(el) {
    const r = {};
    for (const c of el?.children || []) {
      switch (c.localName) {
        case 'rStyle': r.style = val(c); break;
        case 'b': r.b = on(c); break;
        case 'bCs': r.bCs = on(c); break;
        case 'i': r.i = on(c); break;
        case 'iCs': r.iCs = on(c); break;
        case 'u': {
          const v = val(c);
          r.u = v && v !== 'none' ? v : false;
          r.uColor = hex(val(c, 'color'));
          break;
        }
        case 'strike':
        case 'dstrike': r.strike = on(c); break;
        case 'caps': r.caps = on(c); break;
        case 'smallCaps': r.smallCaps = on(c); break;
        case 'vanish': r.vanish = on(c); break;
        case 'color': r.color = val(c) === 'auto' ? 'auto' : hex(val(c)) || r.color; break;
        case 'highlight': r.highlight = HIGHLIGHT[val(c)] || null; break;
        case 'shd': {
          const fill = val(c, 'fill');
          r.shd = fill && fill !== 'auto' ? hex(fill) : null;
          break;
        }
        case 'sz': r.sz = Number(val(c)) / 2; break;
        case 'szCs': r.szCs = Number(val(c)) / 2; break;
        case 'rFonts': {
          const font = val(c, 'ascii') || val(c, 'hAnsi') || themeFont(val(c, 'asciiTheme') || val(c, 'hAnsiTheme'));
          if (font) r.font = font;
          const cs = val(c, 'cs') || themeFont(val(c, 'cstheme'));
          if (cs) r.fontCs = cs;
          break;
        }
        case 'vertAlign': r.vertAlign = val(c); break;
        case 'spacing': r.spacing = Number(val(c)) / 20; break;
        case 'position': r.position = Number(val(c)) / 2; break;
        default:
      }
    }
    return r;
  }
  function readPPr(el) {
    const p = {};
    for (const c of el?.children || []) {
      switch (c.localName) {
        case 'pStyle': p.style = val(c); break;
        case 'jc': p.jc = val(c); break;
        case 'spacing': {
          const before = val(c, 'before');
          const after = val(c, 'after');
          const line = val(c, 'line');
          if (before != null) p.before = Number(before) / 20;
          if (after != null) p.after = Number(after) / 20;
          if (yes(val(c, 'beforeAutospacing'))) p.before = 14;
          if (yes(val(c, 'afterAutospacing'))) p.after = 14;
          if (line != null) {
            p.line = Number(line);
            p.lineRule = val(c, 'lineRule') || 'auto';
          }
          break;
        }
        case 'ind': {
          const get = (name) => (val(c, name) == null ? undefined : Number(val(c, name)) / 20);
          const left = get('left') ?? get('start');
          const right = get('right') ?? get('end');
          if (left !== undefined) p.left = left;
          if (right !== undefined) p.right = right;
          const hanging = get('hanging');
          const first = get('firstLine');
          if (hanging !== undefined) p.first = -hanging;
          else if (first !== undefined) p.first = first;
          break;
        }
        case 'numPr': {
          const id = val(kid(c, 'numId'));
          const level = val(kid(c, 'ilvl'));
          if (id != null) p.numId = id;
          if (level != null) p.ilvl = Number(level);
          break;
        }
        case 'shd': {
          const fill = val(c, 'fill');
          p.shd = fill && fill !== 'auto' ? hex(fill) : null;
          break;
        }
        case 'pBdr': p.borders = readBorders(c); break;
        case 'contextualSpacing': p.contextual = on(c); break;
        case 'rPr': p.mark = readRPr(c); break;
        default:
      }
    }
    return p;
  }
  const readTblPr = (el) => {
    const t = {};
    if (!el) return t;
    t.style = val(kid(el, 'tblStyle'));
    const borders = kid(el, 'tblBorders');
    if (borders) t.borders = readBorders(borders);
    const mar = kid(el, 'tblCellMar');
    if (mar) t.cellMar = readMargins(mar);
    const width = kid(el, 'tblW');
    if (width) t.width = { type: val(width, 'type'), w: Number(val(width, 'w')) };
    const jc = kid(el, 'jc');
    if (jc) t.jc = val(jc);
    const ind = kid(el, 'tblInd');
    if (ind) t.ind = Number(val(ind, 'w')) / 20;
    const layout = kid(el, 'tblLayout');
    if (layout) t.fixed = val(layout, 'type') === 'fixed';
    const shd = kid(el, 'shd');
    if (shd && val(shd, 'fill') && val(shd, 'fill') !== 'auto') t.shd = hex(val(shd, 'fill'));
    return t;
  };
  const readTcPr = (el) => {
    const t = {};
    if (!el) return t;
    const borders = kid(el, 'tcBorders');
    if (borders) t.borders = readBorders(borders);
    const shd = kid(el, 'shd');
    if (shd) t.shd = val(shd, 'fill') && val(shd, 'fill') !== 'auto' ? hex(val(shd, 'fill')) : null;
    const span = kid(el, 'gridSpan');
    if (span) t.span = Number(val(span)) || 1;
    const merge = kid(el, 'vMerge');
    if (merge) t.vMerge = val(merge) === 'restart' ? 'restart' : 'continue';
    const align = kid(el, 'vAlign');
    if (align) t.vAlign = { center: 'middle', both: 'middle', bottom: 'bottom' }[val(align)] || 'top';
    const mar = kid(el, 'tcMar');
    if (mar) t.mar = readMargins(mar);
    const width = kid(el, 'tcW');
    if (width) t.width = { type: val(width, 'type'), w: Number(val(width, 'w')) };
    return t;
  };

  // ---- Styles ----
  const stylesDoc = await xml('word/styles.xml');
  const rawStyles = {};
  let defaultPara = null;
  let defaultTable = null;
  const defaults = { p: {}, r: {} };
  if (stylesDoc) {
    const root = stylesDoc.documentElement;
    const docDefaults = kid(root, 'docDefaults');
    defaults.r = readRPr(kid(kid(docDefaults, 'rPrDefault'), 'rPr'));
    defaults.p = readPPr(kid(kid(docDefaults, 'pPrDefault'), 'pPr'));
    for (const s of kids(root, 'style')) {
      const id = val(s, 'styleId');
      const type = val(s, 'type');
      if (yes(s.getAttribute('w:default'))) {
        if (type === 'paragraph') defaultPara = id;
        if (type === 'table') defaultTable = id;
      }
      rawStyles[id] = {
        type,
        name: (val(kid(s, 'name')) || '').toLowerCase(),
        basedOn: val(kid(s, 'basedOn')),
        p: readPPr(kid(s, 'pPr')),
        r: readRPr(kid(s, 'rPr')),
        tbl: readTblPr(kid(s, 'tblPr')),
        tc: readTcPr(kid(s, 'tcPr')),
        cond: Object.fromEntries(
          kids(s, 'tblStylePr').map((c) => [val(c, 'type'), { p: readPPr(kid(c, 'pPr')), r: readRPr(kid(c, 'rPr')), tc: readTcPr(kid(c, 'tcPr')) }]),
        ),
      };
    }
  }
  const resolved = {};
  const mergeCond = (a = {}, b = {}) => {
    const out = { ...a };
    for (const [type, part] of Object.entries(b)) {
      const was = out[type] || { p: {}, r: {}, tc: {} };
      out[type] = { p: { ...was.p, ...part.p }, r: { ...was.r, ...part.r }, tc: { ...was.tc, ...part.tc, borders: { ...was.tc.borders, ...part.tc.borders } } };
    }
    return out;
  };
  function style(id) {
    if (!id || !rawStyles[id]) return null;
    if (resolved[id]) return resolved[id];
    const s = rawStyles[id];
    resolved[id] = { name: s.name, p: s.p, r: s.r, tbl: s.tbl, tc: s.tc, cond: s.cond }; // a loop in basedOn stops here
    const base = s.basedOn && s.basedOn !== id ? style(s.basedOn) : null;
    const { style: _p, ...ownP } = s.p;
    resolved[id] = {
      name: s.name,
      p: { ...base?.p, ...ownP },
      r: { ...base?.r, ...s.r },
      tbl: { ...base?.tbl, ...s.tbl, borders: { ...base?.tbl?.borders, ...s.tbl.borders }, cellMar: { ...base?.tbl?.cellMar, ...s.tbl.cellMar } },
      tc: { ...base?.tc, ...s.tc },
      cond: mergeCond(base?.cond, s.cond),
    };
    return resolved[id];
  }

  // ---- Numbering (lists) ----
  const numberingDoc = await xml('word/numbering.xml');
  const abstracts = {};
  const nums = {};
  if (numberingDoc) {
    const root = numberingDoc.documentElement;
    for (const a of kids(root, 'abstractNum')) {
      const levels = {};
      for (const l of kids(a, 'lvl')) {
        const start = val(kid(l, 'start'));
        levels[Number(val(l, 'ilvl'))] = {
          start: start == null ? 1 : Number(start),
          format: val(kid(l, 'numFmt')) || 'decimal',
          text: val(kid(l, 'lvlText')) ?? '',
          suffix: val(kid(l, 'suff')) || 'tab',
          p: readPPr(kid(l, 'pPr')),
          r: readRPr(kid(l, 'rPr')),
        };
      }
      abstracts[val(a, 'abstractNumId')] = levels;
    }
    for (const n of kids(root, 'num')) {
      const starts = {};
      for (const o of kids(n, 'lvlOverride')) {
        const start = kid(o, 'startOverride');
        if (start) starts[Number(val(o, 'ilvl'))] = Number(val(start));
      }
      nums[val(n, 'numId')] = { abstract: val(kid(n, 'abstractNumId')), starts };
    }
  }
  const counters = {};
  const levelOf = (numId, ilvl) => {
    const num = nums[numId];
    const level = num && abstracts[num.abstract]?.[ilvl];
    return level ? { ...level, start: num.starts[ilvl] ?? level.start } : null;
  };
  function listMarker(numId, ilvl) {
    const level = levelOf(numId, ilvl);
    if (!level) return null;
    const count = (counters[numId] ||= []);
    count[ilvl] = (count[ilvl] ?? level.start - 1) + 1;
    count.length = ilvl + 1; // a deeper list starts again
    if (level.format === 'none') return { level, text: '' };
    if (level.format === 'bullet') return { level, text: [...level.text].map((ch) => symbol(ch, level.r.font)).join(''), bullet: true };
    const text = level.text.replace(/%(\d)/g, (_, n) => {
      const at = Number(n) - 1;
      const other = levelOf(numId, at);
      return numberText(count[at] ?? other?.start ?? 1, at === ilvl ? level.format : other?.format);
    });
    return { level, text };
  }

  // ---- The page ----
  const body = kid(main.documentElement, 'body');
  const section = kid(body, 'sectPr');
  const pageWidth = Number(val(kid(section, 'pgSz'), 'w')) || 12240;
  const margins = kid(section, 'pgMar');
  const contentWidth = (pageWidth - (Number(val(margins, 'left')) || 1440) - (Number(val(margins, 'right')) || 1440)) / 20; // in points
  const background = hex(val(kid(main.documentElement, 'background'), 'color'));

  // The document's own base: its default font, size and colour.
  const baseRun = { ...defaults.r, ...style(defaultPara)?.r };
  const INHERITED = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'text-transform', 'font-variant', 'letter-spacing'];
  function runMap(r, tamil) {
    const size = (tamil ? r.szCs ?? r.sz : r.sz) ?? 10;
    const raised = r.vertAlign === 'superscript' || r.vertAlign === 'subscript';
    const lines = [r.u && 'underline', r.strike && 'line-through'].filter(Boolean);
    const u = String(r.u || '');
    return {
      'font-family': fontStack((tamil ? r.fontCs || theme.tamil || r.font : r.font) || theme.minor, tamil),
      'font-size': pt(raised ? size * 0.65 : size),
      'font-weight': (tamil ? r.bCs ?? r.b : r.b) ? 'bold' : 'normal',
      'font-style': (tamil ? r.iCs ?? r.i : r.i) ? 'italic' : 'normal',
      color: r.color && r.color !== 'auto' ? r.color : '#000000',
      'text-transform': r.caps ? 'uppercase' : 'none',
      'font-variant': r.smallCaps ? 'small-caps' : 'normal',
      'letter-spacing': r.spacing ? pt(r.spacing) : 'normal',
      'text-decoration-line': lines.join(' ') || 'none',
      'text-decoration-style': u === 'double' ? 'double' : /dot/i.test(u) ? 'dotted' : /dash/i.test(u) ? 'dashed' : /wav/i.test(u) ? 'wavy' : 'solid',
      'text-decoration-color': r.uColor || 'currentcolor',
      'background-color': r.highlight || r.shd || 'transparent',
      'vertical-align': r.vertAlign === 'superscript' ? 'super' : r.vertAlign === 'subscript' ? 'sub' : r.position ? pt(r.position) : 'baseline',
    };
  }
  const OWN_DEFAULTS = { 'text-decoration-line': 'none', 'text-decoration-style': 'solid', 'text-decoration-color': 'currentcolor', 'background-color': 'transparent', 'vertical-align': 'baseline' };
  const pick = (map, keys) => Object.fromEntries(keys.map((k) => [k, map[k]]));
  // The style a piece of text needs on top of what it sits in.
  const diff = (map, parent) => {
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const from = INHERITED.includes(k) ? parent[k] : OWN_DEFAULTS[k];
      if (v !== from) out[k] = v;
    }
    // Only the line's own pieces show a line style or colour.
    if (out['text-decoration-line'] === undefined) {
      delete out['text-decoration-style'];
      delete out['text-decoration-color'];
    }
    return out;
  };
  const baseMap = pick(runMap(baseRun, false), INHERITED);

  // ---- Pictures ----
  const uploaded = {};
  let pictureCount = 0;
  async function picture(rels, id, widthPx, heightPx, extra = {}) {
    const rel = rels[id];
    if (!rel || rel.external) return '';
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target.replace(/^\.\//, '')}`;
    const part = zip.file(path.replace(/[^/]+\/\.\.\//g, ''));
    if (!part) return '';
    const ext = path.split('.').pop().toLowerCase();
    const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext];
    if (!type) {
      notes.add('Some drawings saved in an old Office format (EMF or WMF) cannot be shown on websites, so they were left out. Paste them into Word again as pictures (PNG or JPG) to include them.');
      return '';
    }
    if (!uploaded[path]) {
      pictureCount += 1;
      onProgress(`Uploading picture ${pictureCount}…`);
      let blob = new Blob([await part.async('arraybuffer')], { type });
      // Pictures browsers can draw but the site does not store are redrawn as PNG.
      if (type === 'image/bmp' || type === 'image/svg+xml') blob = await redraw(blob);
      uploaded[path] = upload(blob);
    }
    const url = await uploaded[path];
    const w = Math.round(widthPx);
    const h = Math.round(heightPx);
    const style = css({ width: w ? `${w}px` : '', 'max-width': '100%', height: 'auto', ...extra });
    return `<img src="${esc(url)}" alt=""${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} style="${style}">`;
  }
  async function drawing(el, ctx) {
    const blip = deep(el, 'blip')[0];
    const extent = deep(el, 'extent')[0];
    const anchor = deep(el, 'anchor')[0] || (el.localName === 'anchor' ? el : null);
    let html = '';
    if (blip) {
      const width = Number(extent?.getAttribute('cx')) / EMU_PX;
      const height = Number(extent?.getAttribute('cy')) / EMU_PX;
      let extra = {};
      // A picture placed beside the text: to the left, to the right or on its own.
      if (anchor && !kid(anchor, 'wrapNone') && !kid(anchor, 'wrapTopAndBottom')) {
        const position = kid(anchor, 'positionH');
        const align = kid(position, 'align')?.textContent;
        const offset = Number(kid(position, 'posOffset')?.textContent || 0) / 12700; // points
        const side = align === 'right' || align === 'outside' ? 'right' : align === 'center' ? null : align ? 'left' : offset > contentWidth / 2 ? 'right' : 'left';
        const gap = (name) => `${Math.round(Number(anchor.getAttribute(name) || 114300) / EMU_PX)}px`;
        extra = side ? { float: side, [`margin-${side === 'left' ? 'right' : 'left'}`]: gap(side === 'left' ? 'distR' : 'distL'), 'margin-bottom': gap('distB') } : { display: 'block', 'margin-left': 'auto', 'margin-right': 'auto' };
      } else if (anchor) {
        extra = { display: 'block', 'margin-left': 'auto', 'margin-right': 'auto' };
      }
      html += await picture(ctx.rels, blip.getAttribute('r:embed'), width, height, extra);
    }
    // Words in a text box follow the picture, as their own lines.
    for (const box of deep(el, 'txbxContent')) ctx.boxes.push(await blocks(box, ctx));
    return html;
  }
  async function vml(el, ctx) {
    let html = '';
    const image = deep(el, 'imagedata')[0];
    if (image) {
      const shape = deep(el, 'shape')[0];
      const style = shape?.getAttribute('style') || '';
      const size = (name) => {
        const m = new RegExp(`${name}:([\\d.]+)(pt|in|px)`).exec(style);
        return m ? Number(m[1]) * ({ pt: 4 / 3, in: 96, px: 1 }[m[2]]) : 0;
      };
      html += await picture(ctx.rels, image.getAttribute('r:id'), size('width'), size('height'));
    }
    for (const box of deep(el, 'txbxContent')) ctx.boxes.push(await blocks(box, ctx));
    return html;
  }

  // ---- Footnotes and endnotes ----
  const noteNumbers = { footnote: {}, endnote: {} };
  const noteOrder = { footnote: [], endnote: [] };
  const noteNumber = (kind, id) => {
    if (!noteNumbers[kind][id]) {
      noteOrder[kind].push(id);
      noteNumbers[kind][id] = noteOrder[kind].length;
    }
    return noteNumbers[kind][id];
  };

  // ---- Fields: a link written as a field, and text that only works in Word ----
  const fields = [];
  const linkNow = () => [...fields].reverse().find((f) => f.result && f.href)?.href || null;
  const hidingCode = () => fields.some((f) => !f.result);

  // ---- Text inside a paragraph ----
  // Pieces are text (with its style and link) or ready HTML (pictures, breaks).
  async function inline(el, ctx, R, paraMap, pieces, href = null) {
    for (const c of el.children) {
      switch (c.localName) {
        case 'r':
          await run(c, ctx, R, paraMap, pieces, href);
          break;
        case 'hyperlink': {
          const rel = ctx.rels[c.getAttribute('r:id')];
          const link = rel?.external ? rel.target : null;
          await inline(c, ctx, R, paraMap, pieces, link || href);
          break;
        }
        case 'fldSimple': {
          const m = /HYPERLINK\s+"([^"]+)"/.exec(val(c, 'instr') || '');
          await inline(c, ctx, R, paraMap, pieces, m ? m[1] : href);
          break;
        }
        case 'ins':
        case 'smartTag':
        case 'customXml':
        case 'dir':
        case 'bdo':
          await inline(c, ctx, R, paraMap, pieces, href);
          break;
        case 'sdt':
          await inline(kid(c, 'sdtContent') || c, ctx, R, paraMap, pieces, href);
          break;
        case 'oMath':
        case 'oMathPara': {
          // An equation keeps its words and symbols, in Word's maths font.
          const text = deep(c, 't').map((t) => t.textContent).join('');
          if (text) pieces.push({ text, style: css(diff({ ...runMap(R, false), 'font-family': "'Cambria Math', 'Cambria', serif", 'font-style': 'italic' }, paraMap)), href });
          notes.add('Equations are shown as plain text.');
          break;
        }
        default:
      }
    }
  }
  async function run(r, ctx, R, paraMap, pieces, href) {
    const own = readRPr(kid(r, 'rPr'));
    const charStyle = own.style ? style(own.style)?.r : null;
    const eff = { ...R, ...charStyle, ...own };
    if (eff.vanish) return;
    const link = () => linkNow() || href;
    const text = (t) => {
      if (!t || hidingCode()) return;
      const tamil = TAMIL.test(t);
      pieces.push({ text: t, style: css(diff(runMap(eff, tamil), paraMap)), href: link() });
    };
    const html = (h) => {
      if (h && !hidingCode()) pieces.push({ html: h, href: link() });
    };
    for (const c of r.children) {
      switch (c.localName) {
        case 't':
          text(c.textContent);
          break;
        case 'tab':
        case 'ptab':
          text('\t');
          break;
        case 'br':
          if (!val(c, 'type') || val(c, 'type') === 'textWrapping') html('<br>');
          break;
        case 'cr':
          html('<br>');
          break;
        case 'noBreakHyphen':
          text('‑');
          break;
        case 'softHyphen':
          text('­');
          break;
        case 'sym': {
          const code = parseInt(val(c, 'char') || '', 16);
          if (code) text(symbol(String.fromCharCode(code), val(c, 'font') || ''));
          break;
        }
        case 'drawing':
          html(await drawing(c, ctx));
          break;
        case 'pict':
        case 'object':
          html(await vml(c, ctx));
          break;
        case 'AlternateContent': {
          const chosen = kid(c, 'Choice') || kid(c, 'Fallback');
          for (const inner of chosen?.children || []) {
            if (inner.localName === 'drawing') html(await drawing(inner, ctx));
            else if (inner.localName === 'pict') html(await vml(inner, ctx));
          }
          break;
        }
        case 'fldChar': {
          const type = val(c, 'fldCharType');
          if (type === 'begin') fields.push({ code: '', result: false, href: null });
          else if (type === 'separate' && fields.length) {
            const field = fields[fields.length - 1];
            field.result = true;
            field.href = /HYPERLINK\s+"([^"]+)"/.exec(field.code)?.[1] || null;
          } else if (type === 'end') fields.pop();
          break;
        }
        case 'instrText':
          if (fields.length) fields[fields.length - 1].code += c.textContent;
          break;
        case 'footnoteReference':
        case 'endnoteReference': {
          const kind = c.localName === 'footnoteReference' ? 'footnote' : 'endnote';
          const n = noteNumber(kind, val(c, 'id'));
          text(kind === 'footnote' ? String(n) : ROMAN(n).toLowerCase());
          break;
        }
        case 'footnoteRef':
        case 'endnoteRef':
          if (ctx.noteMark) text(ctx.noteMark);
          break;
        default:
      }
    }
  }

  // Joins pieces: neighbours with the same style and link become one.
  function joinPieces(pieces) {
    const merged = [];
    for (const piece of pieces) {
      const last = merged[merged.length - 1];
      if (piece.text != null && last?.text != null && last.style === piece.style && last.href === piece.href) last.text += piece.text;
      else merged.push({ ...piece });
    }
    let out = '';
    let open = null;
    for (const piece of merged) {
      if (piece.href !== open) {
        if (open) out += '</a>';
        if (piece.href && /^(https?:|mailto:)/i.test(piece.href)) {
          out += `<a href="${esc(piece.href)}" style="color:inherit;text-decoration-line:none">`;
          open = piece.href;
        } else open = null;
      }
      if (piece.html) out += piece.html;
      else out += piece.style ? `<span style="${piece.style}">${esc(piece.text)}</span>` : esc(piece.text);
    }
    if (open) out += '</a>';
    return out;
  }

  // ---- Paragraphs ----
  async function paragraph(el, ctx) {
    const direct = readPPr(kid(el, 'pPr'));
    const styleId = direct.style || defaultPara;
    const ps = style(styleId) || { p: {}, r: {}, name: '' };
    const plain = styleId === defaultPara;
    // Order of layers: document defaults, table design, paragraph style
    // (a table design wins over the plain Normal style), list, the paragraph.
    let P = { ...defaults.p };
    let R = { ...defaults.r };
    if (ctx.table && !plain) {
      P = { ...P, ...ctx.table.p };
      R = { ...R, ...ctx.table.r };
    }
    P = { ...P, ...ps.p };
    R = { ...R, ...ps.r };
    if (ctx.table && plain) {
      P = { ...P, ...ctx.table.p };
      R = { ...R, ...ctx.table.r };
    }
    const numId = direct.numId ?? P.numId;
    const ilvl = direct.ilvl ?? P.ilvl ?? 0;
    const marker = numId && numId !== '0' ? listMarker(numId, ilvl) : null;
    if (marker) P = { ...P, ...marker.level.p };
    const { style: _s, mark, ...directP } = direct;
    P = { ...P, ...directP };

    const paraMap = pick(runMap(R, false), INHERITED);
    const pieces = [];
    const boxes = [];
    const local = { ...ctx, boxes };
    await inline(el, local, R, paraMap, pieces);
    let inner = joinPieces(pieces);
    const text = pieces.map((p) => p.text || '').join('');

    if (marker && (marker.text || marker.level.suffix !== 'nothing')) {
      const markerMap = runMap({ ...R, ...marker.level.r, ...(marker.bullet ? { font: R.font } : {}) }, false);
      const markerStyle = diff(markerMap, paraMap);
      const hanging = P.first < 0 ? -P.first : 0;
      const after = marker.level.suffix === 'space' ? ' ' : marker.level.suffix === 'nothing' ? '' : '\t';
      inner =
        hanging && after === '\t'
          ? `<span style="${css({ display: 'inline-block', 'min-width': pt(hanging), 'text-indent': '0', ...markerStyle })}">${esc(marker.text)}</span>${inner}`
          : `<span${Object.keys(markerStyle).length ? ` style="${css(markerStyle)}"` : ''}>${esc(marker.text + after)}</span>${inner}`;
    }
    // An empty paragraph still takes its line, at the size of its mark.
    const empty = !inner;
    const ownMap = empty && mark ? pick(runMap({ ...R, ...mark }, false), INHERITED) : paraMap;
    if (empty) inner = '<br>';

    const level = /^heading (\d)$/.exec(ps.name)?.[1];
    const tag = ps.name === 'title' || level === '1' ? 'h2' : level === '2' ? 'h3' : level ? 'h4' : 'p';
    const boxed = Boolean(P.shd || (P.borders && Object.values(P.borders).some((b) => b !== 'none')));
    const lineHeight =
      P.line == null ? null : P.lineRule === 'auto' ? String(round((P.line / 240) * 1.15)) : pt(P.line / 20);
    const look = {
      'text-align': { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[P.jc] || null,
      'line-height': lineHeight,
      'margin-left': P.left ? pt(P.left) : null,
      'margin-right': P.right ? pt(P.right) : null,
      'text-indent': P.first ? pt(P.first) : null,
      'background-color': P.shd || null,
      ...diff(ownMap, ctx.parentMap),
    };
    if (boxed && P.borders) {
      for (const edge of ['top', 'right', 'bottom', 'left']) if (P.borders[edge] && P.borders[edge] !== 'none') look[`border-${edge}`] = P.borders[edge];
      look['padding-left'] = look['padding-left'] || '4pt';
      look['padding-right'] = look['padding-right'] || '4pt';
    }
    return {
      tag,
      style: look,
      inner,
      styleId,
      contextual: P.contextual,
      before: P.before || 0,
      after: P.after || 0,
      boxed,
      extra: boxes.join(''),
      text,
      map: ownMap,
    };
  }

  // ---- Tables ----
  async function table(el, ctx) {
    const pr = readTblPr(kid(el, 'tblPr'));
    const ts = style(pr.style) || style(defaultTable) || { tbl: {}, tc: {}, p: {}, r: {}, cond: {} };
    const lookEl = kid(kid(el, 'tblPr'), 'tblLook');
    const lookVal = parseInt(val(lookEl) || '04A0', 16);
    const flag = (name, bit) => (val(lookEl, name) != null ? yes(val(lookEl, name)) : Boolean(lookVal & bit));
    const look = { firstRow: flag('firstRow', 0x20), lastRow: flag('lastRow', 0x40), firstCol: flag('firstColumn', 0x80), lastCol: flag('lastColumn', 0x100), noHBand: flag('noHBand', 0x200), noVBand: flag('noVBand', 0x400) };
    const borders = { ...ts.tbl.borders, ...pr.borders };
    const cellMar = { left: 5.4, right: 5.4, top: 0, bottom: 0, ...ts.tbl.cellMar, ...pr.cellMar };
    const grid = kids(kid(el, 'tblGrid'), 'gridCol').map((g) => Number(val(g, 'w')) / 20);
    const rows = kids(el, 'tr');
    const layout = rows.map((tr) => {
      let col = Number(val(kid(kid(tr, 'trPr'), 'gridBefore')) || 0);
      return kids(tr, 'tc').map((tc) => {
        const cellPr = readTcPr(kid(tc, 'tcPr'));
        const cell = { tc, pr: cellPr, col, span: cellPr.span || 1 };
        col += cell.span;
        return cell;
      });
    });
    layout.forEach((cells, ri) =>
      cells.forEach((cell) => {
        if (cell.pr.vMerge === 'continue') cell.skip = true;
        if (cell.pr.vMerge === 'restart') {
          let n = 1;
          for (let k = ri + 1; k < layout.length; k += 1) {
            const below = layout[k].find((c) => c.col === cell.col);
            if (below?.pr.vMerge === 'continue') n += 1;
            else break;
          }
          cell.rowspan = n;
        }
      }),
    );
    const columns = grid.length || Math.max(...layout.map((cells) => cells.reduce((n, c) => n + c.span, 0)));
    const headerRows = look.firstRow ? 1 : 0;
    let html = '';
    for (const [ri, cells] of layout.entries()) {
      const trPr = kid(rows[ri], 'trPr');
      const height = kid(trPr, 'trHeight');
      let row = '';
      for (const cell of cells) {
        if (cell.skip) continue;
        const lastRowIndex = ri + (cell.rowspan || 1) - 1;
        // The table design's parts that apply to this cell, weakest first.
        const types = ['wholeTable'];
        if (!look.noVBand) types.push((cell.col - (look.firstCol ? 1 : 0)) % 2 === 0 ? 'band1Vert' : 'band2Vert');
        if (!look.noHBand && ri >= headerRows) types.push((ri - headerRows) % 2 === 0 ? 'band1Horz' : 'band2Horz');
        if (look.firstCol && cell.col === 0) types.push('firstCol');
        if (look.lastCol && cell.col + cell.span === columns) types.push('lastCol');
        if (look.firstRow && ri === 0) types.push('firstRow');
        if (look.lastRow && lastRowIndex === layout.length - 1 && ri > 0) types.push('lastRow');
        const parts = types.map((t) => ts.cond[t]).filter(Boolean);
        const tc = { ...ts.tc };
        let tcBorders = {};
        const tableP = { ...ts.p };
        const tableR = { ...ts.r };
        for (const part of parts) {
          Object.assign(tableP, part.p);
          Object.assign(tableR, part.r);
          if ('shd' in part.tc) tc.shd = part.tc.shd;
          if (part.tc.vAlign) tc.vAlign = part.tc.vAlign;
          tcBorders = { ...tcBorders, ...part.tc.borders };
        }
        if ('shd' in cell.pr) tc.shd = cell.pr.shd;
        if (cell.pr.vAlign) tc.vAlign = cell.pr.vAlign;
        tcBorders = { ...tcBorders, ...cell.pr.borders };
        const edge = (side, outer, inside) => tcBorders[side] ?? (outer ? borders[side] : borders[inside]) ?? 'none';
        const mar = { ...cellMar, ...cell.pr.mar };
        const cellStyle = {
          'border-top': edge('top', ri === 0, 'insideH'),
          'border-bottom': edge('bottom', lastRowIndex === layout.length - 1, 'insideH'),
          'border-left': edge('left', cell.col === 0, 'insideV'),
          'border-right': edge('right', cell.col + cell.span >= columns, 'insideV'),
          'padding-top': pt(mar.top || 0),
          'padding-right': pt(mar.right || 0),
          'padding-bottom': pt(mar.bottom || 0),
          'padding-left': pt(mar.left || 0),
          'vertical-align': tc.vAlign || 'top',
          'background-color': tc.shd || pr.shd || null,
        };
        const cellCtx = { ...ctx, table: { p: tableP, r: tableR } };
        const content = await blocks(cell.tc, cellCtx);
        const attrs = `${cell.span > 1 ? ` colspan="${cell.span}"` : ''}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}`;
        row += `<td${attrs} style="${css(cellStyle)}">${content || '<br>'}</td>`;
      }
      const rowStyle = height ? css({ height: pt(Number(val(height)) / 20) }) : '';
      html += `<tr${rowStyle ? ` style="${rowStyle}"` : ''}>${row}</tr>`;
    }
    const total = grid.reduce((a, b) => a + b, 0);
    const width = pr.width?.type === 'pct' ? `${round(pr.width.w / 50)}%` : pr.width?.type === 'dxa' && pr.width.w ? pt(pr.width.w / 20) : total ? pt(total) : null;
    const tableStyle = {
      'border-collapse': 'collapse',
      width,
      'table-layout': pr.fixed ? 'fixed' : null,
      'margin-left': pr.jc === 'center' ? 'auto' : pr.ind ? pt(pr.ind) : null,
      'margin-right': pr.jc === 'center' ? 'auto' : null,
    };
    const cols = grid.length ? `<colgroup>${grid.map((w) => `<col style="width:${pt(w)}">`).join('')}</colgroup>` : '';
    // Wide tables scroll sideways on a phone rather than squeezing.
    return `<div style="overflow-x:auto;max-width:100%"><table style="${css(tableStyle)}">${cols}<tbody>${html}</tbody></table></div>`;
  }

  // ---- A run of paragraphs and tables ----
  async function blocks(parent, ctx) {
    const list = [];
    const scope = { ...ctx, parentMap: ctx.parentMap || baseMap };
    const walk = async (el) => {
      for (const c of el?.children || []) {
        if (c.localName === 'p') list.push(await paragraph(c, scope));
        else if (c.localName === 'tbl') list.push({ html: await table(c, scope) });
        else if (c.localName === 'sdt') await walk(kid(c, 'sdtContent'));
        else if (c.localName === 'customXml' || c.localName === 'ins') await walk(c);
      }
    };
    await walk(parent);
    // A paragraph set to ignore spacing next to its own kind does so.
    for (let i = 1; i < list.length; i += 1) {
      const [a, b] = [list[i - 1], list[i]];
      if (a.tag && b.tag && a.styleId === b.styleId) {
        if (b.contextual) b.before = 0;
        if (a.contextual) a.after = 0;
      }
    }
    return list
      .map((b) => {
        if (b.html) return b.html;
        // Spacing is padding, so the space after one paragraph and before the
        // next add up as they do in Word; a shaded paragraph uses margin.
        const side = b.boxed ? 'margin' : 'padding';
        const style = { ...b.style, [`${side}-top`]: b.before ? pt(b.before) : null, [`${side}-bottom`]: b.after ? pt(b.after) : null };
        const attr = css(style);
        return `<${b.tag}${attr ? ` style="${attr}"` : ''}>${b.inner}</${b.tag}>${b.extra}`;
      })
      .join('');
  }

  onProgress('Reading the document…');
  const rels = await relsOf('word/_rels/document.xml.rels');
  const plainText = [];
  const collect = (el) => deep(el, 'p').forEach((p) => plainText.push(deep(p, 't').map((t) => t.textContent).join('')));
  collect(body);
  let html = await blocks(body, { rels, table: null });

  // Footnotes and endnotes, numbered as in the text, at the end.
  for (const kind of ['footnote', 'endnote']) {
    if (!noteOrder[kind].length) continue;
    const partDoc = await xml(`word/${kind}s.xml`);
    if (!partDoc) continue;
    const noteRels = await relsOf(`word/_rels/${kind}s.xml.rels`);
    const byId = Object.fromEntries(kids(partDoc.documentElement, kind).map((n) => [val(n, 'id'), n]));
    let list = '';
    for (const id of noteOrder[kind]) {
      if (!byId[id]) continue;
      const mark = kind === 'footnote' ? String(noteNumbers[kind][id]) : ROMAN(noteNumbers[kind][id]).toLowerCase();
      list += await blocks(byId[id], { rels: noteRels, table: null, noteMark: mark });
      collect(byId[id]);
    }
    html += `<hr style="${css({ width: '33%', 'margin-left': '0', 'margin-top': '12pt', 'border-top': '0.75pt solid #000000' })}">${list}`;
  }

  const page = {
    'font-family': baseMap['font-family'],
    'font-size': baseMap['font-size'],
    color: baseMap.color,
    'line-height': '1.15',
    'white-space': 'pre-wrap',
    'tab-size': '48px',
    'overflow-wrap': 'break-word',
    display: 'flow-root',
    'background-color': background,
    'padding-top': background ? '16pt' : null,
    'padding-right': background ? '16pt' : null,
    'padding-bottom': background ? '16pt' : null,
    'padding-left': background ? '16pt' : null,
  };
  return {
    html: `<div style="${css(page)}">${html}</div>`,
    text: plainText.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    notes: [...notes],
  };
}

// A picture browsers can draw but the site does not keep (BMP, SVG), as PNG.
async function redraw(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 800;
    canvas.height = image.naturalHeight || 600;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
