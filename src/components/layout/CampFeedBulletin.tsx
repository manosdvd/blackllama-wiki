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
  if (lower.includes('youtube')) return '#ff0000';
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

function getYoutubeThumbnail(urlStr?: string) {
  if (!urlStr) return undefined;
  try {
    const url = new URL(urlStr);
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/v/')) {
        videoId = url.pathname.split('/')[2] || null;
      } else {
        videoId = url.searchParams.get('v');
      }
    }
    if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return undefined;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return undefined;
  }
}

function getCategoryFallbackImage(category?: string) {
  const lower = (category || '').toLowerCase();
  if (lower.includes('weather') || lower.includes('safety') || lower.includes('alert')) {
    return '/images/weather_placeholder.jpg';
  }
  if (lower.includes('nature') || lower.includes('forest')) {
    return '/images/nature_placeholder.jpg';
  }
  if (lower.includes('astronomy') || lower.includes('space') || lower.includes('sky')) {
    return '/images/astronomy_placeholder.jpg';
  }
  if (lower.includes('scout') || lower.includes('useful') || lower.includes('local') || lower.includes('youtube')) {
    return '/images/scouting_placeholder.jpg';
  }
  return '/images/nature_placeholder.jpg';
}

function getResolvedImageUrl(item: CampFeedBulletinItem) {
  if (item.imageUrl) {
    const ytFromImage = getYoutubeThumbnail(item.imageUrl);
    if (ytFromImage) return ytFromImage;
  }
  if (item.url) {
    const ytFromUrl = getYoutubeThumbnail(item.url);
    if (ytFromUrl) return ytFromUrl;
  }
  if (item.imageUrl) return item.imageUrl;
  return getCategoryFallbackImage(item.category || item.sourceType);
}

function FeedImage({ item, imageUrl }: { item: CampFeedBulletinItem; imageUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) return null;

  const image = (
    // Feed image hosts are dynamic, so they cannot be exhaustively configured for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
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
              const resolvedImageUrl = getResolvedImageUrl(item);

              return (
                <article key={item.id} className={`${styles.card} ${resolvedImageUrl ? styles.cardWithImage : ''}`}>
                  <FeedImage item={item} imageUrl={resolvedImageUrl} />

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
