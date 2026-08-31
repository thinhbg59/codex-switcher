' Codex Switcher - Silent Background Launcher for Windows
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strBatPath = strScriptDir & "\start-service.bat"

If Not fso.FileExists(strBatPath) Then
    strUserProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
    strBatPath = strUserProfile & "\.codex-switcher-web\start-service.bat"
End If

If fso.FileExists(strBatPath) Then
    ' Run silently (0 = hide window, False = don't wait)
    WshShell.Run """" & strBatPath & """", 0, False
End If
