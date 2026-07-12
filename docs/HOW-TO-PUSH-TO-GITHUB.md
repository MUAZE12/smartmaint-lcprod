# How to push this repo to GitHub yourself

Follow this in order. Total time: **~15 minutes** if it's your first time; **~5 minutes** if you've done it before.

---

## 0. Prerequisites (one-time setup)

Check what you already have. Open PowerShell in the project folder and run:

```powershell
git --version
gh --version
git config --global user.name
git config --global user.email
```

- If **`git` is missing**: install [Git for Windows](https://git-scm.com/download/win). Pick "Git from the command line and also from 3rd-party software" when asked.
- If **`gh` is missing**: install the [GitHub CLI](https://cli.github.com/) — this is optional but makes step 3 one command instead of five clicks.
- If **`user.name` / `user.email` is empty**, set them:

```powershell
git config --global user.name "Your Real Name"
git config --global user.email "you@example.com"   # the one on your GitHub account
```

---

## 1. Sanity check — what's about to be committed

Before pushing anything, verify the `.gitignore` is doing its job. Open PowerShell in the project folder (the one that contains `package.json`) and run:

```powershell
git init
git add .
git status --short | Measure-Object | Select-Object Count
```

You should see roughly **300–800 files staged**. If you see **more than 2000**, something huge slipped through the `.gitignore` — most likely `node_modules/`, `.next/`, `runtime/node.exe`, or the Whisper model. Stop, investigate, and fix `.gitignore` before continuing.

**To spot a big file that's about to be committed:**

```powershell
git ls-files -s | ForEach-Object {
    $parts = $_ -split "\s+", 4
    $hash = $parts[1]
    $path = $parts[3]
    $size = (git cat-file -s $hash) -as [int]
    [PSCustomObject]@{ SizeMB = [math]::Round($size / 1MB, 2); Path = $path }
} | Sort-Object SizeMB -Descending | Select-Object -First 20
```

**Nothing should be over 50 MB.** GitHub's per-file hard limit is 100 MB and it will reject the push. If you see a big file that shouldn't be there, add it to `.gitignore` then run:

```powershell
git rm --cached <bad-file>
git add .gitignore
```

---

## 2. Check for accidental secrets

Even better — run this to make sure no obvious secret slipped in:

```powershell
git grep -n -i -E "(anon|service_role|smartmaint_api|cron_secret|resend|sk_live|password\s*=)" -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' '*.md' '*.json' '*.yml' '*.env*' 2>$null
```

Any output? **Do not push yet.** Move the secret to `.env.local` (already gitignored) and reference it via `process.env.NAME` in code. Then re-check.

---

## 3. Make the first commit

```powershell
git branch -m main    # rename the default branch to "main" (optional but standard)
git commit -m "chore: initial commit — SmartMaint - L.C PROD v0.1"
```

If the commit succeeds, you're locally versioned. Now push it up.

---

## 4. Create the GitHub repo + push

### Option A — with the GitHub CLI (recommended, one command)

If you have `gh` installed and logged in (`gh auth status` says logged in):

```powershell
gh repo create smartmaint-lcprod --public --source=. --remote=origin --description "Full-featured GMAO/CMMS for a Moroccan edible-oil plant. Next.js 16, Supabase realtime, offline Whisper voice dictation, Arabic RTL, Windows installer with auto-update." --push
```

Done. The CLI creates the repo on GitHub, adds it as a remote, and pushes. Skip to step 5.

### Option B — via the GitHub website (5 clicks)

1. Go to **https://github.com/new** (must be logged in).
2. Repository name: **`smartmaint-lcprod`**
3. Description: **`Full-featured GMAO/CMMS for a Moroccan edible-oil plant. Next.js 16, Supabase realtime, offline Whisper voice dictation, Arabic RTL, Windows installer with auto-update.`**
4. Set to **Public** (private also works but nobody sees your CV project if it's private).
5. **DO NOT** check "Add a README", "Add .gitignore", or "Choose a license" — you already have those.
6. Click **Create repository**.

GitHub now shows you a page with a "…or push an existing repository" section. Copy the commands it shows (they include YOUR username), or use these — **replacing `YOUR_USERNAME`** with your real GitHub username:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/smartmaint-lcprod.git
git push -u origin main
```

If prompted for a password: **that's a Personal Access Token, not your GitHub password**. Generate one at https://github.com/settings/tokens/new — check the `repo` scope, expiry 90 days. Paste that token as the password. Windows will remember it for future pushes via Git Credential Manager.

---

## 5. Post-push polish (5 minutes total, big CV impact)

After the push, do these — they take 60 seconds each and dramatically improve the repo's first impression.

### 5.1 Add topics for discoverability

On the repo page, click the ⚙ next to "About" (top right). Under "Topics", add:

```
gmao cmms nextjs react typescript supabase realtime whisper industrial-software haccp windows-installer arabic rtl morocco
```

### 5.2 Fill in the "About" fields

Same panel:
- **Website**: your Vercel demo URL (once deployed).
- **Include in the home page**: check ✅ Releases, ✅ Packages (they'll show once you create them).

### 5.3 Replace the placeholders in files

Search-and-replace `YOUR_USERNAME` and `YOUR_LINKEDIN` across the repo before the first release:

```powershell
# Find every file mentioning the placeholders
git grep -l "YOUR_USERNAME\|YOUR_LINKEDIN\|YOUR_VIDEO_ID"
```

Files to update:
- `README.md` — badges, links, LinkedIn, video ID
- `LICENSE` — copyright line
- `docs/blog/escaping-windows-job-object.md` — links to your LinkedIn + repo
- `docs/video/demo-script.md` — links in the title card

Commit + push:

```powershell
git add .
git commit -m "docs: personalize placeholders (username, LinkedIn, video ID)"
git push
```

### 5.4 Add secrets to GitHub Actions (so CI can run E2E)

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

Add two secrets:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |

(These are safe to commit publicly — they're already in `.env.example`. But GitHub Actions needs them injected at runtime.)

### 5.5 Enable Actions

Repo → **Actions** tab → if you see "Workflows aren't being run…", click "I understand my workflows, go ahead and enable them." Your first CI run should start immediately.

### 5.6 Add a pinned repo card to your GitHub profile

Profile → "Customize your pins" → check **`smartmaint-lcprod`**. Now it's the first thing anyone sees on your profile.

---

## 6. Set up the live demo (Vercel)

1. Go to **https://vercel.com/new** → import `smartmaint-lcprod`.
2. Framework preset: **Next.js**.
3. Root directory: leave default (project root).
4. **Environment variables**: paste every entry from your `.env.local`. Vercel will encrypt them.
5. Deploy.
6. Once deployed, click the project → **Settings → Domains** → optionally attach `demo.smartmaint-lcprod.vercel.app` or a custom domain.

Copy the deploy URL back into `README.md` (the `## 🌐 Live demo` section) and push again.

---

## 7. Publish the blog post

You have three good options — pick one:

1. **dev.to** — free, developer audience, fast to publish. Paste the content of `docs/blog/escaping-windows-job-object.md` into a new post. Add tags: `windows`, `nodejs`, `powershell`, `webdev`, `devjournal`.
2. **Medium** — same idea, more general audience. Publish under your name, add to a publication if you have one.
3. **GitHub Pages** — turn `docs/blog/` into a Jekyll site. More work but you own everything.

Whichever you pick, once it's live, add the URL back into `README.md` (replace `docs/blog/escaping-windows-job-object.md` with the public URL).

---

## 8. Record + upload the video

Follow `docs/video/demo-script.md`. Recording time: ~30 min (allowing for retakes). Post-production: ~15 min. Total: **~1 hour**.

Upload to YouTube as **Unlisted**. Paste the video ID into `README.md` where it says `YOUR_VIDEO_ID`.

---

## 9. Post to LinkedIn

Copy the "LinkedIn post to accompany the video" section from `docs/video/demo-script.md`. Paste into a new LinkedIn post. Attach the YouTube video URL. Hit publish.

Done. Your project is now discoverable, testable, and pitch-ready.

---

## Troubleshooting

**"error: File X is 178.42 MB; this exceeds GitHub's file size limit of 100.00 MB"**
Something got past `.gitignore`. Add the file to `.gitignore`, then:
```powershell
git rm --cached path/to/big-file
git commit -am "chore: remove large file from tracking"
git push
```
If the big file is already in a *committed* commit, you need `git filter-repo` (or `git filter-branch`) to purge it from history — otherwise GitHub keeps rejecting the push. Simplest recovery: delete `.git/` and start over from step 1 with the fixed `.gitignore`.

**"remote: Support for password authentication was removed"**
Use a Personal Access Token as the password. See step 4 Option B.

**CI is red and it's not my code**
Most likely `npm ci` is failing because a Supabase secret isn't set. Check step 5.4 — Actions needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` as secrets.

**`npm run test` fails with "Cannot find module 'vitest'"**
Run `npm install` first. Vitest was added to `devDependencies` but hasn't been installed on your machine yet.

**Playwright fails locally with "browserType.launch: Executable doesn't exist"**
Run `npx playwright install chromium` once.
