[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

$width = 256
$height = 256
$bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Clear background
$g.Clear([System.Drawing.Color]::Transparent)

# Outer rounded background
$rect = New-Object System.Drawing.Rectangle(12, 12, 232, 232)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 48
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.X + $rect.Width - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.X + $rect.Width - $d, $rect.Y + $rect.Height - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Y + $rect.Height - $d, $d, $d, 90, 90)
$path.CloseFigure()

# Background Gradient
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 12)),
    (New-Object System.Drawing.Point(0, 244)),
    [System.Drawing.Color]::FromArgb(255, 21, 101, 192),
    [System.Drawing.Color]::FromArgb(255, 13, 71, 161)
)
$g.FillPath($bgBrush, $path)

# Subtle border
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 255, 255), 3)
$g.DrawPath($borderPen, $path)

# Draw Water Tank Vessel (Cylindrical tank in center)
# Tank Outline: 100 wide x 110 high, centered at x=78, y=55
$tankX = 78
$tankY = 55
$tankW = 100
$tankH = 110

# Tank body fill (unfilled upper region)
$tankEmptyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 236, 239, 241))
$g.FillRectangle($tankEmptyBrush, $tankX, ($tankY + 14), $tankW, ($tankH - 28))

# Tank water fill (lower 70% of tank)
$waterH = 68
$waterY = ($tankY + $tankH - 14 - $waterH)
$waterBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point($tankX, $waterY)),
    (New-Object System.Drawing.Point($tankX, ($waterY + $waterH))),
    [System.Drawing.Color]::FromArgb(255, 0, 188, 212),
    [System.Drawing.Color]::FromArgb(255, 2, 119, 189)
)
$g.FillRectangle($waterBrush, $tankX, $waterY, $tankW, $waterH)

# Tank Bottom Ellipse
$bottomEllipse = New-Object System.Drawing.Rectangle($tankX, ($tankY + $tankH - 28), $tankW, 28)
$g.FillEllipse($waterBrush, $bottomEllipse)

# Tank Top Ellipse
$topEllipse = New-Object System.Drawing.Rectangle($tankX, $tankY, $tankW, 28)
$topBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 207, 216, 220))
$g.FillEllipse($topBrush, $topEllipse)

# Water Top Level Ellipse
$waterLevelEllipse = New-Object System.Drawing.Rectangle($tankX, ($waterY - 10), $tankW, 20)
$waterSurfaceBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 77, 208, 225))
$g.FillEllipse($waterSurfaceBrush, $waterLevelEllipse)

# Tank Outline Pens
$tankPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 255, 255), 4)
$g.DrawLine($tankPen, $tankX, ($tankY + 14), $tankX, ($tankY + $tankH - 14))
$g.DrawLine($tankPen, ($tankX + $tankW), ($tankY + 14), ($tankX + $tankW), ($tankY + $tankH - 14))
$g.DrawEllipse($tankPen, $topEllipse)
$g.DrawArc($tankPen, $bottomEllipse, 0, 180)

# Railway Coach Emblem at Bottom (Rail tracks icon)
$trackY = 192
$trackPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 193, 7), 3)
# Two horizontal rail lines
$g.DrawLine($trackPen, 50, $trackY, 206, $trackY)
$g.DrawLine($trackPen, 50, ($trackY + 16), 206, ($trackY + 16))
# 5 Sleepers (cross ties)
for ($i = 0; $i -lt 6; $i++) {
    $x = 65 + ($i * 25)
    $g.DrawLine($trackPen, $x, ($trackY - 4), $x, ($trackY + 20))
}

# Save PNG
$dir = "C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\apps\mobile\electron\assets"
$pngPath = Join-Path $dir "icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved PNG: $pngPath"

# Save ICO file (contains 256x256 PNG)
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$icoPath = Join-Path $dir "icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONHEADER (6 bytes)
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type 1 = Icon
$bw.Write([uint16]1) # Count = 1 image

# ICONDIRENTRY (16 bytes)
$bw.Write([byte]0)   # Width 0 = 256
$bw.Write([byte]0)   # Height 0 = 256
$bw.Write([byte]0)   # Colors
$bw.Write([byte]0)   # Reserved
$bw.Write([uint16]1) # Color planes
$bw.Write([uint16]32)# Bits per pixel
$bw.Write([uint32]$pngBytes.Length) # Image size in bytes
$bw.Write([uint32]22)# Offset to image data (6 + 16 = 22)

# Image Data
$bw.Write($pngBytes)
$bw.Flush()
$fs.Close()

Write-Output "Saved ICO: $icoPath ($($pngBytes.Length + 22) bytes)"
$g.Dispose()
$bmp.Dispose()

