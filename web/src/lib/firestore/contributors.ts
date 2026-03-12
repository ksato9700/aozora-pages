import { db, dataPoint } from '@/lib/firebase/server';
import { Contributor, Book, RoleId, Person } from '@/types/aozora';

export type Work = {
    role: RoleId;
    book: Book;
};

export async function getWorksByPerson(personId: string): Promise<Work[]> {
    try {
        const contributorsRef = dataPoint<Contributor>('contributors');
        const pId = parseInt(personId, 10);
        if (isNaN(pId)) return [];

        const snapshot = await contributorsRef.where('person_id', '==', pId).get();
        if (snapshot.empty) return [];

        // Collect all unique book IDs (6-digit zero padded) and map them to roles
        const bookRoleMap: Record<string, RoleId> = {};
        const bookRefs = snapshot.docs.map(doc => {
            const data = doc.data();
            const bookIdStr = data.book_id.toString().padStart(6, '0');
            bookRoleMap[bookIdStr] = data.role as RoleId;
            return db.collection('books').doc(bookIdStr);
        });

        if (bookRefs.length === 0) return [];

        // Fetch all books in one batch
        const bookSnapshots = await db.getAll(...bookRefs);
        
        return bookSnapshots
            .filter(snap => snap.exists)
            .map(snap => ({
                role: bookRoleMap[snap.id],
                book: { ...snap.data() as Book, book_id: snap.id }
            }));

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

        // Collect unique person IDs and map them to roles
        const personRoleMap: Record<string, RoleId> = {};
        const personRefs = snapshot.docs.map(doc => {
            const data = doc.data();
            const personIdStr = data.person_id.toString().padStart(6, '0');
            personRoleMap[personIdStr] = data.role as RoleId;
            return db.collection('persons').doc(personIdStr);
        });

        if (personRefs.length === 0) return [];

        // Fetch all persons in one batch
        const personSnapshots = await db.getAll(...personRefs);
        
        return personSnapshots
            .filter(snap => snap.exists)
            .map(snap => ({
                role: personRoleMap[snap.id],
                person: { ...snap.data() as Person, person_id: snap.id }
            }));

    } catch (error) {
        console.error(`Error fetching contributors for book ${bookId}:`, error);
        return [];
    }
}

