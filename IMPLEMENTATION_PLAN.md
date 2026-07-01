# Blackllama Wiki Implementation Plan

This document is the working implementation plan for `blackllama-wiki`. It is based on the current codebase, not the older `blackllama_staff` project.

The governing philosophy comes from `webapprules.md`:

> Provide a rich resource for Camp Lawton Scout Camp Staff for onboarding, training, and reference.

The priority order is:

1. Build the robust interactive wiki.
2. Build the deep WYSIWYG admin backend for wiki editing, user management, applications, onboarding, and moderation.
3. Build the staff application, onboarding, form/resource library, alerts HUD, and ticker support.
4. Leave internal community/forum features as a future placeholder until the wiki and user backend are fully functional.

The app should feel like a clean employment/onboarding portal wrapped around a beautiful camp wiki. It should not become a social network, a generic CMS, a game, or a paperwork vault.

---

## 1. Current Codebase Baseline

The current repo already has the right foundation:

- Next.js app structure.
- Firebase client SDK.
- Firebase Admin dependency.
- Firebase Auth with Google sign-in.
- Firestore connection.
- Firestore offline persistence.
- Editor.js WYSIWYG editor.
- PWA dependency.
- A styled dashboard/HUD shell.
- Wiki, edit, forum, and application page scaffolds.
- Prototype Firestore security rules.

Current important files:

```txt
package.json
firestore.rules
firebase.json
webapprules.md
src/lib/firebase/client.ts
src/components/auth/AuthContext.tsx
src/components/layout/AuthButton.tsx
src/app/page.tsx
src/app/wiki/page.tsx
src/app/wiki/edit/page.tsx
src/components/wiki/Editor.tsx
src/app/apply/page.tsx
src/app/forum/page.tsx
```

Current state in plain language:

- The dashboard/HUD is close to the desired direction.
- The wiki index is currently mock/static data.
- The wiki editor exists, but saving/publishing is not wired to Firestore.
- Auth exists, but the user model only checks simple custom claims like `admin` and `moderator`.
- Firestore rules exist, but they are prototype-level and too coarse for production.
- Application and forum pages are visual scaffolds, not functional workflows.

The next work should strengthen the existing Next/Firebase/Editor.js system rather than migrate stacks.

---

## 2. Core Product Rules

Every feature should pass this test:

```txt
Does this help Camp Lawton staff find, trust, create, maintain, or act on useful camp knowledge?
```

If the answer is no, it is probably clutter.

### Build for these outcomes

- Staff can quickly find accurate procedures, training information, forms, policies, songs, culture/history, and references.
- Admins can create and maintain wiki content without touching code.
- Admins can control exactly who can see, draft, publish, verify, manage, and moderate.
- Applicants and onboarding staff always know what they need to do next.
- The app works well on phones and weak camp internet.
- Offline mode keeps the most recent complete published wiki and UI available.
- Ticker and alerts remain useful but do not distract from the wiki.
- Forum/community features remain hidden and deferred until core systems are finished.

### Do not build for v1

- Google Docs-style collaborative editing.
- Gamification, XP, streaks, badges, or leaderboards.
- Public community features.
- Private DMs.
- Public staff profiles.
- A separate blog engine.
- A separate alert engine.
- A separate forum engine.
- AI ticker expansion.
- Push notifications.
- Dispatch/fire service integrations beyond current alert-source research.
- A completed sensitive-paperwork vault unless explicitly designed later with secure official submission requirements.

---

## 3. Technical Spine

Use the current stack:

```txt
Next.js
Firebase Auth
Firestore
Firebase Storage
Firebase Admin / server-only route handlers
Editor.js
PWA offline cache
Client-side/offline search index
```

### Why this stack

- It is already present in `blackllama-wiki`.
- It supports free/open-source-friendly development.
- Firestore supports offline persistence.
- Firebase Auth gives a realistic path to Google login and admin-set custom claims.
- Firebase Storage can host images, videos, and blank/fillable PDF resources.
- Editor.js already provides a block-based WYSIWYG foundation.

### Firebase boundary rule

Client code may read allowed data and submit allowed user actions. Sensitive actions must go through server-only code using Firebase Admin.

Server-only actions include:

