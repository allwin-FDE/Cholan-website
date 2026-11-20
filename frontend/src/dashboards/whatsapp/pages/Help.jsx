import { PageHead } from '../../shared/ui.jsx';

// Help for the WhatsApp dashboard, step by step, with WhatsApp's own rules.
const SECTIONS = [
  {
    title: 'The rules WhatsApp sets',
    steps: [
      'You can start a conversation only with an approved template. Meta checks every template, usually within minutes.',
      'When someone writes to you, you can reply freely for 24 hours after their last message. After that, only a template again.',
      'Offers (Marketing templates) only go to people who agreed to get them. Order updates (Utility templates) can go to any customer about their order.',
      'Anyone who replies STOP is opted out at once and gets nothing more except replies to their own messages. START brings them back.',
      'Meta charges per message for Marketing, Utility and Authentication templates (Marketing costs the most); replies within 24 hours of the customer writing are free.',
      'Meta rates your number’s quality from how people react. If many block or report you, sending is limited. Send useful messages to people who want them.',
    ],
  },
  {
    title: 'Making a template',
    steps: [
      'Templates → New template. Give it a name (small letters and _), choose the language and the kind: Marketing, Utility or Authentication.',
      'Optional header: text, or an image, video or document (upload a sample for Meta to check; each campaign chooses its own file).',
      'Write the message. Click “+ Variable” where a name, order number or price goes: {{1}}, {{2}}… and give an example for each. *Bold*, _italic_ and ~strike~ work as in WhatsApp.',
      'Optional footer (like “Reply STOP to stop offers”) and up to 10 buttons: quick replies, a website link (it can end with a variable, like a product page), a call button, or a copy-offer-code button.',
      'The phone on the right shows how it will look. Click “Send to Meta for approval”. Its status changes to Approved (or Rejected, with the reason) by itself.',
      'A rejected template can’t be edited: open it, click “Make a copy”, fix it and send the copy.',
    ],
  },
  {
    title: 'Contacts and consent',
    steps: [
      'Contacts → Import: a CSV file (with a phone column; name, tags and any other columns such as city are kept), all website enquiries, or the plant’s customers.',
      'Tick “agreed to get offers” only for people who really agreed (for example on a form, at the shop counter, or by messaging you). Without it they still get order updates and replies.',
      'Tags group people (vip, hotel, coimbatore, diwali-2026). Select people and use “Add tag” to tag many at once.',
      'People who write to your number, place a website order or send an enquiry are added by themselves.',
    ],
  },
  {
    title: 'Sending a campaign',
    steps: [
      'Campaigns → New campaign. Step 1: name it and choose an approved template.',
      'Step 2: choose who gets it: everyone, or people with any (or all) of some tags, leaving out other tags. The count shows how many will get it, and who is left out (opted out, or no consent for offers).',
      'Step 3: fill in the template. Each variable can be typed (same for everyone) or taken from the contact (first name, city…) with a fallback. Send yourself a test.',
      'Step 4: send now, schedule a date and time, or save a draft. Messages go out at a steady pace (Connection → messages a minute).',
      'Open a campaign to see sent, delivered, read, replied and failed for each person, with the reason for any failure. You can pause, resume or cancel while it sends, and “Send again / copy” for the next one.',
    ],
  },
  {
    title: 'The inbox',
    steps: [
      'Messages people send to your number arrive in the Inbox within seconds; the menu shows how many are unread.',
      'Within 24 hours of their last message, type a reply. After that the box offers templates instead.',
      'Ticks show what happened to your messages: ✓ sent, ✓✓ delivered, blue ✓✓ read, ! failed (with the reason).',
    ],
  },
  {
    title: 'Automations',
    steps: [
      'Keyword reply: when a message contains a word (price, rate, offer…), reply with a message or a template.',
      'Welcome: the first time someone writes, send a greeting.',
      'Website enquiry, website order, order confirmed, dispatched or delivered: send the customer a template (a Utility one), with the order number, total, items, vehicle number or driver’s phone filled in.',
      'Each automation can be switched off and on; the list shows how many times each one sent.',
    ],
  },
];

export default function Help() {
  return (
    <div className="dash-page">
      <PageHead title="Help" intro="How to use the WhatsApp dashboard, and WhatsApp’s rules." range={false} />
      <nav className="dash-help-toc" aria-label="Topics">
        {SECTIONS.map((s, i) => (
          <a key={s.title} href={`#help-${i}`}>
            {s.title}
          </a>
        ))}
      </nav>
      <div className="dash-help">
        {SECTIONS.map((s, i) => (
          <section key={s.title} id={`help-${i}`} className="dash-card">
            <h2>{s.title}</h2>
            <ol>
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
