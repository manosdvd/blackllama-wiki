export type ContentType = 'wiki' | 'blog' | 'alert' | 'onboarding_page' | 'resource' | 'form' | 'forum_topic_later';
export type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived' | 'needs_update';
export type ContentVisibility =
  | 'public'
  | 'candidate'
  | 'onboarding'
  | 'staff'
  | 'alumni'
  | 'admin_only'
  | 'safety_sensitive';
export type DeliveryMode =
  | 'normal_page'
  | 'wiki_page'
  | 'blog_feed'
  | 'dashboard_card'
  | 'hud_alert'
  | 'onboarding_step'
  | 'resource_download'
  | 'forum_thread_later';

export interface EditorBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EditorData {
  time?: number;
  blocks: EditorBlock[];
  version?: string;
}

export interface WikiCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  parentId?: string | null;
  isSuperCategory?: boolean;
}

export interface WikiTag {
  id: string;
  slug: string;
  name: string;
  description?: string;
  color?: string;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  summary: string;
  bodyEditorJs: EditorData;
  plainTextSearch: string;
  categoryId: string;
  tagIds: string[];
  linkedContentIds: string[];
  unresolvedWikiLinks: string[];
  backlinks?: string[];
  visibility: ContentVisibility;
  status: ContentStatus;
  deliveryMode: DeliveryMode;
  ownerUid?: string | null;
  ownerRole?: string | null;
  createdByUid: string;
  updatedByUid: string;
  reviewedByUid?: string | null;
  publishedByUid?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  reviewedAt?: unknown;
  publishedAt?: unknown;
  archivedAt?: unknown;
  reviewDueAt?: unknown;
  emergencyPriority?: number;
  isPinned: boolean;
  versionNumber: number;
}

export interface ContentRevision {
  id: string;
  versionNumber: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'published' | 'superseded';
  bodyEditorJs: EditorData;
  plainTextSearch: string;
  changeSummary?: string;
  createdByUid: string;
  reviewedByUid?: string | null;
  approvedByUid?: string | null;
  publishedByUid?: string | null;
  createdAt?: unknown;
  reviewedAt?: unknown;
  publishedAt?: unknown;
}

export interface ContentWritePayload {
  id?: string;
  title: string;
  slug?: string;
  summary: string;
  bodyEditorJs: EditorData;
  categoryId: string;
  tagIds?: string[];
  visibility: ContentVisibility;
  status: ContentStatus;
  reviewDueAt?: string | null;
  isPinned?: boolean;
  changeSummary?: string;
}

export const DEFAULT_WIKI_CATEGORIES: WikiCategory[] = [
  {
    id: 'camp-culture-and-training',
    slug: 'camp-culture-and-training',
    name: 'Camp Culture and Training',
    description: 'Camp Lawton culture, staff expectations, teaching guidance, campfire training, and core Scouting principles.',
    color: '#14b8a6',
    sortOrder: 10,
  },
  {
    id: 'policies',
    slug: 'policies',
    name: 'Policies',
    description: 'Campwide rules, employment information, and policies for staff conduct and daily operations.',
    color: '#d97706',
    sortOrder: 20,
  },
  {
    id: 'songbook',
    slug: 'songbook',
    name: 'Songbook',
    description: 'Camp songs, skits, ceremonies, and campfire material.',
    color: '#eab308',
    sortOrder: 30,
  },
  {
    id: 'procedures',
    slug: 'procedures',
    name: 'Procedures',
    description: 'Safety, emergency response, incident handling, camp security, and camp-opening procedures.',
    color: '#991b1b',
    sortOrder: 40,
  },
  {
    id: 'onboarding',
    slug: 'onboarding',
    name: 'Onboarding',
    description: 'Required staff paperwork, packing guidance, and the Camp Lawton Staff Code of Conduct.',
    color: '#2563eb',
    sortOrder: 50,
  },
];
