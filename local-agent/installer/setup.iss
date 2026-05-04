; Thermopac Drawing Structuring Agent — Inno Setup 6 installer script
; Compile with: iscc installer\setup.iss   (from the local-agent\ directory)
;
; Build pipeline (GitHub Actions — PyInstaller):
;   1. PyInstaller builds dist\ThermopacStructuringAgent\ThermopacStructuringAgent.exe
;   2. iscc installer\setup.iss packages everything into a single .exe installer
;
; Requires:
;   - Inno Setup 6.x  https://jrsoftware.org/isinfo.php
;   - dist\ThermopacStructuringAgent\  folder built by PyInstaller

#define AppName             "Thermopac Drawing Structuring Agent"
#define AppVersion          "1.0.33"
#define AppPublisher        "Thermopac"
#define AppShortName        "ThermopacStructuringAgent"
#define DesktopShortcutName "Drawing Structuring Agent"
#define AppURL              "https://5d05ae61-8225-4651-bb76-b4e20a4ddabb-00-3mex6zlihlmft.janeway.replit.dev"
#define AppExeName          "ThermopacStructuringAgent.exe"
; SourcePath is an InnoSetup built-in: the directory containing this .iss file
; (always local-agent\installer\). Using it avoids CWD-relative path bugs
; when ISCC is invoked from a different working directory (e.g. the repo root
; or local-agent\ in GitHub Actions).
#define AgentRoot    SourcePath + "\.."
#define SourceDir    AgentRoot + "\dist\ThermopacStructuringAgent"

[Setup]
AppId={{A17C3F82-2D44-4B12-9E3F-88C40B5EF947}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\{#AppShortName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir={#AgentRoot}\installer_output
OutputBaseFilename=ThermopacStructuringAgent-Setup-v{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";     Description: "Create a &desktop shortcut";                  GroupDescription: "Additional icons:"
Name: "startmenuicon";   Description: "Create a &Start Menu shortcut";               GroupDescription: "Additional icons:"
Name: "startupschedule"; Description: "Start agent automatically at &Windows login"; GroupDescription: "Auto-start:"

[Files]
; PyInstaller output — the entire dist\ThermopacStructuringAgent\ folder
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Default config — users edit this after installation
Source: "{#AgentRoot}\config.ini"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist

[Dirs]
Name: "{commonappdata}\ThermopacStructuringAgent\temp";   Permissions: everyone-full
Name: "{commonappdata}\ThermopacStructuringAgent\logs";   Permissions: everyone-full
Name: "{commonappdata}\ThermopacStructuringAgent\config"; Permissions: everyone-full

[Icons]
; Start Menu group entries (always created)
Name: "{group}\{#AppName}";               Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{group}\Edit Config";              Filename: "notepad.exe";         Parameters: """{app}\config.ini"""
Name: "{group}\Uninstall {#AppName}";     Filename: "{uninstallexe}"
; Named Start Menu shortcut (task-controlled)
Name: "{group}\{#DesktopShortcutName}";  Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: startmenuicon
; Desktop shortcut (task-controlled)
Name: "{autodesktop}\{#DesktopShortcutName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent unchecked

[Code]

// ── SolidWorks detection ──────────────────────────────────────────────────
function DetectSwProgId(): String;
var
  Years: array of String;
  i: Integer;
  Dummy: String;
begin
  Result := '';
  Years := ['32','31','30','29','28','27'];
  for i := 0 to GetArrayLength(Years) - 1 do
  begin
    if RegQueryStringValue(HKCR, 'SldWorks.Application.' + Years[i], '', Dummy) then
    begin
      Result := 'SldWorks.Application.' + Years[i];
      Exit;
    end;
  end;
end;

function CheckSolidWorks(): Boolean;
begin
  Result := DetectSwProgId() <> '';
end;

// ── Scheduled task ────────────────────────────────────────────────────────
procedure CreateScheduledTask();
var
  ResultCode: Integer;
begin
  if IsTaskSelected('startupschedule') then
  begin
    Exec('schtasks.exe',
      '/Create /F /SC ONLOGON /RL HIGHEST /TN "ThermopacStructuringAgent" /TR "\"' +
      ExpandConstant('{app}') + '\{#AppExeName}\"" /DELAY 0000:30',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode = 0 then
      MsgBox('Scheduled task created: Drawing Structuring Agent starts 30s after login.',
             mbInformation, MB_OK)
    else
      MsgBox('Warning: Could not create scheduled task (code ' + IntToStr(ResultCode) + '). ' +
             'Start from the Start Menu manually.', mbError, MB_OK);
  end;
end;

// ── Validation ────────────────────────────────────────────────────────────
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not CheckSolidWorks() then
  begin
    MsgBox(
      'SolidWorks (2019-2024) was not detected on this machine.' + #13#10 + #13#10 +
      'Thermopac Drawing Structuring Agent requires SolidWorks to be installed.' + #13#10 +
      'Please install SolidWorks first, then re-run this installer.' + #13#10 + #13#10 +
      'Click OK to cancel installation.',
      mbCriticalError, MB_OK);
    Result := False;
  end;
end;

// ── Post-install ──────────────────────────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CreateScheduledTask();

    MsgBox(
      'Installation complete!' + #13#10 + #13#10 +
      'NEXT STEPS:' + #13#10 +
      '  1. Open config.ini in ' + ExpandConstant('{app}') + #13#10 +
      '     Set your api_url, node_id and node_token' + #13#10 + #13#10 +
      '  2. Run "Drawing Structuring Agent" from the Start Menu or Desktop' + #13#10 + #13#10 +
      '  3. If SolidWorks COM errors appear, restart the agent once' + #13#10 +
      '     — it will regenerate the COM cache automatically on startup.',
      mbInformation, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usPostUninstall then
    Exec('schtasks.exe', '/Delete /F /TN "ThermopacStructuringAgent"',
         '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
