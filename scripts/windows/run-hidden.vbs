' Runs a .cmd from this folder with no console window, so closing a window can't interrupt it.
' Usage: wscript run-hidden.vbs [script.cmd]   (default: run-agent.cmd)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
script = "run-agent.cmd"
If WScript.Arguments.Count > 0 Then script = WScript.Arguments(0)
CreateObject("WScript.Shell").Run "cmd /c """ & dir & "\" & script & """", 0, True