```txt
set custom claims
create/revoke admin roles
approve applications
activate staff
verify onboarding requirements
publish official content if extra validation is needed
write immutable audit logs
```

---

## 4. User System Model

The app needs an admin-visible user mode and a robust permission system.

### 4.1 Portal modes

Portal mode controls the user experience and navigation.

```txt
guest
candidate
onboarding
staff
alumni
admin
```

Meanings:

| Portal mode | Meaning |
| --- | --- |
| guest | Not logged in, or not associated with camp yet. Can see public content and application entry points only. |
| candidate | Has applied or been invited, but is not yet approved/hired. |
| onboarding | Approved/hired but onboarding is not complete. |
| staff | Active current-season staff. |
| alumni | Former staff with specialized limited access. |
| admin | Has access to the admin backend. Admin may also be staff or alumni. |

### 4.2 Account status

Account status controls whether the account is healthy.

```txt
pending
active
suspended
disabled
removed
```

Rules:

- `suspended`, `disabled`, and `removed` must block protected access.
- Account status should be checked before portal mode or permissions.

### 4.3 Season relationship

Camp work is seasonal, so user access must support yearly cycles.

```txt
applicant
candidate
onboarding
active_staff
completed_staff
alumni
```

A user can be active staff for one season and alumni later. Admin status should not erase their season history.

### 4.4 Admin permissions

Admin is a visible portal mode, but admin power is permission-based.

```txt
canManageUsers
canManageRoles
canReviewApplications
canManageOnboarding
canVerifyPaperwork
canDraftWiki
canEditWiki
canPublishWiki
canArchiveWiki
canManageForms
canManageTags
canManageCategories
canManageAlerts
canModerateCommunity
canViewAuditLog
canManageSystemSettings
```

Named admin presets should bundle these permissions:

| Admin preset | Purpose |
| --- | --- |
| owner | Full system control. Use rarely. |
| full_admin | Broad admin authority without ownership-level danger. |
| camp_director | Users, applications, onboarding, official content, alerts. |
| program_director | Program/wiki content, staff resources, onboarding support. |
| content_admin | Wiki/content creation, editing, review queue. |
| publisher | Can publish official content. |
| onboarding_admin | Can manage onboarding checklists and verification. |
| application_reviewer | Can review and process applications. |
| safety_admin | Can manage emergency/safety content and alerts. |
| moderator | Reserved for future community moderation. |
| read_only_admin | Can inspect admin dashboards without changing data. |

### 4.5 Proposed Firestore collections

```txt
users/{uid}
  uid
  email
  displayName
  preferredName
  legalName
  phone
  photoURL
  portalMode
  accountStatus
  currentSeasonId
  primarySeasonRole
  isAdmin
  adminLevel
  createdAt
  updatedAt
  lastLoginAt
  suspendedAt
  disabledAt

seasonMemberships/{seasonId_uid}
  uid
  seasonId
  relationshipStatus
  staffType
  area
  positionTitle
  isYouthStaff
  isAdultStaff
  onboardingStatus
  applicationId
  reportsToUid
  startedAt
  endedAt

roleGrants/{grantId}
  uid
  roleKey
  permissions[]
  scopeType
  scopeId
  grantedByUid
  grantedAt
  expiresAt
  revokedAt

permissionPresets/{presetId}
  name
  description
  permissions[]
  editableByOwnerOnly

auditLogs/{logId}
  actorUid
  action
  targetType
  targetId
  before
  after
  createdAt
  requestId
```

### 4.6 AuthContext upgrade

Current `AuthContext` should evolve from this:

```txt
user
loading
login
logout
isAdmin
isModerator
```

To this:

```txt
user
profile
portalMode
accountStatus
permissions[]
seasonMembership
loading
login
logout
hasPermission(permission)
canAccessVisibility(visibility)
```

The UI should use this for route guards and button visibility. Firestore rules and server checks remain the real enforcement.

### 4.7 Suggested user/auth files

Add or refactor toward:

```txt
src/types/users.ts
src/types/permissions.ts
src/lib/auth/permissions.ts
src/lib/auth/access.ts
src/lib/firebase/admin.ts
src/lib/server/currentUser.ts
src/lib/server/adminActions.ts
```

These files should centralize role checks, profile loading, permission checks, and server-only admin operations so permission logic does not get scattered across random components.

---

