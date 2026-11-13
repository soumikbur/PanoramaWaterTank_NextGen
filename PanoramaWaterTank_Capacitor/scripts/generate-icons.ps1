Add-Type -AssemblyName System.Drawing

$srcIconPath = "C:\Users\soumi\OneDrive\Documents\Antigravity\PanoramaWaterTank_NextGen\apps\mobile\src\assets\panorama_logo_icon.png"
$resBase = "C:\Users\soumi\OneDrive\Documents\Antigravity\PanoramaWaterTank_NextGen\PanoramaWaterTank_Capacitor\android\app\src\main\res"

if (-not (Test-Path $srcIconPath)) {
    Write-Error "Source icon not found at $srcIconPath"
    exit 1
}

$srcBitmap = [System.Drawing.Bitmap]::FromFile($srcIconPath)

function Resize-Image {
    param(
        [System.Drawing.Bitmap]$source,
        [int]$width,
        [int]$height,
        [string]$destPath,
        [System.Drawing.Color]$bgColor = [System.Drawing.Color]::Transparent,
        [double]$scaleFactor = 1.0
    )

    $destBitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($bgColor -ne [System.Drawing.Color]::Transparent) {
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $graphics.FillRectangle($brush, 0, 0, $width, $height)
        $brush.Dispose()
    }

    $drawW = [int]($width * $scaleFactor)
    $drawH = [int]($height * $scaleFactor)
    $drawX = [int](($width - $drawW) / 2)
    $drawY = [int](($height - $drawH) / 2)

    $graphics.DrawImage($source, $drawX, $drawY, $drawW, $drawH)
    $graphics.Dispose()

    $destDir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBitmap.Dispose()
    Write-Host "Generated: $destPath ($($width)x$($height))"
}

# 1. Launcher icons
$iconSizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($k in $iconSizes.Keys) {
    $size = $iconSizes[$k]
    $dir = Join-Path $resBase $k
    Resize-Image $srcBitmap $size $size (Join-Path $dir "ic_launcher.png")
    Resize-Image $srcBitmap $size $size (Join-Path $dir "ic_launcher_round.png")
}

# 2. Foreground adaptive icons
$fgSizes = @{
    "mipmap-mdpi" = 108
    "mipmap-hdpi" = 162
    "mipmap-xhdpi" = 216
    "mipmap-xxhdpi" = 324
    "mipmap-xxxhdpi" = 432
}

foreach ($k in $fgSizes.Keys) {
    $size = $fgSizes[$k]
    $dir = Join-Path $resBase $k
    # Scale icon to 60% inside adaptive icon container
    Resize-Image $srcBitmap $size $size (Join-Path $dir "ic_launcher_foreground.png") -scaleFactor 0.65
}

# 3. Notification Small Icon (white silhouette on transparent)
$statIconPath = Join-Path $resBase "drawable\ic_stat_panorama.png"
Resize-Image $srcBitmap 24 24 $statIconPath

# 4. Splash screens
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$splashConfigs = @(
    @{ Dir = "drawable"; W = 480; H = 800; Scale = 0.35 },
    @{ Dir = "drawable-port-mdpi"; W = 320; H = 480; Scale = 0.35 },
    @{ Dir = "drawable-port-hdpi"; W = 480; H = 800; Scale = 0.35 },
    @{ Dir = "drawable-port-xhdpi"; W = 720; H = 1280; Scale = 0.35 },
    @{ Dir = "drawable-port-xxhdpi"; W = 960; H = 1600; Scale = 0.35 },
    @{ Dir = "drawable-port-xxxhdpi"; W = 1280; H = 1920; Scale = 0.35 },
    @{ Dir = "drawable-land-mdpi"; W = 480; H = 320; Scale = 0.35 },
    @{ Dir = "drawable-land-hdpi"; W = 800; H = 480; Scale = 0.35 },
    @{ Dir = "drawable-land-xhdpi"; W = 1280; H = 720; Scale = 0.35 },
    @{ Dir = "drawable-land-xxhdpi"; W = 1600; H = 960; Scale = 0.35 },
    @{ Dir = "drawable-land-xxxhdpi"; W = 1920; H = 1280; Scale = 0.35 }
)

foreach ($c in $splashConfigs) {
    $dir = Join-Path $resBase $c.Dir
    $dest = Join-Path $dir "splash.png"
    Resize-Image $srcBitmap $c.W $c.H $dest -bgColor $white -scaleFactor $c.Scale
}

$srcBitmap.Dispose()
Write-Host "All icons and splash screens successfully generated!"

