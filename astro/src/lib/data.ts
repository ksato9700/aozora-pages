// Build-time only: reads pre-generated JSON files written by the py-aozora-data
// import pipeline before `astro build` runs. Vite resolves these at build time.
// The module-level Promise ensures a single parse even when multiple
// getStaticPaths() calls run concurrently during `astro build`.
import type { Book, Person, Contributor, RoleId } from '../types/aozora';

export type BookContributor = { role: RoleId; person: Person };
export type Work = { role: RoleId; book: Book };

interface DataCache {
  books: Map<string, Book>;
  persons: Map<string, Person>;
  contributorsByBook: Map<string, BookContributor[]>;
  contributorsByPerson: Map<string, Work[]>;
  booksSortedByDate: Book[];
}

let dataPromise: Promise<DataCache> | null = null;

async function fetchAll(): Promise<DataCache> {
  console.log('[data] Loading JSON data files...');

  // These files are written by the Python import pipeline before astro build runs.
  // Vite bundles them at build time — no runtime I/O.
  const { default: booksRaw } = await import('../../data/books.json');
  const { default: personsRaw } = await import('../../data/persons.json');
  const { default: contributorsRaw } = await import('../../data/contributors.json');

  const booksData = booksRaw as unknown as Book[];
  const personsData = personsRaw as unknown as Person[];
  const contributorsData = contributorsRaw as unknown as Contributor[];

  console.log(`[data] Loaded ${booksData.length} books, ${personsData.length} persons, ${contributorsData.length} contributors`);

  const books = new Map<string, Book>();
  for (const book of booksData) {
    books.set(book.book_id, book);
  }

  const persons = new Map<string, Person>();
  for (const person of personsData) {
    persons.set(person.person_id, person);
  }

  const contributorsByBook = new Map<string, BookContributor[]>();
  const contributorsByPerson = new Map<string, Work[]>();

  for (const c of contributorsData) {
    const bookId = c.book_id.toString().padStart(6, '0');
    const personId = c.person_id.toString().padStart(6, '0');
    const book = books.get(bookId);
    const person = persons.get(personId);

    if (book && person) {
      if (!contributorsByBook.has(bookId)) contributorsByBook.set(bookId, []);
      contributorsByBook.get(bookId)!.push({ person, role: c.role as RoleId });

      if (!contributorsByPerson.has(personId)) contributorsByPerson.set(personId, []);
      contributorsByPerson.get(personId)!.push({ book, role: c.role as RoleId });
    }
  }

  const booksSortedByDate = [...books.values()].sort(
    (a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''),
  );

  return { books, persons, contributorsByBook, contributorsByPerson, booksSortedByDate };
}

export function getData(): Promise<DataCache> {
  if (!dataPromise) dataPromise = fetchAll();
  return dataPromise;
}
