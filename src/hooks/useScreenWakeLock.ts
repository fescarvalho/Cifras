import { useEffect } from 'react';

export function useScreenWakeLock() {
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake Lock ativado com sucesso.');
        } catch (err) {
          console.log('Falha ao manter tela ativa:', err);
        }
      }
    }

    requestWakeLock();

    // Re-solicita se o usuário alternar abas e voltar para a cifra
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock) {
        wakeLock.release();
        console.log('Wake Lock liberado.');
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
