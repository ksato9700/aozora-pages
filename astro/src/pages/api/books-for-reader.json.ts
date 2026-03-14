import type { APIRoute } from 'astro';
import { getData } from '../../lib/data';

interface ReaderBook {
  title: string;
  text_url?: string;
  html_url?: string;
  copyright: boolean;
}

export const GET: APIRoute = async () => {
  const { books } = await getData();
  const result: Record<string, ReaderBook> = {};

  for (const [id, book] of books) {
    if (book.text_url || book.html_url || !book.copyright) {
      result[id] = {
        title: book.title,
        ...(book.text_url && { text_url: book.text_url }),
        ...(book.html_url && { html_url: book.html_url }),
        copyright: book.copyright,
      };
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
