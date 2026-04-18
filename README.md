# NAE Online Platform Complete

This package is a deployable Next.js + Supabase starter for the National Art Expressions platform.

## Included
- Admin and coordinator login
- Separate evaluator management
- Multi-evaluator weighted scoring with averaged rounded-up results
- Management revaluation overrides
- Student-level import with Student eSIS
- School-level import with School eSIS
- Students page
- Schools page
- Dashboard with charts and analytics export
- Final selected with images
- Import/export workflow

## Default admin login
- Username: `Admin`
- Password: `NAE2026`

## Important files
- `supabase/schema.sql` for a fresh setup
- `supabase/migration_latest.sql` if you need to update an older copy
- `supabase/seed_admin.sql` to seed the default admin
- `.env.example` to copy into `.env.local`
- `DEPLOY_BEGINNER.md` for step-by-step deployment
