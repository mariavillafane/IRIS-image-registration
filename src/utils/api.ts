// API helper: dynamically construct API base from runtime server info
// Reads the full server URL from window.__SERVER_INFO__ (fetched at startup)
// Falls back to localhost:4000 if not available, or uses relative path as last resort

export function apiUrl(path: string): string {
  // Ensure path starts with '/'
  if (!path.startsWith("/")) path = "/" + path;

  // If server URL is available, use it
  if (window.__SERVER_INFO__?.serverUrl) {
    return `${window.__SERVER_INFO__.serverUrl}${path}`;
  }

  // Fallback to localhost:4000 if port is available but no serverUrl yet
  if (window.__SERVER_INFO__?.port) {
    return `http://localhost:${window.__SERVER_INFO__.port}${path}`;
  }

  // Final fallback to relative path (works in production or before server-info loads)
  return path;
}