## 5. Security Rules Plan

Current Firestore rules are useful for the prototype, but they need a real permission model.

### Security principles

- Deny by default.
- Public content must be explicitly public.
- Suspended/disabled/removed users get no protected access.
- Drafts are not readable unless the user is the author or has content admin permission.
- Publishing requires `canPublishWiki` or equivalent scoped permission.
- Role and permission changes must happen only through server/admin code.
- Audit logs should be append-only and server-written.

### Content visibility levels

```txt
public
candidate
onboarding
staff
alumni
admin_only
safety_sensitive
```

### Rule behavior

| Visibility | Who can read |
| --- | --- |
| public | anyone |
| candidate | candidate, onboarding, staff, alumni if allowed, admin |
| onboarding | onboarding, staff, admin |
| staff | active staff, admin |
| alumni | alumni, staff/admin where allowed by item settings |
| admin_only | admin with matching permission |
| safety_sensitive | safety_admin, camp_director, selected staff roles |

### Required helper concepts

```txt
isSignedIn()
isHealthyAccount()
isAdmin()
hasClaim(claim)
hasPermission(permission)
hasPortalMode(mode)
canReadVisibility(visibility)
canEditContent(resource)
canPublishContent(resource)
isSelf(uid)
```

Firestore rules cannot do everything elegantly, so the practical approach is:

- Use custom claims for coarse gates.
- Use Firestore profile/role data for UI and server-verified actions.
- Use server route handlers for sensitive writes.

---

## 6. Unified Content Engine

The wiki should become the core content engine for the whole app.

Do not build separate engines for wiki, blog, alerts, resources, onboarding pages, and future forum topics. Build one content system with different delivery modes.

### 6.1 Content item model

```txt
contentItems/{contentId}
  type
    wiki
    blog
    alert
    onboarding_page
    resource
    form
    forum_topic_later

  title
  slug
  summary
  bodyEditorJs
  plainTextSearch
  categoryId
  tagIds[]
  linkedContentIds[]
  backlinks[]
  media[]
  embeds[]
  codeBlocks[]

  visibility
    public
    candidate
    onboarding
    staff
    alumni
    admin_only
    safety_sensitive

  status
    draft
    in_review
    published
    archived
    needs_update

  deliveryMode
    normal_page
    wiki_page
    blog_feed
    dashboard_card
    hud_alert
    onboarding_step
    resource_download
    forum_thread_later

  ownerUid
  ownerRole
  createdByUid
  updatedByUid
  reviewedByUid
  publishedByUid
  createdAt
  updatedAt
  reviewedAt
  publishedAt
  archivedAt
  reviewDueAt
  emergencyPriority
  isPinned
```

### 6.2 Content revisions

```txt
contentItems/{contentId}/revisions/{revisionId}
  versionNumber
  status
    draft
    submitted
    approved
    rejected
    published
    superseded
  bodyEditorJs
  plainTextSearch
  changeSummary
  createdByUid
  reviewedByUid
  approvedByUid
  publishedByUid
  createdAt
  reviewedAt
  publishedAt
```

### 6.3 Delivery by type

| Type | Delivery |
| --- | --- |
| wiki | Searchable reference article. |
| blog | Admin-authored updates/news feed. |
| alert | HUD/banner/card alert using same content/revision structure. |
| onboarding_page | Instruction content attached to onboarding tasks. |
| resource | Link/file/download card. |
| form | Blank/fillable form listing with instructions and official submission guidance. |
| forum_topic_later | Reserved for future hidden internal community. |

### 6.4 Suggested content files

Add:

```txt
src/types/content.ts
src/types/tags.ts
src/types/categories.ts
src/lib/content/contentService.ts
src/lib/content/revisionService.ts
src/lib/content/editorText.ts
```

`editorText.ts` should extract plain text from Editor.js blocks for search, link detection, preview snippets, and offline indexes.

---

## 7. Wiki Completion Plan

The wiki is the product. Everything else supports it.

### 7.1 Replace mock data

Replace the hardcoded data in `src/app/wiki/page.tsx` with Firestore queries for:

```txt
published contentItems where type == wiki
categories
tags
recently updated articles
pinned articles
```

### 7.2 Build article routes

Add routes such as:

