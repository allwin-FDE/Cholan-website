import { Link } from 'react-router-dom';
import { PageHead } from '../ui.jsx';

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
      'Type their email, choose Viewer, Editor or Admin, and click “Give access”.',
      'Tell them to go to www.cholanrice.in/admin and click “Continue with Google” with that account.',
      'To change what they can do, pick a different level next to their name. To take access away, click Remove — it works immediately.',
    ],
  },
  {
    title: 'Reading the Overview',
    steps: [
      'Choose the period at the top right: Today, 7 days, 30 days, 90 days or 12 months.',
      'Visitors are different people; visits are separate trips to the site (one person can visit many times).',
      '“Where visitors come from” shows Google, Instagram, WhatsApp, other websites, or Direct (typed in or a saved link).',
      '“Actions taken” counts the taps that matter: calls, WhatsApp, enquiries, directions and chat.',
      'Every visitor is counted unless they chose “Don’t track me” on the cookie notice. Their visits still show as a plain number under Visits (“with tracking turned off”), with no pages or details.',
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
];

export default function Help() {
  return (
    <div className="dash-page">
      <PageHead title="Help" intro="How to use each part of the admin." range={false} />
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
            Visitor tracking runs unless a visitor turns it off (“Don’t track me”), never records what anyone types, and deletes visit data
            after about 13 months. This matches the website’s <Link to="/policies/privacy">Privacy Policy</Link>. Enquiries hold
            phone numbers — only give Editor or Admin access to people who need them.
          </p>
        </section>
      </div>
    </div>
  );
}
