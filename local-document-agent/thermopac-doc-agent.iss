; ============================================================
;  THERMOPAC Local Document Agent — Inno Setup Script
;  Version: 1.0.0
;
;  Builds: ThermopacLocalDocumentAgentSetup-v1.0.0.exe
;
;  Prerequisites (for the GitHub Actions build):
;    - ThermopacDocAgent.exe  (built by pkg from dist/index.js)
;    - config.json.example
;    - README.md, SETUP.md, VERSION.txt
;
;  Service management: sc.exe (no Node.js required on target)
;  Uninstall: stops + deletes the Windows service automatically
; ============================================================

#define MyAppName      "THERMOPAC Local Document Agent"
#define MyAppVersion   "1.0.0"
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
OutputDir=installer-output
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
; Agent executable (Node.js runtime bundled — no Node.js install required)
Source: "{#MyExeName}";        DestDir: "{app}"; Flags: ignoreversion

; Config — always ship the example; copy to config.json only if not already present
Source: "config.json.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.json.example"; DestDir: "{app}"; DestName: "config.json"; Flags: onlyifdoesntexist

; Documentation
Source: "README.md";           DestDir: "{app}"; Flags: ignoreversion
Source: "SETUP.md";            DestDir: "{app}"; Flags: ignoreversion
Source: "VERSION.txt";         DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Log and temp dirs — preserved on uninstall (contain user data)
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\temp"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\Edit Configuration";      Filename: "notepad.exe";     Parameters: """{app}\config.json"""
Name: "{group}\Start Agent Service";     Filename: "{sys}\net.exe";   Parameters: "start {#MyServiceName}"; Comment: "Start the THERMOPAC Document Agent Windows service"
Name: "{group}\Stop Agent Service";      Filename: "{sys}\net.exe";   Parameters: "stop {#MyServiceName}";  Comment: "Stop the THERMOPAC Document Agent Windows service"
Name: "{group}\Uninstall {#MyAppName}";  Filename: "{uninstallexe}"

[Run]
; Register as a Windows Service (auto-start, runs as LocalSystem)
Filename: "{sys}\sc.exe"; \
  Parameters: "create ""{#MyServiceName}"" binPath= ""{app}\{#MyExeName}"" start= auto DisplayName= ""{#MyAppName}"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Registering Windows service..."

Filename: "{sys}\sc.exe"; \
  Parameters: "description ""{#MyServiceName}"" ""THERMOPAC Local Document Agent — saves ERP files to local file server"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Setting service description..."

; Post-install: offer to open config.json (unchecked — must configure before starting)
Filename: "notepad.exe"; \
  Parameters: """{app}\config.json"""; \
  Description: "Open config.json to set ERP URL and API key (required before starting service)"; \
  Flags: postinstall nowait unchecked shellexec

[UninstallRun]
; Stop the service gracefully, then delete it
Filename: "{sys}\sc.exe"; Parameters: "stop ""{#MyServiceName}""";   Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{sys}\sc.exe"; Parameters: "delete ""{#MyServiceName}"""; Flags: runhidden waituntilterminated; RunOnceId: "DelSvc"

[Code]
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then begin
    WizardForm.FinishedLabel.Caption :=
      'THERMOPAC Local Document Agent has been installed and registered as a Windows service.' + #13#10 +
      #13#10 +
      'Before starting the service:' + #13#10 +
      '  1. Edit ' + ExpandConstant('{app}') + '\config.json' + #13#10 +
      '  2. Set:  erpBaseUrl, apiKey, allowedRootPath' + #13#10 +
      #13#10 +
      'Then start the service:' + #13#10 +
      '  net start {#MyServiceName}' + #13#10 +
      '  — or open Services (services.msc)';
  end;
end;
