// Ready-made templates for Cholan Rice: open one in the builder, check it,
// and send it to Meta. Written to pass Meta's rules (no variable at the start
// or end, examples for each, no emoji in headers). Utility ones are for order
// and payment updates; Marketing ones need the person's consent.
const PHONE = '+919092266667';
const SHOP = 'https://www.cholanrice.in/products';
const blankHeader = { type: 'none', text: '', example: '', handle: '', previewUrl: '' };
const t = (name, category, use, body, examples, extra = {}) => ({
  use,
  form: {
    name,
    language: extra.language || 'en',
    category,
    header: extra.header ? { ...blankHeader, ...extra.header } : blankHeader,
    body: { text: body, examples },
    footer: { text: extra.footer || '' },
    buttons: extra.buttons || [],
    auth: { securityNote: true, expiresMinutes: 10, buttonText: 'Copy code' },
  },
});

export const LIBRARY = [
  t('order_confirmed', 'UTILITY', 'When an order is confirmed (Automations: order confirmed or website order).', 'Hi {{1}}, thank you for your order {{2}} with Cholan Rice. Order total: {{3}}. We will pack it fresh and call you to arrange delivery.', ['Lakshmi', 'CO-00012', '₹1,040'], {
    header: { type: 'text', text: 'Order confirmed' },
    footer: 'Cholan Rice, Coimbatore',
    buttons: [{ type: 'phone', text: 'Call us', phone: PHONE }],
  }),
  t('order_dispatched', 'UTILITY', 'When an order leaves the mill, with the vehicle and driver (Automations: order dispatched).', 'Hi {{1}}, your order {{2}} has left our mill. Vehicle {{3}}, driver’s phone {{4}}. It should reach you soon.', ['Lakshmi', 'CO-00012', 'TN 37 AB 1234', '+91 98765 43210'], {
    header: { type: 'text', text: 'Your rice is on its way' },
    footer: 'Cholan Rice, Coimbatore',
    buttons: [{ type: 'phone', text: 'Call us', phone: PHONE }],
  }),
  t('order_delivered_feedback', 'UTILITY', 'After delivery, asking how it went (Automations: order delivered).', 'Hi {{1}}, your order {{2}} has been delivered. We hope you enjoy the rice! How was everything? Tap a button below to tell us.', ['Lakshmi', 'CO-00012'], {
    buttons: [
      { type: 'quick_reply', text: 'Excellent' },
      { type: 'quick_reply', text: 'Good' },
      { type: 'quick_reply', text: 'Needs improvement' },
    ],
  }),
  t('payment_received', 'UTILITY', 'When a payment comes in.', 'Hi {{1}}, we have received your payment of {{2}} for invoice {{3}}. Thank you for choosing Cholan Rice.', ['Lakshmi', '₹1,040', 'CR/26-27/0012'], {
    header: { type: 'text', text: 'Payment received' },
  }),
  t('payment_reminder', 'UTILITY', 'A polite reminder for an unpaid invoice.', 'Hi {{1}}, a gentle reminder that {{2}} is due on invoice {{3}} (due on {{4}}). You can pay by UPI or bank transfer. Please call us if you have any questions.', ['Ravi Stores', '₹14,500', 'CR/26-27/0034', '25 Nov'], {
    header: { type: 'text', text: 'Payment reminder' },
    footer: 'Cholan Rice, Coimbatore',
    buttons: [{ type: 'phone', text: 'Call us', phone: PHONE }],
  }),
  t('delivery_delayed', 'UTILITY', 'When a delivery will be late.', 'Hi {{1}}, sorry, your order {{2}} will reach you a little later than planned, by {{3}}. Thank you for your patience.', ['Lakshmi', 'CO-00012', 'tomorrow evening'], {
    buttons: [{ type: 'phone', text: 'Call us', phone: PHONE }],
  }),
  t('enquiry_received', 'UTILITY', 'Right after a website enquiry (Automations: website enquiry).', 'Hi {{1}}, thank you for asking about {{2}}. Our team will call you shortly with today’s price and delivery details.', ['Lakshmi', 'Moongil Ponni 26 kg'], {
    footer: 'Cholan Rice, Coimbatore',
    buttons: [{ type: 'url', text: 'See all rice', url: SHOP }],
  }),
  t('festival_offer', 'MARKETING', 'Festival offers (Pongal, Diwali, Tamil New Year…) with an offer code.', 'Hi {{1}}, celebrate {{2}} with Cholan Rice! Get {{3}} off on every 26 kg bag this week. Use the code below when you order.', ['Lakshmi', 'Pongal', '₹100'], {
    header: { type: 'text', text: 'Festival offer' },
    footer: 'Reply STOP to stop offers',
    buttons: [
      { type: 'url', text: 'Order now', url: SHOP },
      { type: 'copy_code', example: 'PONGAL100' },
    ],
  }),
  t('back_in_stock', 'MARKETING', 'When a popular rice is back.', 'Good news, {{1}}! {{2}} is back in stock at Cholan Rice. Order now before it runs out again.', ['Lakshmi', 'Seeraga Samba 5 kg'], {
    footer: 'Reply STOP to stop offers',
    buttons: [{ type: 'url', text: 'Order now', url: 'https://www.cholanrice.in/products/{{1}}', example: 'seeraga-samba' }],
  }),
  t('new_crop_arrival', 'MARKETING', 'New crop or new product, with a photo (upload a sample photo before sending to Meta).', 'Hi {{1}}, the new crop of {{2}} has just arrived at our mill. Fresh, aged right and carefully cleaned. Order yours today.', ['Lakshmi', 'Ponni rice'], {
    header: { type: 'image' },
    footer: 'Reply STOP to stop offers',
    buttons: [{ type: 'url', text: 'See the rice', url: SHOP }],
  }),
  t('weekly_price_update', 'MARKETING', 'This week’s prices for shops and regular buyers.', 'Hi {{1}}, this week’s prices at Cholan Rice: {{2}}. Reply with your order, or call us to book.', ['Ravi Stores', 'Ponni 26 kg ₹1,450, Idli rice 26 kg ₹1,280'], {
    header: { type: 'text', text: 'This week’s rice prices' },
    footer: 'Reply STOP to stop offers',
    buttons: [{ type: 'phone', text: 'Call to order', phone: PHONE }],
  }),
  t('bulk_hotel_offer', 'MARKETING', 'Bulk rates for hotels, caterers and institutions.', 'Hello {{1}}, special bulk rates for hotels and caterers: {{2}} a bag on orders of {{3}} bags or more, with free delivery within Coimbatore.', ['Annapoorna Hotel', '₹1,380', '20'], {
    header: { type: 'text', text: 'Bulk rice rates' },
    footer: 'Reply STOP to stop offers',
    buttons: [
      { type: 'quick_reply', text: 'Send me a quote' },
      { type: 'phone', text: 'Call us', phone: PHONE },
    ],
  }),
  t('reorder_reminder', 'MARKETING', 'About a month after an order: time to buy again?', 'Hi {{1}}, it has been about a month since your last order of {{2}}. Running low? Tap below and we will deliver the same again.', ['Lakshmi', 'Moongil Ponni 26 kg'], {
    footer: 'Reply STOP to stop offers',
    buttons: [
      { type: 'quick_reply', text: 'Yes, send again' },
      { type: 'quick_reply', text: 'Not now' },
    ],
  }),
  t('welcome_customer', 'MARKETING', 'Welcome for a new customer who agreed to offers.', 'Welcome to Cholan Rice, {{1}}! You will get our best offers and new arrivals here first. Save this number to order rice on WhatsApp any time.', ['Lakshmi'], {
    footer: 'Reply STOP to stop offers',
    buttons: [{ type: 'url', text: 'See all rice', url: SHOP }],
  }),
  t('order_dispatched_ta', 'UTILITY', 'Order dispatched, in Tamil.', 'வணக்கம் {{1}}, உங்கள் ஆர்டர் {{2}} எங்கள் ஆலையிலிருந்து அனுப்பப்பட்டது. வாகன எண் {{3}}. விரைவில் உங்களை வந்தடையும், நன்றி!', ['லட்சுமி', 'CO-00012', 'TN 37 AB 1234'], {
    language: 'ta',
    footer: 'சோழன் அரிசி, கோயம்புத்தூர்',
    buttons: [{ type: 'phone', text: 'அழைக்கவும்', phone: PHONE }],
  }),
  t('festival_offer_ta', 'MARKETING', 'Festival offer, in Tamil.', 'வணக்கம் {{1}}, {{2}} பண்டிகையை சோழன் அரிசியுடன் கொண்டாடுங்கள்! இந்த வாரம் ஒவ்வொரு 26 கிலோ மூட்டைக்கும் {{3}} தள்ளுபடி.', ['லட்சுமி', 'பொங்கல்', '₹100'], {
    language: 'ta',
    footer: 'நிறுத்த STOP என பதிலளிக்கவும்',
    buttons: [{ type: 'url', text: 'இப்போதே ஆர்டர்', url: SHOP }],
  }),
  {
    use: 'A one-time code for signing in or confirming a phone number. Meta writes the text.',
    form: { name: 'login_code', language: 'en', category: 'AUTHENTICATION', header: blankHeader, body: { text: '', examples: [] }, footer: { text: '' }, buttons: [], auth: { securityNote: true, expiresMinutes: 10, buttonText: 'Copy code' } },
  },
];
