export const FORUM_CATEGORIES = [
  {
    id: 'general',
    name: 'General Discussion',
    description: 'Everything camp related.',
    icon: '🏕️',
  },
  {
    id: 'training',
    name: 'Training Q&A',
    description: 'Questions about certifications, policies, and procedures.',
    icon: '📚',
  },
  {
    id: 'stories',
    name: 'Campfire Stories',
    description: 'Share favorite memories and alumni tales.',
    icon: '🔥',
  },
  {
    id: 'trading-post',
    name: 'Trading Post',
    description: 'Ride-shares, lost and found, and gear exchange.',
    icon: '🎒',
  },
] as const;

export type ForumCategoryId = (typeof FORUM_CATEGORIES)[number]['id'];
export type ForumTopicStatus = 'open' | 'locked' | 'removed';

export interface ForumTopic {
  id: string;
  title: string;
  body: string;
  categoryId: ForumCategoryId;
  authorUid: string;
  authorName: string;
  authorRole: string;
  status: ForumTopicStatus;
  isPinned: boolean;
  replyCount: number;
  flagCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastActivityAt?: unknown;
  editedAt?: unknown;
  removedAt?: unknown;
  removedByUid?: string | null;
}

export interface ForumPost {
  id: string;
  topicId: string;
  content: string;
  authorUid: string;
  authorName: string;
  authorRole: string;
  isRemoved: boolean;
  removalReason?: string | null;
  removedByUid?: string | null;
  flagCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  editedAt?: unknown;
  removedAt?: unknown;
}

export interface ForumPostFlag {
  id: string;
  postId: string;
  topicId: string;
  reporterUid: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt?: unknown;
  resolvedAt?: unknown;
  resolvedByUid?: string | null;
}

export function isForumCategoryId(value: unknown): value is ForumCategoryId {
  return FORUM_CATEGORIES.some((category) => category.id === value);
}

export function forumCategoryName(categoryId: ForumCategoryId) {
  return FORUM_CATEGORIES.find((category) => category.id === categoryId)?.name ?? categoryId;
}
