/**
 * Shared feed chrome navigation (search / back / discover).
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FEED_HOME } from '../lib/settingsNav';

export function useFeedChromeNav() {
  const navigate = useNavigate();

  const goSearch = useCallback(() => {
    navigate('/search');
  }, [navigate]);

  const goBack = useCallback(() => {
    navigate(FEED_HOME, { replace: true });
  }, [navigate]);

  const goDiscover = useCallback(() => {
    navigate('/discover');
  }, [navigate]);

  return { navigate, goSearch, goBack, goDiscover };
}
