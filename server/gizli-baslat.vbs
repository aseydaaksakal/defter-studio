' Defter Studio sunucusunu pencere acmadan baslatir (Windows oturum acilisinda otomatik calistirmak icin).
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c " & Chr(34) & Chr(34) & d & "\baslat.bat" & Chr(34) & " sessiz" & Chr(34), 0, False
