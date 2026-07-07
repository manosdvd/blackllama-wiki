export const LOW_MOTION_STORAGE_KEY = 'access-low-motion';
export const ACCESSIBILITY_PREFERENCES_EVENT = 'accessibility-preferences-changed';

export function readLowMotionPreference() {
  return typeof window !== 'undefined' && localStorage.getItem(LOW_MOTION_STORAGE_KEY) === 'true';
}

export function writeLowMotionPreference(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOW_MOTION_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event(ACCESSIBILITY_PREFERENCES_EVENT));
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldReduceMotion() {
  return readLowMotionPreference() || prefersReducedMotion();
}

export function subscribeMotionPreference(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOW_MOTION_STORAGE_KEY) callback();
  };

  window.addEventListener(ACCESSIBILITY_PREFERENCES_EVENT, callback);
  window.addEventListener('storage', handleStorage);
  mediaQuery.addEventListener('change', callback);

  return () => {
    window.removeEventListener(ACCESSIBILITY_PREFERENCES_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
    mediaQuery.removeEventListener('change', callback);
  };
}
