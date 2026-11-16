param(
    [string]$ThemeName
)

$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Creates new files in the themes directory and optionally adds import/import@ statements.
    
.DESCRIPTION
    This script allows users to create multiple files in specified theme subdirectories.
    For CSS files, it adds @import statements to the theme's main.css.
    For TypeScript files, it adds import statements to the theme's main.ts.
    
.PARAMETER ThemeName
    Optional. The name of the theme (e.g., 'pentadeep-one'). If provided, the user only needs
    to enter the subdirectory path. If not provided, the full path is required.
    
.EXAMPLE
    .\new-file.ps1
    .\new-file.ps1 -ThemeName 'pentadeep-one'
#>

function Get-ProjectRoot {
    <#
    .SYNOPSIS
        Gets the project root directory (2 levels up from script location)
    #>
    $projectRoot = (Get-Location).Path  # the theme repo: run from its root
    return $projectRoot
}

function Get-ThemeName {
    <#
    .SYNOPSIS
        Extracts theme name from file path
    #>
    param(
        [string]$FilePath
    )
    $parts = $FilePath -split '[/\\]'
    return $parts[0]
}

function Add-ImportStatement {
    <#
    .SYNOPSIS
      Adds import/import@ statement to main.css or main.ts
    #>
    param(
      [string]$MainFilePath,
      [string]$NewFilePath,
      [string]$FileExtension
    )
    
    if (-not (Test-Path $MainFilePath)) {
      Write-Warning "Main file not found at $MainFilePath"
      return
    }
    
    # Normalize the new file path for the import statement
    $importPath = $NewFilePath -replace '^([^/]*/){3}'
    
    if ($FileExtension -eq '.css') {
      $importStatement = "@import '@css/$importPath';"
    }
    elseif ($FileExtension -eq '.ts') {
      $importStatement = "import '@ts/$importPath';"
    }
    else {
      return
    }
    
    # Check if import already exists to avoid duplicates
    $fileContent = Get-Content $MainFilePath -Raw
    if ($fileContent -contains $importStatement) {
      Write-Host "Import statement already exists in $(Split-Path -Leaf $MainFilePath)"
      return
    }

    if($fileContnet -and -not $fileContent.EndsWith('`n')) {
      $importStatement = "`n" + $importStatement
    }
    
    # Append import statement to the main file
    $importStatement | Out-File -FilePath $MainFilePath -Encoding UTF8 -Append
    Write-Host "✓ Added $($FileExtension -replace '^\.') import to $(Split-Path -Leaf $MainFilePath)"
}

function New-ThemeFile {
    <#
    .SYNOPSIS
        Creates a new file in the theme directory
    #>
    param(
        [string]$FileName,
        [string]$FilePath,
        [string]$ProjectRoot
    )
    
    # Get theme name and validate
    $themeName = Get-ThemeName -FilePath $FilePath
    $fullPath = Join-Path $ProjectRoot $FilePath
    $fullFilePath = Join-Path $fullPath $FileName
    
    # Create directory structure if it doesn't exist
    $directory = Split-Path -Parent $fullFilePath
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        Write-Host "✓ Created directory: $directory"
    }
    
    # Check if file already exists
    if (Test-Path $fullFilePath) {
        Write-Warning "File already exists: $fullFilePath"
        return $false
    }
    
    # Create the file with basic template content based on file type
    $fileExtension = [System.IO.Path]::GetExtension($FileName)
    
    # Create the file
    New-Item -ItemType File -Path $fullFilePath -Force | Out-Null
    Write-Host "✓ Created file: $fullFilePath"
    
    # Handle import statements for CSS and TS files
    if ($fileExtension -eq '.css' -or $fileExtension -eq '.ts' -or $fileExtension -eq '.js') {
        $mainFileName = if ($fileExtension -eq '.css') { 'main.css' } elseif ($fileExtension -eq '.ts') { 'main.ts' } else { 'main.js' }
        $srcFolder = if ($fileExtension -eq '.css') { 'css' } elseif ($fileExtension -eq '.ts') { 'ts '} else { 'js' }
        $mainFilePath = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $ProjectRoot "themes") $themeName) "src") $srcFolder) $mainFileName
        
        if (Test-Path $mainFilePath) {
            # Create relative path for import statement
            $relativePath = $FilePath.Replace('\', '/').TrimEnd('/') + '/' + $FileName
            
            Add-ImportStatement -MainFilePath $mainFilePath -NewFilePath $relativePath -FileExtension $fileExtension
        }
        else {
            Write-Warning "Main $mainFileName not found for theme '$themeName'. Import statement not added."
        }
    }
    
    return $true
}

