import { Icon } from './ui.jsx';

// Which app a person may open, from their access in Settings: "website"
// opens /admin, "plant" opens /warehouse, "both" opens both. The server
// checks it on every request; this only decides what to show.
export const AREAS = {
  website: 'Website (/admin)',
  plant: 'Plant (/warehouse)',
  both: 'Both',
};
export const opensArea = (user, needed) => !user?.area || user.area === 'both' || user.area === needed;

const OTHER = {
  website: { name: 'the plant dashboard', href: '/warehouse', label: 'Open the plant dashboard' },
  plant: { name: 'the website admin', href: '/admin', label: 'Open the website admin' },
};

// Shown when someone opens the app their access doesn't cover.
export function AreaElsewhere({ user, here, onSignOut }) {
  const other = OTHER[here];
  return (
    <div className="dash-login">
      <meta name="robots" content="noindex, nofollow" />
      <div className="dash-login__card">
        <img className="dash-login__logo" src="/images/cholan-logo.png" alt="Cholan Rice and Millet Shop" />
        <div className="dash-login__icon dash-login__icon--warn">
          <Icon name="lock" />
        </div>
        <h1>This account is for {other.name}</h1>
        <p>
          <strong>{user.email}</strong> can open {other.name} only.
        </p>
        <p className="dash-muted">If you need this one too, ask an admin to change your access in Admin → Settings.</p>
        <div className="dash-login__row">
          <a className="dash-btn" href={other.href}>
            {other.label}
          </a>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onSignOut}>
            Use another account
          </button>
        </div>
      </div>
    </div>
  );
}
