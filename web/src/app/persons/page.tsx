import { getPersons, searchPersons } from '@/lib/firestore/persons';
import PersonCard from '@/components/PersonCard';
import SearchInput from '@/components/SearchInput';
import styles from './page.module.css';

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PersonsPage({ searchParams }: Props) {
    const resolvedSearchParams = await searchParams;
    const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : '';

    const persons = q ? await searchPersons(q) : await getPersons(20);

    return (
        <main className={styles.main}>
            <div className="container">
                <header className={styles.header}>
                    <h1 className={styles.title}>Authors & Contributors</h1>
                    <SearchInput targetRoute="/persons" placeholder="Search by last name..." />
                </header>

                <section>
                    <div className="mb-6 text-sm text-muted">
                        {q ? `Results for "${q}"` : 'All Personnel'}
                    </div>

                    {persons.length > 0 ? (
                        <div className={styles.grid}>
                            {persons.map((person) => (
                                <PersonCard key={person.person_id} person={person} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.noResults}>
                            No persons found matching &quot;{q}&quot;
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
