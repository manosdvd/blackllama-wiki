export const ADMIN_PERMISSIONS = [
  'canManageUsers',
  'canManageRoles',
  'canReviewApplications',
  'canManageOnboarding',
  'canVerifyPaperwork',
  'canDraftWiki',
  'canEditWiki',
  'canPublishWiki',
  'canArchiveWiki',
  'canManageForms',
  'canManageTags',
  'canManageCategories',
  'canManageAlerts',
  'canModerateCommunity',
  'canViewAuditLog',
  'canManageSystemSettings',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminPresetKey =
  | 'owner'
  | 'full_admin'
  | 'camp_director'
  | 'program_director'
  | 'content_admin'
  | 'publisher'
  | 'onboarding_admin'
  | 'application_reviewer'
  | 'safety_admin'
  | 'moderator'
  | 'read_only_admin';

export interface AdminPreset {
  key: AdminPresetKey;
  name: string;
  description: string;
  permissions: AdminPermission[];
}

export const ADMIN_PRESETS: Record<AdminPresetKey, AdminPreset> = {
  owner: {
    key: 'owner',
    name: 'Owner',
    description: 'Full system control. Use rarely.',
    permissions: [...ADMIN_PERMISSIONS],
  },
  full_admin: {
    key: 'full_admin',
    name: 'Full admin',
    description: 'Broad administrative access without ownership language.',
    permissions: [...ADMIN_PERMISSIONS].filter((permission) => permission !== 'canManageSystemSettings'),
  },
  camp_director: {
    key: 'camp_director',
    name: 'Camp director',
    description: 'Users, applications, onboarding, official content, and alerts.',
    permissions: [
      'canManageUsers',
      'canReviewApplications',
      'canManageOnboarding',
      'canVerifyPaperwork',
      'canDraftWiki',
      'canEditWiki',
      'canPublishWiki',
      'canManageForms',
      'canManageAlerts',
      'canViewAuditLog',
    ],
  },
  program_director: {
    key: 'program_director',
    name: 'Program director',
    description: 'Program/wiki content and onboarding support.',
    permissions: [
      'canDraftWiki',
      'canEditWiki',
      'canPublishWiki',
      'canManageTags',
      'canManageCategories',
      'canManageOnboarding',
    ],
  },
  content_admin: {
    key: 'content_admin',
    name: 'Content admin',
    description: 'Wiki/content creation, editing, and review queue.',
    permissions: ['canDraftWiki', 'canEditWiki', 'canManageTags', 'canManageCategories'],
  },
  publisher: {
    key: 'publisher',
    name: 'Publisher',
    description: 'Can publish official content.',
    permissions: ['canDraftWiki', 'canEditWiki', 'canPublishWiki'],
  },
  onboarding_admin: {
    key: 'onboarding_admin',
    name: 'Onboarding admin',
    description: 'Can manage onboarding checklists and verification.',
    permissions: ['canManageOnboarding', 'canVerifyPaperwork'],
  },
  application_reviewer: {
    key: 'application_reviewer',
    name: 'Application reviewer',
    description: 'Can review and process staff applications.',
    permissions: ['canReviewApplications'],
  },
  safety_admin: {
    key: 'safety_admin',
    name: 'Safety admin',
    description: 'Can manage emergency/safety content and alerts.',
    permissions: ['canDraftWiki', 'canEditWiki', 'canPublishWiki', 'canManageAlerts'],
  },
  moderator: {
    key: 'moderator',
    name: 'Moderator',
    description: 'Reserved for future community moderation.',
    permissions: ['canModerateCommunity', 'canViewAuditLog'],
  },
  read_only_admin: {
    key: 'read_only_admin',
    name: 'Read-only admin',
    description: 'Can inspect admin dashboards without changing data.',
    permissions: ['canViewAuditLog'],
  },
};

export function permissionsForPreset(presetKey?: AdminPresetKey | null): AdminPermission[] {
  if (!presetKey) return [];
  return ADMIN_PRESETS[presetKey]?.permissions ?? [];
}