```txt
/wiki/[slug]
/wiki/category/[categorySlug]
/wiki/tag/[tagSlug]
/wiki/search
```

Each wiki article should show:

```txt
title
summary
category
tags
body
related pages
pages that link here
last updated
review due date
owner/responsible role
visibility badge for admins/editors
```

### 7.3 Complete the editor

Current `src/components/wiki/Editor.tsx` is a good start. Complete it with:

```txt
title field
slug field
summary field
category selector
tag selector
visibility selector
status controls
Editor.js body
photo upload
video embed
code block support
related-page selector
save draft
preview
submit for review
publish if permitted
archive if permitted
```

### 7.4 Keep Editor.js, but add guardrails

Allowed v1 blocks:

```txt
paragraph
header
list
quote
table
warning
image
video embed
code
inline code
delimiter
```

Editor guardrails:

- No arbitrary unsafe HTML.
- Sanitize embeds.
- Images and files go through approved upload endpoints.
- Draft autosave should not overwrite published content.
- Publishing creates a new published revision.

### 7.5 Draft/review/publish workflow

```txt
Create draft
Save draft / autosave
Preview
Submit for review
Approve or request revision
Publish
Keep older published revision available for rollback
Archive when obsolete
```

### 7.6 Review due dates

Important operational content should have review dates:

```txt
emergency procedures: review annually or before camp season
forms/resources: review before each season
training links: review before each season
songbook/culture: review as needed
```

Admin dashboard should show pages needing review.

---

## 8. Search, Tags, and Interlinking

The wiki needs to feel like an industry-standard knowledge base, not a pile of pages.

### 8.1 Search

Use a free/open-source local search approach for v1, such as MiniSearch or Fuse.js. MiniSearch is the preferred first try because it is built for local full-text indexes and can work well with an offline wiki cache.

Search should work online and offline against the cached published wiki index.

Search index fields:

```txt
contentId
type
title
slug
summary
plainTextSearch
categoryId
tagIds
visibility
updatedAt
emergencyPriority
```

Search UI should support:

```txt
full text search
title search
tag filters
category filters
audience/visibility filters for admins
recently updated
pinned/important pages
emergency/safety priority
```

Suggested files:

```txt
src/lib/search/buildSearchIndex.ts
src/lib/search/wikiSearch.ts
```

### 8.2 Tags

```txt
tags/{tagId}
  name
  slug
  description
  parentTagId
  color
  createdAt
  updatedAt
```

Recommended starting tags:

```txt
emergency
training
forms
policy
procedure
songbook
camp-culture
history
aquatics
kitchen
health-lodge
ranger
maintenance
program
staff-week
safeguarding-youth
hazardous-weather
fire
weather
```

### 8.3 Categories

Start with categories from the app philosophy:

```txt
training
policies-procedures
songbook
camp-culture-history
resources
forms-paperwork
emergency-procedures
program-areas
facilities-maintenance
kitchen-dining
health-lodge
```

### 8.4 Interlinking

Support wiki-style links:

```txt
[[Lost Scout Procedure]]
[[Dining Hall Protocol]]
[[Opening Campfire Script]]
```

V1 implementation can be simple:

- Detect `[[Page Title]]` patterns when saving.
- Resolve matching titles/slugs to `linkedContentIds`.
- Store unresolved links for admin cleanup.
- Generate backlinks from linked pages.

Later improvement:

- Add autocomplete inside the editor.

---

## 9. Admin Backend Plan

The admin backend must be powerful but boring. It should use obvious camp verbs, not developer jargon.

### 9.1 Admin routes

```txt
/admin
/admin/users
/admin/applications
/admin/onboarding
/admin/content
/admin/content/review
/admin/forms
/admin/tags
/admin/categories
/admin/alerts
/admin/audit-log
/admin/settings
```

### 9.2 Admin dashboard cards

```txt
Pending applications
Candidates awaiting review
Onboarding staff blocked
Tasks needing verification
Wiki drafts awaiting review
Published pages needing review
Forms/resources needing link checks
Recent role changes
Recent published content
Alert status
```

### 9.3 User management actions

```txt
invite user
edit profile
set portal mode
assign season role
approve candidate
move to onboarding
activate staff
mark as alumni
suspend account
restore account
grant admin preset
grant scoped permission
revoke permission
view audit history
```

