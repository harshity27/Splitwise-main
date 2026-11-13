const configuredRoot = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_ROOT = configuredRoot
  ? (configuredRoot.endsWith('/api') ? configuredRoot : `${configuredRoot}/api`)
  : '/api';

export function getToken() {
  return localStorage.getItem('sw_token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function expenseStreamUrl(expenseId) {
  return `${API_ROOT}/expenses/${expenseId}/comments/stream?token=${encodeURIComponent(getToken() || '')}`;
}
