export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    const href = parsed.href;
    const suffixLength = parsed.search.length + parsed.hash.length;
    const base =
      suffixLength > 0 ? href.slice(0, href.length - suffixLength) : href;
    const trimmedBase = base.length > 1 ? base.replace(/\/$/, '') : base;

    return trimmedBase + parsed.search + parsed.hash;
  } catch {
    const hashIndex = url.indexOf('#');
    const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const afterHash = hashIndex === -1 ? '' : url.slice(hashIndex);

    const queryIndex = beforeHash.indexOf('?');
    const beforeQuery =
      queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
    const afterQuery = queryIndex === -1 ? '' : beforeHash.slice(queryIndex);

    const trimmedBase =
      beforeQuery.length > 1 ? beforeQuery.replace(/\/$/, '') : beforeQuery;
    return trimmedBase + afterQuery + afterHash;
  }
}
