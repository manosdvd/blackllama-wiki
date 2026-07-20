# Camp Lawton Handbook Import Plan

This branch starts the Camp Lawton staff-handbook import for the wiki.

## Source package

The generated source package contains 79 cleaned wiki pages derived from `staffHandbookCL.md`.

Use the final export files for any future import:

- `camp_lawton_staff_handbook_wiki_pages_final.json`
- `camp_lawton_staff_handbook_wiki_cleaned_final.md`
- `camp_lawton_wiki_pages_frontmatter.zip`
- `camp_lawton_staff_handbook_export_changelog.md`

The final flat-file Markdown export uses standard YAML frontmatter at the top of each individual page file. Migration-only drafting metadata has been pruned from the final JSON and page frontmatter.

## Current repo fit

The repo has a strong conceptual wiki plan, but the live app is not ready for a true Firestore import yet.

Existing strengths:

- Next.js app structure is present.
- Firebase client/admin dependencies are present.
- Editor.js dependencies and a basic editor component exist.
- `/wiki` and `/wiki/edit` scaffolds exist.
- The implementation plan already defines `contentItems`, revisions, visibility, status, categories, tags, and publish/review workflow.

Current blockers:

- `/wiki` still uses mock static arrays.
- `/wiki/edit` logs Editor.js output but does not save to Firestore.
- No published article route is wired yet.
- No import/seed script exists for `contentItems` or revisions.
- Visibility and status values in the generated handbook need mapping to the repo's planned values.

## Recommended import mapping

| Generated field | Planned repo field |
| --- | --- |
| `id` | `contentId` and/or `slug` |
| `title` | `title` |
| `section` | `categoryId` after category slug normalization |
| `visibility` | `visibility` |
| `status` | `status` after review-state mapping |
| `show_on_home` | `isPinned` or dashboard delivery flag |
| `tags` | `tagIds` after tag normalization |
| `summary` | `summary` |
| `content_markdown` | convert to `bodyEditorJs` or store as markdown during seed phase |

## Flat-file Markdown frontmatter

Each individual Markdown file should start with frontmatter like this:

```yaml
---
id: welcome-to-camp-lawton-staff
title: Welcome to Camp Lawton Staff
section: Camp Culture and History
visibility: staff
status: draft-needs-review
show_on_home: true
tags:
  - orientation
  - home
summary: ""
---
```

Do not include one-off migration notes in live frontmatter. Keep drafting provenance in changelogs, import logs, or revision summaries instead.

## Status mapping

| Generated status | Suggested repo status |
| --- | --- |
| `approved` | `published` |
| `draft-needs-review` | `in_review` |
| `draft-needs-seasonal-review` | `needs_update` |
| `needs-council-review` | `in_review` with `ownerRole = Council` or `safety_admin` |
| `needs-seasonal-review` | `needs_update` |
| `needs-seasonal-update` | `needs_update` |

## Visibility mapping

| Generated visibility | Suggested repo visibility |
| --- | --- |
| `public` | `public` |
| `candidate` | `candidate` |
| `staff` | `staff` |
| `adult-staff` | `staff` plus role/tag guard until a richer scope model exists |
| `area-director` | `admin_only` or scoped permission until area-director visibility exists |
| `admin` | `admin_only` |

## Best next implementation step

Do **not** hand-enter these pages.

Add a real import script that reads `camp_lawton_staff_handbook_wiki_pages_final.json`, normalizes sections/tags/visibility/status, and writes:

```txt
contentItems/{contentId}
contentItems/{contentId}/revisions/{revisionId}
categories/{categoryId}
tags/{tagId}
```

Until the content engine is wired, the JSON should be treated as authoritative seed content rather than manually pasted page copy. If the project pivots to a flat-file CMS, use `camp_lawton_wiki_pages_frontmatter.zip` as the import source instead of the Firestore JSON seed.