// Site-wide business details (original symbol `H`). Single source of truth for
// contact info, address, registration numbers and social links.
export const site = {
  // Matches the wording on the logo, so the brand reads the same everywhere.
  name: 'Cholan Rice and Millet Shop',
  shortName: 'Cholan',
  tagline: 'Pure goodness, always.',
  intro:
    'From the paddy fields of Tamil Nadu to your kitchen — rice, sourced and packed with care.',
  phone: '+91 90922 66667',
  phoneRaw: '919092266667',
  // The WhatsApp Business number (the /whatsapp dashboard and bot), shown
  // with the WhatsApp logo under the call number. show: false hides it.
  // The "WhatsApp us" buttons still open phoneRaw.
  whatsapp: { number: '+91 81483 13478', raw: '918148313478', show: true },
  email: 'info@cholanrice.in',
  address: {
    // As on the company's GST registration (and Meta's verified business info).
    line1: '32/B2, SP Kannusamy Street',
    line2: 'Sanganoor, Coimbatore',
    pincode: '641027',
    state: 'Tamil Nadu, India',
  },
  // The company behind the brand, and its registration numbers, shown in the
  // footer. Each line stays hidden until its number is filled in, so no
  // placeholder ever reaches the page.
  legalName: 'Cholan Rice and Millet Shops Private Limited',
  cin: 'U51211TZ2022PTC038064',
  fssai: '12422018001222',
  gstin: '33AAKCC0627N1ZL', // 15-character GSTIN
  social: {
    instagram: 'https://www.instagram.com/cholanrice/',
    facebook: 'https://www.facebook.com/profile.php?id=61593548190956',
    linkedin: 'https://www.linkedin.com/company/cholan-rice-millets/',
  },
};
