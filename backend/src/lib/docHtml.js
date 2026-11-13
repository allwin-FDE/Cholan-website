// A Word document turned into HTML in the browser (frontend/src/lib/docx.js)
// keeps its look through inline styles: spacing, colours, fonts, borders and
// tables. Whatever the browser sent, only these tags, attributes and style
// properties are kept, each rebuilt from what is allowed. No style value may
// hold brackets, so nothing can be loaded from elsewhere or run.

const MEDIA_PATH = /^https?:\/\/[^/]+(\/api\/media\/(?:dev_)?blog\/[\w.-]+)$/;
const WHOLE_NUMBER = /^\d{1,4}$/;

const LEN = '-?\\d{1,5}(?:\\.\\d{1,3})?(?:pt|px|em|%)?';
const COLOR = '#[0-9a-f]{3,8}|transparent|currentcolor|inherit';
const BORDER = `none|${LEN} (?:solid|double|dotted|dashed) (?:${COLOR})`;
const STYLE_RULES = Object.fromEntries(
  Object.entries({
    color: COLOR,
    'background-color': COLOR,
    'font-family': "[\\w ',-]{1,300}",
    'font-size': LEN,
    'font-weight': 'bold|normal|[1-9]00',
    'font-style': 'italic|normal',
    'font-variant': 'small-caps|normal',
    'text-decoration-line': '(?:underline|line-through|none)(?: line-through)?',
    'text-decoration-style': 'solid|double|dotted|dashed|wavy',
    'text-decoration-color': COLOR,
    'text-transform': 'uppercase|none',
    'letter-spacing': `normal|${LEN}`,
    'vertical-align': `super|sub|baseline|top|middle|bottom|${LEN}`,
    'text-align': 'left|right|center|justify',
    'text-indent': LEN,
    'line-height': `normal|${LEN}`,
    'margin-top': `auto|${LEN}`,
    'margin-right': `auto|${LEN}`,
    'margin-bottom': `auto|${LEN}`,
    'margin-left': `auto|${LEN}`,
    'padding-top': LEN,
    'padding-right': LEN,
    'padding-bottom': LEN,
    'padding-left': LEN,
    'border-top': BORDER,
    'border-right': BORDER,
    'border-bottom': BORDER,
    'border-left': BORDER,
    'border-collapse': 'collapse|separate',
    width: `auto|${LEN}`,
    'min-width': LEN,
    'max-width': `none|${LEN}`,
    height: `auto|${LEN}`,
    display: 'inline-block|block|flow-root',
    float: 'left|right|none',
    clear: 'both|none',
    'white-space': 'pre-wrap|normal',
    'tab-size': LEN,
    'overflow-x': 'auto|visible',
    'overflow-wrap': 'break-word|anywhere|normal',
    'table-layout': 'fixed|auto',
  }).map(([name, pattern]) => [name, new RegExp(`^(?:${pattern})$`, 'i')]),
);

export function cleanStyle(style) {
  return String(style || '')
    .split(';')
    .map((part) => {
      const at = part.indexOf(':');
      if (at < 1) return '';
      const name = part.slice(0, at).trim().toLowerCase();
      const value = part.slice(at + 1).trim();
      return STYLE_RULES[name]?.test(value) ? `${name}:${value}` : '';
    })
    .filter(Boolean)
    .join(';');
}

const STYLED = { style: true };
const DOC_TAGS = {
  div: STYLED,
  p: STYLED,
  h2: STYLED,
  h3: STYLED,
  h4: STYLED,
  span: STYLED,
  sup: STYLED,
  sub: STYLED,
  br: {},
  hr: STYLED,
  a: { style: true, href: /^(?:https?:\/\/|mailto:)[^\s"<>]+$/i },
  img: { style: true, alt: /^[^"<>]{0,160}$/, width: WHOLE_NUMBER, height: WHOLE_NUMBER },
  table: STYLED,
  colgroup: {},
  col: STYLED,
  tbody: {},
  thead: {},
  tr: STYLED,
  td: { style: true, colspan: WHOLE_NUMBER, rowspan: WHOLE_NUMBER },
  th: { style: true, colspan: WHOLE_NUMBER, rowspan: WHOLE_NUMBER },
};
const VOID = new Set(['br', 'hr', 'img', 'col']);

function cleanDocTag(tag, origin) {
  const match = /^<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/?>$/i.exec(tag);
  if (!match) return '';
  const name = match[2].toLowerCase();
  const allowed = DOC_TAGS[name];
  if (!allowed) return '';
  if (match[1]) return VOID.has(name) ? '' : `</${name}>`;
  const pairs = [...match[3].matchAll(/([a-z-]+)="([^"<>]*)"/gi)].map(([, key, value]) => [key.toLowerCase(), value]);
  const attrs = pairs
    .map(([key, value]) => {
      if (key === 'style' && allowed.style) {
        const style = cleanStyle(value);
        return style ? ` style="${style}"` : '';
      }
      return allowed[key] instanceof RegExp && allowed[key].test(value) ? ` ${key}="${value}"` : '';
    })
    .join('');
  if (name === 'img') {
    const path = MEDIA_PATH.exec(pairs.find(([key]) => key === 'src')?.[1] || '')?.[1];
    return path ? `<img src="${origin}${path}"${attrs}>` : '';
  }
  return `<${name}${attrs}>`;
}

export const cleanDocHtml = (html, origin) =>
  typeof html === 'string' ? html.replace(/<[^>]*>?/g, (tag) => cleanDocTag(tag, origin)) : '';

// The document's words, for the summary, word count and search.
export const docText = (html) =>
  html
    .replace(/<\/(?:p|h2|h3|h4|div|tr)>|<br\s*\/?>/g, '\n')
    .replace(/<\/t[dh]>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
