/**
 * Shared feed chrome navigation (search / back / discover).
 */

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FEED_HOME, DISCOVER_HOME, containerReturnState } from '../lib/settingsNav';

const FEED_CHROME_CONTAINERS = new Set([
  '/friends',
  '/following',
  '/music',
  '/stem',
  '/discover',
]);

export function useFeedChromeNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const goSearch = useCallback(() => {
    const path = location.pathname.split('?')[0] || '/';
    if (FEED_CHROME_CONTAINERS.has(path)) {
      navigate('/search', { state: containerReturnState(path) });
      return;
    }
    navigate('/search');
  }, [navigate, location.pathname]);

  const goBack = useCallback(() => {
    navigate(FEED_HOME, { replace: true });
  }, [navigate]);

  const goDiscover = useCallback(() => {
    const path = location.pathname.split('?')[0] || '/';
    if (path === '/friends' || path === '/following') {
      navigate(DISCOVER_HOME, { state: containerReturnState(path) });
      return;
    }
    navigate(DISCOVER_HOME);
  }, [navigate, location.pathname]);

  return { navigate, goSearch, goBack, goDiscover };
}
