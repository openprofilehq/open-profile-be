export interface UrlValidationResult {
  valid: boolean;
  finalUrl: string | null;
  statusCode: number | null;
  error: string | null;
}

export async function validateUrl(url: string): Promise<UrlValidationResult> {
  const result: UrlValidationResult = {
    valid: false,
    finalUrl: null,
    statusCode: null,
    error: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkValidator/1.0)',
        },
      });
    } catch {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkValidator/1.0)',
          Range: 'bytes=0-2048',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    result.statusCode = response.status;
    result.finalUrl = response.url;

    if (!response.ok) {
      result.error = `Server returned status ${response.status}`;
      return result;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      result.error = `Not an HTML page (content-type: ${contentType})`;
      return result;
    }

    result.valid = true;
    return result;
  } catch (err: unknown) {
    const error = err as {
      name?: string;
      code?: string;
      message?: string;
    };

    result.error =
      error.name === 'AbortError'
        ? 'Request timed out'
        : error.code === 'ENOTFOUND'
          ? 'Domain not found'
          : error.code === 'ECONNREFUSED'
            ? 'Connection refused'
            : (error.message ?? 'Unknown error');

    return result;
  }
}
