import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import CharacterCount from '@tiptap/extension-character-count';
import { api, prepareImage } from '../api.js';
import { Badge, Drawer, ErrorNote, Icon, Loading, ago, dateOnly } from '../ui.jsx';
import PostBody from '../../components/blog/PostBody.jsx';
import DocImport from '../../admin/DocImport.jsx';
import { cleanDocHtml, docPlainText } from '../../lib/docHtml.js';
import { POST_STATUS, liveStatus } from './BlogList.jsx';

const EMPTY = {
  title: '',
  slug: '',
  excerpt: '',
  contentHtml: '',
  docHtml: '',
  coverUrl: '',
  coverAlt: '',
  heroRatio: '5:2',
  category: '',
  tags: [],
  author: 'Cholan Rice and Millet Shop',
  language: 'en',
  featured: false,
  status: 'draft',
  publishAt: '',
  seoTitle: '',
  seoDescription: '',
};

const CATEGORIES = ['Recipes', 'Health & nutrition', 'Rice guide', 'Farming & sourcing', 'News', 'Offers'];

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function BlogEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [post, setPost] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }
  const [fieldErrors, setFieldErrors] = useState({});
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [library, setLibrary] = useState(null); // null | 'cover' | 'content'
  const [preview, setPreview] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image.configure({ HTMLAttributes: { class: 'post-img' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your post… Use the toolbar for headings, lists, photos and videos.' }),
      Highlight,
      Youtube.configure({ nocookie: true, width: 720, height: 405 }),
      CharacterCount,
    ],
    content: '',
    onUpdate: ({ editor: ed }) => setPost((p) => ({ ...p, contentHtml: ed.getHTML() })),
  });

  // Load an existing post.
  useEffect(() => {
    if (isNew) return;
    api
      .post(id)
      .then((data) => {
        const loaded = { ...EMPTY, ...data, publishAt: data.publishAt || '' };
        // Photo posts are reviewed from the Blog list, not written here.
        if (loaded.format === 'post') return navigate('/dashboard/blog', { replace: true });
        setPost(loaded);
        setSaved(loaded);
        setLoading(false);
      })
      .catch((error) => {
        setLoadError(error);
        setLoading(false);
      });
  }, [id, isNew]);

  useEffect(() => {
    if (editor && !loading && editor.getHTML() !== saved.contentHtml) {
      editor.commands.setContent(saved.contentHtml || '', { emitUpdate: false });
    }
  }, [editor, loading, saved.contentHtml]);

  const dirty = JSON.stringify(post) !== JSON.stringify(saved);

  // Don't lose work by closing the tab.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (field) => (value) => {
    setPost((p) => {
      const next = { ...p, [field]: value };
      if (field === 'title' && !slugTouched) next.slug = slugify(value);
      return next;
    });
    setFieldErrors((f) => ({ ...f, [field]: undefined }));
  };

  const save = async (status) => {
    const body = { ...post, status: status || post.status };
    if (body.status === 'scheduled' && post.publishAt) body.publishAt = new Date(post.publishAt).toISOString();
    if (body.status === 'published' && saved.status !== 'published') body.publishAt = new Date().toISOString();
    setSaving(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const result = isNew ? await api.createPost(body) : await api.updatePost(id, body);
      const next = { ...EMPTY, ...result, publishAt: result.publishAt || '' };
      setPost(next);
      setSaved(next);
      setSlugTouched(true);
      const s = liveStatus(next);
      setMessage({
        tone: 'good',
        text:
          s === 'published'
            ? 'Published. It is live on the Blog page now.'
            : s === 'scheduled'
              ? `Scheduled. It goes live on ${new Date(next.publishAt).toLocaleString('en-IN')}.`
              : 'Draft saved. Only people with dashboard access can see it.',
      });
      if (isNew) navigate(`/dashboard/blog/${result.id}`, { replace: true });
    } catch (error) {
      setMessage({ tone: 'bad', text: error.message });
      setFieldErrors(error.fields || {});
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${post.title || 'this post'}” for good? This cannot be undone.`)) return;
    await api.deletePost(id);
    navigate('/dashboard/blog');
  };

  const chooseImage = (url) => {
    if (library === 'cover') set('coverUrl')(url);
    else editor?.chain().focus().setImage({ src: url, alt: '' }).run();
    setLibrary(null);
  };

  if (loading) return <div className="dash-page"><Loading /></div>;
  if (loadError) return <div className="dash-page"><ErrorNote error={loadError} /></div>;

  const status = liveStatus(post);
  const words = post.docHtml ? docPlainText(post.docHtml).split(' ').filter(Boolean).length : editor?.storage.characterCount?.words() ?? 0;

  return (
    <div className="dash-page dash-editor">
      <div className="dash-editor__top">
        <Link to="/dashboard/blog" className="dash-link">
          <Icon name="back" /> All posts
        </Link>
        <div className="dash-editor__state">
          <Badge tone={POST_STATUS[status]?.tone}>{POST_STATUS[status]?.label}</Badge>
          {dirty ? <span className="dash-muted">Unsaved changes</span> : !isNew && <span className="dash-muted">Saved {ago(saved.updatedAt)}</span>}
        </div>
        <div className="dash-row">
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setPreview(true)}>
            <Icon name="eye" /> Preview
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => save('draft')} disabled={saving}>
            {status === 'draft' ? 'Save draft' : 'Unpublish'}
          </button>
          <button type="button" className="dash-btn" onClick={() => save(post.status === 'scheduled' ? 'scheduled' : 'published')} disabled={saving}>
            {saving ? 'Saving…' : post.status === 'scheduled' ? 'Schedule' : status === 'published' ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>
      {message && <div className={`dash-flash dash-flash--${message.tone}`}>{message.text}</div>}

      <div className="dash-editor__layout">
        <div className="dash-editor__main">
          <textarea
            className={`dash-editor__title${fieldErrors.title ? ' has-error' : ''}`}
            placeholder="Post title"
            rows={1}
            value={post.title}
            onChange={(e) => set('title')(e.target.value)}
          />
          {fieldErrors.title && <p className="dash-field-error">{fieldErrors.title}</p>}
          <textarea
            className="dash-editor__excerpt"
            placeholder="A short summary (1–2 sentences). Shown on the Blog page and in Google."
            rows={2}
            maxLength={320}
            value={post.excerpt}
            onChange={(e) => set('excerpt')(e.target.value)}
          />
          <div className={`dash-rte${fieldErrors.contentHtml ? ' has-error' : ''}`} style={post.docHtml ? { display: 'none' } : undefined}>
            {editor && <Toolbar editor={editor} onImage={() => setLibrary('content')} />}
            <EditorContent editor={editor} className="dash-rte__content post-body" />
            <div className="dash-rte__foot">
              <span>{words} words · about {Math.max(1, Math.round(words / 200))} min read</span>
              <span>Tip: paste text from Word or Google Docs — formatting is kept.</span>
            </div>
          </div>
          <DocImport html={post.docHtml} onChange={(doc) => set('docHtml')(doc ? doc.html : '')} />
          {fieldErrors.contentHtml && <p className="dash-field-error">{fieldErrors.contentHtml}</p>}
        </div>

        <aside className="dash-editor__side">
          <Panel title="Publishing">
            <div className="dash-radio">
              {[
                ['draft', 'Draft', 'Not on the website'],
                ['published', 'Publish now', 'Goes live when you click Publish'],
                ['scheduled', 'Schedule', 'Goes live at a date and time you pick'],
              ].map(([key, label, hint]) => (
                <label key={key} className={post.status === key ? 'is-on' : ''}>
                  <input type="radio" name="status" checked={post.status === key} onChange={() => set('status')(key)} />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
            {post.status === 'scheduled' && (
              <Field label="Go live on" error={fieldErrors.publishAt}>
                <input type="datetime-local" value={toLocalInput(post.publishAt)} onChange={(e) => set('publishAt')(e.target.value ? new Date(e.target.value).toISOString() : '')} />
              </Field>
            )}
            {status === 'published' && post.publishAt && <p className="dash-muted dash-small">Published {dateOnly(post.publishAt)}</p>}
            <label className="dash-toggle">
              <input type="checkbox" checked={post.featured} onChange={(e) => set('featured')(e.target.checked)} />
              <span />
              Feature this post (shown first on the Blog page)
            </label>
          </Panel>

          <Panel title="Cover image">
            {post.coverUrl ? (
              <div className="dash-cover">
                <img src={post.coverUrl} alt="" />
                <div className="dash-row">
                  <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setLibrary('cover')}>
                    Change
                  </button>
                  <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => set('coverUrl')('')}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="dash-drop" onClick={() => setLibrary('cover')}>
                <Icon name="image" />
                <span>Add a cover image</span>
                <small>Wide photos work best (about 1600 × 900)</small>
              </button>
            )}
            {post.coverUrl && (
              // Not a Field: its <label> would pass a tap on the words to the first button.
              <div className="dash-field">
                <span className="dash-field__label">At the top of the blog</span>
                <div className="dash-seg" role="group" aria-label="Cover shape at the top of the blog">
                  {[
                    ['5:2', 'Wide'],
                    ['free', 'Free'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" className={post.heroRatio === key ? 'is-on' : ''} onClick={() => set('heroRatio')(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="dash-field__hint">
                  {post.heroRatio === 'free' ? 'The whole picture, in its own shape. Nothing is cut off.' : 'Cut to a wide strip.'}
                </span>
              </div>
            )}
            {post.coverUrl && (
              <Field label="Describe the image" hint="For people who can’t see it, and for Google.">
                <input value={post.coverAlt} onChange={(e) => set('coverAlt')(e.target.value)} placeholder="e.g. A plate of idli made with Chennai Pattanam rice" />
              </Field>
            )}
          </Panel>

          <Panel title="Details">
            <Field label="Web address" hint={`cholanrice.in/blog/${post.slug || '…'}`} error={fieldErrors.slug}>
              <input
                value={post.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug')(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Category">
              <input list="dash-categories" value={post.category} onChange={(e) => set('category')(e.target.value)} placeholder="Pick or type a category" />
              <datalist id="dash-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" hint="Press Enter after each tag.">
              <TagInput tags={post.tags} onChange={set('tags')} />
            </Field>
            <Field label="Author">
              <input value={post.author} onChange={(e) => set('author')(e.target.value)} />
            </Field>
            <Field label="Language">
              <select value={post.language} onChange={(e) => set('language')(e.target.value)}>
                <option value="en">English</option>
                <option value="ta">Tamil (தமிழ்)</option>
              </select>
            </Field>
          </Panel>

          <Panel title="Google & sharing">
            <Field label="Title on Google" hint={`${(post.seoTitle || post.title).length}/60 characters — leave empty to use the post title`}>
              <input value={post.seoTitle} maxLength={70} onChange={(e) => set('seoTitle')(e.target.value)} placeholder={post.title} />
            </Field>
            <Field label="Description on Google" hint={`${(post.seoDescription || post.excerpt).length}/160 characters — leave empty to use the summary`}>
              <textarea rows={3} maxLength={170} value={post.seoDescription} onChange={(e) => set('seoDescription')(e.target.value)} placeholder={post.excerpt} />
            </Field>
            <div className="dash-serp" aria-label="Google preview">
              <span className="dash-serp__url">www.cholanrice.in › blog › {post.slug || '…'}</span>
              <span className="dash-serp__title">{(post.seoTitle || post.title || 'Post title').slice(0, 60)} | Cholan Rice and Millet Shop</span>
              <span className="dash-serp__desc">{(post.seoDescription || post.excerpt || 'Your summary appears here.').slice(0, 160)}</span>
            </div>
          </Panel>

          {!isNew && (
            <Panel title="Danger zone">
              <button type="button" className="dash-btn dash-btn--danger" onClick={remove}>
                <Icon name="trash" /> Delete post
              </button>
            </Panel>
          )}
        </aside>
      </div>

      <Drawer open={Boolean(library)} onClose={() => setLibrary(null)} title={library === 'cover' ? 'Choose a cover image' : 'Insert an image'} wide>
        {library && <MediaLibrary onPick={chooseImage} />}
      </Drawer>
      <Drawer open={preview} onClose={() => setPreview(false)} title="Preview" wide>
        <article className="post-preview">
          {post.coverUrl && <img className="post-preview__cover" src={post.coverUrl} alt={post.coverAlt} />}
          {post.category && <span className="post-preview__cat">{post.category}</span>}
          <h1>{post.title || 'Untitled'}</h1>
          {post.excerpt && <p className="post-preview__excerpt">{post.excerpt}</p>}
          <p className="dash-muted dash-small">
            {post.author} · {Math.max(1, Math.round(words / 200))} min read
          </p>
          {post.docHtml ? <div className="post-doc" dangerouslySetInnerHTML={{ __html: cleanDocHtml(post.docHtml) }} /> : <PostBody html={post.contentHtml} />}
        </article>
      </Drawer>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="dash-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className={`dash-field${error ? ' has-error' : ''}`}>
      <span className="dash-field__label">{label}</span>
      {children}
      {error ? <span className="dash-field-error">{error}</span> : hint && <span className="dash-field__hint">{hint}</span>}
    </label>
  );
}

function TagInput({ tags, onChange }) {
  const [value, setValue] = useState('');
  const add = () => {
    const tag = value.trim().replace(/,$/, '');
    if (tag && !tags.includes(tag)) onChange([...tags, tag].slice(0, 12));
    setValue('');
  };
  return (
    <div className="dash-tags">
      {tags.map((t) => (
        <span key={t} className="dash-tag">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !value && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={add}
        placeholder={tags.length ? '' : 'e.g. idli, ponni, healthy'}
      />
    </div>
  );
}

function Toolbar({ editor, onImage }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = (fn) => () => fn(editor.chain().focus()).run();
  const block = s.h2 ? 'h2' : s.h3 ? 'h3' : s.h4 ? 'h4' : 'p';

  const setLink = () => {
    const previous = editor.getAttributes('link').href || '';
    const url = window.prompt('Link address (leave empty to remove the link):', previous || 'https://');
    if (url === null) return;
    if (!url || url === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const addVideo = () => {
    const url = window.prompt('Paste a YouTube link:');
    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const B = ({ on, label, onClick, children, disabled }) => (
    <button type="button" className={on ? 'is-on' : ''} onClick={onClick} title={label} aria-label={label} aria-pressed={on} disabled={disabled}>
      {children}
    </button>
  );

  return (
    <div className="dash-rte__bar" role="toolbar" aria-label="Formatting">
      <select
        value={block}
        aria-label="Text style"
        onChange={(e) => {
          const v = e.target.value;
          const chain = editor.chain().focus();
          (v === 'p' ? chain.setParagraph() : chain.toggleHeading({ level: Number(v[1]) })).run();
        }}
      >
        <option value="p">Paragraph</option>
        <option value="h2">Heading</option>
        <option value="h3">Subheading</option>
        <option value="h4">Small heading</option>
      </select>
      <span className="dash-rte__sep" />
      <B on={s.bold} label="Bold (Ctrl+B)" onClick={run((c) => c.toggleBold())}>
        <b>B</b>
      </B>
      <B on={s.italic} label="Italic (Ctrl+I)" onClick={run((c) => c.toggleItalic())}>
        <i>I</i>
      </B>
      <B on={s.underline} label="Underline (Ctrl+U)" onClick={run((c) => c.toggleUnderline())}>
        <u>U</u>
      </B>
      <B on={s.strike} label="Strikethrough" onClick={run((c) => c.toggleStrike())}>
        <s>S</s>
      </B>
      <B on={s.highlight} label="Highlight" onClick={run((c) => c.toggleHighlight())}>
        <mark>H</mark>
      </B>
      <B on={s.link} label="Link" onClick={setLink}>
        <Icon name="link" />
      </B>
      <span className="dash-rte__sep" />
      <B on={s.bullet} label="Bulleted list" onClick={run((c) => c.toggleBulletList())}>
        •≡
      </B>
      <B on={s.ordered} label="Numbered list" onClick={run((c) => c.toggleOrderedList())}>
        1≡
      </B>
      <B on={s.quote} label="Quote" onClick={run((c) => c.toggleBlockquote())}>
        ❝
      </B>
      <B on={s.codeBlock} label="Code block" onClick={run((c) => c.toggleCodeBlock())}>
        {'</>'}
      </B>
      <B label="Divider line" onClick={run((c) => c.setHorizontalRule())}>
        ―
      </B>
      <span className="dash-rte__sep" />
      <B on={s.left} label="Align left" onClick={run((c) => c.setTextAlign('left'))}>
        ⫷
      </B>
      <B on={s.center} label="Centre" onClick={run((c) => c.setTextAlign('center'))}>
        ≡
      </B>
      <B on={s.right} label="Align right" onClick={run((c) => c.setTextAlign('right'))}>
        ⫸
      </B>
      <span className="dash-rte__sep" />
      <B label="Insert image" onClick={onImage}>
        <Icon name="image" />
      </B>
      <B label="Insert YouTube video" onClick={addVideo}>
        ▶
      </B>
      <span className="dash-rte__sep" />
      <B label="Clear formatting" onClick={run((c) => c.unsetAllMarks().clearNodes())}>
        ⌫
      </B>
      <B label="Undo (Ctrl+Z)" onClick={run((c) => c.undo())} disabled={!s.canUndo}>
        ↶
      </B>
      <B label="Redo (Ctrl+Y)" onClick={run((c) => c.redo())} disabled={!s.canRedo}>
        ↷
      </B>
    </div>
  );
}

// Uploaded images: pick one, upload new ones, or delete unused ones.
function MediaLibrary({ onPick }) {
  const [media, setMedia] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef(null);

  const load = () =>
    api
      .media()
      .then((d) => setMedia(d.media))
      .catch(setError);
  useEffect(() => {
    load();
  }, []);

  const upload = async (files) => {
    setError(null);
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    setUploading(list.length);
    let last = null;
    for (const file of list) {
      try {
        const blob = await prepareImage(file);
        last = await api.upload(blob);
      } catch (e) {
        setError(e);
      }
      setUploading((n) => n - 1);
    }
    await load();
    if (list.length === 1 && last) onPick(last.url);
  };

  const remove = async (item) => {
    if (!window.confirm('Delete this image? Posts that use it will show a broken image.')) return;
    await api.deleteMedia(item.name);
    load();
  };

  const kb = useMemo(() => (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`), []);

  return (
    <div className="dash-media">
      <div
        className="dash-drop dash-drop--big"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
      >
        <Icon name="download" />
        <span>{uploading ? `Uploading ${uploading}…` : 'Drop photos here, or click to choose'}</span>
        <small>JPG, PNG, WebP or GIF. Large photos are resized automatically.</small>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {error && <ErrorNote error={error} />}
      {!media && !error && <Loading />}
      {media && !media.length && <p className="dash-muted">No images uploaded yet.</p>}
      {media && media.length > 0 && (
        <div className="dash-media__grid">
          {media.map((m) => (
            <figure key={m.name} className="dash-media__item">
              <button type="button" onClick={() => onPick(m.url)} title="Use this image">
                <img src={m.url} alt="" loading="lazy" />
              </button>
              <figcaption>
                <span>{kb(m.size)}</span>
                <button type="button" className="dash-icon-btn" onClick={() => remove(m)} aria-label="Delete image" title="Delete image">
                  <Icon name="trash" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
