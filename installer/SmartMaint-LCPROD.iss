; ============================================================
;  SmartMaint - L.C PROD  ·  Installateur Windows (Inno Setup)
; ------------------------------------------------------------
;  Compile:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" SmartMaint-LCPROD.iss
;  Produit:  installer\Output\SmartMaint-LCPROD-Setup.exe
; ============================================================

#define AppName "SmartMaint - L.C PROD"
#define AppVersion "1.0.0"
#define AppPublisher "L.C PROD"
#define AppExe "SmartMaint - L.C PROD.exe"
#define SrcDir "C:\Users\elitebook\OneDrive\Bureau\projet gmao\SmartMaint - L.C PROD"

[Setup]
AppId={{A7E3C9F1-2B8D-4E56-9C1A-3F7D0B5E8A24}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir={#SrcDir}\installer\Output
OutputBaseFilename=SmartMaint-LCPROD-Setup
SetupIconFile={#SrcDir}\public\logo.ico
UninstallDisplayIcon={app}\public\logo.ico
UninstallDisplayName={#AppName}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "{#SrcDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion; \
  Excludes: "\installer\*,\src\*,\.next\cache\*,\node_modules\.cache\*,\scripts\*,logo-source.png,publish-secret.txt,update-error.log,*.iss,*.bat,*.cs"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\public\logo.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\public\logo.ico"; Tasks: desktopicon

[UninstallDelete]
; Wipe the whole folder on uninstall — covers files the app generates at runtime.
Type: filesandordirs; Name: "{app}"

[Run]
Filename: "{app}\{#AppExe}"; Description: "Lancer {#AppName} maintenant"; Flags: nowait postinstall skipifsilent
