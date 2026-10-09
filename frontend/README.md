# Cholan Rice & Millets — website source

Vite + React 19 (plain JS/JSX), react-router-dom v7, gsap 3.15 (ScrollTrigger + Flip).
Rebuilt from the un-minified production bundle; behaviour, markup, class names and text are meant to be identical to the live site.

```
npm install
npm run dev        # dev server
npm run build      # outputs to dist/  (firebase.json serves dist) -- do not run until told
npx vite build --outDir <somewhere-else>   # safe test build
```

## Structure

```
index.html                  <head> copied from the live site (meta/OG tags, Google Fonts); loads /src/main.jsx
vite.config.js              react plugin, outDir dist
public/                     static assets copied verbatim to dist/ by Vite
  images/  draco/  models/  icons.svg  favicon.png  favicon.svg
  (dist/__/firebase is NOT here: Firebase hosting serves it itself)
src/
  main.jsx                  entry: imports all CSS (in cascade order) and renders <App/> in StrictMode
  App.jsx                   router tree (original Um + Wm)
  config/
    site.js                 `site`      business name/phone/email/address/hours/social   (H)
    features.js             `features`  { prices, cart } flags                          (Ln)
    navigation.js           `mainNav`, `footerNav`, `policyNav`
  data/                     pure shared data
    categories.js           `categories`                                                (zn)
    products.js             `products` (all 29, exact)                                  (Vn)
  lib/                      pure helpers (no React)
    packs.js                makePacks, getDefaultPack, getLowestPrice
    products.js             getProduct, hasProductImage, getFeaturedProducts
    format.js               formatPrice
    whatsapp.js             whatsappLink(product?)
    api.js                  submitEnquiry(enquiry), ApiError  (talks to ../backend)
    cart.js                 CART_STORAGE_KEY, cartKey, loadStoredCart
    motion.js               prefersReducedMotion()
    gsap.js                 registers ScrollTrigger + Flip; exports { gsap, ScrollTrigger, Flip } (+ default gsap)
  context/CartContext.jsx   CartProvider, useCart
  hooks/useSnapScroll.js    useSnapScroll(ref, resolveTarget), getSectionTop(el)  (home full-page snap scrolling)
  components/
    layout/                 Header, Footer, CartDrawer, ScrollToTop
    common/                 CartButton, SectionHeading, Icon (+ iconPaths)
    effects/                PageTransition (route wipe + scroll reveals), InteractionFx (click grains, magnet, tilt, back-to-top)
  pages/                    Home, Story, Products, ProductDetail, About, Blog, Contact, Checkout, Policy, NotFound
                            (currently `return null` stubs; imported extensionless from App.jsx so a page can
                            become a folder `pages/Home/index.jsx` without touching App.jsx)
  styles/                   17 CSS files, contiguous slices of the original stylesheet (see below)
```

## Conventions

- Components are PascalCase, one component per file, default export (hooks/lib: named exports). A component only gets its own folder when it has sub-files (e.g. `pages/Home/index.jsx` + `pages/Home/HeroStage.jsx`).
- Page-specific data/components live next to their page; only data/helpers used by several pages go in `data/`, `lib/`, `components/common/`.
- Import gsap ONLY from `src/lib/gsap.js` (so plugins are registered once). Use `prefersReducedMotion()` from `lib/motion.js`.
- Never rename CSS classes. Prices are all `null` while `features.prices` is false; use `formatPrice(null)` -> "Price on request".
- Cart-only UI is gated by `features.cart` (route `/checkout`, `CartDrawer`, header `CartButton`).

## Backend

The contact form posts its enquiry to the API in `../backend`, which stores it
and forwards it to Firestore. `whatsappLink` is still used for the "Message us
on WhatsApp" buttons, but it is no longer part of submitting the form.

The API's base URL comes from `VITE_API_URL` and falls back to
`http://localhost:8080`, so running `npm run dev` in both folders needs no
configuration. For a deploy, set it at build time to the deployed service:

```
VITE_API_URL=https://cholan-backend-xxxx.run.app npm run build
```

The backend must list the site's origin in its own `ALLOWED_ORIGINS`, or the
browser will block the request.

## CSS

The original `index--ylHkMVp.css` (6082 lines, prettified) was split into contiguous slices; `main.jsx` imports them in the original order. Do not reorder. Pages own their file; add new rules for a page to its own file at the position that preserves cascade (appending to the end of the page's file is safe because no other file styles that page's classes).