### 9.4 Content admin actions

```txt
create article
edit draft
submit for review
request revision
publish
rollback
archive
pin
set visibility
set review due date
manage tags
manage categories
```

### 9.5 Admin UX standards

- Use plain language.
- Show next action clearly.
- Avoid hidden destructive actions.
- Confirm dangerous changes.
- Explain permission effects before saving.
- Provide status badges.
- Make mobile layouts usable.
- Keep touch targets large.
- Preserve high contrast and neurodivergent-friendly spacing.

---

## 10. Application and Onboarding Plan

The existing `/apply` page should become the first step in an employment-style onboarding pipeline.

### 10.1 Application flow

```txt
Guest opens application
Applicant submits form
System creates/links user profile
Applicant becomes candidate
Admin reviews application
Admin approves, rejects, waitlists, or requests info
Approved candidate becomes onboarding
Onboarding checklist is generated
Admin verifies checklist items
User becomes active staff
After season, user becomes alumni
```

### 10.2 Application model

```txt
applications/{applicationId}
  uid
  seasonId
  status
    draft
    submitted
    needs_info
    under_review
    approved
    rejected
    waitlisted
    withdrawn
  applicantName
  email
  phone
  dateOfBirth
  isMinor
  parentGuardianRequired
  roleType
  areaOfInterest
  scoutingExperience
  bsaId
  submittedAt
  reviewedByUid
  reviewedAt
  adminNotes
```

### 10.3 Onboarding model

```txt
onboardingTemplates/{templateId}
  name
  seasonId
  appliesTo
  taskIds[]

onboardingTasks/{taskId}
  title
  description
  instructionsContentId
  requiredFor
  officialUrl
  formId
  requiresAdminVerification
  dueOffsetDays
  sortOrder

userOnboarding/{uid_seasonId}
  uid
  seasonId
  templateId
  status
    not_started
    in_progress
    blocked
    complete
  percentComplete
  createdAt
  updatedAt

userOnboarding/{uid_seasonId}/taskStatus/{taskId}
  status
    not_started
    in_progress
    submitted
    verified
    needs_correction
    waived
  userNote
  adminNote
  verifiedByUid
  verifiedAt
  updatedAt
```

### 10.4 Required onboarding checklist seed

Required for all staff:

```txt
Staff Application
Letter of Agreement
Signed Code of Conduct
Annual Health and Medical Record Parts A, B, and C
Vehicle Permit Form / Transportation Authorization
Venture Application / Leader Application if not already registered
Background Check validation
Safeguarding Youth Training
Hazardous Weather Training
```

Required for paid staff:

```txt
I-9 Form
IRS W-4 Form
Arizona Form A-4
```

### 10.5 Form/resource library

The app may host blank/fillable PDF forms or link reliable official permalinks.

```txt
forms/{formId}
  title
  description
  appliesTo
  requiredFor
  officialSourceUrl
  hostedPdfUrl
  fillable
  submissionMethod
  instructionsContentId
  lastVerifiedAt
  lastVerifiedByUid
  notes
```

The app should make paperwork easy and intuitive:

- Explain what each form is.
- Show who needs it.
- Link to the best fillable version.
- Explain how to submit it securely.
- Let admins mark it submitted/verified/needs correction.

The app should not casually store completed medical forms, I-9s, W-4s, ID copies, or background check documents unless a secure official upload workflow is intentionally designed and approved later.

---

## 11. Alerts and Ticker

### 11.1 Ticker

Keep the ticker essentially as-is.

Purpose:

```txt
seasoning, not a product pillar
```

Rules:

- Scout-appropriate.
- Broad audience.
- Low distraction.
- Offline fallback.
- No personalization.
- No gamification.
- No complex AI aggregation for v1.

### 11.2 Alerts

Keep the current alert direction:

```txt
persistent weather
hybrid fire warning system
admin-made alerts
offline/stale state
```

Admin-made alerts should use the shared content engine:

```txt
contentItems.type = alert
contentItems.deliveryMode = hud_alert
```

Future alert improvements:

```txt
push notifications
wildfire source refinement
fire progression tracking
air quality relevance to camp
dispatch/emergency services research
```

These are later priorities after the wiki, user backend, and onboarding are functional.

---

## 12. Community Placeholder

The public should not know there is a community feature.

