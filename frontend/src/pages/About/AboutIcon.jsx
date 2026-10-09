// Stroke icons used on the About page (original `bm` paths + `xm` component).
const iconShapes = {
  grain: (
    <>
      <path d="M12 21V11" />
      <path d="M12 11c-3.6-.4-5.4-2.8-5.4-6.4 3.6.3 5.4 2.6 5.4 6.4Z" />
      <path d="M12 15c3.6-.4 5.4-2.8 5.4-6.4-3.6.3-5.4 2.6-5.4 6.4Z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      <circle cx="12" cy="12" r="6.4" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15" />
      <path d="M5 19 13 11" />
    </>
  ),
  badge: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m12 7.6 1.35 2.75 3.03.44-2.19 2.13.52 3.02L12 14.52l-2.71 1.42.52-3.02-2.19-2.13 3.03-.44Z" />
    </>
  ),
  phone: (
    <path d="M6.6 3.5h2.6l1.5 4-1.9 1.3a11 11 0 0 0 6.4 6.4l1.3-1.9 4 1.5v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
  ),
  chat: (
    <>
      <path d="M4.2 19.8 5.3 16A8.3 8.3 0 1 1 8.4 19l-4.2.8Z" />
      <path d="M9.3 9.2c.3 2.4 2.2 4.3 4.6 4.8l1-1.1 1.6.7-.4 1.5c-3.7-.2-6.7-3.2-6.9-6.9l1.5-.4.7 1.6-1.1.8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  arrow: <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />,
};

export default function AboutIcon({ name, className = '' }) {
  return (
    <svg
      className={`ab-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconShapes[name]}
    </svg>
  );
}
