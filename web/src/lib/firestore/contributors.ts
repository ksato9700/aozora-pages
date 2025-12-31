import { db, dataPoint } from '@/lib/firebase/server';
import { Contributor, Book, ROLES, RoleId, Person } from '@/types/aozora';
import { getBook } from './books'; // Reuse single book fetch or implement batch

export type Work = {
    role: RoleId;
    book: Book;
};

export async function getWorksByPerson(personId: string): Promise<Work[]> {
    try {
        const contributorsRef = dataPoint<Contributor>('contributors');
        // Ensure personId is number if stored as number in contributors
        const pId = parseInt(personId, 10);
        if (isNaN(pId)) return [];

        const snapshot = await contributorsRef.where('person_id', '==', pId).get();

        if (snapshot.empty) return [];

        const works: Work[] = [];
        const bookPromises = snapshot.docs.map(async (doc) => {
            const data = doc.data();
            // book_id is number, need string for getBook with zero padding (6 digits)
            const bookIdStr = data.book_id.toString().padStart(6, '0');
            const book = await getBook(bookIdStr);
            if (book) {
                // Cast role to RoleId if valid
                const roleId = data.role as RoleId;
                return { role: roleId, book };
            }
            return null;
        });

        const results = await Promise.all(bookPromises);

        // Filter nulls
        return results.filter((w): w is Work => w !== null);

    } catch (error) {
        console.error(`Error fetching works for person ${personId}:`, error);
        return [];
    }
}

export type BookContributor = {
    role: RoleId;
    person: Person;
}

export async function getContributorsForBook(bookId: string): Promise<BookContributor[]> {
    try {
        const bId = parseInt(bookId, 10);
        if (isNaN(bId)) return [];

        const contributorsRef = dataPoint<Contributor>('contributors');
        const snapshot = await contributorsRef.where('book_id', '==', bId).get();

        if (snapshot.empty) return [];

        const personPromises = snapshot.docs.map(async (doc) => {
            const data = doc.data();
            // person_id is number or string? DATA_FORMAT says person_id is Integer.
            // But getPerson expects string with zero-padding (6 digits).
            const personIdStr = data.person_id.toString().padStart(6, '0');
            const person = await import('./persons').then(m => m.getPerson(personIdStr));
            if (person) {
                const roleId = data.role as RoleId;
                return { role: roleId, person };
            }
            return null;
        });

        const results = await Promise.all(personPromises);
        return results.filter((c): c is BookContributor => c !== null);

    } catch (error) {
        console.error(`Error fetching contributors for book ${bookId}:`, error);
        return [];
    }
}