For now:

- Remove or hide public navigation to `/forum`.
- Keep any forum route behind permissions or mark it future-only.
- Do not build social profiles.
- Do not build DMs.
- Do not build public comments.
- Do not build likes, karma, leaderboards, or streaks.

Future community can reuse the content engine:

```txt
contentItems.type = forum_topic_later
comments/{commentId}
```

But this is intentionally the lowest priority.

---

## 13. Offline Plan

`webapprules.md` requires seamless online/offline behavior with the most recent complete wiki content and UI stored locally.

### Offline-safe content

```txt
published wiki pages
published onboarding instructions
form/resource metadata and blank form links
songbook
camp culture/history
training references
emergency procedures
local ticker items
```

### Online-required actions

```txt
login
admin writes
role changes
application submission
onboarding verification
wiki publishing
file uploads
forum/comment posting later
```

### Offline UX

Show:

```txt
You are offline
Last synced timestamp
Content may be stale
Search is using cached wiki
Admin actions unavailable until online
```

### Search offline

Generate and cache a local search index from published content the user is allowed to see.

---

## 14. Implementation Strategy

Build this in vertical slices, not as one giant abstract backend project.

The goal is to prove real loops early:

```txt
Admin logs in
Admin creates a wiki draft
Admin publishes it
Staff can read it
Unauthorized users cannot
Staff can search it
Admin can later manage onboarding around it
```

Do not spend weeks only modeling data without shipping a path that proves the app works.

### Build order

```txt
1. User/profile/permission foundation
2. Content/wiki data model
3. Real wiki read/edit/publish flow
4. Search, tags, and interlinking
5. Admin backend
6. Application/onboarding/forms
7. Offline polish
8. Forum/community placeholder only
```

This keeps the wiki and permissions as the spine, then expands outward.

---

## 15. Implementation Phases

### Phase 1: User foundation and rules

Deliverables:

```txt
users collection
seasonMemberships collection
roleGrants collection
permission presets
audit log model
server-only admin helpers
AuthContext profile/permission upgrade
route guards
rewritten Firestore rules
basic /admin shell
```

Acceptance criteria:

- A logged-in user has a profile.
- Admin appears as a first-class portal mode.
- Suspended users are blocked.
- Admin can grant/revoke permissions through controlled UI/server action.
- Firestore rules no longer treat any signed-in user as staff.

### Phase 2: Content/wiki foundation

Deliverables:

```txt
contentItems collection
revisions subcollection
categories collection
tags collection
wiki index from Firestore
article route
editor save draft
preview/publish/archive workflow
```

Acceptance criteria:

- Mock wiki data is gone.
- Published pages render from Firestore.
- Drafts do not overwrite published pages.
- Editors can draft.
- Publishers can publish.
- Revision history exists.

### Phase 3: Real wiki read/edit/publish flow

Deliverables:

```txt
/wiki/[slug]
/wiki/edit/[contentId]
Save Draft action
Submit for Review action
Publish action
Archive action
Rollback action
permission-aware edit/publish buttons
```

Acceptance criteria:

- Admin/editor can create a draft.
- Draft can be previewed.
- Publisher can publish.
- Staff can read the published page.
- Candidate/guest users cannot read staff-only content.
- Older revisions remain available.

### Phase 4: Search, tags, and interlinking

Deliverables:

```txt
plain text extraction from Editor.js
local/offline search index
tag management
category management
[[wiki link]] detection
backlinks
related pages
```

Acceptance criteria:

- Users can search wiki content.
- Users can filter by tag/category.
- Pages can link to other pages.
- Backlinks are visible.
- Search works offline against cached content.

### Phase 5: Admin backend

Deliverables:

```txt
/admin dashboard
/admin/users
/admin/content
/admin/content/review
/admin/tags
/admin/categories
/admin/forms
/admin/audit-log
```

Acceptance criteria:

- Nontechnical admins can manage users and content without Firestore console.
- Review queues are visible.
- Dangerous actions require confirmation.
- Audit history is readable.

### Phase 6: Applications and onboarding

Deliverables:

```txt
persist /apply form
candidate dashboard
application review queue
onboarding templates
onboarding tasks
user onboarding checklist
forms/resource library
admin verification flow
```

Acceptance criteria:

