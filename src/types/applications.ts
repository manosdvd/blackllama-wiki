export const CURRENT_SEASON_ID = '2026';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'needs_info'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'withdrawn';

export type StaffRoleType = 'paid' | 'volunteer';

export interface StaffApplication {
  id: string;
  uid?: string | null;
  seasonId: string;
  status: ApplicationStatus;
  applicantName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  isMinor: boolean;
  parentGuardianRequired: boolean;
  roleType: StaffRoleType;
  areaOfInterest: string;
  scoutingExperience?: string;
  bsaId?: string;
  council?: string;
  submittedAt?: unknown;
  reviewedByUid?: string | null;
  reviewedAt?: unknown;
  adminNotes?: string;
  decisionReason?: string;
}

export interface ApplicationDecisionPayload {
  decision: Extract<ApplicationStatus, 'approved' | 'rejected' | 'waitlisted' | 'needs_info' | 'under_review'>;
  adminNotes?: string;
}