| File | Original lines | Contents |
|---|---|---|
| base.css | 1-283 | `:root` tokens, reset, typography, container/grid/btn/eyebrow/lede utilities, `.ph` + responsive/reduced-motion |
| layout.css | 284-743 | `.app-shell`, header, brand, nav, hamburger, footer |
| effects.css | 744-1004 | `fx-*` (wipe, grains, tilt, back-to-top), hover/focus shared states, filters/input/field basics, `fx-pop` |
| cart.css | 1005-1575 | add-to-cart (`atc*`), cart button/drawer (`cart*`), fly/plus animations |
| hero-curtain.css | 1576-1803 | `.curtain` (home hero) |
| rail-story.css | 1804-2124 | `.rs` (rail story section) |
| temple.css | 2125-2418 | `.temple` (scroll-frame temple section) |
| cards.css | 2419-2794 | `.card` product card |
| home-sections.css | 2795-3114 | home sections: category tiles, process steps, bulk, reviews, marquee, quotes, postcards, showcase |
| story.css | 3115-4134 | `/story` page (`.story`, `.ch*` chapters, feast/family/seed/purity/pack/sig...) |
| products.css | 4135-4388 | filters, chips, results, products grid |
| product-detail.css | 4389-4543 | `.pdp`, crumbs, pack buttons |
| about.css | 4544-5122 | `.ab*` |
| blog.css | 5123-5188 | blog (empty state) |
| contact.css | 5189-5391 | `.pagehero`, contact, infocard, form fields, notice |
| policy.css | 5392-5427 | `.policy` |
| checkout.css | 5428-6082 | `.co*` |

There were no `@font-face` rules (fonts come from Google Fonts in `index.html`).

## Mapping: original minified symbol -> new location

Vendor (React, react-router, GSAP, helpers) lines 1-13490 and 14290-21063/24146-25527 are replaced by npm packages. Router symbols: `wn`=BrowserRouter, `Lt`=Routes, `Ft`=Route, `Pt`=Navigate, `Tn`=Link, `En`=NavLink, `st`=useLocation, `jn`=useSearchParams, `_`=React, `U`=jsx runtime, `K`/`Jo`=gsap, `$`=ScrollTrigger, `dm`=Flip. `dr`/`fr` (lines 14282-14289) are Babel helpers (`_assertThisInitialized`, `_inheritsLoose`) for GSAP and `pr`... onwards (14290+) is GSAP core; all dropped.

### Done (foundation)

| Original | New |
|---|---|
| `H` | `src/config/site.js` -> `site` |
| `Ln` | `src/config/features.js` -> `features` |
| `Rn` | `src/lib/whatsapp.js` -> `whatsappLink` |
| `zn` | `src/data/categories.js` -> `categories` |
| `Bn` | `src/lib/packs.js` -> `makePacks` |
| `Vn` | `src/data/products.js` -> `products` |
| `Hn` | `src/lib/products.js` -> `getProduct` |
| `Un` | `src/lib/products.js` -> `getFeaturedProducts` |
| `Wn` | `src/lib/packs.js` -> `getLowestPrice` |
| `Gn` | `src/lib/format.js` -> `formatPrice` |
| `Kn` | `src/lib/products.js` -> `hasProductImage` |
| `Zn` | `src/lib/packs.js` -> `getDefaultPack` |
| `Jn` | `src/lib/cart.js` -> `CART_STORAGE_KEY` |
| `Xn` | `src/lib/cart.js` -> `cartKey` |
| `Qn` | `src/lib/cart.js` -> `loadStoredCart` |
| `Yn`, `$n`, `er` | `src/context/CartContext.jsx` -> (internal context), `CartProvider`, `useCart` |
| `tr` | `src/components/common/CartButton.jsx` |
| `nr` / `ir` / `ar` | `src/config/navigation.js` -> `mainNav` / `footerNav` / `policyNav` |
| `rr` | `src/components/layout/Header.jsx` |
| `or`, `sr` | `src/components/common/Icon.jsx` -> `Icon`, `iconPaths` |
| `cr` | local `mapsUrl` in `Footer.jsx` (the Contact/About pages have their own copies: `Sm`, `Dm`) |
| `lr` | `src/components/layout/Footer.jsx` |
| `ur` | `src/components/layout/ScrollToTop.jsx` |
| `Rd` (also duplicated as `gf`) | `src/lib/motion.js` -> `prefersReducedMotion` |
| `zd`, `Bd`, `Vd` | `src/components/effects/PageTransition.jsx` (route wipe curtain + generic scroll reveals; dispatches `fx:reveal` on window) |
| `Hd`,`Ud`,`Wd`,`Gd`,`Kd`, `qd` | `src/components/effects/InteractionFx.jsx` (grain burst, magnet buttons, card tilt, back-to-top) |
| `Jd` | `src/components/layout/CartDrawer.jsx` |
| `Yd` | `src/components/common/SectionHeading.jsx` |
| `Xd`,`Zd`,`Qd`,`$d` | `src/hooks/useSnapScroll.js` -> `useSnapScroll`, `getSectionTop` (used by Home `nf` and `hf`) |
| `K`, `$`, `dm` + `registerPlugin` calls | `src/lib/gsap.js` |
| `Um`, `Wm` | `src/App.jsx` (`App`, `AppShell`) |
| render call (line 27562) | `src/main.jsx` |

