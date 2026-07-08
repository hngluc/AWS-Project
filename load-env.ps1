if (Test-Path .env) {
    Get-Content .env | Where-Object { $_ -notmatch "^#" -and $_ -match "=" } | ForEach-Object {
        $name, $value = $_.split('=', 2)
        [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), [System.EnvironmentVariableTarget]::Process)
    }
    Write-Host "Loaded environment variables from .env successfully!" -ForegroundColor Green
} else {
    Write-Host ".env file not found!" -ForegroundColor Red
}
