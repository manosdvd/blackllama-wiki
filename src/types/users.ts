import type { AdminPermission, AdminPresetKey } from './permissions';

export type PortalMode = 'guest' | 'candidate' | 'onboarding' | 'staff' | 'alumni' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'disabled' | 'removed';
export type SeasonRelationship =
  | 'applicant'
  | 'candidate'
  | 'onboarding'
  | 'active_staff'
  | 'completed_staff'
  | 'alumni';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  preferredName?: string | null;
  legalName?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  portalMode: PortalMode;
  accountStatus: AccountStatus;
  currentSeasonId?: string | null;
  primarySeasonRole?: string | null;
  isAdmin: boolean;
  adminPreset?: AdminPresetKey | null;
  adminPermissions: AdminPermission[];
  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
  suspendedAt?: unknown;
  disabledAt?: unknown;
}

export interface SeasonMembership {
  id: string;
  uid: string;
  seasonId: string;
  relationshipStatus: SeasonRelationship;
  staffType?: 'paid' | 'volunteer' | null;
  area?: string | null;
  positionTitle?: string | null;
  isYouthStaff?: boolean;
  isAdultStaff?: boolean;
  onboardingStatus?: 'not_started' | 'in_progress' | 'blocked' | 'complete';
  applicationId?: string | null;
  reportsToUid?: string | null;
  startedAt?: unknown;
  endedAt?: unknown;
}

const HEALTHY_ACCOUNT_STATUSES: AccountStatus[] = ['pending', 'active'];

export function isHealthyAccountStatus(status?: AccountStatus | null) {
  return !!status && HEALTHY_ACCOUNT_STATUSES.includes(status);
}
