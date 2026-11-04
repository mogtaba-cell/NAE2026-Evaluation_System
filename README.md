# NAE 2026 Evaluation System

A web platform for running the judging round of **National Art Expressions (NAE) 2026**, a national student art program. It replaces spreadsheet-based scoring with a single system where coordinators import submissions, evaluators score artwork against a rubric, and management reviews and finalises results.

## Features

- **Role-based access:** separate logins for admins, coordinators and evaluators
- **Submission import:** bulk import of students and schools from Excel, matched by eSIS IDs
- **Rubric scoring:** multiple evaluators score each artwork; results are weighted, averaged and rounded
- **Management overrides:** re-evaluation and score adjustments with the final say kept in one place
- **Dashboard:** charts and analytics across schools, categories and evaluators, with export
- **Final selection:** shortlist of selected artworks with images, exportable to PDF and Excel

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) and React
- [Supabase](https://supabase.com/) (PostgreSQL) for data storage
- JWT sessions (jose) with scrypt password hashing
- Recharts for charts; SheetJS, jsPDF and html2canvas for import and export
- Deployed on Vercel

## Getting started

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in your Supabase URL, service role key and a session secret.
4. Seed an admin account with `supabase/seed_admin.sql`, then change its password after first login.
5. Start the dev server:
   ```bash
   npm run dev
   ```

See [DEPLOY_BEGINNER.md](DEPLOY_BEGINNER.md) for a step-by-step deployment guide.

## Project structure

```
app/            Pages and API routes (auth, evaluations, evaluators, submissions, users)
components/     Shared UI (app shell, navigation)
lib/            Auth, database client, rubric and score calculations
supabase/       Schema, migrations and admin seed
```

## License

[MIT](LICENSE)
