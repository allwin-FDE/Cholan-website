import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Scrolls to the top on every navigation (original `ur`). Renders nothing.
export default function ScrollToTop() {
  const { key } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key]);
  return null;
}
