import iconv from 'iconv-lite';
import AdmZip from 'adm-zip';

const ALLOWED_HOSTS = [
    'www.aozora.gr.jp',
    'aozora.ksato9700.com',
    'pubdb.aozora.gr.jp',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function fetchTextContent(url: string): Promise<string> {
    const parsedUrl = new URL(url);

    // SSRF protection: only allow specific hosts or R2 buckets
    const isAllowedHost = ALLOWED_HOSTS.includes(parsedUrl.hostname) ||
                         parsedUrl.hostname.endsWith('.r2.dev');

    if (!isAllowedHost) {
        throw new Error(`Unauthorized host: ${parsedUrl.hostname}. Only Aozora domains or trusted mirrors are allowed.`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
    }

    const res = await fetch(url, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch text from ${url}: ${res.status} ${res.statusText}`);
    }

    const contentLength = res.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        throw new Error(`File too large: ${contentLength} bytes. Maximum allowed is ${MAX_SIZE} bytes.`);
    }

    const arrayBuffer = await res.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_SIZE) {
        throw new Error(`File too large: ${arrayBuffer.byteLength} bytes. Maximum allowed is ${MAX_SIZE} bytes.`);
    }

    const buffer = Buffer.from(arrayBuffer);

    // Check for Zip signature (PK..)
    if (url.endsWith('.zip') || (buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B)) {
        try {
            const zip = new AdmZip(buffer);
            const zipEntries = zip.getEntries();
            // Find the first .txt file
            const textEntry = zipEntries.find(entry => entry.entryName.endsWith('.txt'));

            if (textEntry) {
                const entryData = textEntry.getData();
                if (entryData.length > MAX_SIZE) {
                    throw new Error('Extracted file too large');
                }
                return iconv.decode(entryData, 'Shift_JIS');
            }
            throw new Error('No .txt file found in the zip archive');
        } catch (e) {
            throw new Error('Failed to extract zip file: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    // Decode Shift_JIS which is standard for Aozora Bunko
    return iconv.decode(buffer, 'Shift_JIS');
}
