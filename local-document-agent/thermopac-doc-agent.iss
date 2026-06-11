; ============================================================
;  THERMOPAC Local Document Agent -- Inno Setup Script
;  Version: 1.0.1
;
;  Builds: ThermopacLocalDocumentAgentSetup-v1.0.1.exe
;
;  Prerequisites (for the GitHub Actions build):
;    - ThermopacDocAgent.exe  (built by pkg from dist/index.js)
;    - nssm.exe               (win64, from nssm-2.24.zip -- see build notes below)
;    - config.json.example
;    - README.md, SETUP.md, VERSION.txt
;
;  Service management: NSSM wraps ThermopacDocAgent.exe as a proper Windows Service.
;  Direct sc.exe registration is NOT used -- the EXE is a console polling app,
;  not a native Windows Service (no ServiceMain), so sc.exe causes Error 1053.
;
;  Build notes:
;    Before running iscc, download nssm.exe to the same folder as this .iss file:
;      curl -L https://nssm.cc/release/nssm-2.24.zip -o nssm.zip
;      unzip -j nssm.zip nssm-2.24/win64/nssm.exe -d .
;    If nssm.exe is absent at build time, the installer downloads it at install time.
;
;  Uninstall: stops + removes the NSSM-managed service automatically.
; ============================================================

#define MyAppName      "THERMOPAC Local Document Agent"
#define MyAppVersion   "1.0.1"
#define MyAppPublisher "THERMOPAC"
#define MyServiceName  "ThermopacLocalDocumentAgent"
#define MyExeName      "ThermopacDocAgent.exe"

