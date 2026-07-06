import type { ContentVisibility } from '@/types/content';
import type { AdminPermission } from '@/types/permissions';
import { ADMIN_PERMISSIONS, permissionsForPreset } from '@/types/permissions';
import type { PortalMode, UserProfile } from '@/types/users';
import { isHealthyAccountStatus } from '@/types/users';

function effectivePermissions(profile?: UserProfile | null): AdminPermission[] {
  if (!profile) return [];
  if (profile.adminPreset === 'owner') return [...ADMIN_PERMISSIONS];

  const permissionSet = new Set<AdminPermission>([
    ...permissionsForPreset(profile.adminPreset),
    ...(profile.adminPermissions ?? []),
  ]);

  return [...permissionSet];
}

export function hasPermission(profile: UserProfile | null | undefined, permission: AdminPermission) {
  if (!profile || !isHealthyAccountStatus(profile.accountStatus)) return false;
  if (profile.isAdmin && profile.adminPreset === 'owner') return true;
  return effectivePermissions(profile).includes(permission);
}

export function canAccessVisibility(profile: UserProfile | null | undefined, visibility: ContentVisibility) {
  if (visibility === 'public') return true;
  if (!profile || !isHealthyAccountStatus(profile.accountStatus)) return false;
  if (profile.isAdmin || profile.portalMode === 'admin') return true;

  const portalMode = profile.portalMode;
  const portalOrder: PortalMode[] = ['guest', 'candidate', 'onboarding', 'staff', 'alumni', 'admin'];
  const atLeast = (mode: PortalMode) => portalOrder.indexOf(portalMode) >= portalOrder.indexOf(mode);

  if (visibility === 'candidate') return atLeast('candidate');
  if (visibility === 'onboarding') return atLeast('onboarding') && portalMode !== 'alumni';
  if (visibility === 'staff') return portalMode === 'staff';
  if (visibility === 'alumni') return portalMode === 'staff' || portalMode === 'alumni';
  if (visibility === 'admin_only') return profile.isAdmin;
  if (visibility === 'safety_sensitive') {
    return hasPermission(profile, 'canManageAlerts') || hasPermission(profile, 'canPublishWiki');
  }

  return false;
}
