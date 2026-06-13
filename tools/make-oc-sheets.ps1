# Generates Minifolk-style 192x64 sprite sheets (row 0: idle x4, row 1: walk x6)
# for Mark's OCs from pixel grids. Run: powershell -File make-oc-sheets.ps1
# v2: smaller bodies (Minifolk scale) + 1x2 vertical-line eyes on everyone.
Add-Type -AssemblyName System.Drawing

function New-Sheet {
  param($grids, $pal, $outPath)
  $fw = 32; $fh = 32
  $bmp = New-Object System.Drawing.Bitmap(192, 64, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $cells = @()
  # row 0: idle = stand, stand+bob, stand, stand+bob
  $cells += ,@($grids.stand, 0, 0, 0)
  $cells += ,@($grids.stand, 1, 0, 1)
  $cells += ,@($grids.stand, 2, 0, 0)
  $cells += ,@($grids.stand, 3, 0, 1)
  # row 1: walk = A, stand+bob, B, stand+bob, A, B  (legs alternate, body bobs)
  $cells += ,@($grids.stepA, 0, 1, 0)
  $cells += ,@($grids.stand, 1, 1, 1)
  $cells += ,@($grids.stepB, 2, 1, 0)
  $cells += ,@($grids.stand, 3, 1, 1)
  $cells += ,@($grids.stepA, 4, 1, 1)
  $cells += ,@($grids.stepB, 5, 1, 0)
  foreach ($cell in $cells) {
    $grid = $cell[0]; $cx = $cell[1] * $fw; $cy = $cell[2] * $fh; $bob = $cell[3]
    $rows = $grid -split "`n" | Where-Object { $_ -ne '' }
    $gh = $rows.Count
    $gw = ($rows | Measure-Object -Maximum Length).Maximum
    $ox = [Math]::Floor((32 - $gw) / 2)
    $oy = 30 - $gh + $bob   # feet land on frame row 29 (foot anchor 30)
    for ($y = 0; $y -lt $gh; $y++) {
      $line = $rows[$y]
      for ($x = 0; $x -lt $line.Length; $x++) {
        $ch = $line[$x].ToString()
        if ($ch -eq '.') { continue }
        if (-not $pal.ContainsKey($ch)) { continue }
        $px = $cx + $ox + $x; $py = $cy + $oy + $y
        if ($px -ge $cx -and $px -lt ($cx + 32) -and $py -ge $cy -and $py -lt ($cy + 32)) {
          $bmp.SetPixel($px, $py, $pal[$ch])
        }
      }
    }
  }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $outPath"
}

function C($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function NewPal($pairs) {
  # hashtable literals are case-INSENSITIVE in PowerShell — palettes need 'H' vs 'h'
  $d = New-Object 'System.Collections.Generic.Dictionary[string,System.Drawing.Color]' ([System.StringComparer]::Ordinal)
  for ($i = 0; $i -lt $pairs.Count; $i += 2) { $d[$pairs[$i]] = C $pairs[$i + 1] }
  return $d
}

# ============ AVERIS — deadpan devil-boy: dark curls, red horns (gold band),
# ============ black coat w/ gold trim, red vest, red gloves, black boots
$avPal = NewPal @(
  'k','#1a1014', 'H','#2e2228', 'h','#453640',
  'R','#8e2f3a', 'r','#6a212c', 'G','#d9a441',
  'S','#d8a98a', 's','#b87f63', 'e','#a83232', 'x','#6e1d26',
  'Q','#26202a', 'q','#3a3340',
  'V','#a8323a', 'v','#7e242c', 'T','#16121a',
  'P','#4a3f44', 'p','#382f33', 'B','#16121a', 'g','#a8323a'
)
$avStand = @"
.....kkkkkk.....
...kkHHHHHHkk...
..kHHHHHHHHHHk..
.kRkHHhHHhHHkRk.
kRGkHHHHHHHHkRRk
.kkHHHHHHHHHHkk.
..kHSSSSSSSSHk..
..kSSSeSSeSSSk..
..kSSSxSSxSSSk..
..kSSSssSSSSk...
...kkkkkkkkkk...
...kQkVVVVkQk...
..kQQkVTTVkQQk..
..kGQkVVVVkQGk..
..kgkkRGRRkkgk..
....kPPPPPPk....
....kPPkkPPk....
...kBBk..kBBk...
...kkk....kkk...
"@
$avStepA = @"
.....kkkkkk.....
...kkHHHHHHkk...
..kHHHHHHHHHHk..
.kRkHHhHHhHHkRk.
kRGkHHHHHHHHkRRk
.kkHHHHHHHHHHkk.
..kHSSSSSSSSHk..
..kSSSeSSeSSSk..
..kSSSxSSxSSSk..
..kSSSssSSSSk...
...kkkkkkkkkk...
...kQkVVVVkQk...
..kQQkVTTVkQQk..
..kGQkVVVVkQGk..
..kgkkRGRRkkgk..
....kPPPPPPk....
...kPPk..kPPk...
..kBBk....kBBk..
..kkk......kkk..
"@
$avStepB = @"
.....kkkkkk.....
...kkHHHHHHkk...
..kHHHHHHHHHHk..
.kRkHHhHHhHHkRk.
kRGkHHHHHHHHkRRk
.kkHHHHHHHHHHkk.
..kHSSSSSSSSHk..
..kSSSeSSeSSSk..
..kSSSxSSxSSSk..
..kSSSssSSSSk...
...kkkkkkkkkk...
...kQkVVVVkQk...
..kQQkVTTVkQQk..
..kGQkVVVVkQGk..
..kgkkRGRRkkgk..
....kPPPPPPk....
.....kPPPPk.....
....kBBBBk......
....kkkkk.......
"@
New-Sheet -grids @{ stand = $avStand; stepA = $avStepA; stepB = $avStepB } -pal $avPal -outPath 'C:\Users\spenc\Desktop\aiagents\assets\mini\AverisOC.png'

# ============ SUNI — the little sunbeam: golden waves, golden line-eyes,
# ============ cream dress with gold belt, white cape and boots
$suPal = NewPal @(
  'k','#3a2e1a', 'Y','#e8c878', 'y','#caa45c', 'o','#f4dfa4',
  'S','#f6e3cd', 's','#e3bf9d', 'e','#d9912b', 'x','#a86415',
  'D','#f2e8d8', 'd','#d9c8ae', 'G','#d9a441',
  'W','#fffaf0', 'B','#efe7d8'
)
$suStand = @"
....kkkkkkk....
..kkYYYYYYYkk..
.kYoYYYYYoYYk..
.kYYYYYYYYYYYk.
.kYSSSSSSSSYk..
.kYSSeSSeSSYk..
.kYSSxSSxSSYk..
.kYSSSssSSSYk..
.kYYkSSSSkYYk..
.kYYYkkkkYYYk..
.kYkWWWWWWkYk..
.kYkDDGGDDkYk..
.kykDDDDDDkyk..
..kDDDDDDDDk...
..kDdDDDDdDk...
.kddddddddddk..
...kBBk.kBBk...
...kkk...kkk...
"@
$suStepA = @"
....kkkkkkk....
..kkYYYYYYYkk..
.kYoYYYYYoYYk..
.kYYYYYYYYYYYk.
.kYSSSSSSSSYk..
.kYSSeSSeSSYk..
.kYSSxSSxSSYk..
.kYSSSssSSSYk..
.kYYkSSSSkYYk..
.kYYYkkkkYYYk..
.kYkWWWWWWkYk..
.kYkDDGGDDkYk..
.kykDDDDDDkyk..
..kDDDDDDDDk...
..kDdDDDDdDk...
.kddddddddddk..
..kBBk...kBBk..
..kkk.....kkk..
"@
$suStepB = @"
....kkkkkkk....
..kkYYYYYYYkk..
.kYoYYYYYoYYk..
.kYYYYYYYYYYYk.
.kYSSSSSSSSYk..
.kYSSeSSeSSYk..
.kYSSxSSxSSYk..
.kYSSSssSSSYk..
.kYYkSSSSkYYk..
.kYYYkkkkYYYk..
.kYkWWWWWWkYk..
.kYkDDGGDDkYk..
.kykDDDDDDkyk..
..kDDDDDDDDk...
..kDdDDDDdDk...
.kddddddddddk..
....kBBBBk.....
....kkkkk......
"@
New-Sheet -grids @{ stand = $suStand; stepA = $suStepA; stepB = $suStepB } -pal $suPal -outPath 'C:\Users\spenc\Desktop\aiagents\assets\mini\SuniOC.png'

# ============ YENNA — punk wolf girl: dark wild mane + ears, amber line-eyes,
# ============ fang, black jacket w/ grey fur collar, ripped jeans, chunky
# ============ boots — and one ENORMOUS fluffy tail (light tip)
$yePal = NewPal @(
  'k','#14100e', 'M','#332620', 'm','#4a3a30',
  'S','#d8a87e', 's','#b8855c', 'e','#e88a2b', 'x','#a85a1d', 'w','#f6f2ea',
  'J','#1d1a1f', 'j','#322d38', 'F','#8a8076', 'f','#a89e90',
  'T','#8e8a84', 't','#26222b',
  'P','#23202a', 'p','#3a3540', 'B','#16121a', 'C','#7a7a82',
  'Q','#3a2c22', 'q','#553f2e', 'L','#c9a87e', 'u','#7e4a38'
)
$yeStand = @"
.kk......kk..........
kMMk....kMMk.........
kMmMkkkkMmMk.........
kMMMMMMMMMMk....kkk..
kMmSSSSSSmMk...kLLLk.
kMmSeSSSeSmMk..kLLqk.
kMmSxSSSxSmMk..kqQQk.
kMmSSwSSSSmMk..kQQqk.
.kMSSSSSSMMk..kQQQk..
.kMMkkkkkMMk..kQQqk..
.kMkFfFfFkMk..kQQQk..
.kJkFTTtFkJkkkQQqk...
.kJjkTTTkjJkkQQQk....
..kkkPCPPkkkkQQqk....
....kPpPpPkkQQk......
....kPSpPSk.kQk......
....kPpPPpk.kk.......
....kBBkBBk..........
....kBBkBBk..........
....kkk.kkk..........
"@
$yeStepA = @"
.kk......kk..........
kMMk....kMMk.........
kMmMkkkkMmMk.........
kMMMMMMMMMMk....kkk..
kMmSSSSSSmMk...kLLLk.
kMmSeSSSeSmMk..kLLqk.
kMmSxSSSxSmMk..kqQQk.
kMmSSwSSSSmMk..kQQqk.
.kMSSSSSSMMk..kQQQk..
.kMMkkkkkMMk..kQQqk..
.kMkFfFfFkMk..kQQQk..
.kJkFTTtFkJkkkQQqk...
.kJjkTTTkjJkkQQQk....
..kkkPCPPkkkkQQqk....
....kPpPpPkkQQk......
...kPSpkPSk.kQk......
...kPpk.kPpk.kk......
..kBBk...kBBk........
..kkk.....kkk........
"@
$yeStepB = @"
.kk......kk..........
kMMk....kMMk.........
kMmMkkkkMmMk.........
kMMMMMMMMMMk....kkk..
kMmSSSSSSmMk...kLLLk.
kMmSeSSSeSmMk..kLLqk.
kMmSxSSSxSmMk..kqQQk.
kMmSSwSSSSmMk..kQQqk.
.kMSSSSSSMMk..kQQQk..
.kMMkkkkkMMk..kQQqk..
.kMkFfFfFkMk..kQQQk..
.kJkFTTtFkJkkkQQqk...
.kJjkTTTkjJkkQQQk....
..kkkPCPPkkkkQQqk....
....kPpPpPkkQQk......
....kPSpPSk.kQk......
.....kPpPpk.kk.......
.....kBBBBk..........
.....kkkkk...........
"@
New-Sheet -grids @{ stand = $yeStand; stepA = $yeStepA; stepB = $yeStepB } -pal $yePal -outPath 'C:\Users\spenc\Desktop\aiagents\assets\mini\YennaOC.png'
