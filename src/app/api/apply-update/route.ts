// ============================================================
// POST /api/apply-update - download the latest release + swap it in +
// exit the Node process. The Windows launcher wraps Node in a Job
// Object; when Node exits gracefully, the launcher restarts it. The
// user only sees a ~2s black flash instead of having to close-and-reopen
// the app themselves.
//
// Flow
// ----
// 1. Read update-channel.txt to know where releases live.
// 2. Download <channel>/app.zip to a temp file.
// 3. Delete the current .next folder + version.txt.
// 4. Extract the zip in place (contains .next, package.json,
//    next.config.ts, .env.local, update-channel.txt, version.txt).
// 5. Reply 200 + schedule process.exit(0) after 500 ms so the response
//    reaches the client before Node dies.
// 6. Launcher detects Node exit, restarts it, user sees fresh version.
//
// Safety
// ------
// - Only runs when the launcher exposes an update-channel.txt (never on
//   Vercel - where there's no such file).
// - Failures during download / extract short-circuit and DON'T touch
//   the installed files, so the app keeps working on the old version.
// ============================================================

import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { isApiCallAuthorized, unauthorizedResponse } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!isApiCallAuthorized(request)) return unauthorizedResponse();
    const cwd = process.cwd();

    // 1. Load the update channel URL from the local file
    let channel: string;
    try {
        const raw = await readFile(path.join(cwd, 'update-channel.txt'), 'utf8');
        channel = raw.trim();
        if (!channel) throw new Error('empty channel');
    } catch {
        return NextResponse.json({
            ok: false,
            error: 'update-channel.txt introuvable - mise à jour manuelle requise sur cette installation (Vercel n\'a pas ce fichier).',
        }, { status: 400 });
    }

    // 2. Fetch the target version FIRST so we can stamp version.txt after
    //    the swap. Without this the app extracts new .next files but the
    //    version.txt on disk stays at the OLD number, and UpdateNotifier
    //    keeps re-showing the "Mettre à jour" banner on every reload.
    const base = channel.replace(/\/+$/, '');
    let remoteVersion = '';
    try {
        const vRes = await fetch(base + '/version.txt?cb=' + Date.now(), { cache: 'no-store' });
        if (vRes.ok) remoteVersion = (await vRes.text()).trim();
    } catch { /* proceed without - better than blocking the update */ }

    // 3. Download app.zip to a temp file
    const zipUrl = base + '/app.zip?cb=' + Date.now();
    const tmpDir = path.join(cwd, '.update-tmp');
    const tmpZip = path.join(tmpDir, 'app.zip');
    try {
        await mkdir(tmpDir, { recursive: true });
        const res = await fetch(zipUrl, { cache: 'no-store' });
        if (!res.ok || !res.body) {
            return NextResponse.json({ ok: false, error: `Téléchargement échoué (HTTP ${res.status})` }, { status: 500 });
        }
        // Stream the response body directly to disk to avoid buffering
        // multi-MB payloads in memory.
        const arrayBuf = await res.arrayBuffer();
        await writeFile(tmpZip, Buffer.from(arrayBuf));
    } catch (err) {
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }, { status: 500 });
    }

    // 4. Extract the zip in place using the built-in `tar` binary.
    //    Windows 10+ ships tar.exe which handles zip via `-x -f`. Both
    //    zip and tar-gz are supported by the launcher publisher script.
    try {
        // Wipe old build artefacts so removed files don't linger.
        // Wrap each removal in try/catch - the delete can fail if a file
        // handle is still open (Windows locks) but we can proceed.
        try { await rm(path.join(cwd, '.next'), { recursive: true, force: true }); } catch { /* ignore */ }

        await new Promise<void>((resolve, reject) => {
            const proc = spawn('tar', ['-xf', tmpZip, '-C', cwd], { windowsHide: true });
            proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
            proc.on('error', reject);
        });
    } catch (err) {
        return NextResponse.json({ ok: false, error: 'Extraction échouée : ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
    }

    // 5. Stamp version.txt with the target version so that after the app
    //    restarts, /api/version returns the NEW value and UpdateNotifier
    //    stops showing the banner.
    if (remoteVersion) {
        try { await writeFile(path.join(cwd, 'version.txt'), remoteVersion, 'utf8'); } catch { /* non-fatal */ }
    }

    // 6. Clean up temp files (best-effort)
    try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

    // 7. Auto-relaunch - the KEY constraint: the Windows launcher wraps
    //    Node in a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
    //    Any child we spawn from Node inherits that Job → when we kill
    //    the launcher, the Job closes and Windows kills our restart
    //    script too, BEFORE it can re-launch the .exe.
    //
    //    Solution: register a Windows Scheduled Task that runs in 6 s.
    //    Scheduled tasks are executed by the Task Scheduler service,
    //    OUTSIDE our Job Object → surviving the launcher's death.
    //    We register the task, exit Node, the launcher stays up for a
    //    few more seconds, then the task fires, kills the launcher,
    //    starts a fresh one, and deletes itself.
    try {
        const pid = process.pid;
        const parentPid = process.ppid;
        const helperPath = path.join(cwd, 'smartmaint-restart.ps1');
        const fallbackLauncherName = 'SmartMaint - L.C PROD.exe';
        const fallbackLauncherPath = path.join(cwd, fallbackLauncherName);
        const psEsc = (s: string) => s.replace(/'/g, "''");
        const logPath = path.join(cwd, 'smartmaint-restart.log');
        const taskName = `smlc-restart-${Date.now()}`;

        const ps =
            '$ErrorActionPreference = "Continue"\r\n' +
            `$pid_ = ${pid}\r\n` +
            `$parentPid = ${parentPid}\r\n` +
            `$fallbackLauncher = '${psEsc(fallbackLauncherPath)}'\r\n` +
            `$installDir = '${psEsc(cwd)}'\r\n` +
            `$logPath = '${psEsc(logPath)}'\r\n` +
            `$taskName = '${psEsc(taskName)}'\r\n` +
            // Coordinate WMI + schtasks paths - only ONE gets to restart.
            '$lockPath = Join-Path $installDir ".restart-lock"\r\n' +
            'try {\r\n' +
            '    if (Test-Path $lockPath) {\r\n' +
            '        $lockAge = (Get-Date) - (Get-Item $lockPath).LastWriteTime\r\n' +
            '        if ($lockAge.TotalSeconds -lt 90) {\r\n' +
            '            try { Start-Transcript -Path $logPath -Append -Force } catch {}\r\n' +
            '            Write-Host "== restart already in progress (age $($lockAge.TotalSeconds) s) - exiting =="\r\n' +
            '            try { Stop-Transcript } catch {}\r\n' +
            '            try { schtasks /Delete /TN $taskName /F | Out-Null } catch {}\r\n' +
            '            exit 0\r\n' +
            '        }\r\n' +
            '    }\r\n' +
            '    New-Item -Path $lockPath -ItemType File -Force | Out-Null\r\n' +
            '} catch {}\r\n' +
            'try { Start-Transcript -Path $logPath -Append -Force } catch {}\r\n' +
            'Write-Host "== restart task fired at $(Get-Date) =="\r\n' +
            'Write-Host "node PID: $pid_ | parent PID: $parentPid | task: $taskName"\r\n' +
            // Walk the process tree UP from parent to find the launcher.
            'function Find-Launcher($startPid) {\r\n' +
            '    $current = $startPid\r\n' +
            '    for ($depth = 0; $depth -lt 10 -and $current -gt 0; $depth++) {\r\n' +
            '        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue\r\n' +
            '        if (-not $p) { break }\r\n' +
            '        Write-Host "  tree[$depth]: PID $current - $($p.Name) - $($p.ExecutablePath)"\r\n' +
            '        if ($p.ExecutablePath -like "*SmartMaint*" -and $p.ExecutablePath -notlike "*node.exe" -and $p.ExecutablePath -notlike "*powershell*") {\r\n' +
            '            return @{ Path = $p.ExecutablePath; Pid = $current }\r\n' +
            '        }\r\n' +
            '        $current = $p.ParentProcessId\r\n' +
            '    }\r\n' +
            '    return $null\r\n' +
            '}\r\n' +
            // Kill Node (if still alive), then walk from its ex-parent to
            // find and kill the launcher.
            'Write-Host "killing node PID $pid_"\r\n' +
            'Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue\r\n' +
            'Start-Sleep -Milliseconds 500\r\n' +
            'Write-Host "walking process tree from parent PID $parentPid"\r\n' +
            '$launcher = Find-Launcher $parentPid\r\n' +
            '$launcherPath = $null\r\n' +
            'if ($launcher) {\r\n' +
            '    $launcherPath = $launcher.Path\r\n' +
            '    Write-Host "found launcher: $launcherPath (PID $($launcher.Pid))"\r\n' +
            '    Stop-Process -Id $launcher.Pid -Force -ErrorAction SilentlyContinue\r\n' +
            '    Write-Host "launcher killed"\r\n' +
            '} else {\r\n' +
            '    Write-Host "process-tree walk found no launcher - falling back to $fallbackLauncher"\r\n' +
            '    $launcherPath = $fallbackLauncher\r\n' +
            '}\r\n' +
            // ALWAYS run the broad-sweep fallback too — the tree walk sometimes
            // misses the launcher on Win 10/11 (elevated processes hide their
            // ExecutablePath from a non-elevated PS session). Killing by
            // ProcessName + Path catches launcher instances the tree walk
            // missed, which was the "old window stays open" bug: PS thought
            // it killed the launcher via the tree walk but the actual .exe
            // process kept running, so the user saw TWO windows after the
            // new launcher started.
            'Write-Host "broad-sweep: killing any remaining SmartMaint processes"\r\n' +
            '$myPid = $PID\r\n' +
            'Get-Process | Where-Object { $_.Id -ne $myPid -and ($_.ProcessName -like "*SmartMaint*" -or ($_.Path -and $_.Path -like "*SmartMaint*" -and $_.Path -notlike "*node.exe" -and $_.Path -notlike "*powershell*")) } | ForEach-Object {\r\n' +
            '    Write-Host ("  killing PID $($_.Id) - $($_.ProcessName) - $($_.Path)")\r\n' +
            '    try { $_ | Stop-Process -Force -ErrorAction Stop } catch { Write-Host "    Stop-Process failed: $_" }\r\n' +
            '}\r\n' +
            // Second pass after a short wait — some launchers spawn quickly
            // after being killed if they had a "self-restart on crash"
            // watchdog. Belt and braces.
            'Start-Sleep -Milliseconds 800\r\n' +
            'Get-Process | Where-Object { $_.Id -ne $myPid -and ($_.ProcessName -like "*SmartMaint*" -or ($_.Path -and $_.Path -like "*SmartMaint*" -and $_.Path -notlike "*node.exe" -and $_.Path -notlike "*powershell*")) } | ForEach-Object {\r\n' +
            '    Write-Host ("  2nd-pass killing PID $($_.Id) - $($_.ProcessName)")\r\n' +
            '    try { $_ | Stop-Process -Force -ErrorAction Stop } catch { }\r\n' +
            '}\r\n' +
            // Wait for the port to clear and the mutex to release.
            'Start-Sleep -Seconds 4\r\n' +
            // Start the launcher fresh.
            'if ($launcherPath -and (Test-Path $launcherPath)) {\r\n' +
            '    Write-Host "starting launcher: $launcherPath"\r\n' +
            '    Start-Process -FilePath $launcherPath -WorkingDirectory $installDir\r\n' +
            '    Write-Host "launcher started"\r\n' +
            '} else {\r\n' +
            '    Write-Host "LAUNCHER NOT FOUND at $launcherPath - listing install dir .exe files:"\r\n' +
            '    Get-ChildItem -Path $installDir -Filter "*.exe" | ForEach-Object { Write-Host ("  " + $_.FullName) }\r\n' +
            '}\r\n' +
            'Write-Host "== restart task done =="\r\n' +
            'try { Stop-Transcript } catch {}\r\n' +
            // Self-clean the scheduled task, the lock file, and the script.
            'try { schtasks /Delete /TN $taskName /F | Out-Null } catch {}\r\n' +
            'Start-Sleep -Seconds 2\r\n' +
            'Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue\r\n' +
            'Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue\r\n';
        // Write with UTF-8 BOM — PowerShell 5.1 (Windows built-in) reads
        // .ps1 files as Windows-1252 by default, which mangles any
        // multi-byte characters and breaks string parsing. A BOM makes
        // it read as UTF-8. Ascii-only content stays ascii either way.
        await writeFile(helperPath, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(ps, 'utf8')]));

        // ── Escape the Job Object via WMI Win32_Process.Create ──
        //
        // Prior attempt used Task Scheduler with `/SC ONCE /ST HH:MM:SS`.
        // Windows silently refuses to fire ONCE tasks whose ST is in the
        // past - even by a fraction of a second. So the tasks sat in
        // "Ready" state forever and the update flow never restarted the
        // launcher. Log the outcome to a bootstrap file so we ALWAYS
        // have telemetry after clicking Mettre à jour.
        // Previously we spawned a bootstrap PowerShell here that in turn
        // called Invoke-CimMethod. Empirically Node's spawn produced a
        // child that never started executing (never wrote its first log
        // line) — but the same bootstrap script ran fine when launched
        // manually. Root cause was elusive (Job Object inheritance, stdio
        // handling, environment, or all three); fix is to skip that whole
        // hop and call the WMI service directly via wmic.exe.
        //
        // wmic asks the WMI service to spawn `restartCmdLine` — the child
        // ends up under WmiPrvSE.exe, outside our Node process's Job.

        const bootstrapLog = path.join(cwd, 'smartmaint-restart-bootstrap.log');
        const attempt = `== apply-update: spawning restart via wmic at ${new Date().toISOString()}\r\n   helper=${helperPath}\r\n`;
        try { await writeFile(bootstrapLog, Buffer.from(attempt, 'utf8'), { flag: 'a' }); } catch { /* ignore */ }

        const restartCmdLine = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${helperPath}"`;

        // Wait for wmic to return so we know whether WMI accepted the request.
        // wmic is fast (usually <1 s) and its stdout/stderr tell us the outcome.
        await new Promise<void>((resolve) => {
            let stdout = '';
            let stderr = '';
            const w = spawn('wmic.exe', [
                'process', 'call', 'create', restartCmdLine,
            ], { windowsHide: true });
            w.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
            w.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
            const finalize = (code: number | null, err?: Error) => {
                const line = err
                    ? `wmic ERROR: ${err.message}\r\n`
                    : `wmic exit=${code}\r\n   stdout: ${stdout.replace(/\r?\n/g, ' | ').trim()}\r\n   stderr: ${stderr.replace(/\r?\n/g, ' | ').trim()}\r\n`;
                writeFile(bootstrapLog, Buffer.from(line, 'utf8'), { flag: 'a' }).catch(() => {});
                resolve();
            };
            w.on('exit', (code) => finalize(code));
            w.on('error', (err) => finalize(null, err));
        });

        // Best-effort: clean up any stuck Task Scheduler entries from a
        // previous version of this route. Non-fatal if it fails.
        spawn('powershell.exe', [
            '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
            `Get-ScheduledTask -TaskName 'smlc-restart-*' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue`,
        ], { windowsHide: true, stdio: 'ignore', detached: true }).unref();

        // Guard against `taskName` becoming unused after removing schtasks path.
        void taskName;
    } catch { /* fall back to manual restart - client shows a friendly toast */ }

    // 6. Schedule graceful exit AFTER the response goes out.
    setTimeout(() => {
        process.exit(0);
    }, 800);

    return NextResponse.json({ ok: true, message: 'Redémarrage en cours…' });
}
