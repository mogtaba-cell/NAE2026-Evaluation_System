# NAE 2026 Evaluation System (v2)

The scoring, review and artwork-logistics platform for National Art Expressions 2026, run by Global Vision Training.
Built with Next.js 15 (App Router) and Supabase (Postgres), and hosted on Vercel. Submission files come from the GVC Google Shared Drive.

## Who uses it

| Role | What they do |
| --- | --- |
| Admin | Sets up the program (pathways, rubrics, rounds), imports entries, manages people, allocates schools, opens and closes rounds, corrects scores, runs reports |
| Coordinator | Follows up with their schools and runs scoring sessions for evaluators without a login (online entries from their files in any round, physical artworks in the room), entering each evaluator's scores |
| Evaluator | Scores entries in their queue. Sees the files and the entry's title, description and reflections in English, Arabic or both |
| Management | Decides flagged reviews (confirm, override with a reason, or delegate) |
| Storage team | Collections, check-in, shelves, pull lists, exceptions |
| Leadership | Overview, final results, reports |

## How an entry moves

1. **Import.** Admin uploads the submissions export. Rows are sorted by submission date and get short codes such as `VA-PD-0042`. Re-importing only updates details; scores and history are never touched.
2. **Allocate.** Each school goes to one coordinator. Coordinators see their own entries, plus an **All entries** view (files and details only) for reference.
3. **Open a round.** The readiness checks must be green: "Must fix" items block opening, "Check" items can be overridden by an admin with a reason. Each round has its own **evaluator panel** (chosen per round, or everyone with a login in the pathway). Round 2 avoids giving an entry to its Round 1 evaluators where possible.
4. **Scoring.** Evaluators score each criterion from 0 to 100 (criteria can be shown in English, Arabic or both). The total is the weighted sum, rounded up. Grades come from the rubric's grade lines (default A 80, B 50), which admins set per rubric. Every score on an entry uses the same rubric version: the one of the first score saved for it.
5. **Automatic move-on.** When the scores are in, the team result (average of totals, rounded up) decides: through, not through, or management review. Each round can switch on or off: close to the pass mark or the grade A line (3 points by default; Round 2 uses the A line), evaluators more than 15 apart, and disagreement on national identity.
6. **Management review.** Due within the round's review time. The manager confirms, or overrides the outcome (goes through or not, optionally with an adjusted result) with a reason. If the scores change after a decision, the entry comes back for review.
7. **Round 2.** Online subpathways are assigned to evaluators again. Subpathways switched to Physical in Program setup are collected, checked in and stored (room and shelf chosen per batch), and scored in sessions. Several sessions can run at once; coordinators pick the schools. An evaluator can be marked absent for one artwork (at least 2 scores, and half the team, are needed). The team ticks **Needs framing** and **Protective glass** per artwork for the showcase.
8. **Closing a round** is possible once every entry is scored, reassigned or marked "not scored". Closing locks the results: they are final. An admin can unlock one result or the whole round with a reason.
9. **Final results.** The shortlist is every Round 2 entry with grade A that passed Round 2.

**Evaluators without a login** are scored through coordinator sessions in any round: the coordinator picks schools, the team, and types each evaluator's scores. Entries already given to evaluators with a login stay in those evaluators' queues. A round's panel smaller than the evaluators each entry needs gets no assignments, so its entries wait for sessions instead.

**View as.** An admin can pick any active account (grouped by role) from **View as…** in the top bar and see the platform exactly as that person does. It is read only, shown with a banner, recorded in the audit log, and ends with **Back to my account** (or after 4 hours).

Every change is written to the audit log. Management opening an entry is recorded as "viewed by management"; anyone else can tick it on the entry page, and the entries list can filter on it.

## Submission files and previews

- The sync computer copies ADEK SharePoint into the Shared Drive `01 Submissions (SharePoint copy)` (`nae-sync.ps1`).
- `nae-previews.ps1` makes small previews in `02 Previews` under the same path, named `<original name>.preview.<ext>`. Originals are never changed.
  - Videos become 720p H.264 MP4s.
  - HEIC photos become JPGs.
  - Word and PowerPoint files become PDFs.
- The site finds an entry's folder from its ArtLink the first time someone opens the entry.
  - It caches the file list for 10 minutes, so new uploads appear without a full index.
  - **Submission files → Run index now** matches every folder at once and lists folders it can't match. Admins can link those folders or ignore them.
- **Viewing**
  - Images first load a fast Drive-generated preview (this also works for HEIC). **Full size** loads the original.
  - Videos and audio stream in 4 MB pieces (Vercel's response limit is 4.5 MB), so playback starts at once. Speed control and full screen are available.
  - If a video's picture is in a format browsers can't show (for example an old MPEG-4 Part 2 MP4), the viewer says so; `nae-previews.ps1` checks small MP4s with ffprobe and converts those.
  - PDFs and converted previews open inline.
  - **Source ↗** opens the original. **Download** saves it, in pieces. Everyone who can open an entry can download its files; downloads are written to the audit log.
  - While an evaluator scores one entry, the next entry's files are looked up in the background.

## Setup

1. **Database.** In Supabase, run `supabase/v2_schema.sql`, then `supabase/v2_seed.sql` (the Arts track: Visual, Digital, Literary and Performing Arts), then `supabase/v3_upgrade.sql` (round panels and flags, storage locations, framing, absences, score history, "viewed by management"). `supabase/v2_arts_only.sql` removed the old Expressions track from the first install.
   - Both are safe to re-run.
   - Every table is prefixed `nae_` and is locked to the server (service role) only.
2. **Environment variables.** Set these in Vercel; see `.env.example`.
   - `APP_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - `DRIVE_MOCK=1` shows generated test files and is for testing only.
3. **Google Drive.**
   - Create a Google Cloud service account with the Drive API enabled.
   - Add its email as **Viewer** on the Shared Drive "NAE Evaluation System".
   - Paste its JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON`, mark it Sensitive, and remove `DRIVE_MOCK`.
4. **First sign-in.**
   - Open the site. With no accounts yet, it asks you to create the first admin.
   - After that, create everyone else in **People and logins**.

## Local development

```
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

## Going live (after testing the preview)

0. If the demo data is still in the database, run `supabase/demo_reset.sql` first (it removes the demo accounts, scores, sessions, collections, demo rubrics and the audit log, and keeps the setup and imported entries).
1. Promote the tested deployment in Vercel, or push to `main`.
2. The old tables (`users`, `evaluators`, `schools`, `students`, `submissions`, `submission_students`, `evaluation_records`) are no longer used. Drop them once you are happy:
   ```sql
   drop table if exists evaluation_records, submission_students, students, submissions, evaluators, schools, users cascade;
   ```
3. Remove the unused `APP_PASSWORD` and `SESSION_COOKIE_NAME` variables. In Vercel, mark `SUPABASE_SERVICE_ROLE_KEY` and `APP_SESSION_SECRET` as **Sensitive**.
