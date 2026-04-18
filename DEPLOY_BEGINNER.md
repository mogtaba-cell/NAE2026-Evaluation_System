# Beginner deployment guide

## 1. Unzip the project
Unzip the folder somewhere easy, such as Desktop or Documents.

## 2. Create a Supabase project
1. Go to Supabase and create a new project.
2. Wait until the project is ready.
3. Open **SQL Editor**.
4. Run `supabase/schema.sql`.
5. Run `supabase/seed_admin.sql`.
6. Open **Project Settings -> API Keys**.
7. Copy your:
   - Project URL
   - service_role key

## 3. Create `.env.local`
Copy `.env.example` to `.env.local` and fill in:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`
- `APP_BASE_URL=http://localhost:3000`

## 4. Run locally
Open the project in VS Code and run:
```bash
npm install
npm run dev
```
Then open `http://localhost:3000`.

## 5. Log in
Use:
- Username: `Admin`
- Password: `NAE2026`

## 6. Test import
Go to **Import & Export**.
Download the template and confirm it includes:
- `Coordinator Username`
- `School eSIS`
- `Student eSIS`
Then import your file.
The app will report:
- imported count
- reuploaded count

## 7. Push to GitHub
Create a private GitHub repository and run:
```bash
git init
git add .
git commit -m "Initial NAE platform"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 8. Deploy on Vercel
1. Open Vercel.
2. Click **Add New -> Project**.
3. Import your GitHub repository.
4. Add the environment variables from `.env.local` in Vercel.
5. Deploy.

## 9. Update `APP_BASE_URL`
After Vercel gives you the live URL, update `APP_BASE_URL` in Vercel to that real URL and redeploy.

## 10. Use the live app
- Admin sees everything.
- Coordinators can see all submissions and final selected, but only evaluate submissions assigned to them.
- Evaluators are separate records and do not log in.
