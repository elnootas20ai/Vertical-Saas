/**
 * Helpers CouchDB para push: couchRequest devuelve Response, hay que parsear JSON.
 */
export async function couchJson(response) {
  if (!response) return null;
  if (typeof response.json !== 'function') {
    // Ya era un objeto (tests / mocks)
    return response;
  }
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function couchOk(response) {
  return Boolean(response && typeof response.ok === 'boolean' ? response.ok : response?.ok !== false);
}
