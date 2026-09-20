const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const localApiUrl = 'http://localhost:5050';
const deployedApiUrl = 'https://binz-clone.onrender.com';

// In production this must be the public HTTPS URL of the separately deployed API.
export const apiBaseUrl = (configuredApiUrl || (import.meta.env.DEV ? localApiUrl : deployedApiUrl))
  .replace(/\/+$/, '');

export function apiUrl(path) {
  if (!apiBaseUrl) {
    throw new Error('The API is not configured. Set VITE_API_URL in the frontend deployment settings.');
  }

  return `${apiBaseUrl}${path}`;
}