[Setup]
AppId={{8F3A2B1C-4D5E-6F70-89AB-CDEF01234567}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppSupportURL=https://thermopac.com
DefaultDirName={autopf}\ThermopacDocAgent
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer_output
OutputBaseFilename=ThermopacLocalDocumentAgentSetup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Agent executable (Node.js runtime bundled by pkg -- no Node.js required)
Source: "{#MyExeName}";        DestDir: "{app}"; Flags: ignoreversion

; NSSM service wrapper (win64) -- bundled if present at build time
; If absent, installer downloads it automatically at install time.
Source: "nssm.exe";            DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Config -- ship example; copy to config.json only on fresh install
Source: "config.json.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.json.example"; DestDir: "{app}"; DestName: "config.json"; Flags: onlyifdoesntexist

; Documentation
Source: "README.md";           DestDir: "{app}"; Flags: ignoreversion
Source: "SETUP.md";            DestDir: "{app}"; Flags: ignoreversion
Source: "VERSION.txt";         DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Log and temp dirs -- preserved on uninstall
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\temp"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\Edit Configuration";     Filename: "notepad.exe"; Parameters: """{app}\config.json"""
Name: "{group}\Start Agent Service";    Filename: "{sys}\net.exe"; Parameters: "start {#MyServiceName}"; Comment: "Start the THERMOPAC Document Agent service"
Name: "{group}\Stop Agent Service";     Filename: "{sys}\net.exe"; Parameters: "stop {#MyServiceName}";  Comment: "Stop the THERMOPAC Document Agent service"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Post-install only: offer to open config.json (unchecked -- must configure before starting)
Filename: "notepad.exe"; \
  Parameters: """{app}\config.json"""; \
  Description: "Open config.json to set ERP URL and API key (required before starting service)"; \
  Flags: postinstall nowait unchecked shellexec

[Code]

// ── Download nssm.exe from nssm.cc if not bundled ─────────────────────────
function DownloadNssm(DestPath: String): Boolean;
var
  ResultCode: Integer;
  PS: String;
begin
  Result := False;
  PS :=
    '$ErrorActionPreference = ''Stop''; ' +
    '$zip = Join-Path $env:TEMP ''nssm-2.24.zip''; ' +
    'Invoke-WebRequest -Uri ''https://nssm.cc/release/nssm-2.24.zip'' ' +
    '  -OutFile $zip -UseBasicParsing; ' +
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
    '$arc = [System.IO.Compression.ZipFile]::OpenRead($zip); ' +
    'foreach ($e in $arc.Entries) { ' +
    '  if ($e.Name -eq ''nssm.exe'' -and $e.FullName -like ''*win64*'') { ' +
    '    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, ''' + DestPath + ''', $true); ' +
    '    break ' +
    '  } ' +
    '}; ' +
    '$arc.Dispose()';

  if Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -Command "' + PS + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := (ResultCode = 0) and FileExists(DestPath);
end;

// ── Register service via NSSM ─────────────────────────────────────────────
procedure RegisterWithNssm(NssmPath: String);
var
  AppPath, AppDir, LogDir: String;
  ResultCode: Integer;
begin
  AppPath := ExpandConstant('{app}\{#MyExeName}');
  AppDir  := ExpandConstant('{app}');
  LogDir  := ExpandConstant('{app}\logs');

  // Remove any previous registration (idempotent)
  Exec(NssmPath, 'stop   {#MyServiceName} confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'remove {#MyServiceName} confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Install
  if not Exec(NssmPath, 'install {#MyServiceName} "' + AppPath + '"',
              '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    MsgBox(
      'NSSM could not register the service (code ' + IntToStr(ResultCode) + ').' + #13#10 +
      #13#10 +
      'After editing config.json, run install-service.bat as Administrator to retry.',
      mbError, MB_OK);
    Exit;
  end;

  // Configure
  Exec(NssmPath, 'set {#MyServiceName} AppDirectory   "' + AppDir  + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} DisplayName    "THERMOPAC Local Document Agent"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} Description    "THERMOPAC Local Document Agent -- saves ERP files to local file server"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} Start          SERVICE_AUTO_START', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} AppStdout      "' + LogDir + '\service-stdout.log"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} AppStderr      "' + LogDir + '\service-stderr.log"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} AppRotateFiles 1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(NssmPath, 'set {#MyServiceName} AppRotateBytes 10485760', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// ── Post-install step ──────────────────────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  NssmPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    NssmPath := ExpandConstant('{app}\nssm.exe');

    // If nssm.exe was not bundled, download it now
    if not FileExists(NssmPath) then
    begin
      MsgBox(
        'nssm.exe was not bundled in this installer.' + #13#10 +
        'Downloading from nssm.cc now (requires internet access).' + #13#10 +
        'A brief pause is normal.',
        mbInformation, MB_OK);
      if not DownloadNssm(NssmPath) then
      begin
        MsgBox(
          'Could not download NSSM automatically.' + #13#10 +
          #13#10 +
          'Manual fix:' + #13#10 +
          '  1. Download https://nssm.cc/release/nssm-2.24.zip' + #13#10 +
          '  2. Extract win64\nssm.exe to ' + ExpandConstant('{app}') + #13#10 +
          '  3. Run install-service.bat as Administrator.',
          mbError, MB_OK);
        Exit;
      end;
    end;

    RegisterWithNssm(NssmPath);

    MsgBox(
      'THERMOPAC Local Document Agent installed.' + #13#10 +
      #13#10 +
      'BEFORE STARTING THE SERVICE:' + #13#10 +
      '  Edit config.json in ' + ExpandConstant('{app}') + #13#10 +
      '  Set:  erpBaseUrl, apiKey, allowedRootPath' + #13#10 +
      #13#10 +
      'Then start the service:' + #13#10 +
      '  net start {#MyServiceName}' + #13#10 +
      '  -- or open Services (services.msc)',
      mbInformation, MB_OK);
  end;
end;

// ── Uninstall: stop + remove service ──────────────────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  NssmPath: String;
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    NssmPath := ExpandConstant('{app}\nssm.exe');
    if FileExists(NssmPath) then
    begin
      Exec(NssmPath, 'stop   {#MyServiceName} confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(NssmPath, 'remove {#MyServiceName} confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end else
    begin
      // Fallback if nssm.exe was already removed
      Exec(ExpandConstant('{sys}\net.exe'), 'stop {#MyServiceName}',   '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(ExpandConstant('{sys}\sc.exe'),  'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
