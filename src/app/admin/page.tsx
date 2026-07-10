import Link from 'next/link';
import { BookOpen, ClipboardList, MessagesSquare, ShieldCheck, Users } from 'lucide-react';
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
    description: 'Create accounts, set portal access, manage roles, and remove access safely.',
    icon: Users,
  },
  {
    href: '/admin/content',
    title: 'Wiki Content',
    description: 'Review drafts, published pages, visibility, and editor workflow.',
    icon: BookOpen,
  },
  {
    href: '/admin/community',
    title: 'Community Moderation',
    description: 'Review flags and moderate public forum discussions.',
    icon: MessagesSquare,
  },
  {
    href: '/admin/moderation',
    title: 'System Diagnostics',
    description: 'Review recent server errors and operational diagnostics.',
    icon: ShieldCheck,
  },
];

export default function AdminPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Admin Console</h1>
        <p>Plain-language controls for the staff wiki, applications, onboarding, users, community, and safety-sensitive workflows.</p>
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
