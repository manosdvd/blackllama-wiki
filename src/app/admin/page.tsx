import Link from 'next/link';
import { BookOpen, ClipboardList, ShieldCheck, Users } from 'lucide-react';
import styles from './page.module.css';

const adminLinks = [
  {
    href: '/admin/review',
    title: 'Applications & Onboarding',
    description: 'Review staff applications and track onboarding verification.',
    icon: ClipboardList,
  },
  {
    href: '/admin/users',
    title: 'User Management',
    description: 'Set portal modes, account status, admin presets, and synced claims.',
    icon: Users,
  },
  {
    href: '/admin/content',
    title: 'Wiki Content',
    description: 'Review drafts, published pages, visibility, and editor workflow.',
    icon: BookOpen,
  },
  {
    href: '/admin/moderation',
    title: 'System & Moderation',
    description: 'Ticker sync, future forum moderation, and audit-facing controls.',
    icon: ShieldCheck,
  },
];

export default function AdminPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Admin Console</h1>
        <p>Plain-language controls for the staff wiki, applications, onboarding, users, and safety-sensitive workflows.</p>
      </header>

      <div className={styles.adminGrid}>
        {adminLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={styles.adminCard}>
              <Icon size={28} />
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
