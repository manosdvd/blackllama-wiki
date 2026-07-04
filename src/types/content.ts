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
    id: 'camp-staff-culture-training',
    slug: 'camp-staff-culture-training',
    name: 'Camp Culture & Training',
    description: 'Mission, staff culture, chain of command, teaching methods, required trainings, and staff-life references.',
    color: '#14b8a6',
    sortOrder: 11,
  },
  {
    id: 'policies-procedures',
    slug: 'policies-procedures',
    name: 'Policies & Procedures',
    description: 'Operational policies, camp procedures, and reference checks.',
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
    id: 'camp-culture-history',
    slug: 'camp-culture-history',
    name: 'Camp Culture & History',
    description: 'Traditions, stories, and Camp Lawton institutional memory.',
    color: '#78716c',
    sortOrder: 40,
  },
  {
    id: 'forms-paperwork',
    slug: 'forms-paperwork',
    name: 'Forms & Paperwork',
    description: 'Official forms, links, and secure submission guidance.',
    color: '#2563eb',
    sortOrder: 50,
  },
  {
    id: 'resources',
    slug: 'resources',
    name: 'Resources',
    description: 'Useful staff references, addresses, directories, and quick lookup material.',
    color: '#0891b2',
    sortOrder: 55,
  },
  {
    id: 'emergency-procedures',
    slug: 'emergency-procedures',
    name: 'Emergency Procedures',
    description: 'Safety-sensitive procedures and emergency references.',
    color: '#991b1b',
    sortOrder: 60,
  },
  {
    id: 'program-areas',
    slug: 'program-areas',
    name: 'Program Areas',
    description: 'Aquatics, scoutcraft, nature, handicraft, and range operations.',
    color: '#15803d',
    sortOrder: 70,
  },
  {
    id: 'facilities-maintenance',
    slug: 'facilities-maintenance',
    name: 'Facilities & Maintenance',
    description: 'Ranger notes, utility references, and facility care.',
    color: '#57534e',
    sortOrder: 80,
  },
  {
    id: 'kitchen-dining',
    slug: 'kitchen-dining',
    name: 'Kitchen & Dining',
    description: 'Dining hall procedures, kitchen references, and meal service.',
    color: '#b45309',
    sortOrder: 90,
  },
  {
    id: 'health-lodge',
    slug: 'health-lodge',
    name: 'Health Lodge',
    description: 'Health lodge references and official care procedures.',
    color: '#be123c',
    sortOrder: 100,
  },
];