function Show-Menu {
  <#
  .SYNOPSIS
      Displays the main menu and processes user input
  .PARAMETER ThemeName
      Optional. The theme name to use (auto-populated from parameter)
  #>
  param(
    [string]$ThemeName
  )
  
  $projectRoot = Get-ProjectRoot
  $fileQueue = @()
  
  Write-Host "`n=== Theme File Creator ===" -ForegroundColor Cyan
  if ($ThemeName) {
    Write-Host "Theme: $ThemeName`n" -ForegroundColor Green
  }
  
  do {
    Write-Host "File #$($fileQueue.Count + 1):" -ForegroundColor Yellow
    
    # ===== LOOP 1: Get and validate file name =====
    do {
      $fileName = Read-Host "Enter file name (e.g., filename.php)"
      
      if ([string]::IsNullOrWhiteSpace($fileName)) {
        Write-Host "File name cannot be empty. Please try again.`n" -ForegroundColor Red
        continue
      }
      break
    } while ($true)
    
    # ===== LOOP 2: Get and validate file path + theme =====
    do {
      if ($ThemeName) {
        $prompt = "Enter file path relative to theme (e.g., wp/patterns)"
      }
      else {
        $prompt = "Enter file path relative to theme (e.g., themename/wp/patterns)"
      }
      
      $userPath = Read-Host $prompt
      
      # Validate path is not empty
      if ([string]::IsNullOrWhiteSpace($userPath)) {
        Write-Host "File path cannot be empty. Please try again.`n" -ForegroundColor Red
        continue
      }
      
      # Build full file path (with or without provided theme name)
      if ($ThemeName) {
        $filePath = $userPath
        $extractedThemeName = $ThemeName
      }
      else {
        $filePath = $userPath
        $extractedThemeName = Split-Path -Leaf $projectRoot
      }
      
      # Validate theme exists
      $themeRoot = $projectRoot
      if (-not (Test-Path $themeRoot)) {
        Write-Host "Theme '$extractedThemeName' not found. Please check your path and try again.`n" -ForegroundColor Red
        continue
      }
      
      break
    } while ($true)
    
    # Add to queue
    $fileQueue += @{ FileName = $fileName; FilePath = $filePath }
    Write-Host "✓ File added to queue`n" -ForegroundColor Green
    
    # Ask if user wants to add another file (with validation)
    do {
      $addAnother = Read-Host "Add another file? (Y/N)"
      
      if ($addAnother -match '^[YyNn]$') {
        break
      }
      
      Write-Host "Invalid input. Please enter Y or N.`n" -ForegroundColor Red
    } while ($true)
    
    if ($addAnother -notmatch '^[Yy]') {
      break
    }
    Write-Host ""
  } while ($true)
  
  # Process all files
  if ($fileQueue.Count -gt 0) {
    Write-Host "`n=== Creating Files ===" -ForegroundColor Cyan
    foreach ($file in $fileQueue) {
      $success = New-ThemeFile -FileName $file.FileName -FilePath $file.FilePath -ProjectRoot $projectRoot
      if ($success) {
        Write-Host ""
      }
    }
    Write-Host "✓ All files created successfully!`n" -ForegroundColor Green
  }
  else {
    Write-Host "No files were created.`n" -ForegroundColor Yellow
  }
}

# Run the script
Show-Menu -ThemeName $ThemeName
