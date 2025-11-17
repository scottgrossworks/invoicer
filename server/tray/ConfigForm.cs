using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;

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
    private Label lblStatus = new();

    private readonly string configFilePath;

    public ConfigForm(string configFilePath)
    {
        this.configFilePath = configFilePath;
        InitializeForm();
        LoadCurrentConfig();
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

        // CRITICAL FIX 1: Increased height to 820 (was 720)
        this.ClientSize = new Size(850, 820);
        this.MinimumSize = new Size(750, 750);
        this.MaximumSize = new Size(1200, 1100);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.FormBorderStyle = FormBorderStyle.Sizable;
        this.MaximizeBox = true;
        this.MinimizeBox = true;

        // Header panel with blue background
        Panel headerPanel = new Panel();
        headerPanel.BackColor = Color.DodgerBlue;
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
        int controlHeight = 40;
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

        // Auto-Start Checkbox (disabled for now)
        chkAutoStart.Text = "Enable Auto-Start (not yet implemented)";
        chkAutoStart.Left = leftMargin;
        chkAutoStart.Top = yPos;
        chkAutoStart.Width = 450;
        chkAutoStart.Font = new Font("Segoe UI", 10, FontStyle.Regular);
        chkAutoStart.AutoSize = true;
        chkAutoStart.Enabled = false;
        contentPanel.Controls.Add(chkAutoStart);
        yPos += chkAutoStart.Height + controlToControlSpacing;

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
            BackColor = Color.ForestGreen,
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
            }
        }
        catch (Exception ex)
        {
            lblStatus.Text = $"Error loading config: {ex.Message}";
        }
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
}