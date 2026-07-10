import type { DecodedIdToken } from 'firebase-admin/auth';
import type { CurrentUser } from '@/lib/server/auth';
import { currentUserHasPermission, currentUserIsHealthy } from '@/lib/server/auth';
import type { UserProfile } from '@/types/users';

export function canParticipateInCommunity(currentUser: CurrentUser | null) {
  if (!currentUser || !currentUserIsHealthy(currentUser) || !currentUser.profile) return false;
  return currentUser.profile.portalMode !== 'guest';
}

export function canModerateCommunity(currentUser: CurrentUser | null) {
  return currentUserHasPermission(currentUser, 'canModerateCommunity');
}

export function communityAuthor(profile: UserProfile, decodedToken: DecodedIdToken) {
  return {
    authorUid: decodedToken.uid,
    authorName: profile.preferredName || profile.displayName || profile.email || 'Camp Staff',
    authorRole: profile.primarySeasonRole || profile.portalMode,
  };
}

export function cleanCommunityText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}
