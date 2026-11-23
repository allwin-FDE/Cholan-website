import { Link } from 'react-router-dom';
import { PageHead } from '../../shared/ui.jsx';

const SECTIONS = [
  {
    title: 'Signing in',
    steps: [
      'Go to www.cholanrice.in/admin.',
      'Click “Continue with Google” and choose your Google account. Google is the only way to sign in.',
      'You stay signed in on that device until you click the sign-out button at the bottom of the menu.',
      'Only Google accounts added in Settings can see anything.',
    ],
  },
  {
    title: 'Giving someone access (admins)',
    steps: [
      'Open Settings.',
      'Type their email, choose Viewer, Editor or Admin, and choose where they may go: Website (this admin, /admin), Plant (the plant dashboard, /warehouse) or Both. Click “Give access”.',
      'Plant staff get Plant: they see orders, delivery, stock, purchases and money at www.cholanrice.in/warehouse, and cannot open this admin. Website people get Website. Owners always have both.',
      'Tell them to go to the right address and click “Continue with Google” with that account.',
      'To change what they can do, pick a different level next to their name. To take access away, click Remove — it works immediately.',
    ],
  },
  {
    title: 'Reading the Overview',
    steps: [
      'Choose the period at the top: the last 7, 30 or 90 days, or Custom with any From and To dates.',
      'Visitors are different people; visits are separate trips to the site (one person can visit many times).',
      '“Where visitors come from” shows Google, Instagram, WhatsApp, other websites, or Direct (typed in or a saved link).',
      '“Actions taken” counts the taps that matter: calls, WhatsApp, enquiries, directions and chat.',
      'Every visitor is counted; there is no cookie notice or opt-out on the website. A private or incognito window, or a browser that blocks cookies, shows up as a new visitor.',
      'Each device keeps the same ID for about 13 months, so a visitor who comes back weeks later counts as returning, not new. One person on two browsers or devices (or in a private window) still counts as two.',
    ],
  },
  {
    title: 'Following one visitor’s journey',
    steps: [
      'Open Visitors and click any row.',
      'You see where they came from, their device, every page they opened in order, how long they stayed, what they clicked, and whether they called, sent WhatsApp or an enquiry.',
      'Visitors lists one row per visitor, the one whose latest visit is newest at the top. Each device has its own visitor number, V-1, V-2 and so on, the same on every visit; “Visits” is how many times they came in the chosen period. Search for a number (e.g. V-12) to find that visitor.',
      'Click a visitor to see the number of visits, when they were first and last seen, and each visit. Below that is their latest visit, step by step. Click any other visit to open it.',
      'Use the filters to find, for example, every visitor who tapped WhatsApp, or everyone from Instagram.',
      'Names and phone numbers are never part of a visit — they only appear in Enquiries, when someone sends the form.',
    ],
  },
  {
    title: 'Using heatmaps',
    steps: [
      'Open Heatmaps (or click “Heatmap →” next to a page in Pages).',
      'Pick the page, then Desktop or Mobile — people use the site differently on each.',
      '“Heat”: warm colours show where people click most. “Each click” shows every single click. “Scroll depth” shows how far down people get before leaving.',
      'Scroll inside the page preview to see further down.',
      'Use it to check if people find the WhatsApp and Call buttons, and whether they reach the products lower on the page.',
    ],
  },
  {
    title: 'Handling enquiries (editors)',
    steps: [
      'Open Enquiries. New ones arrive within a minute of being sent.',
      '“Enquiries by page” shows which pages bring enquiries — click one to see just those.',
      'Click an enquiry to read it, then Call or WhatsApp the customer in one tap.',
      'Set the status as you go: New → Contacted → Quoted → Won or Lost. Add notes so everyone knows what was said.',
      'Click “Export to Excel” for a spreadsheet of the enquiries shown.',
    ],
  },
  {
    title: 'Newsletter subscribers (editors)',
    steps: [
      'Open Subscribers. Everyone who typed their email into “Subscribe to Updates” at the bottom of the website is listed, newest first.',
      'You can see the page they signed up on and how they found the site.',
      'Click “Export to Excel” for the list, to send offers or news from your email or a mailing tool.',
      'If someone asks to stop receiving updates, click Remove next to their email.',
    ],
  },
  {
    title: 'Approving comments (editors)',
    steps: [
      'Visitors can leave a comment and a star rating under any blog post. A number on the Comments menu shows how many are waiting.',
      'Nothing appears on the website until you press Approve. Reject or Delete anything you do not want shown.',
      'A comment’s email address is never shown on the website. It is only for you, in case you want to reply.',
    ],
  },
  {
    title: 'Writing and publishing a blog (editors)',
    steps: [
      'Open Blog and click “New blog”. It opens full screen, on a phone or a computer.',
      'Choose a cover picture (shown on the blog’s card), then the main pictures, and crop them to the shape you want.',
      'Write the title and the content. The toolbar adds headings, bold, lists, links and photos, or you can upload a Word document and it is shown as written. Turn on recipe details if it is a recipe.',
      'Pick a category, add a few tags and tag the products it mentions. Click Preview to see it as visitors will.',
      'Click Publish and it goes live on www.cholanrice.in/blog straight away; there is no approval step. Save draft keeps it here, off the website, to finish later on any device.',
      'To correct a live blog, open it from the list and click “Save changes”. To take it down, choose Save draft, or Delete to remove it for good.',
    ],
  },
  {
    id: 'stores',
    title: 'The store finder (Stores)',
    steps: [
      'Customers find the nearest shop at www.cholanrice.in/stores: “Find stores near me” (they allow their location) or a pincode, town or area. Stores are ranked by road distance with the driving time, and “Get directions” opens Google Maps.',
      'To add or update shops, an admin clicks “Upload Excel” and chooses the store list (.xlsx or .csv, one row per shop, with a header row such as Shop Code, Branch, Door No., Street Name, Area, Landmark, Taluk, Pincode; Phone, Latitude and Longitude are optional). Check the preview (new, updated, unchanged, and rows that can’t be used), then Import. Shops are matched by Shop Code; nothing is ever deleted, and a column missing from the sheet leaves that detail as it was.',
      'After an import, “Place on the map” looks up each new or changed shop with Google: first its own Google listing (Cholan Rice and Millet Shops…), then its street address.',
      '“Verified” is an exact shop location; “Street address” is the exact address. “Approximate” means Google found only the road, area or pincode: customers see “Approximate location” on those. The “To check” list has them all.',
      'To fix a pin, open the shop, drag the pin to the shop (or click the map) and Save this pin. Or paste the shop’s Google Maps link, or “latitude, longitude”. If the pin is already right, click “The pin is right”. Pins set or checked by staff are never changed by Google.',
      'A note such as “the pincode in the sheet may be wrong” or “Possible Google listing… check which store it is” says exactly what to look at. Add a phone number to show a “Call store” button. “Hide from the website” takes a shop off the finder without deleting it.',
      'The ASM, Region and Zone are for staff only and never shown on the website. Customers’ locations are used for the search only and never saved.',
      'The home page also offers the finder in a popup: it opens by itself once, a few seconds in (then not again for a week on that phone or computer), and the “Find a store” button at the bottom left brings it back. It shows the three nearest shops, without a map; “See more stores on the map” opens /stores with the same results.',
      '“Store searches left today” at the top of Stores shows how many customer searches with road distance are left before today’s Google Maps limit, which keeps Maps under ₹1,000 a month. Green is plenty, amber under half, red under a fifth. When it reaches 0, searches still work but show straight-line distances until midnight. The smaller bars are for typed pincodes and for placing stores on the map, which uses Google’s own daily quotas.',
    ],
  },
];

export default function Help() {
  return (
    <div className="dash-page">
      <PageHead title="Help" intro="How to use each part of the website admin. Orders, stock, purchases and money are in the plant dashboard (/warehouse), with its own help." range={false} />
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
        <section className="dash-card">
          <h2>Privacy</h2>
          <p>
            Visitor tracking runs for every visitor, never records what anyone types, and deletes visit data
            after about 13 months. This matches the website’s <Link to="/policies/privacy">Privacy Policy</Link>. Enquiries hold
            phone numbers — only give Editor or Admin access to people who need them.
          </p>
        </section>
      </div>
    </div>
  );
}
