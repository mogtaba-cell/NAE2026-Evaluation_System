# NAE 2026 Evaluation System (v2)

The scoring, review and artwork-logistics platform for National Art Expressions 2026, run by Global Vision Training.
Built with Next.js 15 (App Router) and Supabase (Postgres), and hosted on Vercel. Submission files come from the GVC Google Shared Drive.

## Who uses it

| Role | What they do |
| --- | --- |
| Admin | Sets up the program (pathways, rubrics, rounds), imports entries, manages people, allocates schools, opens and closes rounds, corrects scores, runs reports |
| Coordinator | Follows up with their schools and runs physical scoring sessions, entering each evaluator's scores |
| Evaluator | Scores entries in their queue. Sees the files and the entry's title, description and reflections in English, Arabic or both |
| Management | Decides flagged reviews (confirm, override with a reason, or delegate) |
| Storage team | Collections, check-in, shelves, pull lists, exceptions |
| Leadership | Overview, final results, reports |

## How an entry moves

1. **Import.** Admin uploads the submissions export. Rows are sorted by submission date and get short codes such as `VA-PD-0042`. Re-importing only updates details; scores and history are never touched.
2. **Allocate.** Each school goes to one coordinator.
3. **Round 1 opens.** Each entry is assigned to two evaluators who have logins. Assignment is balanced by workload.
4. **Scoring.** Evaluators score each criterion from 0 to 100. The total is the weighted sum, rounded up. The team result is the average of the evaluators' totals, rounded up.
5. **Automatic move-on.** When the scores are in, the entry goes through, does not go through, or goes to management review. It is flagged for review when it is within 3 points of the pass mark or the evaluators are more than 15 points apart.
6. **Management review.** A review is due within 48 hours. The manager confirms the result, or overrides it with a reason.
7. **Round 2.** Online subpathways are assigned to evaluators again. Subpathways marked Physical in Program setup follow this path instead:
   - The storage team collects them, checks them in and shelves them.
   - The coordinator creates a session, and the storage team gets a pull list sorted by shelf.
   - Scores are entered in the room.

Every change is written to the audit log.

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

1. **Database.** In Supabase, run `supabase/v2_schema.sql` and then `supabase/v2_seed.sql` (the Arts track: Visual, Digital, Literary and Performing Arts). `supabase/v2_arts_only.sql` removed the old Expressions track from the first install.
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

1. Promote the tested deployment in Vercel, or push to `main`.
2. The old tables (`users`, `evaluators`, `schools`, `students`, `submissions`, `submission_students`, `evaluation_records`) are no longer used. Drop them once you are happy:
   ```sql
   drop table if exists evaluation_records, submission_students, students, submissions, evaluators, schools, users cascade;
   ```
3. Remove the unused `APP_PASSWORD` and `SESSION_COOKIE_NAME` variables. In Vercel, mark `SUPABASE_SERVICE_ROLE_KEY` and `APP_SESSION_SECRET` as **Sensitive**.
