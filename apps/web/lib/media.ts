/** Turn an API image path (/v1/users/{id}/avatar?v=…) into the web proxy path (/media/…). */
export function mediaUrl(apiPath: string | null | undefined): string | null {
  return apiPath ? apiPath.replace(/^\/v1\//, '/media/') : null;
}
