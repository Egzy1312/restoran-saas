'use client';

const TOKEN_KEY = 'restoran_staff_token';
const REFRESH_TOKEN_KEY = 'restoran_staff_refresh_token';
const USER_KEY = 'restoran_staff_user';

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  restaurant_id: string;
}

export function saveSession(token: string, refreshToken: string, user: StaffUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Nakon uspjesnog /auth/refresh - zamjenjuje samo access token (i po zelji rotirani refresh token), ne dira korisnika. */
export function setTokens(token: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getStaffUser(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