### Product components (`src/components/product/`)

| File | Export | Original |
|---|---|---|
| `ProductCard.jsx` | default `ProductCard({ product })` | `xf` |
| `AddToCart.jsx` | default `AddToCart({ product, pack?, className? })` | `yf` |
| `flyToCart.js` | named `flyToCart(el)`, `floatPlusOne(el)` | `_f`, `vf` |
| `productOrder.js` | named `categoryName(slug)`, `PINNED_PRODUCT_IDS`, `pinnedRank(product)` | `bf`, `fm`, `pm` |

### Still to do (page agents) — everything in lines 21729-27479

Shared product pieces (used by several pages; suggest `src/components/product/`):

| Original | What | Used by |
|---|---|---|
| `_f(el)` | "fly to cart" clone animation (uses `.cart-btn`) | `yf` |
| `vf(el)` | "+1" float animation | `yf` |
| `yf` | DONE `components/product/AddToCart.jsx` | `xf` |
| `bf` | DONE `components/product/productOrder.js` -> `categoryName` | `xf`, Story |
| `xf` | DONE `components/product/ProductCard.jsx` | Home, Products, ProductDetail (related) |
| `_f`,`vf`,`pm`,`fm` | DONE `components/product/flyToCart.js` (`flyToCart`,`floatPlusOne`), `productOrder.js` (`pinnedRank`,`PINNED_PRODUCT_IDS`) | |
| `Em` | DONE: `src/components/common/PageHero.jsx` (props eyebrow/title/lede; default export) | Contact, Policy |
| `xm` | `AboutIcon` svg by name | About |

Pages:

| Original | Page | Owned helpers/data |
|---|---|---|
| `wf` | DONE: `src/pages/Home/index.jsx` (sections `CategoryTiles`, `FeaturedProducts`, `BulkSection`, `Reviews`, `Journal`) | |
| `ef`,`tf`,`nf` | DONE: `src/pages/Home/HeroCurtain.jsx` | |
| `rf`,`af`,`of`,`sf`,`cf` | DONE: `src/pages/Home/RailStory.jsx` | |
| `lf`,`uf`,`df`,`ff`,`pf`,`mf`,`hf` | DONE: `src/pages/Home/TempleSection.jsx` + `useTempleFlight.js` (canvas frame engine + timeline) + `templeBenefits.js` | |
| `Sf` | DONE: `src/data/blogPosts.js` -> `blogPosts` (used by Home `Journal`) | Home |
| `Cf` | DONE: `src/pages/Home/reviews.js` -> `reviews` | Home |
| `Mf` | DONE: `src/pages/Story/index.jsx` + `useStoryScroll.js`, `animations/*.js` (GSAP per chapter), `chapters/*.jsx` (markup), `storyData.js` (`Tf`,`Ef`,`Df`,`Of`,`kf`,`Af`,`jf`). `bf` is not actually used by Story. | |
| `mm` | DONE `pages/Products/index.jsx` + `ProductFilters.jsx` | |
| `hm` | DONE `pages/NotFound.jsx` | |
| `gm` | DONE `pages/ProductDetail.jsx` | |
| `_m`,`vm`,`ym`,`Sm` / `bm`+`xm` / `Cm` / `wm` | DONE: `src/pages/About/` -> `data.js` (values, milestones, packs, directionsUrl) / `AboutIcon.jsx` / `splitWords.jsx` / `index.jsx` (+ `useAboutAnimations.js`). `/process` redirects here | `Rn` |
| `Tm` | DONE: `src/pages/Blog/index.jsx` (empty state only; does not use `Sf`) | |
| `Om`,`Dm`,`km` | DONE: `src/pages/Contact/index.jsx` (`emptyForm`, `fullAddress` inline) | `Em`, `Rn`, `Hn` |
| `Am`,`jm` | DONE `pages/Policy.jsx`, data `src/data/policies.js` -> `policies` | |
| `Mm`,`Nm`,`Pm`,`Fm`,`Im`,`Lm`,`Rm`,`zm`,`Bm`,`Vm`,`Hm` | DONE `pages/Checkout/` (index, DetailsFields, OrderSummary, OrderDone, EmptyCart, orderHelpers.js = `Mm Nm Pm Fm Im Lm Rm`) + `components/checkout/` (`AnimatedPrice`=`zm`, `Field`=`Vm`, `ChoiceRadio`=`Hm`) | |

Note: symbol usages above were detected by text search and can include false positives from shadowed local variables; verify while porting. Line numbers refer to `scratchpad/bundle.pretty.js`.

## Verifying

`npx vite build --outDir <tmp>` builds cleanly with the stub pages (CSS output size matches the original within a few bytes of formatting). `src/data/*.js` were verified to be deep-equal to the originals.
