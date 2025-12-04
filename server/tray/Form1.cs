using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Reflection;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Linq;

namespace tray;

// Leedz Tray application
// For a tray app we do not show the form at all,
// we use it as a container for NotifyIcon (the tray component)
//
//


public partial class Form1 : Form
{
    // Paths - exe deployed to server/tray/dist/tray.exe (dev) or dist-pkg/leedz-server-win-x64/ (prod)
    private string ExeDir => AppDomain.CurrentDomain.BaseDirectory;
    private string ServerDir => IsPackagedDeployment ? ExeDir : Path.GetFullPath(Path.Combine(ExeDir, "../../"));

    // Detect if running from packaged deployment (leedz-server.exe in same dir as TheLeedz.exe)
    private bool IsPackagedDeployment => File.Exists(Path.Combine(ExeDir, "leedz-server.exe"));

    public string CONFIG_FILE => Path.Combine(ServerDir, "server_config.json");
    public string SERVER_SCRIPT => Path.Combine(ServerDir, "src/leedz_server.js");
    public string SERVER_EXE => Path.Combine(ExeDir, "leedz-server.exe");
    public string ICON_PATH => Path.Combine(ExeDir, "img/icon.ico");

    private string? _logFilePath;


    private NotifyIcon? trayIcon;
    private Process? nodeProcess;
    private ToolStripMenuItem? headerMenuItem;
    private ToolStripMenuItem? exitMenuItem;
    private Font? headerFont;
    private SolidBrush? greenBrush;
    private SolidBrush? whiteBrush;
    private bool allowMenuClose = false;

    /// <summary>
    /// Constructor - initializes tray application.
    /// Loads server config, initializes Windows Form components, and sets up system tray icon.
    /// </summary>
    public Form1()
    {
        try
        {
            // Set form icon for taskbar
            if (File.Exists(Path.Combine(ExeDir, "../../img/icon.ico")))
            {
                this.Icon = new Icon(Path.Combine(ExeDir, "../../img/icon.ico"));
            }

            LoadConfig();

            InitializeComponent();

            SetupTrayIcon();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Startup error: {ex.Message}\n\n{ex.StackTrace}", "Tray Startup Failed");
            throw;
        }
    }

    /// <summary>
    /// Loads server configuration from server_config.json.
    /// Extracts log file path from logging.file property and resolves it relative to ServerDir.
    /// Throws FileNotFoundException if config file does not exist.
    /// </summary>
    private void LoadConfig()
    {
        if (!File.Exists(CONFIG_FILE))
        {
            throw new FileNotFoundException($"Config file not found: {CONFIG_FILE}");
        }

        string json = File.ReadAllText(CONFIG_FILE);
        using (var doc = JsonDocument.Parse(json))
        {
            var root = doc.RootElement;

            if (root.TryGetProperty("logging", out var logging))
            {
                if (logging.TryGetProperty("file", out var logFile))
                {
                    string logPath = logFile.GetString() ?? "";
                    _logFilePath = Path.Combine(ServerDir, logPath);
                }
            }
        }
    }

