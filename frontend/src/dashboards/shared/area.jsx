import { Icon } from './ui.jsx';

// Which apps a person may open, from their access in Settings: "website"
// opens /admin, "plant" opens /warehouse, "whatsapp" opens /whatsapp; a
// person has any mix. The server checks it on every request; this only
// decides what to show.
export const APPS = {
  website: { label: 'Website', path: '/admin', name: 'the website admin' },
  plant: { label: 'Plant', path: '/warehouse', name: 'the plant dashboard' },
  whatsapp: { label: 'WhatsApp', path: '/whatsapp', name: 'the WhatsApp dashboard' },
};
// An older answer from the server may still carry a single "area".
const appsOfUser = (user) => user?.apps || (user?.area === 'website' || user?.area === 'plant' ? [user.area] : ['website', 'plant']);
export const opensArea = (user, needed) => appsOfUser(user).includes(needed);


// Shown when someone opens the app their access doesn't cover.
export function AreaElsewhere({ user, here, onSignOut }) {
  // The first of their apps, to send them on to.
  const other = APPS[appsOfUser(user).find((a) => a !== here)] || APPS.website;
  const label = `Open ${other.name}`;
  return (
    <div className="dash-login">
      <meta name="robots" content="noindex, nofollow" />
      <div className="dash-login__card">
        <img className="dash-login__logo" src="/images/cholan-logo.png" alt="Cholan Rice and Millet Shop" />
        <div className="dash-login__icon dash-login__icon--warn">
          <Icon name="lock" />
        </div>
        <h1>This account isn’t for {APPS[here].name}</h1>
        <p>
          <strong>{user.email}</strong> can open {appsOfUser(user).map((a) => APPS[a].name).join(' and ')}.
        </p>
        <p className="dash-muted">If you need this one too, ask an admin to change your access in Admin → Settings.</p>
        <div className="dash-login__row">
          <a className="dash-btn" href={other.path}>
            {label}
          </a>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onSignOut}>
            Use another account
          </button>
        </div>
      </div>
    </div>
  );
}
