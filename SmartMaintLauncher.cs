using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

/// <summary>
/// SmartMaint - L.C PROD — Desktop Launcher (windowless .exe)
///
/// On every click: checks the update channel (a folder path OR an https URL
/// in update-channel.txt). If a newer version exists it stops the running
/// server, applies the update, and restarts — so updates land even while the
/// app is in use. If nothing changed and the server is up, it just opens the
/// app window. Self-contained: runs on the bundled Node, no prerequisites.
///
/// BUILD (from the project root):
///   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe ^
///     /out:"SmartMaint - L.C PROD.exe" /win32icon:public\logo.ico ^
///     /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ^
///     /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ^
///     SmartMaintLauncher.cs
/// </summary>
class SmartMaintLauncher
{
    const int Port = 3000;
    static Form splash;
    static Label splashStatus;
    // Process-lifetime job: any process assigned to it dies when this
    // handle closes — i.e. when the launcher exits for ANY reason
    // (clean close, crash, Task Manager kill). That's how we make sure
    // node.exe never lingers after the user closes the app window.
    static IntPtr jobHandle = IntPtr.Zero;
    static Mutex supervisorMutex;

    [STAThread]
    static void Main()
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        string appDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        string url = "http://localhost:" + Port;

        // ── Single-instance gate. If a supervisor is already running
        // for this app, don't spawn a second one — just open another
        // window onto the same server and exit. The existing supervisor
        // still owns the node process lifetime. ──
        bool createdNew;
        try
        {
            supervisorMutex = new Mutex(true, "Global\\SmartMaint_LCPROD_Supervisor", out createdNew);
        }
        catch { createdNew = true; }
        if (!createdNew)
        {
            try { OpenApp(url); } catch { }
            return;
        }

        // ── Self-update bootstrap. If a previous auto-update dropped a
        // newer launcher next to us as "SmartMaint - L.C PROD.exe.new",
        // swap it in BEFORE doing anything else. Pattern: write a tiny
        // batch that waits 2 s (so this process exits and releases its
        // own file lock), then renames .new → .exe and relaunches. We
        // exit immediately so the rename can succeed. ──
        try
        {
            string selfPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string newExe = selfPath + ".new";
            if (File.Exists(newExe))
            {
                string bat = Path.Combine(Path.GetTempPath(), "smlc-self-update.bat");
                string content =
                    "@echo off\r\n"
                    + "ping 127.0.0.1 -n 3 >nul\r\n"
                    + "move /Y \"" + newExe + "\" \"" + selfPath + "\" >nul\r\n"
                    + "start \"\" \"" + selfPath + "\"\r\n"
                    + "del \"%~f0\"\r\n";
                File.WriteAllText(bat, content);
                ProcessStartInfo pi = new ProcessStartInfo("cmd.exe", "/c \"" + bat + "\"");
                pi.CreateNoWindow = true;
                pi.WindowStyle = ProcessWindowStyle.Hidden;
                pi.UseShellExecute = false;
                Process.Start(pi);
                try { supervisorMutex.ReleaseMutex(); } catch { }
                return;
            }
        }
        catch { }

