import Link from 'next/link';
import { Person } from '@/types/aozora';
import styles from './PersonCard.module.css';

interface PersonCardProps {
    person: Person;
}

export default function PersonCard({ person }: PersonCardProps) {
    const fullName = `${person.last_name} ${person.first_name}`;
    const yomi = `${person.last_name_yomi} ${person.first_name_yomi}`;

    return (
        <Link href={`/persons/${person.person_id}`} className={styles.card}>
            <div className={styles.glassPanel}>
                <div className={styles.content}>
                    <div className={styles.avatarPlaceholder}>
                        {person.last_name[0]}
                    </div>
                    <div>
                        <h3 className={styles.name}>
                            {fullName}
                        </h3>
                        <p className={styles.yomi}>{yomi}</p>
                    </div>
                </div>
            </div>
        </Link>
    );
}