- Applicants can submit applications.
- Admins can approve/reject/request info.
- Approved users become onboarding users.
- Onboarding users see clear next steps.
- Admins can verify required tasks.
- Completed onboarding can promote user to staff.

### Phase 7: Offline polish

Deliverables:

```txt
cache published wiki content
cache permitted search index
cache resource/form metadata
show offline/stale state
keep ticker fallback local
prevent offline admin writes
```

Acceptance criteria:

- Staff can read the complete cached wiki offline.
- Search still works offline.
- The UI clearly shows stale/offline state.
- Admin writes wait until online or are disabled.

### Phase 8: Future community placeholder only

Deliverables:

```txt
hide forum from public navigation
reserve content type and comments model
basic moderation permission placeholder
```

Acceptance criteria:

- Public users do not know community exists.
- Staff social features do not distract from wiki/user/onboarding development.

---

## 16. First Concrete Coding Sprint

Start here:

```txt
1. Add shared TypeScript models for users, permissions, content, tags, categories.
2. Add Firebase Admin helper.
3. Add first-login profile creation.
4. Upgrade AuthContext to load profile and permissions.
5. Add route guard helpers.
6. Add /admin shell visible only to admin portal mode.
7. Add contentItems and revisions Firestore helpers.
8. Wire /wiki/edit Save Draft to Firestore.
9. Add /wiki/[slug] published article rendering.
10. Add basic publish action for canPublishWiki users.
```

This first sprint proves the core app loop:

```txt
Admin logs in
Admin writes wiki draft
Admin publishes it
Staff user can read it
Non-authorized user cannot
```

Do not start with onboarding, forms, or forum UX until this loop works.

---

## 17. Second Coding Sprint

After the first loop works, widen the wiki into an actual knowledge base.

```txt
1. Replace /wiki mock index with Firestore published content.
2. Add category and tag collections.
3. Add category/tag admin screens.
4. Add tag/category selectors to the editor.
5. Add plain-text extraction from Editor.js blocks.
6. Add MiniSearch or Fuse.js search proof of concept.
7. Add /wiki/search route.
8. Add [[Internal Link]] detection on save/publish.
9. Add backlinks and related pages display.
10. Add review due date metadata.
```

Acceptance criteria:

```txt
A user can browse, search, filter, and follow internal links through real wiki content.
```

---

## 18. Third Coding Sprint

Then build the admin workbench around the working content and user model.

```txt
1. Expand /admin dashboard cards.
2. Add /admin/users list and detail view.
3. Add permission preset assignment UI.
4. Add suspend/restore user actions.
5. Add /admin/content review queue.
6. Add publish/request revision/archive actions.
7. Add audit log viewer.
8. Add admin UX copy explaining dangerous actions.
```

Acceptance criteria:

```txt
A nontechnical admin can manage users and wiki content without opening Firebase console.
```

---

## 19. Fourth Coding Sprint

Only then make onboarding real.

```txt
1. Persist the /apply form.
2. Create application status dashboard for candidates.
3. Add /admin/applications review queue.
4. Add approve/reject/request info actions.
5. Create onboarding template/task models.
6. Generate user onboarding checklist after approval.
7. Add forms/resource library.
8. Add official URL/hosted PDF fields.
9. Add task verification workflow.
10. Add promote-to-staff action.
```

Acceptance criteria:

```txt
An applicant can apply, be approved, complete onboarding tasks, and become active staff.
```

---

## 20. Definition of Done for the Core System

The wiki and user system are not truly done until:

```txt
Users have portal modes and account statuses.
Admin exists as a first-class user mode.
Permissions are granular and admin-managed.
Firestore rules enforce protected access.
Wiki pages are stored in Firestore, not mock arrays.
Editor.js can save drafts and publish revisions.
Published content has revision history and rollback.
Search works across published allowed content.
Tags and categories are admin-manageable.
Internal wiki links and backlinks work.
Admins can manage applications and onboarding.
Forms/resources are easy to find and verify.
Offline mode preserves complete published wiki access.
Public users cannot see hidden community features.
The system remains usable by nontechnical admins.
```

If this is achieved, `blackllama-wiki` becomes what it is supposed to be: a robust, attractive, Scouting-aware, offline-capable Camp Lawton staff wiki and onboarding system.
