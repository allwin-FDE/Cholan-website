import { useEffect, useRef, useState } from 'react';
import { EditorContent, Extension, Mark, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import CharacterCount from '@tiptap/extension-character-count';
import { inkFor } from '../components/blog/PostMain.jsx';
import { api, prepareImage } from '../dashboard/api.js';
import { Icon } from '../dashboard/ui.jsx';

export const CAPTION_LIMIT = 12000;

// Named choices, stored as data-font / data-size / data-color on the text and
// styled in blog.css. Names rather than free CSS, so a post can only ever
// carry these looks; the backend throws away anything else.
const FONTS = [
  ['', 'Normal font'],
  ['heading', 'Bold heading'],
  ['classic', 'Classic serif'],
  ['typewriter', 'Typewriter'],
  ['handwritten', 'Handwritten'],
];
const SIZES = [
  ['small', 'Small'],
  ['', 'Normal size'],
  ['large', 'Large'],
  ['xlarge', 'Extra large'],
];
const TEXT_COLORS = [
  ['', 'Default', 'transparent'],
  ['green', 'Green', '#1b4d33'],
  ['gold', 'Gold', '#9a6a16'],
  ['red', 'Red', '#b3261e'],
  ['blue', 'Blue', '#2a5d9f'],
  ['black', 'Black', '#111111'],
  ['white', 'White', '#ffffff'],
];
const BACKGROUNDS = [
  ['', 'None'],
  ['#fff8e7', 'Cream'],
  ['#f6ecd2', 'Light gold'],
  ['#e2efe6', 'Light green'],
  ['#fbe8dc', 'Peach'],
  ['#1b4d33', 'Dark green'],
  ['#9a6a16', 'Gold'],
  ['#7a2e1f', 'Brick'],
  ['#111111', 'Black'],
];

const styleMark = (attr) =>
  Mark.create({
    name: `text-${attr}`,
    addAttributes() {
      return {
        value: {
          default: null,
          parseHTML: (el) => el.getAttribute(`data-${attr}`),
          renderHTML: (attrs) => ({ [`data-${attr}`]: attrs.value }),
        },
      };
    },
    parseHTML() {
      return [{ tag: `span[data-${attr}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', HTMLAttributes, 0];
    },
  });
const MARKS = [styleMark('font'), styleMark('size'), styleMark('color')];

// Left, centre or right, stored as data-align and styled in blog.css.
const Alignment = Extension.create({
  name: 'alignment',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          align: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-align'),
            renderHTML: (attrs) => (attrs.align ? { 'data-align': attrs.align } : {}),
          },
        },
      },
    ];
  },
});

// A caption written before captions could be formatted, as editor content.
export const textToHtml = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');

// The caption box: bold, italic, fonts, sizes and colours. `onChange` gets
// { html, text } whenever the person changes it.
export default function CaptionEditor({ html, bgColor, onChange, hasError }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null, class: null } },
      }),
      Image,
      Highlight,
      Youtube.configure({ nocookie: true, width: 720, height: 405 }),
      Alignment,
      Placeholder.configure({ placeholder: 'Write your blog here. Select any text to change its font, size or colour.' }),
      CharacterCount.configure({ limit: CAPTION_LIMIT }),
      ...MARKS,
    ],
    content: html || '',
    onUpdate: ({ editor: ed }) => onChange({ html: ed.isEmpty ? '' : ed.getHTML(), text: ed.getText({ blockSeparator: '\n' }) }),
    editorProps: { attributes: { 'aria-label': 'Blog content', class: 'rich post-body adm-editor__text' } },
  });

  // What the toolbar shows, read once per screen refresh rather than on every
  // keystroke, so fast typing on a slow phone stays smooth.
  const [state, setState] = useState(null);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef(null);
  useEffect(() => {
    if (!editor) return undefined;
    let frame = null;
    const read = () => {
      frame = null;
      setState({
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        highlight: editor.isActive('highlight'),
        bullets: editor.isActive('bulletList'),
        numbers: editor.isActive('orderedList'),
        quote: editor.isActive('blockquote'),
        codeBlock: editor.isActive('codeBlock'),
        link: editor.isActive('link'),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        block: [2, 3, 4].map((level) => (editor.isActive('heading', { level }) ? `h${level}` : '')).find(Boolean) || 'p',
        align: editor.getAttributes('heading').align || editor.getAttributes('paragraph').align || 'left',
        font: editor.getAttributes('text-font').value || '',
        size: editor.getAttributes('text-size').value || '',
        color: editor.getAttributes('text-color').value || '',
        count: editor.storage.characterCount.characters(),
        words: editor.storage.characterCount.words(),
      });
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(read);
    };
    read();
    editor.on('transaction', schedule);
    return () => {
      editor.off('transaction', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor]);

  if (!editor || !state) return <div className={`dash-rte adm-editor${hasError ? ' has-error' : ''}`} />;

  const setStyle = (attr, value) => {
    const name = `text-${attr}`;
    const chain = editor.chain().focus();
    (value ? chain.setMark(name, { value }) : chain.unsetMark(name)).run();
  };
  const setBlock = (value) => {
    const chain = editor.chain().focus();
    (value === 'p' ? chain.setParagraph() : chain.setHeading({ level: Number(value[1]) })).run();
  };
  const setAlign = (align) =>
    editor
      .chain()
      .focus()
      .updateAttributes('paragraph', { align: align === 'left' ? null : align })
      .updateAttributes('heading', { align: align === 'left' ? null : align })
      .run();
  const setLink = () => {
    if (state.link) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('Paste the web address for this link:', 'https://');
    if (!url || url === 'https://') return;
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      window.alert('A link must start with https://');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  const addVideo = () => {
    const url = window.prompt('Paste a YouTube link:');
    if (url && !editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run()) {
      window.alert('That does not look like a YouTube link.');
    }
  };
  const addImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(await prepareImage(file));
      // Then a new line under it, so the next thing added does not replace the picture.
      editor.chain().focus().setImage({ src: url, alt: '' }).createParagraphNear().run();
    } catch (error) {
      window.alert(error.message || 'That picture could not be added. Please try again.');
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = '';
    }
  };
  // Pressing a button must not take the selection away from the text.
  const keep = (e) => e.preventDefault();
  const Format = ({ active = false, disabled, onClick, label, children }) => (
    <button type="button" className={`adm-tool${active ? ' is-on' : ''}`} onMouseDown={keep} onClick={onClick} aria-label={label} aria-pressed={active} title={label} disabled={disabled}>
      {children}
    </button>
  );

  // The same tools, in the same order, as the dashboard's editor (BlogEditor.jsx),
  // then the fonts, sizes and colours.
  return (
    <div className={`dash-rte adm-editor${hasError ? ' has-error' : ''}`}>
      <div className="dash-rte__bar adm-toolbar" role="toolbar" aria-label="Text style">
        <select aria-label="Heading" value={state.block} onChange={(e) => setBlock(e.target.value)}>
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="h4">Small heading</option>
        </select>
        <span className="dash-rte__sep" />
        <Format active={state.bold} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </Format>
        <Format active={state.italic} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </Format>
        <Format active={state.underline} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </Format>
        <Format active={state.strike} label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </Format>
        <Format active={state.highlight} label="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <mark>H</mark>
        </Format>
        <Format active={state.link} label={state.link ? 'Remove link' : 'Add a link'} onClick={setLink}>
          <Icon name="link" />
        </Format>
        <span className="dash-rte__sep" />
        <Format active={state.bullets} label="Bullet points" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          •≡
        </Format>
        <Format active={state.numbers} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1≡
        </Format>
        <Format active={state.quote} label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </Format>
        <Format active={state.codeBlock} label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          {'</>'}
        </Format>
        <Format label="Dividing line" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          ―
        </Format>
        <span className="dash-rte__sep" />
        {[
          ['left', 'Align left', '⫷'],
          ['center', 'Align centre', '≡'],
          ['right', 'Align right', '⫸'],
        ].map(([key, label, mark]) => (
          <Format key={key} active={state.align === key} label={label} onClick={() => setAlign(key)}>
            {mark}
          </Format>
        ))}
        <span className="dash-rte__sep" />
        <Format label={uploading ? 'Adding your picture…' : 'Insert image'} disabled={uploading} onClick={() => imageInput.current?.click()}>
          <Icon name="image" />
        </Format>
        <input ref={imageInput} type="file" accept="image/*" hidden data-testid="adm-content-image" onChange={(e) => addImage(e.target.files[0])} />
        <Format label="Insert YouTube video" onClick={addVideo}>
          ▶
        </Format>
        <span className="dash-rte__sep" />
        <Format label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          ⌫
        </Format>
        <Format label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
          ↶
        </Format>
        <Format label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
          ↷
        </Format>
        <span className="adm-toolbar__row" />
        <select aria-label="Font" value={state.font} onChange={(e) => setStyle('font', e.target.value)}>
          {FONTS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Text size" value={state.size} onChange={(e) => setStyle('size', e.target.value)}>
          {SIZES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="adm-swatches" role="group" aria-label="Text colour">
          {TEXT_COLORS.map(([key, label, hex]) => (
            <button
              key={label}
              type="button"
              className={`adm-swatch${state.color === key ? ' is-on' : ''}${key ? '' : ' adm-swatch--none'}`}
              style={{ background: hex }}
              onMouseDown={keep}
              onClick={() => setStyle('color', key)}
              aria-label={`Text colour: ${label}`}
              title={label}
            />
          ))}
        </div>
      </div>
      <div className="adm-editor__page" style={bgColor ? { background: bgColor, color: inkFor(bgColor) } : undefined} onClick={() => editor.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
      <div className="dash-rte__foot">
        <span>
          {state.words} words · about {Math.max(1, Math.round(state.words / 200))} min read
        </span>
        <span>
          {state.count} / {CAPTION_LIMIT} characters
        </span>
      </div>
    </div>
  );
}

// The background behind the caption: ready colours, or any colour they pick.
export function BackgroundPicker({ value, onChange }) {
  const own = value && !BACKGROUNDS.some(([hex]) => hex === value);
  return (
    <div className="adm-swatches adm-swatches--big" role="group" aria-label="Background colour">
      {BACKGROUNDS.map(([hex, label]) => (
        <button
          key={label}
          type="button"
          className={`adm-swatch${value === hex ? ' is-on' : ''}${hex ? '' : ' adm-swatch--none'}`}
          style={{ background: hex || 'transparent' }}
          onClick={() => onChange(hex)}
          aria-label={`Background: ${label}`}
          title={label}
        />
      ))}
      <label className={`adm-swatch adm-swatch--own${own ? ' is-on' : ''}`} title="Choose your own colour" style={own ? { background: value } : undefined}>
        <span>+</span>
        <input type="color" aria-label="Choose your own background colour" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