        try
        {
            // ── Hot path — server fully serving HTTP. Open the browser
            // immediately and check for updates in the background. The old
            // launcher was snappy because it skipped the remote-version
            // HTTPS call when nothing needed doing.
            //
            // PROBE ORDER MATTERS: the TCP-bind check is 400 ms max; the
            // HTTP probe times out at 2.5 s. Only pay the HTTP cost when
            // TCP succeeds. Otherwise a cold start would block 2.5 s before
            // showing the splash. ──
            bool tcpAlready = IsServerUp();
            if (tcpAlready && IsServerReady())
            {
                // Hot path: server is already up (probably from a previous
                // launcher run that died — Task Manager kill, crash, etc.).
                // Take ownership of the existing node process so this
                // supervisor's death cleans it up.
                EnsureJob();
                TryAssignListenerToJob();
                Process edge = OpenApp(url);
                TryAssignToJob(edge);
                // Check for updates after the window is up so the next click
                // can apply them. Doesn't delay this launch.
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try
                    {
                        string ch = ResolveChannel(appDir);
                        string rv = GetRemoteVersion(ch);
                        string lv = ReadLocalVersion(appDir);
                        if (rv.Length > 0 && rv != lv)
                        {
                            try { File.WriteAllText(Path.Combine(appDir, ".update-pending"), rv); } catch { }
                        }
                    }
                    catch { }
                });
                WaitForBrowserExit(edge);
                return;
            }

            // ── Warming path — TCP is bound but HTTP isn't ready yet
            // (Next.js is mid-boot). DO NOT restart the server. Just wait
            // for the existing one. This is the "user clicked again while
            // it was still loading" case — before the fix, each click was
            // killing the booting server and starting over. ──
            if (tcpAlready)
            {
                ShowSplash(appDir);
                SetStatus("Initialisation du serveur en cours…");
                bool warmed = false;
                for (int i = 0; i < 100; i++)   // up to ~50 s
                {
                    if (IsServerReady()) { warmed = true; break; }
                    Thread.Sleep(500);
                }
                CloseSplash();
                if (warmed) { OpenApp(url); return; }
                // Still not responding after 50 s — fall through to a true
                // cold restart. Something is wedged.
            }

            // ── Cold path — nothing on the port, do the full update + start
            // dance. The network call is only paid here, when we'd be
            // waiting on a cold start anyway. ──
            string channel = ResolveChannel(appDir);
            string remoteVer = GetRemoteVersion(channel);
            string localVer = ReadLocalVersion(appDir);
            string pendingPath = Path.Combine(appDir, ".update-pending");
            bool updateAvailable = remoteVer.Length > 0 && remoteVer != localVer;
            // Honor a pending update flag from a previous launch.
            if (!updateAvailable && File.Exists(pendingPath))
            {
                try { remoteVer = File.ReadAllText(pendingPath).Trim(); } catch { }
                updateAvailable = remoteVer.Length > 0 && remoteVer != localVer;
            }

            ShowSplash(appDir);

            // Stop the running server so its files can be replaced / restarted.
            // Use the cheap TCP check here — if anything is bound to the port,
            // we want to kill it before applying the update (even if it's a
            // still-booting Next.js that hasn't started serving yet).
            if (IsServerUp())
            {
                SetStatus("Arret du serveur pour mise a jour…");
                StopServer();
            }

            if (updateAvailable)
            {
                SetStatus("Mise a jour de l'application…");
                ApplyUpdate(appDir, channel, remoteVer);
                // Update applied — clear the pending flag if present.
                try { if (File.Exists(pendingPath)) File.Delete(pendingPath); } catch { }
            }

            // First-run safety net.
            if (!Directory.Exists(Path.Combine(appDir, "node_modules")))
            {
                SetStatus("Installation des composants…");
                RunHiddenAndWait(appDir, "/c npm install");
            }
            if (NeedsBuild(appDir))
            {
                SetStatus("Compilation de l'application…");
                int code = RunHiddenAndWait(appDir, "/c npm run build");
                if (code != 0)
                {
                    CloseSplash();
                    MessageBox.Show("La compilation a echoue — corrigez le code, puis relancez.",
                        "SmartMaint - L.C PROD", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
            }

            SetStatus("Demarrage du serveur…");
            EnsureJob();
            Process serverProc = StartServer(appDir);
            TryAssignToJob(serverProc);

            // Two-phase wait:
            //  1. Wait for the TCP port to be bound (server process is alive)
            //  2. Then wait for actual HTTP readiness (Next.js can serve)
            // Without phase 2 the browser opens too early and the user sees
            // "localhost refused to connect" on a still-booting server.
            bool tcpUp = false;
            for (int i = 0; i < 120; i++)   // up to ~60 s for TCP bind
            {
                if (IsServerUp()) { tcpUp = true; break; }
                Thread.Sleep(500);
            }
            if (tcpUp) SetStatus("Initialisation du serveur…");
            bool ready = false;
            for (int i = 0; i < 80; i++)    // up to ~40 s after TCP is bound
            {
                if (IsServerReady()) { ready = true; break; }
                Thread.Sleep(500);
            }

            CloseSplash();
            if (ready)
            {
                // If StartServer went through cmd.exe (fallback path),
                // the actual node child may have only just bound the port.
                // Re-assign the listener PID to the job — covers both paths.
                TryAssignListenerToJob();
                Process edge = OpenApp(url);
                TryAssignToJob(edge);
                WaitForBrowserExit(edge);
            }
            else
            {
                MessageBox.Show("Le serveur met trop de temps a demarrer. Reessayez dans un instant.",
                    "SmartMaint - L.C PROD", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            CloseSplash();
            MessageBox.Show("Erreur au demarrage :\n\n" + ex.Message,
                "SmartMaint - L.C PROD", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ── Update channel — a folder path OR an https URL ────────
    static string ResolveChannel(string appDir)
    {
        try
        {
            string f = Path.Combine(appDir, "update-channel.txt");
            if (File.Exists(f))
                return Environment.ExpandEnvironmentVariables(File.ReadAllText(f).Trim());
        }
        catch { }
        return "";
    }

    static bool IsUrl(string channel)
    {
        return channel.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || channel.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Latest version published on the channel, or "" if unreachable.</summary>
    static string GetRemoteVersion(string channel)
    {
        try
        {
            if (channel.Length == 0) return "";
            if (IsUrl(channel))
            {
                using (WebClient wc = new WebClient())
                    return wc.DownloadString(channel.TrimEnd('/') + "/version.txt?cb=" + DateTime.UtcNow.Ticks).Trim();
            }
            string vf = Path.Combine(channel, "version.txt");
            return File.Exists(vf) ? File.ReadAllText(vf).Trim() : "";
        }
        catch { return ""; }
    }

    static string ReadLocalVersion(string appDir)
    {
        try
        {
            string f = Path.Combine(appDir, "version.txt");
            return File.Exists(f) ? File.ReadAllText(f).Trim() : "";
        }
        catch { return ""; }
    }

    /// <summary>Download (or copy) the channel's app.zip and extract it over the install folder.</summary>
    static void ApplyUpdate(string appDir, string channel, string remoteVer)
    {
        try
        {
            string zip = Path.Combine(appDir, ".update.zip");
            if (File.Exists(zip)) File.Delete(zip);

            if (IsUrl(channel))
            {
                using (WebClient wc = new WebClient())
                    wc.DownloadFile(channel.TrimEnd('/') + "/app.zip?cb=" + DateTime.UtcNow.Ticks, zip);
            }
            else
            {
                File.Copy(Path.Combine(channel, "app.zip"), zip, true);
            }

            string tmp = Path.Combine(appDir, ".update-tmp");
            if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
            ZipFile.ExtractToDirectory(zip, tmp);

            foreach (string dir in Directory.GetDirectories(tmp))
            {
                string dest = Path.Combine(appDir, Path.GetFileName(dir));
                if (Directory.Exists(dest)) Directory.Delete(dest, true);
                Directory.Move(dir, dest);
            }
            foreach (string file in Directory.GetFiles(tmp))
                File.Copy(file, Path.Combine(appDir, Path.GetFileName(file)), true);

            Directory.Delete(tmp, true);
            File.Delete(zip);
            File.WriteAllText(Path.Combine(appDir, "version.txt"), remoteVer);
        }
        catch (Exception ex)
        {
            // Best-effort — never block startup; log the reason.
            try { File.WriteAllText(Path.Combine(appDir, "update-error.log"),
                DateTime.Now.ToString() + Environment.NewLine + ex.ToString()); }
            catch { }
        }
    }

    /// <summary>Stop whatever is listening on the app port, then wait until it's free.</summary>
    static void StopServer()
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -Command \"Get-NetTCPConnection -LocalPort " + Port +
                " -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | " +
                "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process p = Process.Start(psi);
            p.WaitForExit(8000);
        }
        catch { }
        for (int i = 0; i < 24; i++)   // wait up to ~7 s for the port to free
        {
            if (!IsServerUp()) break;
            Thread.Sleep(300);
        }
    }

    // ── Rebuild detection ─────────────────────────────────────
    static bool NeedsBuild(string appDir)
    {
        // An installed copy ships no source code → fixed build, never self-rebuild.
        if (!Directory.Exists(Path.Combine(appDir, "src"))) return false;

        string buildId = Path.Combine(appDir, ".next", "BUILD_ID");
        if (!File.Exists(buildId)) return true;
        DateTime built = File.GetLastWriteTimeUtc(buildId);

        if (NewerThan(Path.Combine(appDir, "src"), built)) return true;

        string[] configs = { "package.json", "next.config.ts", "next.config.js",
                              "next.config.mjs", "tsconfig.json", "postcss.config.mjs" };
        foreach (string f in configs)
        {
            string p = Path.Combine(appDir, f);
            if (File.Exists(p) && File.GetLastWriteTimeUtc(p) > built) return true;
        }
        return false;
    }

    static bool NewerThan(string dir, DateTime t)
    {
        if (!Directory.Exists(dir)) return false;
        try
        {
            foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
                if (File.GetLastWriteTimeUtc(f) > t) return true;
        }
        catch { }
        return false;
    }

    // ── Server probe ──────────────────────────────────────────
    /// <summary>Cheap TCP-level check: is something listening on port?
    /// Used to decide whether a server is already running BEFORE we try
    /// to do anything heavy. Does NOT mean Next.js is ready to serve.</summary>
    static bool IsServerUp()
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult ar = c.BeginConnect("127.0.0.1", Port, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(400);
                if (ok && c.Connected) { c.EndConnect(ar); return true; }
                return false;
            }
        }
        catch { return false; }
    }

    /// <summary>Full HTTP readiness probe: actually hit the server and
    /// confirm we got an HTTP response (any status). Next.js often binds
    /// the TCP port a few seconds before it can serve a request — if we
    /// open the browser the moment TCP is up the user sees "refused" or
    /// a hang. This is the check that matters for opening the window.</summary>
    static bool IsServerReady()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Port + "/");
            req.Timeout = 2500;
            req.Method = "HEAD";
            req.AllowAutoRedirect = false;
            req.KeepAlive = false;
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            {
                int code = (int)res.StatusCode;
                // Any 2xx/3xx/4xx means the server is alive and serving.
                // 5xx is rare during startup; treat as still booting.
                return code < 500;
            }
        }
        catch (WebException ex)
        {
            // A 4xx (e.g. 404 from a route not found) is fine — Next.js
            // is responding. ConnectFailure / Timeout means still booting.
            HttpWebResponse httpRes = ex.Response as HttpWebResponse;
            if (httpRes != null)
            {
                int code = (int)httpRes.StatusCode;
                return code < 500;
            }
            return false;
        }
        catch { return false; }
    }

    /// <summary>Open the app in its own standalone window (Edge app mode).
    /// Uses a dedicated --user-data-dir so we get OUR OWN Edge process tree
    /// — that lets us call WaitForExit on the returned Process to detect
    /// when the user closes the window. Returns null if no browser could
    /// be launched (then the caller must keep the supervisor alive some
    /// other way).</summary>
    static Process OpenApp(string url)
    {
        string profileDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SmartMaint-LCPROD-Edge");
        try { if (!Directory.Exists(profileDir)) Directory.CreateDirectory(profileDir); } catch { }

        string[] edges = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
        };
        foreach (string e in edges)
        {
            if (File.Exists(e))
            {
                try
                {
                    string args = "--app=" + url
                        + " --window-size=1440,900"
                        + " --user-data-dir=\"" + profileDir + "\""
                        + " --no-first-run --no-default-browser-check";
                    Process p = Process.Start(new ProcessStartInfo(e, args) { UseShellExecute = false });
                    return p;
                }
                catch { }
            }
        }
        try { return Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { return null; }
    }

    // ── Hidden child processes ────────────────────────────────
    static ProcessStartInfo Hidden(string appDir, string args)
    {
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = "cmd.exe";
        psi.Arguments = args;
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        return psi;
    }

    static int RunHiddenAndWait(string appDir, string args)
    {
        Process p = Process.Start(Hidden(appDir, args));
        p.WaitForExit();
        return p.ExitCode;
    }

    /// <summary>Start the Next.js server hidden — uses the bundled Node runtime if present.
    /// Returns the spawned process so it can be assigned to the job object.
    /// When we go through cmd.exe (fallback path), the returned handle is cmd's;
    /// the job is inherited so that path still works for cleanup.</summary>
    static Process StartServer(string appDir)
    {
        string node = Path.Combine(appDir, "runtime", "node.exe");
        string nextBin = Path.Combine(appDir, "node_modules", "next", "dist", "bin", "next");
        ProcessStartInfo psi;
        if (File.Exists(node) && File.Exists(nextBin))
        {
            psi = new ProcessStartInfo();
            psi.FileName = node;
            psi.Arguments = "\"" + nextBin + "\" start";
            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
        }
        else
        {
            psi = Hidden(appDir, "/c npm run start");   // fallback: system Node + npm
        }
        return Process.Start(psi);
    }

    // ─── Job Object — kill-on-job-close lifetime container ──────────
    // Any process assigned here dies when the job handle closes. The
    // launcher holds that handle for its lifetime — so node.exe never
    // outlives the supervisor, even if the supervisor is Task-Manager-killed.
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll")]
    static extern bool SetInformationJobObject(IntPtr hJob, int infoClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);

    [DllImport("kernel32.dll")]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    const int JobObjectExtendedLimitInformation = 9;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS { public ulong R, W, O, RT, WT, OT; }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    static void EnsureJob()
    {
        if (jobHandle != IntPtr.Zero) return;
        try
        {
            jobHandle = CreateJobObject(IntPtr.Zero, null);
            if (jobHandle == IntPtr.Zero) return;
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation,
                ref info, Marshal.SizeOf(info));
        }
        catch { jobHandle = IntPtr.Zero; }
    }

    static void TryAssignToJob(Process p)
    {
        if (p == null) return;
        EnsureJob();
        if (jobHandle == IntPtr.Zero) return;
        try { AssignProcessToJobObject(jobHandle, p.Handle); } catch { }
    }

    /// <summary>Block the supervisor until the user closes the app window.
    /// With --user-data-dir Edge gives us a dedicated process tree, so a
    /// simple WaitForExit on the spawned process is enough. If that handle
    /// is null or exits within a second (fallback / system browser path),
    /// poll the URL — the supervisor exits when the page stops responding
    /// for 30 s straight, which is the user-closed-the-window signal.</summary>
    static void WaitForBrowserExit(Process browser)
    {
        if (browser != null)
        {
            try { browser.WaitForExit(); }
            catch { }
            if (browser.HasExited)
            {
                // If Edge exited well after launch, treat it as a real close.
                try
                {
                    if (browser.ExitTime > browser.StartTime.AddSeconds(2)) return;
                }
                catch { return; }
            }
        }
        // Polling fallback: window died without us tracking it. Stay alive
        // as long as the server keeps responding to traffic; when it stops
        // for 30 s straight, assume the user is gone.
        int idleStreakMs = 0;
        while (idleStreakMs < 30000)
        {
            Thread.Sleep(1000);
            if (IsServerReady()) { idleStreakMs = 0; continue; }
            idleStreakMs += 1000;
        }
    }

    /// <summary>Find the PID currently listening on the app port (typically node.exe)
    /// and assign it to the job — handles the hot-path case where node is already
    /// running from a previous launcher run that died before we started doing this.</summary>
    static void TryAssignListenerToJob()
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -Command \"Get-NetTCPConnection -LocalPort " + Port
                + " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess\"";
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process p = Process.Start(psi);
            string s = p.StandardOutput.ReadToEnd().Trim();
            p.WaitForExit(3000);
            int pid;
            if (int.TryParse(s, out pid))
            {
                try
                {
                    Process node = Process.GetProcessById(pid);
                    TryAssignToJob(node);
                }
                catch { }
            }
        }
        catch { }
    }

    // ── Splash window (own UI thread) ─────────────────────────
    static void ShowSplash(string appDir)
    {
        Thread t = new Thread(delegate()
        {
            Application.EnableVisualStyles();

            splash = new Form();
            splash.FormBorderStyle = FormBorderStyle.None;
            splash.StartPosition = FormStartPosition.CenterScreen;
            splash.Size = new Size(440, 252);
            splash.BackColor = Color.White;
            splash.TopMost = true;
            splash.ShowInTaskbar = false;

            Panel accent = new Panel();
            accent.Dock = DockStyle.Top;
            accent.Height = 6;
            accent.BackColor = Color.FromArgb(37, 99, 235);
            splash.Controls.Add(accent);

            string logo = Path.Combine(appDir, "public", "logo.png");
            if (File.Exists(logo))
            {
                PictureBox pb = new PictureBox();
                // Load via memory so the file stays unlocked (auto-update may replace it).
                try { pb.Image = Image.FromStream(new MemoryStream(File.ReadAllBytes(logo))); } catch { }
                pb.SizeMode = PictureBoxSizeMode.Zoom;
                pb.Size = new Size(92, 92);
                pb.Location = new Point((440 - 92) / 2, 34);
                splash.Controls.Add(pb);
            }

            Label title = new Label();
            title.Text = "SmartMaint - L.C PROD";
            title.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(30, 58, 138);
            title.TextAlign = ContentAlignment.MiddleCenter;
            title.Size = new Size(440, 28);
            title.Location = new Point(0, 140);
            splash.Controls.Add(title);

            Label sub = new Label();
            sub.Text = "GMAO Agroalimentaire";
            sub.Font = new Font("Segoe UI", 8.5f);
            sub.ForeColor = Color.Gray;
            sub.TextAlign = ContentAlignment.MiddleCenter;
            sub.Size = new Size(440, 18);
            sub.Location = new Point(0, 170);
            splash.Controls.Add(sub);

            splashStatus = new Label();
            splashStatus.Text = "Demarrage…";
            splashStatus.Font = new Font("Segoe UI", 9f, FontStyle.Italic);
            splashStatus.ForeColor = Color.FromArgb(37, 99, 235);
            splashStatus.TextAlign = ContentAlignment.MiddleCenter;
            splashStatus.Size = new Size(440, 20);
            splashStatus.Location = new Point(0, 200);
            splash.Controls.Add(splashStatus);

            Application.Run(splash);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.IsBackground = true;
        t.Start();
    }

    static void SetStatus(string text)
    {
        try
        {
            if (splashStatus != null && splashStatus.IsHandleCreated)
                splashStatus.Invoke((MethodInvoker)delegate { splashStatus.Text = text; });
        }
        catch { }
    }

    static void CloseSplash()
    {
        try
        {
            if (splash != null && splash.IsHandleCreated)
                splash.Invoke((MethodInvoker)delegate { splash.Close(); });
        }
        catch { }
    }
}
