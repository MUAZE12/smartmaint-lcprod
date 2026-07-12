$ErrorActionPreference = "Continue"
$log = 'C:\Users\elitebook\OneDrive\Bureau\projet gmao\SmartMaint - L.C PROD\smartmaint-restart-bootstrap.log'
$helper = 'C:\Users\elitebook\OneDrive\Bureau\projet gmao\SmartMaint - L.C PROD\smartmaint-restart.ps1'
try { Add-Content -Path $log -Value ("== bootstrap started at " + (Get-Date).ToString("s")) } catch {}
try {
    # Sleep 2 s so Node has time to reply 200 to the client before we act.
    Start-Sleep -Seconds 2
    $cmd = ("powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"" + $helper + "`"")
    Add-Content -Path $log -Value ("cmd: " + $cmd)
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
    Add-Content -Path $log -Value ("Invoke-CimMethod returnValue=" + $result.ReturnValue + " ProcessId=" + $result.ProcessId)
} catch {
    Add-Content -Path $log -Value ("EXCEPTION: " + $_.Exception.Message)
}
try { Add-Content -Path $log -Value ("== bootstrap done at " + (Get-Date).ToString("s")) } catch {}
