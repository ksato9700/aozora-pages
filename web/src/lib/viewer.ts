import iconv from 'iconv-lite';
import AdmZip from 'adm-zip';

export async function fetchTextContent(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch text from ${url}: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check for Zip signature (PK..)
    if (url.endsWith('.zip') || (buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4B)) {
        try {
            const zip = new AdmZip(buffer);
            const zipEntries = zip.getEntries();
            // Find the first .txt file
            const textEntry = zipEntries.find(entry => entry.entryName.endsWith('.txt'));

            if (textEntry) {
                return iconv.decode(textEntry.getData(), 'Shift_JIS');
            }
            throw new Error('No .txt file found in the zip archive');
        } catch (e) {
            throw new Error('Failed to extract zip file: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    // Decode Shift_JIS which is standard for Aozora Bunko
    return iconv.decode(buffer, 'Shift_JIS');
}
