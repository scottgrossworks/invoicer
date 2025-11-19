using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace tray;

/// <summary>
/// ConfigForm: Modal dialog for editing Leedz server configuration.
/// Reads current config from server_config.json on open.
/// On Save: writes new config and signals caller to restart server if needed.
/// </summary>
public class ConfigForm : Form
{
    private TextBox txtDbPath = new();
    private TextBox txtServerPort = new();
    private TextBox txtLogFilePath = new();
    private CheckBox chkDebugMode = new();
    private CheckBox chkAutoStart = new();
    private TextBox txtExportPath = new();
    private Button btnExport = new();
    private Label lblStatus = new();

    private readonly string configFilePath;

    public ConfigForm(string configFilePath)
    {
        this.configFilePath = configFilePath;
        InitializeForm();
        LoadCurrentConfig();
        CheckServerStatus();
    }

    private void InitializeForm()
    {
        this.Text = "Leedz Server Configuration";

        // Icon path fix
        try
        {
            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "../img/icon.ico");
            if (File.Exists(iconPath))
            {
                this.Icon = new Icon(iconPath);
            }
        }
        catch { }

        // 
        this.ClientSize = new Size(900, 984);
        this.MinimumSize = new Size(800, 900);
        this.MaximumSize = new Size(1200, 1200);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.FormBorderStyle = FormBorderStyle.Sizable;
        this.MaximizeBox = true;
        this.MinimizeBox = true;

        // Header panel with blue background
        Panel headerPanel = new Panel();
        headerPanel.BackColor = Color.Green;
        headerPanel.Location = new Point(0, 0);
        headerPanel.Size = new Size(this.ClientSize.Width, 90);
        headerPanel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;

        Label headerLabel = new Label();
        headerLabel.Text = "Leedz Server Configuration";
        headerLabel.ForeColor = Color.White;
        headerLabel.Font = new Font("Segoe UI", 16, FontStyle.Bold);
        headerLabel.AutoSize = false;
        headerLabel.Size = new Size(headerPanel.Width, headerPanel.Height);
        headerLabel.TextAlign = ContentAlignment.MiddleCenter;
        headerLabel.Dock = DockStyle.Fill;
        headerPanel.Controls.Add(headerLabel);

        this.Controls.Add(headerPanel);

