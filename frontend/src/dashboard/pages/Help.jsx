import { Link } from 'react-router-dom';
import { PageHead } from '../ui.jsx';

const SECTIONS = [
  {
    title: 'Signing in',
    steps: [
      'Go to www.cholanrice.in/dashboard.',
      'Click “Continue with Google” and choose your Google account — the quickest way if your email is a Gmail or Google Workspace address.',
      'Or type your email address and click “Email me a sign-in link”, then open the email (from noreply@cholan-rice-site.firebaseapp.com) and click the link. Check Spam if it isn’t in your inbox.',
      'You stay signed in on that device until you click the sign-out button at the bottom of the menu.',
      'Only email addresses added in Settings can see anything.',
    ],
  },
  {
    title: 'Giving someone access (admins)',
    steps: [
      'Open Settings.',
      'Type their email, choose Viewer, Editor or Admin, and click “Give access”.',
      'Tell them to go to www.cholanrice.in/dashboard and sign in with that email.',
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
      'Only visitors who clicked “Accept” on the cookie banner are counted, so real traffic is higher.',
    ],
  },
  {
    title: 'Following one visitor’s journey',
    steps: [
      'Open Visitors and click any row.',
      'You see where they came from, their device, every page they opened in order, how long they stayed, what they clicked, and whether they called, sent WhatsApp or an enquiry.',
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
    title: 'Approving blogs from /admin (editors)',
    steps: [
      'The shared login writes blogs at www.cholanrice.in/admin: a cover, main pictures, a title and the content, with recipe details if it is a recipe. Nothing it sends goes live until someone here approves it.',
      'A number on the Blog menu shows how many posts are waiting. Open Blog and choose “Waiting”.',
      'Click a blog to see it as visitors will. You can fix the title, content and formatting, change the background colour or category, and crop or remove a picture.',
      'Choose “Approve” to put it live now, “Approve for this time” to pick a date, or “Ask for changes” with a note the poster will see.',
      'A live post can be fixed, or taken off the website, from the same screen.',
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
    title: 'Writing a blog post (editors)',
    steps: [
      'Open Blog and click “New post”.',
      'Write a title and a short summary, then the post itself. The toolbar adds headings, bold, lists, quotes, links, photos and YouTube videos.',
      'Add a cover image on the right — photos are resized automatically, so straight from the phone is fine.',
      'Pick a category and add a few tags. Fill in “Google & sharing” to choose how the post looks on Google.',
      'Click Preview to see it as visitors will. Then choose: Save draft (private), Publish (live now) or Schedule (live at a date you pick).',
      'Published posts appear on www.cholanrice.in/blog within a minute. To take one down, open it and click Unpublish.',
    ],
  },
];

export default function Help() {
  return (
    <div className="dash-page">
      <PageHead title="Help" intro="How to use each part of the dashboard." range={false} />
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
            Visitor tracking only runs for people who accept cookies, never records what anyone types, and deletes visit data
            after about 13 months. This matches the website’s <Link to="/policies/privacy">Privacy Policy</Link>. Enquiries hold
            phone numbers — only give Editor or Admin access to people who need them.
          </p>
        </section>
      </div>
    </div>
  );
}
