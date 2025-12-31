import { db, dataPoint } from '@/lib/firebase/server';
import { Person } from '@/types/aozora';

export async function getPersons(limit: number = 20): Promise<Person[]> {
    try {
        const personsRef = dataPoint<Person>('persons');
        // Order by ID or something stable if no date available.
        // DATA_FORMAT doesn't mention release_date for persons.
        // We'll order by person_id as a proxy for "creation" or just random.
        const q = personsRef.orderBy('person_id', 'desc').limit(limit);
        const snapshot = await q.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            person_id: doc.id
        }));
    } catch (error) {
        console.error("Error fetching persons:", error);
        return [];
    }
}

export async function searchPersons(query: string, limit: number = 20): Promise<Person[]> {
    try {
        const personsRef = dataPoint<Person>('persons');
        // search by last_name
        const q = personsRef
            .where('last_name', '>=', query)
            .where('last_name', '<', query + '\uf8ff')
            .orderBy('last_name')
            .limit(limit);

        const snapshot = await q.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            person_id: doc.id,
        }));
    } catch (error) {
        console.error("Error searching persons:", error);
        return [];
    }
}

export async function getPerson(personId: string): Promise<Person | null> {
    try {
        const docRef = dataPoint<Person>('persons').doc(personId);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return null;
        }
        return {
            ...snapshot.data()!,
            person_id: snapshot.id
        };
    } catch (error) {
        console.error(`Error fetching person ${personId}:`, error);
        return null;
    }
}
