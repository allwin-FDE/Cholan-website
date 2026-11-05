// Buying guide for the rice page (/rice), and the other names each product
// is searched by. Written as plain answers to what people actually ask
// ("which rice is best for idli?"), drawn from the product descriptions — no
// prices, stock or health claims beyond what the rest of the site already says.

// Other names and spellings each product goes by, in English and Tamil.
// Shown on the product page as "Also known as" and given to search engines.
export const aliases = {
  'chennai-pattanam-rice': ['Chennai Pattanam Ponni', 'Chennai Pattinam rice', 'Ponni rice', 'பொன்னி அரிசி', 'everyday rice'],
  'karikalan-rice': ['Karikalan rice', 'Karikalan arisi', 'கரிகாலன் அரிசி', 'premium Ponni rice', 'aged Ponni rice'],
  'kettimelam-rice': ['Kettimelam rice', 'Gettimelam rice', 'Kettimelam arisi', 'கெட்டிமேளம் அரிசி'],
  'moongil-ponni': ['Moongil Ponni rice', 'Moongil Poompuhar Ponni', 'Moongil rice', 'Ponni arisi', 'மூங்கில் அரிசி'],
  senthoora: ['Senthoora rice', 'Senthura rice'],
  'senthoora-half-boil': ['Senthoora half boiled rice', 'half boiled rice', 'half boil rice'],
  'thooyamalli-ponni-raw-rice': ['Thooyamalli rice', 'Thuyamalli', 'Thooya malli', 'Thaymalli', 'தூயமல்லி அரிசி', 'Ponni raw rice', 'pachai arisi', 'பச்சரிசி', 'raw rice'],
  'chennai-pattanam-idli-rice': ['Chennai Pattanam idli rice', 'idly rice', 'idli arisi', 'இட்லி அரிசி', 'dosa rice'],
  'kurunai-rice': ['broken rice', 'kurunai arisi', 'நொய் அரிசி', 'rice for kanji'],
  'basmati-rice': ['basmati arisi', 'biryani rice', 'பாஸ்மதி அரிசி'],
  'seeraga-samba': ['seeraga samba rice', 'jeeraga samba', 'jeera samba', 'biryani rice', 'சீரக சம்பா அரிசி'],
};

// One guide per category slug.
export const guides = {
  rice: {
    path: '/rice',
    seoTitle: 'Best Rice to Buy — Ponni, Idli Rice, Seeraga Samba, Basmati & Broken Rice',
    seoDescription:
      'Which rice is best? Our guide to Ponni rice for daily meals, raw rice, idli rice for soft idlis, seeraga samba and basmati for biryani, and broken rice for kanji — 1 kg to 26 kg bags from Coimbatore.',
    eyebrow: 'Rice guide',
    title: 'The best rice for every dish',
    intro:
      'There is no single best rice — the best rice is the one milled for what you are cooking. Here is our range, and which one to pick for everyday meals, idli and dosa, biryani and kanji.',
    picks: [
      {
        need: 'Everyday meals (sappadu)',
        products: ['chennai-pattanam-rice', 'karikalan-rice', 'moongil-ponni', 'senthoora'],
        why: 'Ponni is the everyday table rice of Tamil Nadu. Karikalan is our well-aged premium Ponni, with good separation and a rich aroma; Chennai Pattinam Ponni, Moongil Ponni and Senthoora are dependable daily choices.',
      },
      {
        need: 'Raw rice and half-boiled rice',
        products: ['thooyamalli-ponni-raw-rice', 'senthoora-half-boil'],
        why: 'Thooyamalli Ponni Raw Rice is pachai arisi, for dishes that call for raw rice. Senthoora Half Boil is half-boiled rice, in the 26 kg bag.',
      },
      {
        need: 'Soft idli and crisp dosa',
        products: ['chennai-pattanam-idli-rice'],
        why: 'Chennai Pattinam Idli Rice is milled for batter. Soak it before grinding, as you would any idli rice, for idlis that stay soft.',
      },
      {
        need: 'Biryani, pulao and ghee rice',
        products: ['seeraga-samba', 'basmati-rice'],
        why: 'Seeraga samba is the small-grain rice of the Tamil biryani; long-grain basmati stays separate when cooked, for biryani and pulao.',
      },
      {
        need: 'Kanji, pongal and upma',
        products: ['kurunai-rice'],
        why: 'Kurunai (broken rice) is cleaned and graded, and cooks soft — the traditional choice for kanji and pongal.',
      },
      {
        need: 'Messes, hotels and large families',
        products: ['kettimelam-rice', 'karikalan-rice'],
        why: 'Kettimelam and most of our rice come in 26 kg bags, and we supply bulk orders to messes, hostels, caterers and stores on a standing rate.',
      },
    ],
    faq: [
      {
        q: 'Which is the best rice for daily use?',
        a: 'For everyday sappadu, Ponni rice is the most popular choice in Tamil Nadu. Our Karikalan is a well-aged premium Ponni; Chennai Pattinam Ponni, Moongil Ponni and Senthoora are also made for daily meals.',
      },
      {
        q: 'Which rice is best for idli and dosa?',
        a: 'Use a rice milled for batter. Our Chennai Pattinam Idli Rice is made for soft idlis and crisp dosas, in 5 kg and 26 kg bags.',
      },
      {
        q: 'Which rice is best for biryani?',
        a: 'Seeraga samba for a Tamil-style biryani, or long-grain basmati, which stays separate when cooked. We sell both in 1 kg packs.',
      },
      {
        q: 'Do you sell rice in 26 kg bags?',
        a: 'Yes. Chennai Pattinam Ponni, Karikalan, Kettimelam, Moongil Ponni, Senthoora, Senthoora Half Boil, Thooyamalli Ponni Raw Rice, Chennai Pattinam Idli Rice and Kurunai Rice all come in 26 kg bags, and we quote standing rates for monthly bulk orders.',
      },
      {
        q: 'Where can I buy rice in Coimbatore?',
        a: 'From Cholan Rice and Millet Shop, 32/A2, SP Kannusamy Gounder St, Sanganoor, Coimbatore – 641027. Call or WhatsApp +91 90922 66667, or send an enquiry from our Contact page. We deliver across India, subject to courier availability at your pin code.',
      },
    ],
  },
};
