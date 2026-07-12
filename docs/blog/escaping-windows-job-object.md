# Escaping a Windows Job Object from Node.js

**How I lost a week to `KILL_ON_JOB_CLOSE`, and how `wmic.exe` saved the release.**

> This post grew out of a real bug that blocked auto-update on **SmartMaint — L.C PROD**, an industrial GMAO/CMMS I ship as a Windows installer. If you're launching Node from a native wrapper on Windows and trying to survive the parent's death, this is for you.
>
> Repo: [github.com/MUAZE12/smartmaint-lcprod](https://github.com/MUAZE12/smartmaint-lcprod)

---

## TL;DR

- The app ships as a **native Windows launcher** that wraps `node.exe` inside a **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. When the launcher exits, every child of Node dies too — that's the whole point.
- Auto-update needs the *opposite*: spawn a helper script, then let the launcher die, then let the helper restart everything.
- Every child I spawned with `child_process.spawn` inherited the Job Object membership. `spawn PowerShell` from Node → PowerShell died the moment Node exited.
- **The fix: don't spawn the helper from Node. Ask the WMI service to spawn it via `wmic.exe process call create`.** The child ends up under `WmiPrvSE.exe`, outside our Job Object, immune to our death.
- Along the way I discovered PowerShell 5.1 will silently mangle any `.ps1` file that doesn't ship a UTF-8 BOM. That cost me two days on top.

---

## Why the launcher wraps Node in a Job Object

The app runs Next.js on `localhost:<port>` inside a native Windows launcher. When the user closes the window, we want Node to die immediately — otherwise, a zombie Node keeps holding the port and future launches fail.

The clean Win32 way to do this is a **Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`**:

```
Launcher.exe
 └── (Job Object handle, KILL_ON_JOB_CLOSE = 1)
      └── node.exe (added to the Job)
           └── any child of Node
```

The rule: when the *last* handle to the Job closes, Windows kills every process in the Job. Simple, robust, no orphan processes. Every native launcher wrapper I've seen does this.

**The catch**: every child that Node spawns via `CreateProcess` inherits Job membership by default. That's normally what you want. But for auto-update, it means the restart script dies at the exact moment I need it to keep running.

---

## The auto-update flow (what I wanted)

```
1. User clicks "Update"
2. POST /api/apply-update
3. Server downloads app.zip, extracts .next/, writes version.txt
4. Server spawns a PowerShell "restart helper"
5. Server calls process.exit(0) after 800 ms
6. Node dies → launcher dies (KILL_ON_JOB_CLOSE) → Job closes
7. Restart helper (outside the Job) waits 4 s, then starts a fresh launcher
```

Steps 4 and 7 are the whole game. If the helper dies with the Job, we've extracted new files but never relaunched.

---

## What failed: `child_process.spawn('powershell', ...)`

My first attempt was the obvious one:

```ts
import { spawn } from 'child_process';

const child = spawn('powershell.exe', [
    '-NoProfile', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass',
    '-File', helperPath,
], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
});
child.unref();
```

Every switch is right. `detached` starts a new session, `unref` breaks the reference, `stdio: 'ignore'` prevents Node from holding pipes. On any *sane* OS, this would work.

On Windows with our Job Object: **the child never runs**. `child.pid` returned a valid PID. But `smartmaint-restart.log` — a file the helper writes on first line — was never created. As if PowerShell was spawned, then killed before its process entry point.

Actually, that's *exactly* what was happening.

`CreateProcess` (which Node uses under the hood) sets `CREATE_BREAKAWAY_FROM_JOB` only if you explicitly ask, **and** if the Job Object has `JOB_OBJECT_LIMIT_BREAKAWAY_OK` set. Ours didn't (why would it — we set `KILL_ON_JOB_CLOSE` for a reason). So PowerShell was silently added to our Job at spawn. Then 800 ms later, we called `process.exit(0)`, the launcher exited, the Job closed, and PowerShell died before its interpreter had finished bootstrapping.

I confirmed this with Process Explorer: right after `apply-update` fired, I could see `powershell.exe` under `node.exe`, both in the Job. When Node exited, they went in the same tick.

### Things that *don't* fix it

I burned a lot of time trying:

- `detached: true` → doesn't set `BREAKAWAY_FROM_JOB` (that flag is a Job Object property, not a spawn one).
- `spawn('cmd.exe', ['/c', 'start', '/B', 'powershell', ...])` → `cmd.exe start` inherits the Job.
- `spawn` with `windowsHide: false` → same story.
- Registering a Windows Scheduled Task with `schtasks /Create /SC ONCE /ST <time+5s>` → this was clever but Windows *silently refuses* to fire a `/SC ONCE` task whose `/ST` is in the past, and by "in the past" they include "one millisecond ago". My tasks sat in "Ready" state forever. Even `/SC MINUTE /MO 1` had a 30–60 s startup lag I didn't want.

---

## The fix: escape via WMI

The realization was: **I don't need Node to spawn the helper. I just need *something outside my Job* to spawn it.**

WMI has an RPC method to do exactly this: `Win32_Process.Create`. It runs inside `WmiPrvSE.exe`, which is a system service — completely outside any Job Object I control.

There are two ways to call it:

1. `Invoke-CimMethod -ClassName Win32_Process -MethodName Create` — but that requires PowerShell, which brings us back to the same problem.
2. **`wmic.exe process call create "<command>"`** — a legacy command-line tool that speaks directly to the WMI service.

The second one is the escape hatch. Here's the working code:

```ts
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import path from 'path';

