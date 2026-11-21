param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$OutWav,
  [int]$Rate = 0
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = $Rate
$synth.Volume = 100

# Prefer a clear English voice if available
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$preferred = $voices | Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
if ($preferred) { $synth.SelectVoice($preferred.Name) }

$dir = Split-Path -Parent $OutWav
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$synth.SetOutputToWaveFile($OutWav)
$synth.Speak($Text)
$synth.Dispose()
Write-Output $OutWav
