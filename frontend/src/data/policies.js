// Policy page text keyed by URL slug (original `Am`), as approved by the
// business on 26 October 2026.
//
// Each policy has an `intro` and `sections` of { h, body }. A body is a list
// of blocks: a paragraph (a string), a bullet list ({ list: [...] }),
// numbered steps ({ steps: [...] }) or a table ({ table: { head, rows } }).
// Inside any text: **bold**, [a link](/path), and [square brackets] alone
// for a detail still to be filled in, which the page marks.
// `draft: true` shows a "placeholder text" note on the page.

const company =
  'Cholan Rice and Millet Shop is a brand of **Cholan Rice and Millet Shops Private Limited**, CIN U51211TZ2022PTC038064, GSTIN 33AAKCC0627N1ZL, FSSAI Licence No. 12422018001222.';

const contactList = {
  list: [
    '**Address:** 32/A2, SP Kannusamy Gounder Street, Sanganoor, Coimbatore – 641027, Tamil Nadu',
    '**Email:** info@cholanrice.in',
    '**Phone / WhatsApp:** +91 90922 66667',
  ],
};

export const policies = {
  shipping: {
    title: 'Shipping Policy',
    lede: 'How we pack and deliver your order.',
    updated: '26 October 2026',
    intro: [
      `This policy explains how Cholan Rice and Millet Shop packs and delivers orders placed through www.cholanrice.in, by phone, WhatsApp or email. It does not cover purchases at our physical stores. ${company}`,
    ],
    sections: [
      {
        h: '1. Where we deliver',
        body: [
          {
            list: [
              'We deliver **across India**, through our own delivery team and trusted courier partners, **subject to courier availability at your pin code**.',
              'When you order, share your full address and pin code. We confirm courier availability and the delivery charge **before you pay**.',
              'If no courier serves your pin code, we will tell you and will not take payment. For bulk orders, we may arrange separate transport.',
            ],
          },
        ],
      },
      {
        h: '2. Packing and dispatch',
        body: [
          {
            list: [
              'Once your order is confirmed, we send you a confirmation by WhatsApp, SMS or email.',
              'Every bag is **packed fresh after your order is confirmed**, sealed at our facility and packed for safe transit.',
              'We dispatch your order within **1–2 working days** of confirmation.',
              'When it is dispatched, we send the dispatch details, and a tracking link where available, on WhatsApp.',
            ],
          },
        ],
      },
      {
        h: '3. Delivery time',
        body: [
          {
            table: {
              head: ['Delivery area', 'Usual delivery time'],
              rows: [
                ['Within Coimbatore', '1–2 working days'],
                ['Other districts of Tamil Nadu', '3–5 working days'],
                ['Other states', '5–8 working days, depending on the courier'],
                ['Bulk orders', 'As per the schedule agreed in your quote'],
              ],
            },
          },
          'These are estimates, not guaranteed dates. Weather, strikes, holidays and other events outside our control can cause delays.',
        ],
      },
      {
        h: '4. Delivery charges',
        body: [
          {
            list: [
              'Delivery charges depend on the order weight, your location and the courier serving your pin code.',
              'We tell you the final total, including product price, taxes and delivery, **before you pay**. There are no hidden charges at the doorstep.',
              'Bulk-order transport is quoted separately with your rate.',
            ],
          },
        ],
      },
      {
        h: '5. Receiving your order',
        body: [
          {
            list: [
              '**Address:** give a complete address, a nearby landmark and a phone number that is reachable on the delivery day. The address cannot be changed after dispatch.',
              '**Delivery attempts:** our delivery partner will make up to **3 attempts** and may call you to reschedule.',
              '**Check at the doorstep:** if the outer bag is torn, wet, open or tampered with, you may refuse it, or accept it and ask the delivery person to note the damage. Report any damaged, wrong, missing or short-weight item within **48 hours**. Our [Return & Refund Policy](/policies/returns) explains what happens next.',
              '**Undelivered orders:** if an order comes back because of a wrong address, an unreachable phone or refusal without a valid reason, we refund the amount paid **minus the actual delivery and return charges**. We will tell you the deduction first and refund within 5–7 working days of the parcel reaching us.',
            ],
          },
        ],
      },
      {
        h: '6. Help and contact',
        body: [
          'Contact us with the phone number you ordered from:',
          contactList,
          'We may update this policy from time to time. The version on our website when you place your order applies to that order. This policy follows the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.',
        ],
      },
    ],
  },

  returns: {
    title: 'Return & Refund Policy',
    lede: 'What happens if something is not right.',
    updated: '26 October 2026',
    intro: [
      `This policy applies to orders placed with Cholan Rice and Millet Shop through www.cholanrice.in, by phone, WhatsApp or email. It does not cover purchases at our physical stores. ${company}`,
    ],
    sections: [
      {
        h: '1. Our promise',
        body: [
          'If your rice reaches you damaged, wrong, short in weight or not up to our quality, **we will replace them or refund you in full**. Because these are food products, we cannot resell anything that has left our hands, so we focus on fixing the problem quickly rather than asking you to send products back.',
        ],
      },
      {
        h: '2. Problems we cover',
        body: [
          {
            table: {
              head: ['Problem', 'Report within', 'What to send us'],
              rows: [
                ['Pack torn, leaking or damaged in transit', '48 hours of delivery', 'Photos of the outer bag and the damaged pack'],
                ['Wrong product, variety or pack size', '48 hours of delivery', 'Photo of the pack received'],
                ['Item missing from the order', '48 hours of delivery', 'Unboxing video and photos of the parcel'],
                ['Pack weighs less than the printed net weight', '48 hours of delivery', 'Unboxing video and photo of the unopened pack on a scale'],
                ['Expired product, or shorter shelf life than we told you', '7 days of delivery', 'Photo of the date and batch number on the pack'],
                ['Quality problem – insects, foul smell, fungus, stones or foreign matter', '7 days of delivery', 'Photos or video and the batch number; please keep the product until we close your request'],
              ],
            },
          },
        ],
      },
      {
        h: '3. How to raise a request',
        body: [
          'WhatsApp or email us with your name, the phone number you ordered from, the batch number on the pack, photos, an unboxing video (for missing or short-weight items, recorded without a cut from the sealed parcel) and a one-line description of the problem.',
          {
            list: [
              '**Email:** info@cholanrice.in',
              '**Phone / WhatsApp:** +91 90922 66667',
              '**Address:** 32/A2, SP Kannusamy Gounder Street, Sanganoor, Coimbatore – 641027, Tamil Nadu',
            ],
          },
          'We reply within **48 hours** and share a decision within **3 working days**.',
        ],
      },
      {
        h: '4. Replacement or refund – your choice',
        body: [
          'Once we verify the issue, you choose a **free replacement** or a **full refund** of that item, including its delivery charge. In most cases you will not need to send the product back. If we need it for testing, we will collect it free of charge.',
          {
            table: {
              head: ['Situation', 'Refund amount', 'Refund time'],
              rows: [
                ['Cancelled within the free cancellation window', '100% of amount paid', 'Started within 24 hours'],
                ['Damaged, wrong, missing, short-weight, expired or quality issue', '100% of item value + its delivery charge', '5–7 working days after approval'],
                ['Undelivered due to wrong address, unreachable phone or refusal without reason', 'Amount paid minus actual courier charges both ways', '5–7 working days after the parcel reaches us'],
              ],
            },
          },
          {
            list: [
              'Refunds go back to your **original payment method**.',
              'If you used a coupon or discount, we refund the amount you actually paid.',
              'If a replacement is out of stock, we refund you in full.',
              'Not received your refund 10 working days after approval? Contact us and we will trace it.',
            ],
          },
        ],
      },
      {
        h: '5. What we cannot take back',
        body: [
          {
            list: [
              '**Change of mind** after the order is packed or dispatched.',
              '**Taste preference** – grain size, aroma or cooking style that matches the product description.',
              '**Storage problems** – moisture, insects or smell that appear later because the product was kept in a damp, hot or open place.',
              '**Largely used packs**, or product mixed with other grain or moved to another container, unless the problem was there from the start.',
              '**Late reports** after the time limits in point 2, unless there was a genuine reason.',
              '**Free gifts** given with an offer.',
            ],
          },
          'Small differences in colour, grain size, aroma or cooking time between harvests are natural and are not defects.',
        ],
      },
      {
        h: '6. Cancellations',
        body: [
          {
            list: [
              'You can cancel **free of charge within 2 hours of confirming your order, or before we start packing, whichever is earlier**. Every bag is packed fresh, so orders already packed or dispatched cannot be cancelled.',
              'We may cancel your order if an item is out of stock, no courier serves your pin code, or there is a clear pricing error. You will get a **full refund**, and we will tell you why.',
            ],
          },
          '**Fair use:** if we see repeated claims that do not match our dispatch records, we may ask for more proof before approving further requests.',
          'We may update this policy from time to time. The version on our website when you place your order applies to that order. This policy does not limit your rights under the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    lede: 'What we collect and what we do with it.',
    updated: '26 October 2026',
    intro: [
      'This policy explains how Cholan Rice and Millet Shop collects, uses and protects your personal information. By using www.cholanrice.in or sharing your details with us, you agree to this policy.',
    ],
    sections: [
      {
        h: '1. Who we are',
        body: [
          'Cholan Rice and Millet Shop (“Cholan”, “we”, “us”) is a brand of **Cholan Rice and Millet Shops Private Limited**, CIN U51211TZ2022PTC038064, GSTIN 33AAKCC0627N1ZL, FSSAI Licence No. 12422018001222, 32/A2, SP Kannusamy Gounder Street, Sanganoor, Coimbatore – 641027, Tamil Nadu, India.',
          'This policy covers information collected through our website, phone, WhatsApp, email, enquiry forms and social media pages. It does not cover purchases at our physical stores.',
        ],
      },
      {
        h: '2. What we collect',
        body: [
          {
            list: [
              '**Contact details** – name, phone or WhatsApp number and email.',
              '**Order details** – delivery address, pin code, products ordered and order history.',
              '**Business details** – business name, GSTIN and billing address, for bulk buyers.',
              '**Payment records** – payment method, transaction reference and amount paid. **We never see or store your card number, CVV, UPI PIN, password or OTP.**',
              '**Messages** – enquiries, complaints, photos and reviews you send us.',
              '**Website usage** – device, browser, pages visited and IP address, collected through cookies. One cookie gives your browser a random ID, kept for about 13 months, so we can count return visits; it does not contain your name or contact details. You can turn this off at any time with “Cookie settings” at the bottom of any page, or block cookies in your browser settings.',
            ],
          },
        ],
      },
      {
        h: '3. How we use it',
        body: [
          {
            list: [
              'To reply to your enquiries and share prices and product details.',
              'To confirm, pack and deliver your orders, and send order updates by call, SMS, WhatsApp or email.',
              'To receive payments, issue GST invoices and handle complaints, replacements and refunds.',
              'To send offers and news, **only if you agree**. Reply STOP or tell us to stop them at any time.',
              'To improve our website and service, measure our ads (for example, Google Analytics, Google Ads and Meta Pixel), prevent fraud and follow the law.',
            ],
          },
        ],
      },
      {
        h: '4. Who we share it with',
        body: [
          '**We never sell or rent your personal information.** We share it only when needed, with:',
          {
            list: [
              'courier and delivery partners, to deliver your order;',
              'banks and payment providers, to process payments;',
              'technology providers (website hosting, email, WhatsApp Business, customer-management and cloud storage tools) that run our services;',
              'our group companies, which share our order, delivery and customer-support systems and follow this same policy;',
              'auditors, accountants and lawyers, for our accounts and legal compliance;',
              'government authorities, only when the law or a court order requires it.',
            ],
          },
          'Everyone we share with must keep your information safe and use it only for that purpose.',
        ],
      },
      {
        h: '5. How we protect and keep it',
        body: [
          {
            list: [
              'We use a secure (HTTPS) website, password-protected systems and trusted providers, and only staff who need your information can access it.',
              'We keep order and invoice records as long as tax laws require, other enquiries up to 2 years, and complaints up to 3 years after closure. After that, we delete the information.',
              'If a data breach affects you, we will inform you and the Data Protection Board of India.',
              'Our website is meant for adults. We do not knowingly collect information from anyone under 18 without a parent’s consent.',
              '**Beware of fraud:** Cholan will never ask for your OTP, UPI PIN, card details or passwords.',
            ],
          },
        ],
      },
      {
        h: '6. Your rights and contact',
        body: [
          'You can ask us to see, correct or delete your information, stop marketing messages, withdraw your consent, or name a nominee to act for you. We may ask you to confirm your identity first.',
          'For any request, question or complaint, contact us:',
          contactList,
          'We reply within 48 hours and aim to resolve complaints within 30 days. If you are not satisfied, you can complain to the Data Protection Board of India.',
          'This policy follows Indian law, including the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023. Courts in Coimbatore, Tamil Nadu have jurisdiction. We may update this policy from time to time; the date at the top shows the latest version.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    lede: 'The basis on which we sell.',
    updated: '26 October 2026',
    intro: [
      'These Terms and Conditions (“Terms”) are a legal agreement between you and **Cholan Rice and Millet Shops Private Limited**, which owns and operates the Cholan Rice and Millet Shop brand and the website www.cholanrice.in. Please read them carefully. By using our website or placing an order with us online, by phone, WhatsApp or email, you agree to these Terms. Purchases made at our physical stores are not covered by these Terms. If you do not agree, please do not use the website or place an order.',
    ],
    sections: [
      {
        h: '1. Who we are',
        body: [
          'Cholan Rice and Millet Shop (“Cholan”, “we”, “us”, “our”) is a brand of **Cholan Rice and Millet Shops Private Limited**, CIN U51211TZ2022PTC038064, GSTIN 33AAKCC0627N1ZL, FSSAI Licence No. 12422018001222, 32/A2, SP Kannusamy Gounder Street, Sanganoor, Coimbatore – 641027, Tamil Nadu, India. Phone / WhatsApp: +91 90922 66667. Email: info@cholanrice.in.',
          'These Terms apply together with our [Privacy Policy](/policies/privacy), [Shipping Policy](/policies/shipping) and [Refund & Return Policy](/policies/returns).',
        ],
      },
      {
        h: '2. Eligibility',
        body: [
          'You must be at least 18 years old and competent to contract under the Indian Contract Act, 1872 to place an order. If you are under 18, a parent or guardian must place the order for you. If you order on behalf of a business, you confirm that you are authorised to bind that business to these Terms.',
        ],
      },
      {
        h: '3. Your responsibilities',
        body: [
          {
            list: [
              'Give us true, complete and current details, including your name, phone number and full delivery address with pin code and landmark.',
              'Make sure someone is available to receive the order at the address given.',
              'Tell us promptly if any of your details change.',
            ],
          },
          'We are not responsible for failed or wrong delivery caused by an incorrect or incomplete address, or when someone at the given address accepts the order on your behalf.',
        ],
      },
      {
        h: '4. Using our website',
        body: [
          'You may use this website to learn about our products, send enquiries and contact us. You must not:',
          {
            list: [
              'give false or misleading information, or use someone else’s details;',
              'copy, scrape or reuse our content, images or prices for commercial purposes without our written permission;',
              'upload viruses or harmful code, or try to hack, disrupt or overload the website;',
              'post content that is unlawful, abusive, defamatory or infringes anyone’s rights;',
              'use the website for any unlawful purpose.',
            ],
          },
          'We may suspend or refuse service to anyone who breaks these rules.',
        ],
      },
      {
        h: '5. Our products',
        body: [
          'Our rice is a natural agricultural product. Colour, grain size, aroma, taste, cooking time and water absorption can vary slightly between harvests and batches. This is normal and not a defect.',
          {
            list: [
              'Product photos are for illustration. The actual pack design or colour may differ slightly.',
              'The label on the pack you receive is the final reference for net weight, ingredients, best-before date, batch number, MRP and storage advice.',
              'Nutrition and health information on our website is general and for awareness only. It is not medical advice. If you have a health condition or allergy, consult a doctor before changing your diet.',
              'Our products are packed in a facility that also handles other grains and pulses, so traces may be present.',
            ],
          },
        ],
      },
      {
        h: '6. Prices, taxes and errors',
        body: [
          {
            list: [
              'All prices are in Indian Rupees and include GST unless stated otherwise.',
              'Rice and grain prices move with the market. Prices on our website, in brochures or in earlier messages are indicative. The rate we confirm when you place your order applies.',
              'We will never charge more than the MRP printed on a retail pack.',
              'Delivery charges, where they apply, are told to you before you confirm the order.',
              'Despite our care, a product, price or offer may sometimes be shown wrongly. If so, we may correct the error or cancel the order, even after confirmation or payment. We will inform you and refund any amount paid in full.',
            ],
          },
        ],
      },
      {
        h: '7. Orders',
        body: [
          'You can order by calling or messaging us on WhatsApp at +91 90922 66667, by email, or through the enquiry form on our website.',
          {
            steps: [
              'Tell us the product, pack size, quantity and delivery address.',
              'We confirm availability, price, delivery charge and expected delivery date.',
              'Your order is confirmed once we acknowledge it and payment terms are agreed.',
              'We pack fresh after confirmation and dispatch as agreed.',
            ],
          },
          'We may refuse or cancel any order, in full or in part, if the product is out of stock, there is a quantity limit, no courier serves the delivery pin code, the address is incomplete, the price or product information was wrong, or we suspect fraud. We may ask for more details before accepting an order. If you have paid for a cancelled order, we will refund you in full.',
        ],
      },
      {
        h: '8. Payment',
        body: [
          'We accept **online payments only** – UPI, debit or credit card, net banking and payment links. We do not offer cash on delivery.',
          {
            list: [
              'We begin packing after your payment is received in our account.',
              'Bulk and trade accounts pay as agreed in writing.',
              'A GST invoice is issued for every order.',
              '**We will never ask for your OTP, UPI PIN, card number or CVV.** Do not share these with anyone claiming to be from Cholan.',
            ],
          },
        ],
      },
      {
        h: '9. Delivery',
        body: [
          'We deliver across India, subject to courier availability at your pin code. Delivery areas, timelines and charges are set out in our [Shipping Policy](/policies/shipping). Delivery dates are estimates and may be affected by weather, strikes, holidays or other events outside our control.',
          '**Check your order at the doorstep.** Please inspect the bag in front of the delivery person. Do not accept a bag that is torn, wet, open or tampered with. If you accept it, take photos and tell us within 48 hours. Ownership and risk pass to you on delivery.',
        ],
      },
      {
        h: '10. Cancellations',
        body: [
          '**By you.** Because every bag is packed fresh against your order, you can cancel free of charge **within 2 hours of confirming, or before we start packing, whichever is earlier**. If you have paid, we refund the full amount. Once an order is packed or dispatched, it cannot be cancelled. You may still refuse delivery, but we may deduct actual delivery and return charges from any refund.',
          '**By us.** We may cancel for the reasons listed in section 7. We will tell you and refund any amount paid in full.',
          'Bulk orders packed or arranged specially for you may be cancelled only as agreed in your quote.',
        ],
      },
      {
        h: '11. Damaged, wrong or missing items',
        body: [
          'Full details are in our [Refund & Return Policy](/policies/returns). In short:',
          {
            list: [
              '**Report within 48 hours of delivery (7 days for expiry or quality problems)** by WhatsApp, phone or email, with your order details, photos of the outer bag and the product, and **an unboxing video** for any missing or short-weight item.',
              'If the claim is valid, we will **replace the product or refund you in full**, at no extra cost.',
              'We cannot accept returns for natural variation in colour, grain size, aroma or taste (see section 5).',
              'Because these are food products, opened packs cannot be returned unless there is a genuine quality defect.',
              'Approved refunds are made within 5–7 working days to the original payment method.',
            ],
          },
          'Nothing in these Terms affects your rights as a consumer under the Consumer Protection Act, 2019.',
        ],
      },
      {
        h: '12. Bulk, wholesale and distributor orders',
        body: [
          'For hotels, hostels, messes, caterers, provision stores and distributors:',
          {
            list: [
              'Bulk rates are quoted in writing and are valid for the period stated in the quote.',
              'Delivery schedules, transport, credit period and minimum quantities are as agreed in writing.',
              'Where a signed quote, purchase order or distributor agreement exists, it applies along with these Terms. If they conflict, the signed document applies.',
            ],
          },
        ],
      },
      {
        h: '13. Storage and use',
        body: [
          'Store our products in a cool, dry, airtight place away from moisture, pests and direct sunlight, and use them before the best-before date. We are not responsible for loss of quality caused by improper storage, contamination or use after delivery.',
        ],
      },
      {
        h: '14. Offers, coupons and contests',
        body: [
          'Discounts, coupons, free gifts and contests follow their own published rules and validity. Unless stated otherwise, offers cannot be combined, exchanged for cash or applied to past orders. We may change or withdraw an offer at any time, but not for orders already confirmed.',
        ],
      },
      {
        h: '15. Reviews, feedback and content you send',
        body: [
          'If you send us reviews, photos, testimonials, ideas or contest entries, you allow us to use, edit and publish them on our website and social media, with your first name and city, without payment. We will not publish your phone number, address or email. You confirm that your content is your own, is truthful and does not break any law or anyone’s rights. We may remove content that is false, offensive or unlawful. You can ask us to remove your review at any time.',
        ],
      },
      {
        h: '16. Intellectual property',
        body: [
          'The Cholan name and logo, our product names (such as Karikalan, Chennai Pattanam, Moongil and Kettimelam), pack designs, photographs, text and website design belong to us or our licensors. You may not copy, reproduce or use them without our written permission.',
        ],
      },
      {
        h: '17. Third-party links and services',
        body: [
          'Our website links to WhatsApp, Google Maps, Facebook, Instagram, LinkedIn and other services we do not control. We are not responsible for their content, availability or how they handle your data. Please read their terms before using them.',
        ],
      },
      {
        h: '18. Disclaimer and limitation of liability',
        body: [
          'We work to keep our website accurate and available, but we do not guarantee that it will always be error-free, secure or uninterrupted.',
          'To the extent allowed by law, our total liability for any order is limited to the amount you paid for that order. We are not liable for indirect or consequential losses, such as loss of business, profit or goodwill. Nothing in these Terms limits liability that cannot be limited under Indian law, including your rights as a consumer.',
        ],
      },
      {
        h: '19. Indemnity',
        body: [
          'You agree to compensate us for any loss, claim or cost, including reasonable legal fees, caused by your breach of these Terms, your misuse of the website, or your violation of any law or another person’s rights.',
        ],
      },
      {
        h: '20. Events beyond our control',
        body: [
          'We are not responsible for delays or failure to deliver caused by events beyond our reasonable control, such as floods, heavy rain, strikes, transport disruption, government orders, epidemics, or power and network failures. We will inform you and offer a new delivery date or a full refund.',
        ],
      },
      {
        h: '21. Suspension and termination',
        body: [
          'We may suspend or stop supplying to anyone who breaks these Terms, misuses offers, or acts fraudulently. Any amounts due to us up to that date remain payable, and any amounts due to you will be refunded.',
        ],
      },
      {
        h: '22. Governing law and disputes',
        body: [
          'These Terms are governed by the laws of India. Courts in Coimbatore, Tamil Nadu will have jurisdiction. Before going to court, please contact our Grievance Officer so we can try to settle the matter. This does not affect your right to approach a Consumer Disputes Redressal Commission or the National Consumer Helpline (1915).',
        ],
      },
      {
        h: '23. Grievance Officer',
        body: [
          'For any complaint about our products, orders or these Terms:',
          contactList,
          'We will acknowledge your complaint within 48 hours and resolve it within 30 days.',
        ],
      },
      {
        h: '24. General',
        body: [
          {
            list: [
              '**Entire agreement.** These Terms, with the policies linked in section 1, are the full agreement between you and us about your use of the website and your orders.',
              '**Severability.** If any part of these Terms is found invalid, the rest remains in force.',
              '**No waiver.** If we do not enforce a right at any time, we do not give up that right.',
              '**Transfer.** We may transfer our rights under these Terms to a successor business. You may not transfer yours without our written consent.',
            ],
          },
        ],
      },
      {
        h: '25. Changes to these Terms',
        body: [
          'We may update these Terms from time to time. The version on our website on the date you place your order applies to that order. The “Last updated” date at the top shows the latest version.',
        ],
      },
    ],
  },
};
