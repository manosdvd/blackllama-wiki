export type OnboardingStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';
export type OnboardingTaskStatus = 'not_started' | 'in_progress' | 'submitted' | 'verified' | 'needs_correction' | 'waived';
export type OnboardingRequirement = 'all' | 'paid' | 'volunteer';

export interface OnboardingTaskDefinition {
  id: string;
  title: string;
  description: string;
  requiredFor: OnboardingRequirement;
  officialUrl?: string;
  actionLabel?: string;
  requiresAdminVerification: boolean;
  sortOrder: number;
}

export interface UserOnboarding {
  id: string;
  uid: string;
  seasonId: string;
  templateId: string;
  status: OnboardingStatus;
  percentComplete: number;
  applicationId?: string | null;
  roleType?: 'paid' | 'volunteer' | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserOnboardingTaskStatus {
  id: string;
  uid: string;
  seasonId: string;
  status: OnboardingTaskStatus;
  userNote?: string;
  adminNote?: string;
  verifiedByUid?: string | null;
  verifiedAt?: unknown;
  updatedAt?: unknown;
}

export const DEFAULT_ONBOARDING_TASKS: OnboardingTaskDefinition[] = [
  {
    id: 'staff-application',
    title: 'Staff Application',
    description: 'Submitted online through this portal.',
    requiredFor: 'all',
    requiresAdminVerification: true,
    sortOrder: 10,
  },
  {
    id: 'letter-of-agreement',
    title: 'Letter of Agreement',
    description: 'Provided by the Camp Director after approval.',
    requiredFor: 'all',
    requiresAdminVerification: true,
    sortOrder: 20,
  },
  {
    id: 'code-of-conduct',
    title: 'Signed Code of Conduct',
    description: 'Read and sign the current staff code of conduct.',
    requiredFor: 'all',
    requiresAdminVerification: true,
    sortOrder: 30,
  },
  {
    id: 'medical-record',
    title: 'Annual Health & Medical Record Parts A/B/C',
    description: 'Requires physical exam within the last 12 months. Submit only through official secure channels.',
    requiredFor: 'all',
    officialUrl: 'https://www.scouting.org/health-and-safety/ahmr/',
    actionLabel: 'Official Site',
    requiresAdminVerification: true,
    sortOrder: 40,
  },
  {
    id: 'vehicle-permit',
    title: 'Vehicle Permit / Transportation Authorization',
    description: 'Required if you are bringing a vehicle to camp.',
    requiredFor: 'all',
    requiresAdminVerification: true,
    sortOrder: 50,
  },
  {
    id: 'venture-leader-application',
    title: 'Venture / Leader Application',
    description: 'Required if you are not currently registered.',
    requiredFor: 'all',
    officialUrl: 'https://my.scouting.org',
    actionLabel: 'my.scouting.org',
    requiresAdminVerification: true,
    sortOrder: 60,
  },
  {
    id: 'background-check',
    title: 'Background Check Validation',
    description: 'Completed via Catalina Council and verified by authorized staff.',
    requiredFor: 'all',
    requiresAdminVerification: true,
    sortOrder: 70,
  },
  {
    id: 'safeguarding-youth',
    title: 'Safeguarding Youth Training',
    description: 'Must be completed annually.',
    requiredFor: 'all',
    officialUrl: 'https://my.scouting.org',
    actionLabel: 'Training Portal',
    requiresAdminVerification: true,
    sortOrder: 80,
  },
  {
    id: 'hazardous-weather',
    title: 'Hazardous Weather Training',
    description: 'Online module required before youth participants arrive.',
    requiredFor: 'all',
    officialUrl: 'https://my.scouting.org',
    actionLabel: 'Training Portal',
    requiresAdminVerification: true,
    sortOrder: 90,
  },
  {
    id: 'i9',
    title: 'I-9 Form',
    description: 'Requires copies of acceptable identity and work authorization documents. Do not upload completed documents here.',
    requiredFor: 'paid',
    officialUrl: 'https://www.uscis.gov/i-9',
    actionLabel: 'USCIS Link',
    requiresAdminVerification: true,
    sortOrder: 100,
  },
  {
    id: 'w4',
    title: 'IRS W-4 Form',
    description: 'Federal tax withholding form for paid staff.',
    requiredFor: 'paid',
    officialUrl: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf',
    actionLabel: 'IRS PDF',
    requiresAdminVerification: true,
    sortOrder: 110,
  },
  {
    id: 'az-a4',
    title: 'Arizona Form A-4',
    description: 'State withholding election for paid staff.',
    requiredFor: 'paid',
    officialUrl: 'https://azdor.gov/forms/withholding-forms',
    actionLabel: 'AZ DOR Link',
    requiresAdminVerification: true,
    sortOrder: 120,
  },
];