        // CRITICAL FIX 2: Reduced top padding from 110 to 100
        TableLayoutPanel mainLayout = new TableLayoutPanel();
        mainLayout.Dock = DockStyle.Fill;
        mainLayout.Padding = new Padding(30, 100, 30, 20);  // Reduced from 110
        mainLayout.ColumnCount = 1;
        mainLayout.RowCount = 2;
        mainLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));  // Content grows
        mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 90F));   // Buttons fixed height
        
        // Content panel (grows with form)
        Panel contentPanel = new Panel();
        contentPanel.Dock = DockStyle.Fill;
        contentPanel.AutoScroll = true;

        int yPos = 10;
        int labelWidth = 200;
        int controlWidth = 500;
        int controlHeight = 50;
        int leftMargin = 15;
        int labelToTextboxMargin = 10;
        int controlToControlSpacing = 30;

        // Database Path
        Label lblDbPath = new() { 
            Text = "Database Path:", 
            Left = leftMargin, 
            Top = yPos, 
            Width = labelWidth, 
            AutoSize = true 
        };
        contentPanel.Controls.Add(lblDbPath);
        txtDbPath.Left = leftMargin;
        txtDbPath.Top = yPos + lblDbPath.Height + labelToTextboxMargin;
        txtDbPath.Width = controlWidth;
        txtDbPath.Height = controlHeight;
        txtDbPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        contentPanel.Controls.Add(txtDbPath);
        yPos = txtDbPath.Top + txtDbPath.Height + controlToControlSpacing;

        // Server Port
        Label lblPort = new() { 
            Text = "Server Port:", 
            Left = leftMargin, 
            Top = yPos, 
            Width = labelWidth, 
            AutoSize = true 
        };
        contentPanel.Controls.Add(lblPort);
        txtServerPort.Left = leftMargin;
        txtServerPort.Top = yPos + lblPort.Height + labelToTextboxMargin;
        txtServerPort.Width = controlWidth;
        txtServerPort.Height = controlHeight;
        txtServerPort.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        contentPanel.Controls.Add(txtServerPort);
        yPos = txtServerPort.Top + txtServerPort.Height + controlToControlSpacing;

        // Log File Path
        Label lblLogPath = new() { 
            Text = "Log File Path:", 
            Left = leftMargin, 
            Top = yPos, 
            Width = labelWidth, 
            AutoSize = true 
        };
        contentPanel.Controls.Add(lblLogPath);
        txtLogFilePath.Left = leftMargin;
        txtLogFilePath.Top = yPos + lblLogPath.Height + labelToTextboxMargin;
        txtLogFilePath.Width = controlWidth;
        txtLogFilePath.Height = controlHeight;
        txtLogFilePath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        contentPanel.Controls.Add(txtLogFilePath);
        yPos = txtLogFilePath.Top + txtLogFilePath.Height + controlToControlSpacing;  // More spacing

        // Debug Mode Checkbox
        chkDebugMode.Text = "Debug Mode (verbose logging)";
        chkDebugMode.Left = leftMargin;
        chkDebugMode.Top = yPos;
        chkDebugMode.Width = 350;
        chkDebugMode.Font = new Font("Segoe UI", 10, FontStyle.Regular);
        chkDebugMode.AutoSize = true;
        contentPanel.Controls.Add(chkDebugMode);
        yPos += chkDebugMode.Height + controlToControlSpacing;

        // Auto-Start Checkbox
        chkAutoStart.Text = "Start TheLeedz automatically when Windows starts";
        chkAutoStart.Left = leftMargin;
        chkAutoStart.Top = yPos;
        chkAutoStart.Width = 450;
        chkAutoStart.Font = new Font("Segoe UI", 10, FontStyle.Regular);
        chkAutoStart.AutoSize = true;
        chkAutoStart.Enabled = true;
        chkAutoStart.CheckedChanged += OnAutoStartChanged;
        contentPanel.Controls.Add(chkAutoStart);
        yPos += chkAutoStart.Height + controlToControlSpacing;

        // Export Path Label
        Label lblExportPath = new() {
            Text = "DB Export Path:",
            Left = leftMargin,
            Top = yPos,
            Width = labelWidth,
            AutoSize = true
        };
        contentPanel.Controls.Add(lblExportPath);

        // Export Path TextBox and Export Button on same row
        txtExportPath.Left = leftMargin;
        txtExportPath.Top = yPos + lblExportPath.Height + labelToTextboxMargin;
        txtExportPath.Width = 350;  // Shorter to make room for button
        txtExportPath.Height = controlHeight;
        txtExportPath.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        contentPanel.Controls.Add(txtExportPath);

        // Export Button (dodger blue, white text) on same row
        btnExport.Text = "Export";
        btnExport.Left = txtExportPath.Left + txtExportPath.Width + 20;  // 20px gap
        btnExport.Top = txtExportPath.Top;
        btnExport.Width = 180;
        btnExport.Height = controlHeight;
        btnExport.BackColor = Color.DodgerBlue;
        btnExport.ForeColor = Color.White;
        btnExport.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        btnExport.Click += OnExportClick;
        contentPanel.Controls.Add(btnExport);

        yPos = txtExportPath.Top + txtExportPath.Height + controlToControlSpacing;

        // Status Label
        lblStatus.Text = "";
        lblStatus.Left = leftMargin;
        lblStatus.Top = yPos;
        lblStatus.Width = controlWidth;
        lblStatus.Height = 30;
        lblStatus.ForeColor = System.Drawing.Color.DarkRed;
        lblStatus.AutoSize = false;
        lblStatus.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        contentPanel.Controls.Add(lblStatus);

        mainLayout.Controls.Add(contentPanel, 0, 0);

        // CRITICAL FIX 3: Button panel matches form background
        Panel buttonPanel = new Panel();
        buttonPanel.Dock = DockStyle.Fill;
        // No BackColor set - inherits from parent (system default gray)

        int buttonWidth = 150;
        int buttonHeight = 55;
        int buttonSpacing = 30;

        // FlowLayoutPanel for buttons
        FlowLayoutPanel buttonFlow = new FlowLayoutPanel();
        buttonFlow.FlowDirection = FlowDirection.RightToLeft;
        buttonFlow.Dock = DockStyle.Fill;
        buttonFlow.Padding = new Padding(30, 20, 30, 20);
        // CRITICAL FIX 4: No BackColor - transparent, inherits parent

        // Save Button
        Button btnSave = new() {
            Text = "Save",
            ForeColor = Color.White,
            BackColor = Color.Green,
            Width = buttonWidth,
            Height = buttonHeight,
            DialogResult = DialogResult.OK,
            Font = new Font("Segoe UI", 11, FontStyle.Bold)
        };
        btnSave.Click += (s, e) => OnOKClick();
        buttonFlow.Controls.Add(btnSave);

        // Spacer
        Panel spacer = new Panel { Width = buttonSpacing, Height = 1 };
        buttonFlow.Controls.Add(spacer);

        // Cancel Button
        Button btnCancel = new() {
            Text = "Cancel",
            Width = buttonWidth,
            Height = buttonHeight,
            DialogResult = DialogResult.Cancel,
            Font = new Font("Segoe UI", 11, FontStyle.Regular)
        };
        buttonFlow.Controls.Add(btnCancel);

        buttonPanel.Controls.Add(buttonFlow);
        mainLayout.Controls.Add(buttonPanel, 0, 1);

        this.Controls.Add(mainLayout);
        mainLayout.BringToFront();
        headerPanel.BringToFront();

        this.AcceptButton = btnSave;
        this.CancelButton = btnCancel;
    }

    private void LoadCurrentConfig()
    {
        try
        {
            if (!File.Exists(configFilePath))
            {
                lblStatus.Text = "Config file not found!";
                return;
            }

            string json = File.ReadAllText(configFilePath);
            using (var doc = JsonDocument.Parse(json))
            {
                var root = doc.RootElement;

                if (root.TryGetProperty("database", out var dbObj) && dbObj.TryGetProperty("url", out var dbUrl))
                    txtDbPath.Text = dbUrl.GetString() ?? "";

                if (root.TryGetProperty("port", out var port))
                    txtServerPort.Text = port.GetInt32().ToString();

                if (root.TryGetProperty("logging", out var logging))
                {
                    if (logging.TryGetProperty("file", out var logFile))
                        txtLogFilePath.Text = logFile.GetString() ?? "";

                    if (logging.TryGetProperty("level", out var level))
                        chkDebugMode.Checked = (level.GetString() == "debug");
                }

                // Set default export path: <log directory>/<database_name>.csv
                string logFilePath = txtLogFilePath.Text;
                string dbPath = txtDbPath.Text;

                if (!string.IsNullOrEmpty(logFilePath) && !string.IsNullOrEmpty(dbPath))
                {
                    // Extract log directory
                    string logDirectory = Path.GetDirectoryName(logFilePath) ?? "";

                    // Extract database name from URL (e.g., "file:./data/leedz_invoicer.sqlite" -> "leedz_invoicer")
                    string dbFileName = Path.GetFileNameWithoutExtension(dbPath.Replace("file:", "").Replace("./", ""));

                    // Construct default export path
                    string defaultExportPath = Path.Combine(logDirectory, $"{dbFileName}.csv");
                    txtExportPath.Text = defaultExportPath;
                }
            }
        }
        catch (Exception ex)
        {
            lblStatus.Text = $"Error loading config: {ex.Message}";
        }

        // Load auto-start state from registry
        LoadAutoStartState();
    }

    private void OnOKClick()
    {
        lblStatus.Text = "";

        if (!ValidateInputs())
        {
            this.DialogResult = DialogResult.None;
            return;
        }

        if (!SaveConfig())
        {
            this.DialogResult = DialogResult.None;
            return;
        }

        this.DialogResult = DialogResult.OK;
        this.Close();
    }

    /// <summary>
    /// Load auto-start checkbox state from Windows Registry
    /// </summary>
    private void LoadAutoStartState()
    {
        try
        {
            const string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
            const string appName = "TheLeedz";

            using (RegistryKey? key = Registry.CurrentUser.OpenSubKey(keyPath, false))
            {
                if (key != null)
                {
                    object? value = key.GetValue(appName);
                    chkAutoStart.Checked = (value != null);
                }
            }
        }
        catch
        {
            // If we can't read registry, default to unchecked
            chkAutoStart.Checked = false;
        }
    }

    /// <summary>
    /// Event handler for auto-start checkbox change
    /// Sets or removes registry entry for Windows startup
    /// </summary>
    private void OnAutoStartChanged(object? sender, EventArgs e)
    {
        try
        {
            const string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
            const string appName = "TheLeedz";
            string exePath = Application.ExecutablePath;

            using (RegistryKey? key = Registry.CurrentUser.OpenSubKey(keyPath, true))
            {
                if (key == null)
                {
                    MessageBox.Show(
                        "Cannot access the Windows startup registry key.",
                        "Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                if (chkAutoStart.Checked)
                {
                    // Enable auto-start: Add registry entry
                    key.SetValue(appName, exePath);
                }
                else
                {
                    // Disable auto-start: Remove registry entry
                    key.DeleteValue(appName, false);
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to update auto-start setting: {ex.Message}",
                "Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private bool ValidateInputs()
    {
        if (!int.TryParse(txtServerPort.Text, out int port) || port < 1 || port > 65535)
        {
            lblStatus.Text = "Port must be a number between 1 and 65535.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(txtDbPath.Text))
        {
            lblStatus.Text = "Database path cannot be empty.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(txtLogFilePath.Text))
        {
            lblStatus.Text = "Log file path cannot be empty.";
            return false;
        }

        return true;
    }

    private bool SaveConfig()
    {
        try
        {
            string json = File.ReadAllText(configFilePath);
            using (var doc = JsonDocument.Parse(json))
            {
                var root = doc.RootElement;
                var dbType = root.GetProperty("database").GetProperty("type").GetString();

                var newConfig = new
                {
                    port = int.Parse(txtServerPort.Text),
                    database = new { type = dbType, url = txtDbPath.Text },
                    logging = new { level = chkDebugMode.Checked ? "debug" : "info", file = txtLogFilePath.Text }
                };

                var options = new JsonSerializerOptions { WriteIndented = true };
                string newJson = JsonSerializer.Serialize(newConfig, options);

                string tempPath = configFilePath + ".tmp";
                File.WriteAllText(tempPath, newJson);
                File.Delete(configFilePath);
                File.Move(tempPath, configFilePath);

                lblStatus.Text = "Configuration saved successfully.";
                return true;
            }
        }
        catch (Exception ex)
        {
            lblStatus.Text = $"Error saving config: {ex.Message}";
            return false;
        }
    }

    public int GetConfiguredPort()
    {
        return int.TryParse(txtServerPort.Text, out int port) ? port : 3000;
    }

    /// <summary>
    /// Export button click handler - calls API to export database to CSV
    /// </summary>
    private async void OnExportClick(object? sender, EventArgs e)
    {
        try
        {
            // Get export path from textbox
            string exportPath = txtExportPath.Text.Trim();

            // Validate export path
            if (string.IsNullOrWhiteSpace(exportPath))
            {
                lblStatus.Text = "Export path cannot be empty.";
                lblStatus.ForeColor = Color.DarkRed;
                return;
            }

            // Ensure path ends with .csv
            if (!exportPath.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            {
                exportPath += ".csv";
                txtExportPath.Text = exportPath;
            }

            // Disable button during export
            btnExport.Enabled = false;
            btnExport.Text = "Exporting...";
            lblStatus.Text = "Exporting database to CSV...";
            lblStatus.ForeColor = Color.DarkBlue;

            // Get server port
            int port = GetConfiguredPort();
            string apiUrl = $"http://localhost:{port}/api/export/csv";

            // Prepare request
            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            var requestBody = new
            {
                exportPath = exportPath
            };

            string jsonBody = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

            // Send POST request
            HttpResponseMessage response = await client.PostAsync(apiUrl, content);

            // Parse response
            string responseBody = await response.Content.ReadAsStringAsync();
            using (var doc = JsonDocument.Parse(responseBody))
            {
                var root = doc.RootElement;

                if (response.IsSuccessStatusCode && root.TryGetProperty("success", out var success) && success.GetBoolean())
                {
                    string message = root.TryGetProperty("message", out var msg) ? msg.GetString() ?? "Export successful" : "Export successful";
                    lblStatus.Text = $"Success: {message}";
                    lblStatus.ForeColor = Color.DarkGreen;

                    // Show success message box
                    MessageBox.Show($"Database exported successfully to:\n{exportPath}\n\n{message}",
                        "Export Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    string errorMsg = root.TryGetProperty("message", out var msg) ? msg.GetString() ?? "Unknown error" : "Unknown error";
                    lblStatus.Text = $"Export failed: {errorMsg}";
                    lblStatus.ForeColor = Color.DarkRed;

                    MessageBox.Show($"Export failed:\n{errorMsg}",
                        "Export Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }
        catch (HttpRequestException httpEx)
        {
            lblStatus.Text = "Server connection failed. Is the server running?";
            lblStatus.ForeColor = Color.DarkRed;
            MessageBox.Show($"Cannot connect to server:\n{httpEx.Message}\n\nMake sure the server is running.",
                "Connection Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            lblStatus.Text = $"Export error: {ex.Message}";
            lblStatus.ForeColor = Color.DarkRed;
            MessageBox.Show($"Export failed:\n{ex.Message}",
                "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            // Re-enable button
            btnExport.Enabled = true;
            btnExport.Text = "Export";
        }
    }

    /// <summary>
    /// Check if server is running on configured port - called when form opens
    /// Disables Export button and shows red status message if server is not running
    /// </summary>
    private async void CheckServerStatus()
    {
        int port = GetConfiguredPort();
        bool serverRunning = await IsServerRunning(port);

        if (!serverRunning)
        {
            btnExport.Enabled = false;
            lblStatus.Text = "Database export requires the server to be running. Go back to the tray menu and start the server.";
            lblStatus.ForeColor = Color.DarkRed;
        }
        else
        {
            btnExport.Enabled = true;
            lblStatus.Text = "";
        }
    }

    /// <summary>
    /// Test if server is running by attempting a quick health check
    /// </summary>
    /// <param name="port">Server port to check</param>
    /// <returns>True if server responds, false otherwise</returns>
    private async Task<bool> IsServerRunning(int port)
    {
        try
        {
            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(2);

            // Try to connect to server root endpoint
            HttpResponseMessage response = await client.GetAsync($"http://localhost:{port}/");
            return response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotFound;
        }
        catch
        {
            return false;
        }
    }
}