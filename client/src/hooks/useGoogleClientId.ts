import { useEffect, useState } from 'react';

export function useGoogleClientId() {
  const buildTimeId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const [clientId, setClientId] = useState(buildTimeId);

  useEffect(() => {
    if (buildTimeId) return;

    let cancelled = false;

    fetch('/api/public-config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.googleClientId) {
          setClientId(data.googleClientId);
        }
      })
      .catch(() => {
        // Leave Google sign-in hidden if the backend is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [buildTimeId]);

  return clientId;
}