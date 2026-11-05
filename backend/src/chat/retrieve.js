// Finds the parts of the website that answer a question.
//
// The knowledge base (knowledge.json, built from the site by
// `npm run knowledge`) is a few dozen short chunks, so a plain BM25 keyword
// index is enough: no embeddings service, nothing to host. A small synonym
// table covers the ways visitors phrase things that the site words
// differently ("idly" for "idli", "cost" for "price", "kollu" for "horse
// gram").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chunks } = JSON.parse(fs.readFileSync(path.join(here, 'knowledge.json'), 'utf8'));

// Always sent with every question: who the business is, how to reach it, and
// how ordering and prices work. Small, and the answer to many questions.
const ALWAYS = ['business', 'ordering'];

const STOP = new Set(
  'a an and are as at be by can do does for from have how i in is it its me my of on or our please the their them this to us was we what when where which who why will with you your'.split(
    ' ',
  ),
);

// Each group is treated as one word: a query using any of them matches
// chunks that use any other.
// Tamil words appear here in their stemmed form (see tamilStem).
const SYNONYMS = [
  ['idli', 'idly', 'இட்லி'],
  ['dosa', 'dosai', 'தோசை'],
  ['rice', 'அரிசி'],
  ['price', 'prices', 'cost', 'rate', 'rates', 'mrp', 'rupees', 'rs', 'விலை'],
  ['delivery', 'deliver', 'shipping', 'ship', 'courier', 'dispatch'],
  ['contact', 'phone', 'call', 'number', 'mobile', 'whatsapp', 'reach'],
  ['email', 'mail', 'gmail'],
  ['address', 'location', 'located', 'shop', 'store', 'office', 'warehouse', 'visit', 'directions'],
  ['hours', 'timing', 'timings', 'open', 'opening', 'closed'],
  // "How long does it take?" — the delivery time table.
  ['time', 'long', 'days', 'quickly', 'soon', 'fast', 'arrive'],
  ['payment', 'pay', 'paying', 'cash', 'cod', 'upi', 'gpay', 'card', 'online', 'banking'],
  ['cancel', 'cancelling', 'canceling', 'cancellation', 'cancelled', 'canceled'],
  ['company', 'brand', 'limited', 'private', 'pvt', 'ltd', 'cin', 'owner', 'owns'],
  ['privacy', 'data', 'personal', 'information', 'share', 'sharing', 'cookies'],
  // Not sold any more; these find the line in the catalogue that says so.
  ['millet', 'millets', 'siruthaniyam', 'ragi', 'thinai', 'samai', 'varagu', 'kuthiraivali'],
  ['kollu', 'horse', 'gram', 'horsegram', 'pulse', 'pulses', 'legume'],
  ['seeraga', 'jeeraga', 'jeera', 'samba', 'biryani'],
  ['raw', 'pachai', 'pacharisi'],
  ['boil', 'boiled', 'parboiled', 'puzhungal'],
  ['kurunai', 'broken'],
  ['bulk', 'wholesale', 'mess', 'messes', 'caterer', 'caterers', 'hotel', 'hostel', 'distributor', 'retailer'],
  ['size', 'sizes', 'pack', 'packs', 'kg', 'weight', 'bag', 'bags', 'quantity'],
  ['refund', 'refunds', 'return', 'returns', 'replace', 'replacement', 'damaged'],
  ['order', 'buy', 'purchase', 'ordering', 'checkout', 'cart'],
  ['gst', 'gstin', 'fssai', 'licence', 'license', 'registration'],
  ['gluten', 'celiac', 'coeliac'],
  ['fibre', 'fiber'],
  ['history', 'founded', 'started', 'began', 'began', 'since', 'journey', 'story', 'old', 'years'],
  ['diabetes', 'diabetic', 'sugar', 'glycaemic', 'glycemic', 'energy'],
];
const canonical = new Map();
for (const group of SYNONYMS) for (const word of group) canonical.set(word, group[0]);

// Tamil joins case endings onto the word ("இட்லிக்கு" = "for idli",
// "அரிசியை" = "the rice"), so the same word rarely matches letter for letter.
// Comparing Tamil words by their opening (first five code units, about two or
// three letters) lines up a word with its inflected forms.
const TAMIL = /[஀-௿]/;
const tamilStem = (w) => (TAMIL.test(w) ? w.slice(0, 5) : w);

export function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map(tamilStem)
    .map((w) => canonical.get(w) ?? canonical.get(w.replace(/s$/, '')) ?? w.replace(/(?<=\w{3})s$/, ''));
}

// ---- BM25 index ----
const K1 = 1.2;
const B = 0.75;

// The title counts twice: a question naming a product should land on it.
const docs = chunks.map((chunk) => {
  const terms = tokenize(`${chunk.title} ${chunk.title} ${chunk.text}`);
  const tf = new Map();
  for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
  return { chunk, tf, length: terms.length };
});
const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;
const docFreq = new Map();
for (const d of docs) for (const t of d.tf.keys()) docFreq.set(t, (docFreq.get(t) || 0) + 1);

const idf = (term) => {
  const n = docFreq.get(term) || 0;
  return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
};

/**
 * The chunks that best answer `query`, best first, plus the always-on ones.
 * Returns `{ context, sources }`: every chunk to show the model, and the
 * retrieved ones to show the visitor as "from these pages" links.
 */
export function retrieve(query, k = 4) {
  const terms = [...new Set(tokenize(query))];
  const scored = docs
    .filter((d) => !ALWAYS.includes(d.chunk.id))
    .map((d) => {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgLength)));
      }
      return { chunk: d.chunk, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const retrieved = scored.map((s) => s.chunk);
  const always = ALWAYS.map((id) => chunks.find((c) => c.id === id)).filter(Boolean);
  return { context: [...retrieved, ...always], sources: retrieved };
}

export const knowledgeSize = chunks.length;
export { chunks };
