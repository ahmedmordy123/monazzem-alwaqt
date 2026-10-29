Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [PSCustomObject]@{
    Device  = $_.DeviceName
    Primary = $_.Primary
    X       = $_.Bounds.X
    Y       = $_.Bounds.Y
    W       = $_.Bounds.Width
    H       = $_.Bounds.Height
  }
} | ConvertTo-Json
