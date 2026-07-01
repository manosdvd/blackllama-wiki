import React from 'react';
import Link from 'next/link';
import { ChevronLeft, Edit3, Clock, User } from 'lucide-react';
import Output from 'editorjs-react-renderer';
import styles from './page.module.css';

// Mock data to simulate Editor.js output from Firestore
const mockArticle = {
  id: '1',
  title: 'Opening Campfire Script',
  category: 'programs',
  author: 'Program Director',
  lastUpdated: '2026-06-30T10:00:00Z',
  content: {
    time: 1629813200000,
    blocks: [
      {
        id: "sheNwCUP5A",
        type: "header",
        data: {
          text: "Introduction",
          level: 2
        }
      },
      {
        id: "12iM3lqzcm",
        type: "paragraph",
        data: {
          text: "Welcome to Camp Lawton. Tonight we start a new week of adventure."
        }
      },
      {
        id: "7kdkDlw2",
        type: "list",
        data: {
          style: "unordered",
          items: [
            "Staff assemble at 1930",
            "Scouts arrive at 1945",
            "Fire ignited at 2000"
          ]
        }
      },
      {
        id: "q9rO3wVp",
        type: "warning",
        data: {
          title: "Safety Notice",
          message: "Ensure fire buckets are filled and placed 10ft from the fire ring."
        }
      }
    ],
    version: "2.22.2"
  }
};

export default async function WikiArticlePage({ params }: { params: Promise<{ id: string }> }) {
  // Wait for params to resolve in Next 16
  const { id } = await params;
  
  // In a real app, we would fetch the article from Firestore using id
  const article = mockArticle;

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb}>
        <Link href="/wiki" className={styles.backLink}>
          <ChevronLeft size={20} />
          Back to Wiki
        </Link>
        <Link href={`/wiki/edit?id=${article.id}`} className={styles.editLink}>
          <Edit3 size={18} />
          Edit Article
        </Link>
      </nav>

      <article className={styles.article}>
        <header className={styles.articleHeader}>
          <div className={styles.categoryBadge}>{article.category}</div>
          <h1>{article.title}</h1>
          <div className={styles.metaData}>
            <span className={styles.metaItem}>
              <User size={16} />
              {article.author}
            </span>
            <span className={styles.metaItem}>
              <Clock size={16} />
              Last updated: {new Date(article.lastUpdated).toLocaleDateString()}
            </span>
          </div>
        </header>

        <div className={styles.content}>
          <Output data={article.content} />
        </div>
      </article>
    </div>
  );
}
