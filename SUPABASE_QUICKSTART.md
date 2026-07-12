# Supabase Setup — Click-by-Click

Estimated time: **8–10 minutes**. Read every step. Don't skip.

You only need to do steps 1–6 yourself. Once you paste your URL and key into `.env.local`, the app works.

---

## Step 1 — Create your Supabase account (2 min)

1. Open **https://supabase.com** in your browser.
2. Top-right corner → click the green **Start your project** button.
3. You'll see "Sign in to Supabase". Click **Sign in with GitHub** if you have a GitHub account, OR click **Continue with email** and use `mustaphagamer111@gmail.com`.
4. If you used email: open Gmail, find the email from Supabase, click the verification link.
5. You'll land on a page that says **"Create your first organization"**. Type any name (e.g. `SmartMaint`), pick **Free plan**, click **Create organization**.

✅ You're in the Supabase dashboard.

---

## Step 2 — Create the project (2 min)

1. You should see a button labeled **"New Project"** (big green button, center of page).
2. Click it. A form appears:
   - **Name**: `smartmaint-tex`
   - **Database Password**: click the **Generate a password** link, then **copy and save** the password somewhere (you won't need it for the app, but keep it).
   - **Region**: pick **West EU (Paris)** — closest to Morocco
   - **Pricing Plan**: Free
3. Click **Create new project**.
4. Wait ~2 minutes. You'll see a "Setting up project..." progress screen. **Don't close the tab.**

✅ When it finishes, you'll land on the project's "Home" page.

---

## Step 3 — Get your URL and anon key (1 min)

1. In the left sidebar, click the **gear icon** at the very bottom (Project Settings).
2. In the settings sidebar, click **API**.
3. You'll see two sections:
   - **Project URL** → looks like `https://abcdefghijklmnop.supabase.co`
   - **Project API keys** → there's a row labeled **`anon` `public`** with a long string. Click the eye icon to reveal it, then click the copy icon.
4. **Open this file in VS Code:** `c:\Users\elitebook\OneDrive\Bureau\projet gmao\smartmaint-tex\.env.local`
5. Replace the two placeholder lines so it looks like this (your actual values):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...VERY_LONG_STRING...
   ```

6. Save the file.

✅ Now Next.js can talk to your Supabase project.

---

## Step 4 — Run the SQL to create all tables (2 min)

1. Back in the Supabase dashboard, look at the left sidebar. Find the icon that looks like a small database/play button — labeled **SQL Editor**. Click it.
2. Click the green **+ New query** button (top right).
3. **Open the file** `SUPABASE_SETUP.md` in this project, scroll to **Step 3** ("Run the schema SQL"), and find the big code block that starts with `-- SmartMaint-Tex — schema + RLS + realtime + seed`.
4. **Copy the entire SQL block** (from `-- SmartMaint-Tex` all the way down to the final `on conflict (id) do nothing;`).
5. Paste it into the SQL Editor.
6. Click the green **Run** button (bottom right of the editor, or press `Ctrl+Enter`).
7. You should see **"Success. No rows returned"** at the bottom.

✅ Your 8 tables exist and the demo data is seeded.

**Verify:** in the left sidebar click **Table Editor** (the icon that looks like a table grid). You should see `machines`, `technicians`, `interventions`, etc. Click `machines` — you should see the 5 seeded rows.

---

## Step 5 — Create your first user (1 min)

The app's AuthContext now defaults new users to **admin** role, so you don't need to set any metadata. Just create a user.

1. Left sidebar → click **Authentication** (the person icon).
2. Click **Users** tab (top of page if not already there).
3. Click **Add user** → **Create new user**.
4. Form:
   - **Email**: any email you want to use to log in — e.g. your gmail, or `admin@smartmaint.local`
   - **Password**: anything you'll remember (min 6 chars), e.g. `Test1234!`
   - ✅ **Auto Confirm User** — toggle this ON (so you don't have to verify the email).
5. Click **Create user**.

✅ Account ready. You'll log in with this email + password.

---

## Step 6 — Restart your dev server (30 sec)

In your terminal where `npm run dev` was running:
- Press `Ctrl+C` to stop it (if it's running)
- Then run:

```powershell
cd "c:\Users\elitebook\OneDrive\Bureau\projet gmao\smartmaint-tex"
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

Wait for `✓ Ready in ...ms`, then open **http://localhost:3000** in an **incognito window** (so no stale session interferes).

✅ You should see the new login screen (dark, glass panel, SVG gear logo).

Log in with the email + password from Step 5 → you land on `/dashboard`. Go to `/machines` → 5 seeded machines visible. Add a new one → it persists. Refresh → still there.

---

## If something doesn't work

| Symptom | Cause | Fix |
|---|---|---|
| Login screen still looks like old role cards (3 colored cards) | `.next` cache | `Remove-Item -Recurse -Force .next` then `npm run dev` |
| "Invalid API key" toast on login | URL or anon key has a typo or trailing space in `.env.local` | Re-copy from Supabase Settings → API |
| "Email or password is incorrect" but you typed it right | User wasn't created with "Auto Confirm" → email not verified | Authentication → Users → click your user → **Confirm email** |
| Machines page is empty | SQL block in Step 4 only partially ran | Re-run the full SQL block — it's idempotent (safe to run again) |
| Browser shows nothing / blank dark page | JavaScript hasn't loaded — check DevTools console (F12) | Look for red errors, copy them to me |

---

## Want me to do more after this?

Once you confirm steps 1–6 are done and login works, tell me. I'll:
- Migrate the other CRUD pages (technicians, interventions, spare-parts, personnel) the same way I migrated machines
- That's the "Phase 2" from my previous message
