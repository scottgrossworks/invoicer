using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.CompilerServices;

using System.Reflection;

namespace tray;

// Leedz Tray application
// For a tray app we do not show the form at all,
// we use it as a container for NotifyIcon (the tray component)
//
//


public partial class Form1 : Form
{
    // Paths - exe deployed to server/tray/dist/tray.exe
    private string ExeDir => AppDomain.CurrentDomain.BaseDirectory;
    private string ServerDir => Path.GetFullPath(Path.Combine(ExeDir, "../../"));

    public string CONFIG_FILE => Path.Combine(ServerDir, "server_config.json");
    public string SERVER_SCRIPT => Path.Combine(ServerDir, "src/leedz_server.js");
    public string ICON_PATH => Path.Combine(ExeDir, "img/icon.ico");

    private string? _logFilePath;


    private NotifyIcon? trayIcon;
    private Process? nodeProcess;

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

    trayIcon = new NotifyIcon();
    trayIcon.Icon = new Icon(ICON_PATH);
    trayIcon.Text = "Leedz Server (stopped)";
    trayIcon.Visible = true;

    // Create menu with custom renderer for header
    ContextMenuStrip menu = new ContextMenuStrip();
    menu.Renderer = new CustomMenuRenderer();
    
    // Header as disabled item - we'll draw it ourselves
    ToolStripMenuItem header = new ToolStripMenuItem("Leedz Server");
    header.Enabled = false;

    header.Font = new Font("Segoe UI", 12, FontStyle.Bold);
    header.Paint += (s, e) => {
        // Fill background
        e.Graphics.FillRectangle(new SolidBrush(Color.Green), e.ClipRectangle);
        
        // Draw white text centered
        TextRenderer.DrawText(e.Graphics, "Leedz Server", 
            new Font("Segoe UI", 12, FontStyle.Bold),
            e.ClipRectangle, Color.White,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    };
    
    header.Padding = new Padding(10);
    
    menu.BackColor = Color.WhiteSmoke;
    menu.Padding = new Padding(5);  

    menu.Items.Add(header);
    menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Start Server", null, OnStartServerClick);
    menu.Items.Add("Configure", null, OnConfigClick);
    menu.Items.Add("Stop Server", null, OnStopServerClick);
    menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Exit", null, OnExitClick);

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
    }

    /// <summary>
    /// Starts the Node.js server process (leedz_server.js).
    /// Validates config file exists, launches node process with redirected stdout/stderr.
    /// Pipes server output to DebugWrite for logging.
    /// </summary>
    private void StartNodeServer()
    {
        try
        {
            // If already running, do nothing
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                
                DebugWrite("Leedz server is already running.");
                MessageBox.Show("Leedz server is already running.");
                return;
            }

            // Validate that server config file exists
            if (!File.Exists(CONFIG_FILE))
            {
                DebugWrite($"Server config not found at: {CONFIG_FILE}");
                MessageBox.Show($"Server config not found at: {CONFIG_FILE}");
                return;
            }

            var psi = new ProcessStartInfo("node")
            {
                WorkingDirectory = ServerDir,
                Arguments = SERVER_SCRIPT,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

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
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
                if (trayIcon != null) trayIcon.Text = "Leedz Server: running";
            }
            else
            {
                DebugWrite("Failed to start Node process.");
                MessageBox.Show("Failed to start Node process.");
            }
        }
        catch (Exception ex)
        {
            DebugWrite("Error starting server: " + ex.Message);
            MessageBox.Show("Error starting server: " + ex.Message);
        }
    }

    /// <summary>
    /// Logs text to configured log file with timestamp.
    /// Always writes to log file if _logFilePath is set.
    /// Also attempts console output (fails silently in WinExe).
    /// </summary>
    private void DebugWrite(string text)
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
            catch (Exception ex)
            {
                // If log file write fails, show error once (could use a flag to prevent spam)
                MessageBox.Show($"Failed to write to log: {ex.Message}");
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
        // 1. Create ConfigForm, passing the full config file path
        using (ConfigForm configForm = new ConfigForm(CONFIG_FILE))
        {
            // 2. Show modal dialog and wait for user response
            DialogResult result = configForm.ShowDialog(this);

            // 3. If user clicked OK, restart the server with new config
            if (result == DialogResult.OK)
            {
                StopNodeServer();
                System.Threading.Thread.Sleep(1000);  // Give server 1 second to fully shut down
                StartNodeServer();
            }
        }
    }

    /// <summary>
    /// Context menu handler for "Stop Server" menu item.
    /// Calls StopNodeServer to terminate the Node.js server process.
    /// </summary>
    private void OnStopServerClick(object? sender, EventArgs e)
    {
        StopNodeServer();
    }

    /// <summary>
    /// Terminates the Node.js server process.
    /// Attempts to kill the entire process tree, waits up to 5 seconds for clean exit.
    /// Updates tray icon tooltip to "stopped" state.
    /// </summary>
    private void StopNodeServer()
    {
        try
        {
            if (nodeProcess == null)
            {
                MessageBox.Show("Server is not running.");
                return;
            }

            if (nodeProcess.HasExited)
            {
                MessageBox.Show("Server process has already exited.");
                nodeProcess = null;
                if (trayIcon != null) trayIcon.Text = "Leedz Server: stopped";
                return;
            }

            // Try graceful close first
            try
            {
                nodeProcess.Kill(entireProcessTree: true);
            }
            catch
            {
                // fallback
                nodeProcess.Kill();
            }

            nodeProcess.WaitForExit(5000);
            if (trayIcon != null) trayIcon.Text = "Leedz Server: stopped";
            nodeProcess = null;
        }
        catch (Exception ex)
        {
            MessageBox.Show("Error stopping server: " + ex.Message);
        }
    }

    /// <summary>
    /// Context menu handler for "Exit" menu item.
    /// Hides tray icon and exits the application.
    /// </summary>
    private void OnExitClick(object? sender, EventArgs e)
    {
        // Clean up tray icon
        if (trayIcon != null) trayIcon.Visible = false;
        Console.WriteLine("Exiting application...");
        Application.Exit();
    }


}
