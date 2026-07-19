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

const SOURCE_IMAGE_PALETTES = [
  ['#15324a', '#2d6f7a', '#f0bd68'],
  ['#2d2438', '#77567a', '#e3b566'],
  ['#14352f', '#34745f', '#dfb96b'],
  ['#3b2b24', '#8a5740', '#e9c57a'],
  ['#1d2c44', '#496b9a', '#d7b462'],
  ['#38243e', '#7a4c68', '#e6bb73'],
  ['#243729', '#5d7648', '#e5bd67'],
  ['#342c21', '#786443', '#ebc979'],
] as const;

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

function hashSource(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeSvgText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] || character);
}

function sourceLabel(item: CampFeedBulletinItem) {
  const raw = (item.source || item.category || item.sourceType || 'Camp Lawton').trim();
  return raw.replace(/^www\./i, '').replace(/\.(?:com|org|net)$/i, '') || 'Camp Lawton';
}

function splitSourceLabel(label: string) {
  const shortened = label.length > 42 ? `${label.slice(0, 39).trim()}...` : label;
  const words = shortened.split(/\s+/);
  if (words.length === 1 || shortened.length <= 24) return [shortened, ''];

  const target = shortened.length / 2;
  let firstLine = '';
  let secondLine = '';

  for (const word of words) {
    if (!secondLine && (firstLine.length === 0 || firstLine.length + word.length + 1 <= target)) {
      firstLine = `${firstLine} ${word}`.trim();
    } else {
      secondLine = `${secondLine} ${word}`.trim();
    }
  }

  return [firstLine, secondLine];
}

function sourceArtwork(seed: number, accent: string) {
  switch (seed % 6) {
    case 0:
      return `<path d="M0 520 L220 260 L390 445 L610 165 L850 455 L1040 285 L1200 490 V675 H0 Z" fill="${accent}" opacity=".36"/><path d="M0 590 L250 390 L430 535 L690 315 L910 540 L1200 365 V675 H0 Z" fill="#ffffff" opacity=".14"/>`;
    case 1:
      return `<g fill="none" stroke="${accent}" stroke-width="10" opacity=".55"><circle cx="885" cy="285" r="150"/><circle cx="885" cy="285" r="95"/><path d="M885 90V480M690 285H1080M747 147L1023 423M1023 147L747 423"/></g><circle cx="885" cy="285" r="22" fill="#ffffff" opacity=".5"/>`;
    case 2:
      return `<g fill="${accent}" opacity=".42"><path d="M110 585L235 285L360 585Z"/><path d="M300 585L470 205L640 585Z"/><path d="M545 585L690 315L835 585Z"/><path d="M770 585L940 225L1110 585Z"/></g><rect y="575" width="1200" height="100" fill="#ffffff" opacity=".1"/>`;
    case 3:
      return `<path d="M120 570 C280 455 365 610 520 485 S790 355 940 480 S1080 545 1200 420" fill="none" stroke="${accent}" stroke-width="38" stroke-linecap="round" opacity=".45"/><path d="M95 570 C255 455 340 610 495 485 S765 355 915 480 S1055 545 1175 420" fill="none" stroke="#ffffff" stroke-width="5" stroke-dasharray="18 20" opacity=".55"/>`;
    case 4:
      return `<g fill="${accent}" opacity=".5"><circle cx="850" cy="180" r="10"/><circle cx="1010" cy="250" r="7"/><circle cx="920" cy="390" r="12"/><circle cx="740" cy="330" r="6"/><circle cx="1080" cy="120" r="9"/></g><path d="M720 390L850 180L1010 250L920 390L1080 120" fill="none" stroke="#ffffff" stroke-width="5" opacity=".35"/>`;
    default:
      return `<g fill="none" stroke="${accent}" stroke-width="12" opacity=".48"><path d="M760 560C760 390 900 390 900 220C900 120 1010 90 1100 130"/><path d="M700 560C700 350 820 350 820 185C820 105 760 75 690 95"/><path d="M640 560C640 435 565 395 500 420"/></g><g fill="${accent}" opacity=".5"><circle cx="1100" cy="130" r="28"/><circle cx="690" cy="95" r="24"/><circle cx="500" cy="420" r="20"/></g>`;
  }
}

function getSourceFallbackImage(item: CampFeedBulletinItem) {
  const label = sourceLabel(item);
  const seed = hashSource(`${item.source || ''}|${item.sourceType || ''}|${item.category || ''}`);
  const palette = SOURCE_IMAGE_PALETTES[seed % SOURCE_IMAGE_PALETTES.length];
  const [lineOne, lineTwo] = splitSourceLabel(label).map(escapeSvgText);
  const initials = escapeSvgText(label.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase());
  const artwork = sourceArtwork(seed, palette[2]);
  const secondLine = lineTwo
    ? `<text x="76" y="520" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="700">${lineTwo}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${palette[0]}"/>
        <stop offset="1" stop-color="${palette[1]}"/>
      </linearGradient>
      <radialGradient id="glow" cx="78%" cy="18%" r="65%">
        <stop offset="0" stop-color="${palette[2]}" stop-opacity=".28"/>
        <stop offset="1" stop-color="${palette[2]}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="675" fill="url(#background)"/>
    <rect width="1200" height="675" fill="url(#glow)"/>
    ${artwork}
    <rect x="54" y="54" width="148" height="148" rx="28" fill="#000000" opacity=".2"/>
    <text x="128" y="154" text-anchor="middle" fill="${palette[2]}" font-family="Arial, sans-serif" font-size="62" font-weight="800">${initials}</text>
    <text x="76" y="380" fill="${palette[2]}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5">CAMP FEED</text>
    <text x="76" y="458" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="700">${lineOne}</text>
    ${secondLine}
    <rect x="76" y="590" width="210" height="5" rx="3" fill="${palette[2]}"/>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
  return getSourceFallbackImage(item);
}

function FeedImage({ item, imageUrl }: { item: CampFeedBulletinItem; imageUrl?: string }) {
  const fallbackUrl = getSourceFallbackImage(item);
  const [failedUrl, setFailedUrl] = useState<string>();
  const currentUrl = imageUrl && imageUrl !== failedUrl ? imageUrl : fallbackUrl;

  const image = (
    // Feed image hosts are dynamic, so they cannot be exhaustively configured for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentUrl}
      alt=""
      className={styles.cardImage}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (currentUrl !== fallbackUrl) setFailedUrl(currentUrl);
      }}
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
