import { notFound } from 'next/navigation';
import { getPerson } from '@/lib/firestore/persons';
import { getWorksByPerson } from '@/lib/firestore/contributors';
import { ROLES, RoleId } from '@/types/aozora';
import BookCard from '@/components/BookCard';
import styles from './page.module.css';

interface Props {
    params: Promise<{ personId: string }>
}

export default async function PersonDetailPage({ params }: Props) {
    const { personId } = await params;

    const [person, works] = await Promise.all([
        getPerson(personId),
        getWorksByPerson(personId)
    ]);

    if (!person) {
        notFound();
    }

    // Group works by role
    const worksByRole: Record<string, typeof works> = {};
    works.forEach(w => {
        const roleName = ROLES[w.role] || 'その他';
        if (!worksByRole[roleName]) {
            worksByRole[roleName] = [];
        }
        worksByRole[roleName].push(w);
    });

    return (
        <main className={styles.main}>
            <div className="container">
                <header className={styles.profileHeader}>
                    <div className={styles.avatar}>
                        {person.last_name[0]}
                    </div>
                    <h1 className={styles.name}>
                        {person.last_name} {person.first_name}
                    </h1>
                    <p className={styles.yomi}>
                        {person.last_name_yomi} {person.first_name_yomi}
                    </p>

                    <div className={styles.meta}>
                        {person.date_of_birth && <span>生年: {person.date_of_birth}</span>}
                        {person.date_of_death && <span>没年: {person.date_of_death}</span>}
                    </div>
                </header>

                <div>
                    {Object.entries(worksByRole).map(([role, roleWorks]) => (
                        <section key={role} className={styles.roleGroup}>
                            <h2 className={styles.sectionTitle}>{role}</h2>
                            <div className={styles.grid}>
                                {roleWorks.map((work) => (
                                    <BookCard key={work.book.book_id} book={work.book} />
                                ))}
                            </div>
                        </section>
                    ))}

                    {works.length === 0 && (
                        <p className="text-center text-muted">No works found in database.</p>
                    )}
                </div>
            </div>
        </main>
    );
}
