import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../dashboard/api.js';
import { Badge, Icon } from '../dashboard/ui.jsx';
import { products } from '../data/products.js';
import PostMain from '../components/blog/PostMain.jsx';
import CaptionEditor, { BackgroundPicker, textToHtml } from './CaptionEditor.jsx';
import PhotoCrop from './PhotoCrop.jsx';
import DocImport from './DocImport.jsx';
import { docPlainText } from '../lib/docHtml.js';
import { MAX_PHOTOS, PHOTO_HEIGHT, PHOTO_RATIO, PHOTO_WIDTH, POST_CATEGORIES, clearDraft, fetchPhoto, loadDraft, readPhoto, renderPhoto, saveDraft } from './photos.js';

const TITLES = { cover: 'Cover picture', pictures: 'Main pictures', adjust: 'Adjust pictures', write: 'Write the blog' };
const order = ['cover', 'pictures', 'adjust', 'write'];
const SIZE_NOTE = `Every picture is 16:9 and saved at exactly ${PHOTO_WIDTH} × ${PHOTO_HEIGHT} pixels. Drag and zoom to choose the part to keep.`;
const EMPTY_RECIPE = { total: '', prep: '', cook: '', servings: '', cuisine: '', method: '', ingredients: '', notes: '' };
// In the form the ingredients are one per line; on the post, a list.
const recipeForm = (recipe) => ({ ...EMPTY_RECIPE, ...recipe, ingredients: (recipe?.ingredients || []).join('\n') });
const EMPTY_PARTS = { subtitle: '', intro: '', takeaway: '', tips: '', conclusion: '' };
// In the form the quick tips are one per line; on the post, a list.
const partsForm = (post) => ({ ...EMPTY_PARTS, subtitle: post.subtitle || '', intro: post.intro || '', takeaway: post.takeaway || '', tips: (post.tips || []).join('\n'), conclusion: post.conclusion || '' });
const recipeBody = (form) => ({ ...form, ingredients: form.ingredients.split('\n').map((l) => l.trim()).filter(Boolean) });

// What a saved blog's state means, in the words of the person writing it.
const STATUS = {
  published: ['Live on the website', 'good'],
  scheduled: ['Scheduled', 'info'],
  pending: ['Not published', 'warn'],
  changes: ['Not published', 'neutral'],
};