    /// <summary>
    /// Creates and configures the system tray icon with context menu.
    /// Menu items: Start Server, Configure, Stop Server, Exit.
    /// </summary>
private void SetupTrayIcon()
{
    DebugWrite("Creating Leedz Tray....");

    if (!File.Exists(ICON_PATH))
    {
        throw new FileNotFoundException($"Icon not found: {ICON_PATH}");
    }

    // Initialize cached objects for Paint event
    headerFont = new Font("Segoe UI", 12, FontStyle.Bold);
    greenBrush = new SolidBrush(Color.Green);
    whiteBrush = new SolidBrush(Color.White);

    trayIcon = new NotifyIcon();
    trayIcon.Icon = new Icon(ICON_PATH);
    trayIcon.Text = "Leedz Server (stopped)";
    trayIcon.Visible = true;

    // Create menu with custom renderer for header
    ContextMenuStrip menu = new ContextMenuStrip();
    menu.Renderer = new CustomMenuRenderer();

    // Header as disabled item - we'll draw it ourselves
    headerMenuItem = new ToolStripMenuItem("Leedz Server");
    headerMenuItem.Enabled = false;
    headerMenuItem.Font = headerFont;
    headerMenuItem.Paint += (s, e) => {
        // Fill background
        e.Graphics.FillRectangle(greenBrush, e.ClipRectangle);

        // Draw white text centered
        TextRenderer.DrawText(e.Graphics, "Leedz Server",
            headerFont,
            e.ClipRectangle, Color.White,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

        // Draw status indicator circle on the right
        bool isRunning = IsServerCurrentlyRunning();
        Color indicatorColor = isRunning ? Color.LimeGreen : Color.Red;
        int circleSize = 14;
        int margin = 20;
        int circleX = e.ClipRectangle.Right - circleSize - margin;
        int circleY = e.ClipRectangle.Top + (e.ClipRectangle.Height - circleSize) / 2;

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using (SolidBrush indicatorBrush = new SolidBrush(indicatorColor))
        {
            e.Graphics.FillEllipse(indicatorBrush, circleX, circleY, circleSize, circleSize);
        }
    };

    headerMenuItem.Padding = new Padding(10);

    menu.BackColor = Color.WhiteSmoke;
    menu.Padding = new Padding(5);

    menu.Items.Add(headerMenuItem);
    menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Start Server", null, OnStartServerClick);
    menu.Items.Add("Configure", null, OnConfigClick);
    menu.Items.Add("Stop Server", null, OnStopServerClick);
    menu.Items.Add(new ToolStripSeparator());
    exitMenuItem = new ToolStripMenuItem("Exit", null, OnExitClick);
    menu.Items.Add(exitMenuItem);

    // Prevent menu from closing except for Exit or outside clicks
    menu.Closing += (s, e) => {
        // Allow close if Exit was clicked
        if (allowMenuClose)
        {
            allowMenuClose = false; // Reset flag
            return;
        }

        // Allow close if user clicked outside, pressed Escape, or lost focus
        if (e.CloseReason == ToolStripDropDownCloseReason.AppClicked ||
            e.CloseReason == ToolStripDropDownCloseReason.AppFocusChange ||
            e.CloseReason == ToolStripDropDownCloseReason.Keyboard)
        {
            return; // Allow close
        }

        // If user clicked a menu item, cancel close - keep menu open
        if (e.CloseReason == ToolStripDropDownCloseReason.ItemClicked)
        {
            e.Cancel = true;
        }
    };

    trayIcon.ContextMenuStrip = menu;
    trayIcon.MouseClick += (s, e) => {
        if (e.Button == MouseButtons.Left)
        {
            MethodInfo? mi = typeof(NotifyIcon).GetMethod("ShowContextMenu",
                BindingFlags.NonPublic | BindingFlags.Instance);
            mi?.Invoke(trayIcon, null);
        }
    };
}

// Simple custom renderer that doesn't interfere with layout
private class CustomMenuRenderer : ToolStripProfessionalRenderer
{
    // Let default rendering handle everything - we're using Paint event on header
}
 
    /// <summary>
    /// Context menu handler for "Start Server" menu item.
    /// Calls StartNodeServer to launch the Node.js server process.
    /// </summary>
    private void OnStartServerClick(object? sender, EventArgs e)
    {
        // Start the Node server when the user clicks Start Server
        StartNodeServer();

        // Refresh header to show updated status circle
        headerMenuItem?.Invalidate();
    }

    /// <summary>
    /// Starts the server process (node + leedz_server.js in dev, or leedz-server.exe in prod).
    /// Validates config file exists, launches process with redirected stdout/stderr.
    /// Pipes server output to DebugWrite for logging.
    /// </summary>
    private void StartNodeServer()
    {
        try
        {
            DebugWrite("[TRAY] Starting server...");

            // If already running, do nothing
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                DebugWrite("[TRAY] Server is already running");
                return;
            }

            // Check if server is already running externally (launched by launch_leedz.bat)
            if (IsPackagedDeployment && IsServerRunningExternal())
            {
                DebugWrite("[TRAY] Server is already running (started externally)");
                return;
            }

            // Validate that server config file exists
            if (!File.Exists(CONFIG_FILE))
            {
                DebugWrite($"[TRAY] Server config not found at: {CONFIG_FILE}");
                MessageBox.Show($"Server config not found at: {CONFIG_FILE}");
                return;
            }

            DebugWrite($"[TRAY] Server config file: {CONFIG_FILE}");
            DebugWrite($"[TRAY] Working directory: {ServerDir}");

            ProcessStartInfo psi;
            if (IsPackagedDeployment)
            {
                DebugWrite($"[TRAY] Starting packaged server: {SERVER_EXE}");
                // Production: use leedz-server.exe
                psi = new ProcessStartInfo(SERVER_EXE)
                {
                    WorkingDirectory = ServerDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
            }
            else
            {
                DebugWrite($"[TRAY] Starting dev server: node {SERVER_SCRIPT}");
                // Development: use node + script
                psi = new ProcessStartInfo("node")
                {
                    WorkingDirectory = ServerDir,
                    Arguments = SERVER_SCRIPT,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
            }

            nodeProcess = new Process();
            nodeProcess.StartInfo = psi;
            nodeProcess.EnableRaisingEvents = true;
            nodeProcess.OutputDataReceived += (s, ea) => {
                if (!string.IsNullOrEmpty(ea.Data)) DebugWrite(ea.Data);
            };
            nodeProcess.ErrorDataReceived += (s, ea) => {
                if (!string.IsNullOrEmpty(ea.Data)) DebugWrite("ERR: " + ea.Data);
            };

            bool started = nodeProcess.Start();
            if (started)
            {
                DebugWrite($"[TRAY] Server process started (PID: {nodeProcess.Id})");
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
                if (trayIcon != null) trayIcon.Text = "Leedz Server: running";
            }
            else
            {
                DebugWrite("[TRAY] Failed to start server process");
                MessageBox.Show("Failed to start server process.");
            }
        }
        catch (Exception ex)
        {
            DebugWrite($"[TRAY] Error starting server: {ex.Message}");
            MessageBox.Show("Error starting server: " + ex.Message);
        }
    }

    /// <summary>
    /// Checks if leedz-server.exe is already running externally (not started by this tray app).
    /// Only relevant in packaged deployment.
    /// </summary>
    private bool IsServerRunningExternal()
    {
        try
        {
            var processes = Process.GetProcessesByName("leedz-server");
            return processes.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Checks if server is currently running (either tracked by this app or externally).
    /// Used for status indicator display.
    /// </summary>
    private bool IsServerCurrentlyRunning()
    {
        // Check our tracked process
        if (nodeProcess != null && !nodeProcess.HasExited)
        {
            return true;
        }

        // In packaged mode, check for external processes
        if (IsPackagedDeployment)
        {
            return IsServerRunningExternal();
        }

        return false;
    }

    /// <summary>
    /// Logs text to configured log file with timestamp.
    /// Always writes to log file if _logFilePath is set.
    /// Also attempts console output (fails silently in WinExe).
    /// </summary>
    public void DebugWrite(string text)
    {
        string timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        string logLine = $"[{timestamp}] {text}";

        // ALWAYS write to log file if configured
        if (!string.IsNullOrEmpty(_logFilePath))
        {
            try
            {
                File.AppendAllText(_logFilePath, logLine + Environment.NewLine);
            }
            catch
            {
                // Fail silently if log file is locked (e.g., by VS Code)
                // Don't interrupt important operations like config save
            }
        }

        // Also try console (won't work in WinExe but won't throw)
        try { Console.WriteLine(logLine); } catch { }
    }

    /// <summary>
    /// Override to prevent form from ever showing.
    /// This is a tray-only application - the form is just a container for NotifyIcon.
    /// </summary>
    protected override void SetVisibleCore(bool value)
    {
        base.SetVisibleCore(false);
    }

    /// <summary>
    /// Context menu handler for "Configure" menu item.
    /// Opens ConfigForm modal dialog to edit server_config.json.
    /// If user clicks OK, restarts the server with new configuration.
    /// </summary>
    private void OnConfigClick(object? sender, EventArgs e)
    {
        // Allow menu to close when showing modal dialog
        allowMenuClose = true;

        // Create ConfigForm with restart callback and log callback
        using (ConfigForm configForm = new ConfigForm(CONFIG_FILE, () => {
            DebugWrite("[CONFIG] Stopping server for configuration change...");
            StopNodeServer();  // Already includes 1 second delay for file handle release
            DebugWrite("[CONFIG] Starting server with new configuration...");
            StartNodeServer();
        }, DebugWrite))
        {
            // Show modal dialog - stays open until user clicks Cancel or closes window
            configForm.ShowDialog(this);
        }

        // Close the menu after Configure dialog closes
        if (trayIcon?.ContextMenuStrip != null)
        {
            trayIcon.ContextMenuStrip.Close();
        }
    }

    /// <summary>
    /// Context menu handler for "Stop Server" menu item.
    /// Calls StopNodeServer to terminate the Node.js server process.
    /// </summary>
    private void OnStopServerClick(object? sender, EventArgs e)
    {
        StopNodeServer();

        // Refresh header to show updated status circle
        headerMenuItem?.Invalidate();
    }

    /// <summary>
    /// Terminates the server process gracefully, then forcefully if needed.
    /// 1. Attempts graceful shutdown via HTTP API
    /// 2. Falls back to killing processes by name
    /// 3. Cleans up orphaned node.exe processes
    /// 4. Waits for file handles to release (prevents log file lock errors)
    /// Updates tray icon tooltip to "stopped" state.
    /// </summary>
    private void StopNodeServer()
    {
        try
        {
            DebugWrite("[TRAY] Stopping server...");
            bool stopped = false;

            // STEP 1: Try graceful shutdown via HTTP API
            if (TryGracefulShutdown())
            {
                DebugWrite("[TRAY] Graceful shutdown successful");
                stopped = true;
                nodeProcess = null;
            }
            else
            {
                DebugWrite("[TRAY] Graceful shutdown failed, falling back to forceful termination");

                // STEP 2: Try to stop our tracked process
                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    DebugWrite($"[TRAY] Killing tracked process (PID: {nodeProcess.Id})");
                    try
                    {
                        nodeProcess.Kill(entireProcessTree: true);
                        nodeProcess.WaitForExit(5000);
                    }
                    catch
                    {
                        try
                        {
                            nodeProcess.Kill();
                            nodeProcess.WaitForExit(5000);
                        }
                        catch (Exception ex)
                        {
                            DebugWrite($"[TRAY] Failed to kill tracked process: {ex.Message}");
                        }
                    }
                    nodeProcess = null;
                    stopped = true;
                }

                // STEP 3: In packaged mode, kill leedz-server.exe processes
                if (IsPackagedDeployment)
                {
                    var externalProcesses = Process.GetProcessesByName("leedz-server");
                    DebugWrite($"[TRAY] Found {externalProcesses.Length} external leedz-server processes");
                    foreach (var proc in externalProcesses)
                    {
                        try
                        {
                            DebugWrite($"[TRAY] Killing external process (PID: {proc.Id})");
                            proc.Kill(entireProcessTree: true);
                            proc.WaitForExit(5000);
                            stopped = true;
                        }
                        catch (Exception ex)
                        {
                            DebugWrite($"[TRAY] Failed to kill PID {proc.Id}: {ex.Message}");
                        }
                    }
                }

                // STEP 4: Clean up orphaned node.exe processes in our working directory
                KillOrphanedNodeProcesses();
            }

            // STEP 5: Wait for file handles to release (prevents log file lock errors on restart)
            if (stopped)
            {
                DebugWrite("[TRAY] Waiting for file handles to release...");
                System.Threading.Thread.Sleep(1000);  // 1 second delay
            }

            if (trayIcon != null) trayIcon.Text = "Leedz Server: stopped";

            if (stopped)
            {
                DebugWrite("[TRAY] Server stopped successfully");
            }
            else
            {
                DebugWrite("[TRAY] Server was not running");
            }
        }
        catch (Exception ex)
        {
            DebugWrite($"[TRAY] Error stopping server: {ex.Message}");
            MessageBox.Show("Error stopping server: " + ex.Message);
        }
    }

    /// <summary>
    /// Attempts graceful shutdown via HTTP API endpoint
    /// Returns true if successful, false otherwise
    /// </summary>
    private bool TryGracefulShutdown()
    {
        try
        {
            DebugWrite("[TRAY] Attempting graceful shutdown via API...");

            // Read port from config
            int port = 3000; // default
            try
            {
                if (File.Exists(CONFIG_FILE))
                {
                    string json = File.ReadAllText(CONFIG_FILE);
                    using (var doc = JsonDocument.Parse(json))
                    {
                        if (doc.RootElement.TryGetProperty("port", out var portProp))
                        {
                            port = portProp.GetInt32();
                        }
                    }
                }
            }
            catch { }

            using (var client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(3);
                string url = $"http://localhost:{port}/api/shutdown";

                var content = new StringContent("{}", Encoding.UTF8, "application/json");
                var response = client.PostAsync(url, content).Result;

                if (response.IsSuccessStatusCode)
                {
                    // Wait for process to exit
                    if (nodeProcess != null && !nodeProcess.HasExited)
                    {
                        bool exited = nodeProcess.WaitForExit(5000);
                        return exited;
                    }
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            DebugWrite($"[TRAY] Graceful shutdown exception: {ex.Message}");
        }

        return false;
    }

    /// <summary>
    /// Kills orphaned node.exe processes that match our server script path
    /// This cleans up zombie processes left behind by incomplete shutdowns
    /// </summary>
    private void KillOrphanedNodeProcesses()
    {
        try
        {
            DebugWrite("[TRAY] Checking for orphaned node.exe processes...");

            var nodeProcesses = Process.GetProcessesByName("node");
            int killedCount = 0;

            string serverScriptPath = Path.GetFullPath(SERVER_SCRIPT).ToLower();
            string serverDir = ServerDir.ToLower();

            foreach (var proc in nodeProcesses)
            {
                try
                {
                    // Get command line to check if it's our server
                    string cmdLine = GetProcessCommandLine(proc);

                    if (!string.IsNullOrEmpty(cmdLine) &&
                        (cmdLine.ToLower().Contains(serverScriptPath) ||
                         cmdLine.ToLower().Contains("leedz_server.js")))
                    {
                        DebugWrite($"[TRAY] Killing orphaned node process (PID: {proc.Id}): {cmdLine}");
                        proc.Kill(entireProcessTree: true);
                        proc.WaitForExit(2000);
                        killedCount++;
                    }
                }
                catch (Exception ex)
                {
                    DebugWrite($"[TRAY] Failed to check/kill node process: {ex.Message}");
                }
            }

            if (killedCount > 0)
            {
                DebugWrite($"[TRAY] Killed {killedCount} orphaned node process(es)");
            }
            else
            {
                DebugWrite("[TRAY] No orphaned node processes found");
            }
        }
        catch (Exception ex)
        {
            DebugWrite($"[TRAY] Error checking orphaned processes: {ex.Message}");
        }
    }

    /// <summary>
    /// Gets the command line of a process using WMI
    /// Returns empty string if unable to retrieve
    /// </summary>
    private string GetProcessCommandLine(Process process)
    {
        try
        {
            using (var searcher = new System.Management.ManagementObjectSearcher(
                $"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {process.Id}"))
            {
                foreach (System.Management.ManagementObject obj in searcher.Get())
                {
                    return obj["CommandLine"]?.ToString() ?? "";
                }
            }
        }
        catch
        {
            // WMI access may fail due to permissions
        }
        return "";
    }

    /// <summary>
    /// Context menu handler for "Exit" menu item.
    /// Hides tray icon and exits the application.
    /// </summary>
    private void OnExitClick(object? sender, EventArgs e)
    {
        // Set flag to allow menu to close
        allowMenuClose = true;

        // Stop the server before exiting
        StopNodeServer();

        // Clean up tray icon
        if (trayIcon != null) trayIcon.Visible = false;
        Console.WriteLine("Exiting application...");
        Application.Exit();
    }


}
