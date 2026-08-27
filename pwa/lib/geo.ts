'use client';

/**
 * GPS lokacija gosta za geofencing (specifikacija, modul A.6). Server
 * primjenjuje ovu provjeru SAMO ako je restoran nesto podesio - ako
 * dozvola nije data ili GPS nije dostupan, jednostavno se salje bez
 * koordinata i server odlucuje (propusta ako geofencing nije ukljucen za
 * taj restoran, odbija uz jasnu poruku ako jeste).
 */
export function getGeoLocation(timeoutMs = 4000): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}