// The blog composer in /admin/blog. Four steps: the cover, the main pictures,
// adjusting them, then the title and the blog itself. Publish puts it on the
// website at once; there is no approval step.
export default function NewPost() {
  const { id } = useParams(); // editing a blog already saved
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState('cover'); // cover | pictures | adjust | write | done
  const [cover, setCover] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [current, setCurrent] = useState(0);
  const [title, setTitle] = useState('');
  const [parts, setParts] = useState(EMPTY_PARTS);
  const [caption, setCaption] = useState('');
  const [captionHtml, setCaptionHtml] = useState('');
  const [docHtml, setDocHtml] = useState(''); // an uploaded Word document, shown as written
  const [bgColor, setBgColor] = useState('');
  const [category, setCategory] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [isRecipe, setIsRecipe] = useState(false);
  const [recipe, setRecipe] = useState(EMPTY_RECIPE);
  const [sentStatus, setSentStatus] = useState(null); // the status of a post being edited
  const [productIds, setProductIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [progress, setProgress] = useState(null); // text while publishing
  const [published, setPublished] = useState(null); // the blog just published
  const [preview, setPreview] = useState(null); // a post object to show

  // Start from the post being edited, or the draft kept on this device.
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const post = await api.post(id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
          if (!post || post.format !== 'post') return navigate('/admin/blog', { replace: true });
          // Pictures saved in another shape are cropped afresh at the one size.
          const reshape = (photo, same) => (same ? photo : { ...photo, uploaded: null });
          if (post.coverUrl) setCover(reshape(await fetchPhoto({ url: post.coverUrl }), (post.coverRatio || '16:9') === PHOTO_RATIO));
          const pictures = await Promise.all((post.media || []).map(fetchPhoto));
          setPhotos(pictures.map((ph, i) => reshape(ph, (i ? post.ratio : post.heroRatio) === PHOTO_RATIO)));
          setTitle(post.title === 'Untitled draft' ? '' : post.title);
          setParts(partsForm(post));
          setCaption(post.caption);
          setCaptionHtml(post.captionHtml || (post.caption && !post.docHtml ? textToHtml(post.caption) : ''));
          setDocHtml(post.docHtml || '');
          setBgColor(post.bgColor || '');
          setCategory(post.category);
          setTagsText((post.tags || []).join(', '));
          setIsRecipe(Boolean(post.recipe));
          setRecipe(recipeForm(post.recipe));
          setProductIds(post.productIds || []);
          setSentStatus(post.status);
          setStep(post.coverUrl ? 'write' : 'cover');
        } else {
          const draft = await loadDraft();
          if (draft?.step) {
            // A draft from before the cover step: its first photo becomes the
            // cover, and it opens on a step that exists now.
            const oldCover = draft.cover || draft.photos[0] || null;
            const pictures = draft.cover ? draft.photos : draft.photos.slice(1);
            // A draft from before the one size: its crops were for other shapes.
            const fresh = (ph) => (ph && draft.photoRatio !== PHOTO_RATIO ? { ...ph, crop: { x: 0, y: 0 }, zoom: 1, area: null } : ph);
            setCover(fresh(oldCover));
            setPhotos(pictures.map(fresh));
            setTitle(draft.title || '');
            setParts({ ...EMPTY_PARTS, ...draft.parts });
            setCaption(draft.caption);
            setCaptionHtml(draft.captionHtml || '');
            setDocHtml(draft.docHtml || '');
            setBgColor(draft.bgColor || '');
            setCategory(draft.category);
            setTagsText(draft.tagsText || '');
            setIsRecipe(Boolean(draft.isRecipe));
            setRecipe({ ...EMPTY_RECIPE, ...draft.recipe });
            setProductIds(draft.productIds);
            const named = { pick: 'pictures', share: 'write' }[draft.step] || draft.step;
            if (!oldCover || !order.includes(named)) setStep('cover');
            else setStep(named !== 'cover' && !pictures.length ? 'pictures' : named);
          }
        }
      } catch (e) {
        setProblem(e.message);
      }
      setReady(true);
      return undefined;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep a new post on this device as it is made, so nothing is lost.
  const hasWork = cover || photos.length || title || caption;
  useEffect(() => {
    if (!ready || id || step === 'done' || progress) return undefined;
    const timer = setTimeout(() => {
      if (hasWork) saveDraft({ cover, photos, photoRatio: PHOTO_RATIO, title, parts, caption, captionHtml, docHtml, bgColor, category, tagsText, isRecipe, recipe, productIds, step });
      else clearDraft();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id, step, progress, cover, photos, title, parts, caption, captionHtml, docHtml, bgColor, category, tagsText, isRecipe, recipe, productIds]);

  // A message belongs to the step it came from, and a field's error goes as
  // soon as the person starts fixing it.
  useEffect(() => setProblem(''), [step]);
  useEffect(() => setErrors((e) => (Object.keys(e).length ? {} : e)), [title, caption, category]);

  const firstId = photos[0]?.id;

  const patchPhoto = (photoId, fields) => setPhotos((list) => list.map((p) => (p.id === photoId ? { ...p, ...fields } : p)));

  const addFiles = async (files) => {
    setProblem('');
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files];
    const read = await Promise.allSettled(picked.slice(0, room).map(readPhoto));
    const good = read.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const bad = read.find((r) => r.status === 'rejected');
    setPhotos((list) => [...list, ...good]);
    if (bad) setProblem(bad.reason.message);
    else if (picked.length > room) setProblem(`A blog can have up to ${MAX_PHOTOS} main pictures.`);
  };

  const pickCover = async (files) => {
    setProblem('');
    try {
      setCover(await readPhoto(files[0]));
    } catch (e) {
      setProblem(e.message);
    }
  };


  const fields = () => ({
    title: title.trim(),
    subtitle: parts.subtitle.trim(),
    intro: parts.intro.trim(),
    takeaway: parts.takeaway.trim(),
    tips: parts.tips.split('\n').map((t) => t.trim()).filter(Boolean),
    conclusion: parts.conclusion.trim(),
    caption: caption.trim(),
    captionHtml,
    docHtml,
    bgColor,
    category: category.trim(),
    tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    coverRatio: PHOTO_RATIO,
    ratio: PHOTO_RATIO,
    heroRatio: PHOTO_RATIO,
    productIds,
    recipe: isRecipe ? recipeBody(recipe) : null,
  });

  const check = () => {
    const next = {};
    if (!cover) next.cover = 'Add a cover picture.';
    if (!photos.length) next.media = 'Add at least one main picture.';
    if (!title.trim()) next.title = 'Give the blog a title.';
    if (!caption.trim()) next.caption = 'Write the blog content.';
    if (!category.trim()) next.category = 'Choose a category.';
    setErrors(next);
    if (next.cover || next.media) setProblem(next.cover || next.media);
    // The first problem may be off the screen, above the thumb's reach.
    requestAnimationFrame(() => document.querySelector('.adm-field.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return !Object.keys(next).length;
  };

  const showPreview = async () => {
    const [coverOut, ...outs] = await Promise.all([cover ? renderPhoto(cover) : null, ...photos.map((p) => renderPhoto(p))]);
    setPreview({
      ...fields(),
      format: 'post',
      title: title.trim() || 'Your title',
      coverUrl: coverOut ? URL.createObjectURL(coverOut.blob) : '',
      media: outs.map((out) => ({ url: URL.createObjectURL(out.blob) })),
      publishAt: new Date().toISOString(),
      author: 'Cholan Rice and Millet Shop',
      readingMinutes: Math.max(1, Math.round((caption.split(/\s+/).length + parts.intro.split(/\s+/).length) / 200)),
    });
  };

  // Uploads whatever is new, keeping each result so that trying again after a
  // failure does not upload anything twice.
  const uploadOne = async (photo) => {
    const out = await renderPhoto(photo);
    const { url } = await api.upload(out.blob);
    return { url, width: out.width, height: out.height };
  };
  const uploadAll = async () => {
    let coverUrl = cover?.uploaded?.url || '';
    if (cover && !cover.uploaded) {
      setProgress('Uploading cover picture…');
      const uploaded = await uploadOne(cover);
      setCover((c) => ({ ...c, uploaded }));
      coverUrl = uploaded.url;
    }
    const media = [];
    const list = [...photos];
    for (let i = 0; i < list.length; i += 1) {
      if (!list[i].uploaded) {
        setProgress(`Uploading picture ${i + 1} of ${list.length}…`);
        list[i] = { ...list[i], uploaded: await uploadOne(list[i]) };
        setPhotos([...list]);
      }
      media.push(list[i].uploaded);
    }
    return { coverUrl, media };
  };

  const save = async (body) => {
    const saved = id ? await api.updateShortPost(id, body) : await api.createShortPost(body);
    if (!id) await clearDraft();
    return saved;
  };

  const live = sentStatus === 'published' || sentStatus === 'scheduled';

  const publish = async () => {
    if (!check()) return;
    setProblem('');
    try {
      const pictures = await uploadAll();
      setProgress(live ? 'Saving changes…' : 'Publishing…');
      setPublished(await save({ ...fields(), ...pictures }));
      setStep('done');
    } catch (e) {
      setProblem(`${e.message} Your blog is safe here; press Publish to try again.`);
    }
    setProgress(null);
  };

  // Keeps the blog in the admin, off the website, to finish later on any device.
  const saveAsDraft = async () => {
    if (!hasWork) {
      setProblem('Add a picture, a title or some content first.');
      return;
    }
    if (live && !window.confirm('Saving as a draft takes this blog off the website until you publish it again. Continue?')) return;
    setProblem('');
    try {
      const pictures = await uploadAll();
      setProgress('Saving draft…');
      await save({ ...fields(), ...pictures, draft: true });
      navigate('/admin/blog', { state: { saved: 'Draft saved. It is not on the website; open it from the list to finish it.' } });
    } catch (e) {
      setProblem(`${e.message} Your blog is safe here; please try again.`);
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(live ? 'Delete this blog? It comes off the website and cannot be brought back.' : 'Delete this blog? It cannot be brought back.')) return;
    try {
      await api.deletePost(id);
      navigate('/admin/blog', { state: { saved: 'Blog deleted.' } });
    } catch (e) {
      setProblem(e.message);
    }
  };

  if (!ready) {
    return (
      <div className="adm-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="adm-center">
        <div className="adm-done">
          <span className="adm-done__icon">
            <Icon name="check" size={34} />
          </span>
          <h1>{live ? 'Changes saved' : 'Your blog is live'}</h1>
          <p>It is on the website now, on the Blog page. It can take up to a minute to appear everywhere.</p>
          {published?.slug && (
            <a href={`/blog/${published.slug}`} target="_blank" rel="noreferrer" className="adm-btn adm-btn--wide">
              View on the website
            </a>
          )}
          <Link to="/admin/blog" className="adm-btn adm-btn--ghost adm-btn--wide">
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  const photo = photos[Math.min(current, photos.length - 1)];
  const back = { pictures: 'cover', adjust: 'pictures', write: 'adjust' }[step];
  const setPart = (key) => (e) => setParts({ ...parts, [key]: e.target.value });
  const setR = (key) => (e) => setRecipe({ ...recipe, [key]: e.target.value });

  const statusBadge = STATUS[sentStatus] || ['Draft', 'neutral'];

  return (
    <div className={`adm-page adm-page--flow${step === 'write' ? ' adm-page--write' : ''}`}>
      {step === 'write' ? (
        <header className="dash-editor__top adm-write-top">
          <button type="button" className="adm-link" onClick={() => setStep(back)}>
            ← Back
          </button>
          <div className="dash-editor__state">
            <Badge tone={statusBadge[1]}>{statusBadge[0]}</Badge>
            <span className="dash-muted">
              Step {order.indexOf(step) + 1} of {order.length}
            </span>
          </div>
          <div className="dash-row">
            <button type="button" className="dash-btn dash-btn--ghost adm-write-preview" onClick={showPreview} disabled={Boolean(progress)}>
              <Icon name="eye" /> Preview
            </button>
            <button type="button" className="dash-btn dash-btn--ghost adm-write-save" onClick={saveAsDraft} disabled={Boolean(progress)}>
              Save draft
            </button>
            <button type="button" className="dash-btn adm-write-send" onClick={publish} disabled={Boolean(progress)}>
              {progress || (live ? 'Save changes' : 'Publish')}
            </button>
          </div>
        </header>
      ) : (
        <>
      <header className="adm-flow-head">
        {back ? (
          <button type="button" className="adm-link" onClick={() => setStep(back)}>
            ← Back
          </button>
        ) : (
          <Link to="/admin/blog" className="adm-link">
            Cancel
          </Link>
        )}
        <h1>{TITLES[step]}</h1>
        <button type="button" className="adm-link adm-flow-head__save" onClick={saveAsDraft} disabled={Boolean(progress)}>
          Save draft
        </button>
      </header>
      <p className="adm-step-count">
        Step {order.indexOf(step) + 1} of {order.length}
      </p>
        </>
      )}

      {problem && (
        <div className="dash-error" role="alert">
          {problem}
        </div>
      )}

      {step === 'cover' &&
        (cover ? (
          <>
            <p className="adm-hint">{SIZE_NOTE}</p>
            <PhotoCrop photo={cover} ratio={PHOTO_RATIO} onChange={(f) => setCover((c) => ({ ...c, ...f }))} />
            <FilePick label="Change cover picture" onFiles={pickCover} testId="adm-cover" />
          </>
        ) : (
          <div className="adm-pick">
            <div className="adm-pick__empty">
              <Icon name="image" size={44} />
              <strong>Add the cover picture</strong>
              <p>Shown on your blog’s card on the blog page. It does not appear inside the blog itself.</p>
              <p>{SIZE_NOTE}</p>
            </div>
            <FilePick label="Choose cover picture" onFiles={pickCover} testId="adm-cover" camera />
          </div>
        ))}

      {step === 'pictures' && <PickStep photos={photos} setPhotos={setPhotos} onFiles={addFiles} />}

      {step === 'adjust' && photo && (
        <>
          <p className="adm-hint adm-hero-note">
            {photo.id === firstId ? 'This first picture is the big one at the top of your blog. ' : ''}
            {SIZE_NOTE}
          </p>
          <PhotoCrop photo={photo} ratio={PHOTO_RATIO} onChange={(f) => patchPhoto(photo.id, f)} />
          {photos.length > 1 && (
            <div className="adm-strip">
              {photos.map((p, i) => (
                <button key={p.id} type="button" className={p.id === photo.id ? 'is-on' : ''} onClick={() => setCurrent(i)} aria-label={`Picture ${i + 1}`}>
                  <img src={p.src} alt="" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'write' && (
        <div className="dash-editor__layout adm-write">
          <div className="dash-editor__main">
            <div className={`adm-field adm-write-head${errors.title ? ' has-error' : ''}`}>
              <textarea
                id="adm-title"
                className="adm-write-title"
                aria-label="Post title"
                rows={1}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
                placeholder="Post title"
              />
              <span className="adm-error">{errors.title}</span>
            </div>
            <textarea
              id="adm-subtitle"
              className="adm-write-summary"
              aria-label="Short summary"
              rows={2}
              maxLength={200}
              value={parts.subtitle}
              onChange={(e) => setParts({ ...parts, subtitle: e.target.value.replace(/\n/g, ' ') })}
              placeholder="A short summary (1–2 sentences). Shown under the title, on the Blog page and in Google."
            />

            <div className={`adm-field${errors.caption ? ' has-error' : ''}`}>
              {!docHtml && (
                <CaptionEditor
                  html={captionHtml}
                  bgColor={bgColor}
                  hasError={Boolean(errors.caption)}
                  onChange={({ html, text }) => {
                    setCaptionHtml(html);
                    setCaption(text);
                  }}
                />
              )}
              <DocImport
                html={docHtml}
                onChange={(doc) => {
                  setDocHtml(doc ? doc.html : '');
                  setCaption(doc ? doc.text : docPlainText(captionHtml));
                }}
              />
              <span className="adm-error">{errors.caption}</span>
            </div>

            <section className="dash-panel">
              <h2>More sections</h2>
              <div className="adm-field">
                <label htmlFor="adm-intro">
                  Introduction <small className="adm-label-note">optional</small>
                </label>
                <textarea id="adm-intro" className="adm-text" rows={3} maxLength={1500} value={parts.intro} onChange={setPart('intro')} placeholder="Start with the main idea of the blog. Keep it simple and clear." />
              </div>
              <div className="adm-field">
                <label htmlFor="adm-takeaway">
                  Key takeaway <small className="adm-label-note">optional, one line</small>
                </label>
                <input id="adm-takeaway" maxLength={300} value={parts.takeaway} onChange={setPart('takeaway')} placeholder="The main benefit for the reader, in one line" />
              </div>
              <div className="adm-field">
                <label htmlFor="adm-tips">
                  Quick tips <small className="adm-label-note">optional, one on each line, up to 6</small>
                </label>
                <textarea id="adm-tips" className="adm-text" rows={3} value={parts.tips} onChange={setPart('tips')} placeholder={'Add short, practical tips\nKeep each point easy to scan'} />
              </div>
              <div className="adm-field">
                <label htmlFor="adm-conclusion">
                  Conclusion <small className="adm-label-note">optional</small>
                </label>
                <textarea id="adm-conclusion" className="adm-text" rows={3} maxLength={1500} value={parts.conclusion} onChange={setPart('conclusion')} placeholder="End with a short wrap-up the reader can take away." />
              </div>
            </section>

            <section className="dash-panel">
              <h2>Recipe</h2>
              <div className="adm-field">
                <label className="adm-check">
                  <input type="checkbox" checked={isRecipe} onChange={(e) => setIsRecipe(e.target.checked)} />
                  <span>
                    <strong>This blog is a recipe</strong>
                    <small>Adds cooking times, ingredients and notes, as a recipe card on the post.</small>
                  </span>
                </label>
                {isRecipe && (
                  <div className="adm-recipe">
                    <div className="adm-recipe__grid">
                      {[
                        ['total', 'Total time', '40 minutes'],
                        ['prep', 'Prep time', '10 minutes'],
                        ['cook', 'Cook time', '30 minutes'],
                        ['servings', 'Serves', '4 people'],
                        ['method', 'Method', 'Steaming'],
                        ['cuisine', 'Cuisine', 'South Indian'],
                      ].map(([key, label, hint]) => (
                        <label key={key}>
                          {label}
                          <input maxLength={60} placeholder={hint} value={recipe[key]} onChange={setR(key)} />
                        </label>
                      ))}
                    </div>
                    <label>
                      Ingredients <small>one on each line</small>
                      <textarea rows={6} value={recipe.ingredients} onChange={setR('ingredients')} placeholder={'2 cups Ponni rice\n1 teaspoon salt'} />
                    </label>
                    <label>
                      Notes <small>optional tips, shown in a box after the steps</small>
                      <textarea rows={3} maxLength={1200} value={recipe.notes} onChange={setR('notes')} />
                    </label>
                    <p className="adm-hint">Write the cooking steps in the blog content above. They appear under “Instructions”.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="dash-editor__side">
            <section className="dash-panel">
              <h2>Publishing</h2>
              <p className="adm-write-note">
                {live
                  ? 'This blog is on the website. Save changes updates it there straight away.'
                  : 'Publish puts this blog on the website straight away. Save draft keeps it here, off the website.'}
              </p>
            </section>

            <section className="dash-panel">
              <h2>Cover image</h2>
              {cover ? (
                <div className="dash-cover">
                  <img src={cover.src} alt="" />
                  <div className="dash-row">
                    <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setStep('cover')}>
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="dash-drop" onClick={() => setStep('cover')}>
                  <Icon name="image" />
                  <span>Add a cover image</span>
                  <small>Shown on your blog’s card on the blog page</small>
                </button>
              )}
            </section>

            <section className="dash-panel">
              <h2>Main pictures</h2>
              {photos.length > 0 ? (
                <div className="adm-write-pictures">
                  {photos.map((p) => (
                    <img key={p.id} src={p.src} alt="" />
                  ))}
                </div>
              ) : (
                <p className="adm-write-note">Add at least one main picture.</p>
              )}
              <div className="dash-row">
                <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setStep('pictures')}>
                  Change
                </button>
                {photos.length > 0 && (
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost dash-btn--sm"
                    onClick={() => {
                      setCurrent(0);
                      setStep('adjust');
                    }}
                  >
                    Adjust
                  </button>
                )}
              </div>
            </section>

            <section className="dash-panel">
              <h2>Details</h2>
              <div className={`adm-field${errors.category ? ' has-error' : ''}`}>
                <label htmlFor="adm-category">Category</label>
                <input id="adm-category" list="adm-categories" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pick or type a category" />
                <datalist id="adm-categories">
                  {POST_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <span className="adm-error">{errors.category}</span>
              </div>
              <div className="adm-field">
                <label htmlFor="adm-tags">
                  Tags <small className="adm-label-note">optional, separated by commas</small>
                </label>
                <input id="adm-tags" maxLength={200} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. idli, ponni, healthy" />
              </div>
              <div className="adm-field">
                <span className="adm-label">
                  Tag products <small>optional, up to 5</small>
                </span>
                <div className="adm-chips">
                  {products.map((p) => {
                    const on = productIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`adm-chip${on ? ' is-on' : ''}`}
                        disabled={!on && productIds.length >= 5}
                        onClick={() => setProductIds(on ? productIds.filter((x) => x !== p.id) : [...productIds, p.id])}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {!docHtml && (
              <section className="dash-panel">
                <h2>Content background</h2>
                <BackgroundPicker value={bgColor} onChange={setBgColor} />
              </section>
            )}

            {id && (
              <section className="dash-panel">
                <h2>Delete</h2>
                <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={remove} disabled={Boolean(progress)}>
                  <Icon name="trash" /> Delete this blog
                </button>
              </section>
            )}
          </aside>
        </div>
      )}

      <div className="adm-bar">
        {step === 'cover' && (
          <button type="button" className="adm-btn adm-btn--wide" disabled={!cover} onClick={() => setStep('pictures')}>
            Next: main pictures
          </button>
        )}
        {step === 'pictures' && (
          <button
            type="button"
            className="adm-btn adm-btn--wide"
            disabled={!photos.length}
            onClick={() => {
              setCurrent(0);
              setStep('adjust');
            }}
          >
            Next: adjust pictures
          </button>
        )}
        {step === 'adjust' && (
          <button type="button" className="adm-btn adm-btn--wide" onClick={() => setStep('write')}>
            Next: write the blog
          </button>
        )}
        {step === 'write' && (
          <>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={showPreview} disabled={Boolean(progress)}>
              Preview
            </button>
            <button type="button" className="adm-btn adm-btn--grow" onClick={publish} disabled={Boolean(progress)}>
              {progress || (live ? 'Save changes' : 'Publish')}
            </button>
          </>
        )}
      </div>

      {preview && (
        <div className="adm-sheet" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="adm-sheet__head">
            <button type="button" className="adm-link" onClick={() => setPreview(null)}>
              ← Back to editing
            </button>
            <span className="adm-muted">How it will look</span>
          </div>
          <div className="adm-sheet__body">
            <PostMain post={preview} preview />
          </div>
        </div>
      )}
    </div>
  );
}

// A button that opens the phone's photos, and optionally one for its camera.
function FilePick({ label, onFiles, testId, camera, multiple, disabled }) {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const onPick = (e) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = '';
  };
  return (
    <div className={`adm-pick__actions${camera ? '' : ' adm-pick__actions--one'}`}>
      <button type="button" className="adm-btn adm-btn--ghost" onClick={() => fileRef.current.click()} disabled={disabled}>
        <Icon name="image" /> {label}
      </button>
      {camera && (
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => cameraRef.current.click()} disabled={disabled}>
          <Icon name="plus" /> Take a photo
        </button>
      )}
      <input ref={fileRef} data-testid={testId} type="file" accept="image/*" multiple={multiple} hidden onChange={onPick} />
      {camera && <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />}
    </div>
  );
}

// Step 2: the main pictures. Drag one to reorder.
function PickStep({ photos, setPhotos, onFiles }) {
  const drag = useRef(null);

  const onPointerDown = (e, photoId) => {
    if (e.target.closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { photoId };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const overId = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-photo]')?.dataset.photo;
    if (!overId || overId === drag.current.photoId) return;
    const { photoId } = drag.current;
    setPhotos((list) => {
      const from = list.findIndex((p) => p.id === photoId);
      const to = list.findIndex((p) => p.id === overId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="adm-pick">
      {photos.length === 0 && (
        <div className="adm-pick__empty">
          <Icon name="image" size={44} />
          <strong>Add the main pictures</strong>
          <p>Up to {MAX_PHOTOS} pictures shown inside your blog. The first one is the big picture at the top.</p>
        </div>
      )}
      {photos.length > 0 && (
        <>
          <div className="adm-pick__grid">
            {photos.map((p, i) => (
              <div
                key={p.id}
                data-photo={p.id}
                className="adm-thumb"
                onPointerDown={(e) => onPointerDown(e, p.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img src={p.src} alt={`Picture ${i + 1}`} draggable={false} />
                {i === 0 && <span className="adm-thumb__cover">Top picture</span>}
                <button
                  type="button"
                  className="adm-thumb__remove"
                  aria-label={`Remove picture ${i + 1}`}
                  onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
          {photos.length > 1 && <p className="adm-muted adm-pick__hint">Drag a picture to change the order. The first is the big picture at the top.</p>}
        </>
      )}
      <FilePick label="Choose pictures" onFiles={onFiles} testId="adm-files" camera multiple disabled={photos.length >= MAX_PHOTOS} />
    </div>
  );
}
