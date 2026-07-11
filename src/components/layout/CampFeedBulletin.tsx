'use client';

import React, { useState } from 'react';
import { CalendarClock, ExternalLink, ImageOff, X } from 'lucide-react';
import styles from './CampFeedBulletin.module.css';

export interface CampFeedBulletinItem {
  id: string;
  title: string;
  url: string;
  category?: string;
  source?: string;
  sourceType?: string;
  publishedAt?: string;
  imageUrl?: string;
}

interface CampFeedBulletinProps {
  items: CampFeedBulletinItem[];
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}

function getCategoryColor(category?: string) {
  const lower = (category || '').toLowerCase();
  if (lower.includes('weather') || lower.includes('safety') || lower.includes('alert')) return '#e74c3c';
  if (lower.includes('nature') || lower.includes('forest')) return '#2ecc71';
  if (lower.includes('astronomy') || lower.includes('space') || lower.includes('sky')) return '#9b59b6';
  if (lower.includes('scout') || lower.includes('useful') || lower.includes('local')) return '#f1c40f';
  return 'var(--lantern-gold, #f7b733)';
}

function publicationLabel(item: CampFeedBulletinItem) {
  if (!item.publishedAt) {
    return item.sourceType === 'rss'
      ? { label: 'Post time unavailable', dateTime: undefined }
      : { label: 'Evergreen reference', dateTime: undefined };
  }

  const parsed = new Date(item.publishedAt);
  if (Number.isNaN(parsed.getTime())) {
    return { label: 'Post time unavailable', dateTime: undefined };
  }

  return {
    label: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(parsed),
    dateTime: parsed.toISOString(),
  };
}

function FeedImage({ item }: { item: CampFeedBulletinItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed) return null;

  const image = (
    // Feed image hosts are dynamic, so they cannot be exhaustively configured for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt=""
      className={styles.cardImage}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );

  if (!item.url) return <div className={styles.imageFrame}>{image}</div>;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.imageFrame}
      aria-label={`Open ${item.title}`}
    >
      {image}
    </a>
  );
}

export default function CampFeedBulletin({ items, onClose, closeButtonRef }: CampFeedBulletinProps) {
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.window}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-modal-title"
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Camp Lawton information stream</p>
            <h2 id="feed-modal-title" className={styles.title}>CAMP FEED BULLETIN</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Close Camp Feed Bulletin"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.cardGrid}>
            {items.map((item) => {
              const publication = publicationLabel(item);
              const category = (item.category || item.sourceType || 'live').replaceAll('_', ' ');

              return (
                <article key={item.id} className={`${styles.card} ${item.imageUrl ? styles.cardWithImage : ''}`}>
                  <FeedImage item={item} />

                  <div className={styles.cardBody}>
                    <div className={styles.metaRow}>
                      <span
                        className={styles.categoryBadge}
                        style={{ backgroundColor: getCategoryColor(item.category), color: '#000' }}
                      >
                        {category}
                      </span>
                      <span className={styles.source}>{item.source || 'Camp Lawton'}</span>
                    </div>

                    <div className={styles.timestamp}>
                      <CalendarClock size={13} aria-hidden="true" />
                      {publication.dateTime ? (
                        <time dateTime={publication.dateTime}>{publication.label}</time>
                      ) : (
                        <span>{publication.label}</span>
                      )}
                    </div>

                    <div className={styles.cardContent}>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.cardLink}
                        >
                          <span>{item.title}</span>
                          <ExternalLink size={15} className={styles.linkIcon} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className={styles.cardText}>{item.title}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {items.length === 0 && (
            <div className={styles.emptyState}>
              <ImageOff size={24} />
              <p>No bulletin items are available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
