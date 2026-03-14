// Cloudflare Pages Function — served at /api/read
// Fetches a text file from an allowlisted host, handles ZIP extraction,
// and decodes Shift_JIS using the WHATWG TextDecoder API.
// Both TextDecoder('shift_jis') and fflate are supported in Cloudflare Workers.
import { unzipSync } from 'fflate';

const ALLOWED_HOSTS = [
  'www.aozora.gr.jp',
  'aozora.ksato9700.com',
  'pubdb.aozora.gr.jp',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function isAllowedUrl(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  return ALLOWED_HOSTS.includes(url.hostname) || url.hostname.endsWith('.r2.dev');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestGet = async (context: { request: Request; [key: string]: any }) => {
  const url = new URL(context.request.url);
  const src = url.searchParams.get('src');

  if (!src) return new Response('Missing src parameter', { status: 400 });

  let parsedSrc: URL;
  try {
    parsedSrc = new URL(src);
  } catch {
    return new Response('Invalid src URL', { status: 400 });
  }

  if (!isAllowedUrl(parsedSrc)) {
    return new Response('Host not allowed', { status: 403 });
  }

  let res: Response;
  try {
    res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    return new Response(`Fetch failed: ${String(e)}`, { status: 502 });
  }

  if (!res.ok) {
    return new Response(`Upstream error: ${res.status} ${res.statusText}`, { status: 502 });
  }

  const contentLength = res.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
    return new Response('File too large', { status: 413 });
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_SIZE) {
    return new Response('File too large', { status: 413 });
  }

  const bytes = new Uint8Array(arrayBuffer);
  let textBytes = bytes;

  // ZIP detection: PK signature 0x50 0x4B
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const files = unzipSync(bytes);
      const txtEntry = Object.keys(files).find((name) => name.endsWith('.txt'));
      if (!txtEntry) return new Response('No .txt file found in ZIP', { status: 422 });
      textBytes = new Uint8Array(files[txtEntry]);
    } catch (e) {
      return new Response(`ZIP extraction failed: ${String(e)}`, { status: 422 });
    }
  }

  // TextDecoder('shift_jis') is part of the WHATWG Encoding spec,
  // fully supported in Cloudflare Workers.
  const decoder = new TextDecoder('shift_jis', { fatal: false });
  const text = decoder.decode(textBytes);

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
