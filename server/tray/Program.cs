namespace tray;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main( string[] args)
    {
        // Single-instance guard: double-clicking TheLeedz.exe twice must not
        // produce two tray icons. The second instance exits silently.
        using var mutex = new Mutex(true, "TheLeedzTrayApp", out bool isFirstInstance);
        if (!isFirstInstance)
        {
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new Form1());
    }
}
