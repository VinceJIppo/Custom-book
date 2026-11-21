/** True for URLs a print provider on the internet can't download from (this machine or a home network). */
export function isPrivateUrl(url: string) {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || host === "::1" || host === "[::1]";
}

export function publicUrlHelp(providerName: string, url: string) {
  return `${providerName} downloads the PDFs itself and can't reach ${new URL(url).host}. Set PUBLIC_BASE_URL in .env.local to a public address for this app (for example a tunnel URL; see the README), restart, and try again.`;
}
