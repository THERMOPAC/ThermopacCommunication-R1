; ============================================================
;  THERMOPAC Local Document Agent -- Inno Setup Script
;  Version: 1.0.1
;
;  Builds: ThermopacLocalDocumentAgentSetup-v1.0.1.exe
;
;  Prerequisites (GitHub Actions CI downloads these before running iscc):
;    - ThermopacDocAgent.exe  (built by pkg from dist/index.js)
;    - nssm.exe               (win64 -- fetched by CI from nssm-2.24.zip)
;    - config.json.example
;    - README.md, SETUP.md, VERSION.txt
;
;  Service registration: NSSM wraps ThermopacDocAgent.exe as a Windows Service.
;  Direct sc.exe registration is NOT used -- the EXE is a console polling app
;  (no ServiceMain), so sc.exe would cause Error 1053.
;
;  Self-contained: nssm.exe is bundled inside the installer.
;  No internet access is required on the target machine.
;  Build FAILS if nssm.exe is absent when iscc runs (no skipifsourcedoesntexist).
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
Source: "{#MyExeName}"; DestDir: "{app}"; Flags: ignoreversion

; NSSM service wrapper (win64) -- REQUIRED at build time.
; CI downloads nssm.exe before running iscc. Build fails if absent.
Source: "nssm.exe";     DestDir: "{app}"; Flags: ignoreversion

; Config -- ship example; copy to config.json only on fresh install
Source: "config.json.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.json.example"; DestDir: "{app}"; DestName: "config.json"; Flags: onlyifdoesntexist

; Documentation
Source: "README.md";    DestDir: "{app}"; Flags: ignoreversion
Source: "SETUP.md";     DestDir: "{app}"; Flags: ignoreversion
Source: "VERSION.txt";  DestDir: "{app}"; Flags: ignoreversion

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

// ── Register service via NSSM ─────────────────────────────────────────────
procedure RegisterWithNssm(NssmPath: String);
var
  AppPath, AppDir, LogDir: String;
  ResultCode: Integer;
  NL: String;
begin
  NL      := Chr(13) + Chr(10);
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
      'NSSM could not register the service (code ' + IntToStr(ResultCode) + ').' + NL +
      NL +
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
  NL: String;
begin
  if CurStep = ssPostInstall then
  begin
    NL       := Chr(13) + Chr(10);
    NssmPath := ExpandConstant('{app}\nssm.exe');

    RegisterWithNssm(NssmPath);

    MsgBox(
      'THERMOPAC Local Document Agent installed.' + NL +
      NL +
      'BEFORE STARTING THE SERVICE:' + NL +
      '  Edit config.json in ' + ExpandConstant('{app}') + NL +
      '  Set:  erpBaseUrl, apiKey, allowedRootPath' + NL +
      NL +
      'Then start the service:' + NL +
      '  net start {#MyServiceName}' + NL +
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
      // Fallback: nssm.exe already removed by uninstaller file cleanup
      Exec(ExpandConstant('{sys}\net.exe'), 'stop {#MyServiceName}',   '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(ExpandConstant('{sys}\sc.exe'),  'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