// 1. Write the helper .ps1 to disk (with UTF-8 BOM — see below).
const helperPath = path.join(cwd, 'smartmaint-restart.ps1');
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
await writeFile(helperPath, Buffer.concat([bom, Buffer.from(ps, 'utf8')]));

// 2. Ask WMI to spawn PowerShell for us.
const cmdLine = `powershell.exe -NoProfile -WindowStyle Hidden ` +
    `-ExecutionPolicy Bypass -File "${helperPath}"`;

await new Promise<void>((resolve) => {
    let stderr = '';
    const w = spawn('wmic.exe', ['process', 'call', 'create', cmdLine], {
        windowsHide: true,
    });
    w.stderr?.on('data', d => stderr += d.toString());
    // wmic itself returns in <1 s. We wait for it so we know WMI accepted.
    w.on('exit', () => resolve());
    w.on('error', () => resolve());
});

// 3. Schedule Node's own exit.
setTimeout(() => process.exit(0), 800);
```

`wmic.exe` is *itself* still inside our Job Object. But `wmic` isn't the thing that needs to survive — it's the process it *asks WMI to create*. That process (`powershell.exe`) ends up under `WmiPrvSE.exe`, outside our Job, and lives on happily after Node exits.

I verified this the same way: Process Explorer, watch the tree during `apply-update`.

- `node.exe` (in Job)
- └── `wmic.exe` (in Job)
- `WmiPrvSE.exe` (system, not in our Job)
- └── `powershell.exe` (**inherits from WmiPrvSE, NOT in our Job**)

The moment Node exits, `wmic.exe` dies with it (fine, it already returned). The launcher dies. The Job closes. But PowerShell keeps running — because it was never in the Job to begin with.

Result: auto-update works. The helper waits 4 seconds, kills the old launcher (with a two-pass broad sweep — see the code for why), and starts a fresh one. The user sees a ~2 s black flash and then the new version.

---

## The second week: PowerShell 5.1 doesn't read UTF-8

Once I had the WMI escape working, I hit a *different* bug. The helper was starting — but crashing halfway through. `smartmaint-restart.log` had garbled text like:

```
== restart task fired at 07�22�12 �(fen<D_HOME>
```

I stared at this for a full afternoon before I realized: **PowerShell 5.1 (the one Windows ships built-in) reads `.ps1` files as Windows-1252 by default, not UTF-8.**

My PowerShell source, generated by Node, contained:

- Em-dashes (`—`) in `Write-Host` messages
- Non-ASCII quotes from a copy-paste
- French accents in comments

Every one of these characters became a two-byte UTF-8 sequence in the file. Windows-1252 tried to read them as two single-byte characters, and the *second* byte happened to be `'` in a bunch of places — which closes an in-progress single-quoted PowerShell string. From that point on, the parser was in a completely different lexical state than I expected. It sometimes even ran, but with corrupted variable values.

**The fix**, applied at write time:

```ts
// Prefix with UTF-8 BOM so PowerShell 5.1 reads it as UTF-8.
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
await writeFile(helperPath, Buffer.concat([bom, Buffer.from(ps, 'utf8')]));
```

**Plus**, as belt and braces, I replaced every em-dash in the generated PowerShell source with a regular hyphen. Cheap insurance.

If you're generating `.ps1` files from Node on Windows, this is your only sane default.

---

## Post-mortem: what I learned

1. **Job Objects on Windows are a great feature that has zero visibility from Node.** There's no API to detect "I'm in a Job Object", and `spawn` gives no hint that its children are inheriting Job membership. You find out via Process Explorer or via mysterious crashes.
2. **`wmic.exe` is deprecated but still ships in Windows 11.** Microsoft says they're removing it "in a future release". If you rely on this, plan a fallback. `Register-ScheduledTask` via a longer-running PS bootstrapper is one option; a native launcher-side "restart-on-parent-death" watchdog is another.
3. **PowerShell 5.1's default encoding is the single most annoying thing about Windows scripting.** BOM + no em-dashes should be a lint rule.
4. **Scheduled Tasks with `/SC ONCE /ST <past-time>` silently fail.** Windows should error, not sit in "Ready" state forever.
5. **When your first four "obvious" solutions all fail the same way, you're wrong about the model.** In my case, I was wrong about *what a Job Object actually does to `spawn` children*. Once I re-read Microsoft's docs on `CREATE_BREAKAWAY_FROM_JOB`, everything clicked.

The whole saga is in the git log under `src/app/api/apply-update/route.ts`. If you want to see the failed attempts, `git log --follow` will show a lot of comments like `// This DOES NOT work` above code that I couldn't bring myself to delete.

---

**About me**: I'm a full-stack engineer building industrial software. SmartMaint — L.C PROD is my full-year project — a GMAO/CMMS with real-time sync across 27 tables, offline French voice dictation, and a Windows installer with auto-update. Find me on [LinkedIn](https://linkedin.com/in/baroudi-mustapha) or [GitHub](https://github.com/MUAZE12).

---

*Thanks for reading. If you've hit this same problem and found a different fix, I'd love to hear it — drop me a message.*
