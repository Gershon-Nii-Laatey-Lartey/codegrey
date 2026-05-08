; Codegrey Windows Installer — Inno Setup 6+
; Run: iscc codegrey.iss
; Output: installer/Output/CodegreySetup-x.x.x.exe

#define MyAppName "Codegrey"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Codegrey"
#define MyAppURL "https://github.com/Gershon-Nii-Laatey-Lartey/codegrey"
#define MyAppExeName "Codegrey.exe"

; --- Paths ---
; electron-builder puts the unpacked app here by default.
; Adjust SourceDir if your release path differs.
#define SourceDir "..\release\win-unpacked"

[Setup]
AppId={{B7C3A1D2-4E5F-4A6B-9C8D-0E1F2A3B4C5D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Require admin to write to Program Files, but support per-user install too
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=Output
OutputBaseFilename=CodegreySetup-{#MyAppVersion}
SetupIconFile=..\public\icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardResizable=yes
; Show a license page if you add a LICENSE.txt
; LicenseFile=..\LICENSE.txt
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
; Minimum Windows 10
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Copy the entire unpacked Electron app
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
; Desktop shortcut (optional, user must tick the task)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; Quick Launch (Windows XP–Vista only)
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Run]
; Offer to launch the app after install
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Kill any running process before uninstalling
Filename: "taskkill.exe"; Parameters: "/f /im {#MyAppExeName}"; Flags: runhidden; RunOnceId: "KillCodegrey"

[Registry]
; Register app for "Open with" and file associations (optional)
Root: HKA; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

[Code]
// Ask user to close Codegrey before upgrading
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  if FindWindowByClassName('Chrome_WidgetWin_1') <> 0 then begin
    if MsgBox('Codegrey appears to be running. Please close it before continuing.', mbConfirmation, MB_OKCANCEL) = IDCANCEL then
      Result := False;
  end;
end;
