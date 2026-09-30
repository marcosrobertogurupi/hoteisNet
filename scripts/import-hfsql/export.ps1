<#
  Exporta tabelas do HFSQL (WinDev) para JSON, SOMENTE LEITURA, via ODBC (DSN "HoteisNetLegado").

  Uso:  powershell -File scripts/import-hfsql/export.ps1 -OutDir <pasta fora do repositório>

  Por que existe:
  - O Node não fala ODBC sem módulo nativo; então extraímos para JSON e o importador TypeScript
    (import.ts) grava via Prisma.
  - O driver HFSQL estoura ("Operação aritmética resultou em um estouro") ao ler colunas de ID
    (inteiro de 8 bytes). Contorno: essas colunas — reportadas com tipo desconhecido — são lidas
    com CAST(coluna AS VARCHAR) e viram texto no JSON.
  - O JSON contém dados pessoais de hóspedes: NUNCA gravar dentro do repositório.
#>
param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Dsn = "HoteisNetLegado",
  [string[]]$Tables
)

$ErrorActionPreference = "Stop"

$AllTables = @(
  "Hotel", "FormaPagt", "PLContas", "TarifasNet", "CidadesNet", "Paises", "NCM",
  "CategoriaApto", "LocalApto", "CaractApto", "AptoCaract", "Apartamentos",
  "Grupos", "SubGrupo", "TipoProduto", "Unidade", "Produtos", "ProdCodBarras", "ProdFoto",
  "Empresas", "EmpTelefones", "EmailEmp", "SocioEmp",
  "HospedeNet", "TelefonesHospede", "EmailHospedeNet", "HospedeEmpresa", "HospedeNetMov", "Veiculos",
  "HospedagemNet", "HospedagemDetalhes", "HospedagemDmsHosp", "HospedagemObs", "HospedagemOutDeb",
  "HospedagemPagto", "HospedagemTarifa", "HospOcorrencia", "OcorrenciaNet",
  "ReservasDatas", "ReservaAdiantamentos",
  "Caixa", "Caixa_Itens", "ConsumoNet", "ConsumoNetItens", "ConsumoNetPagto", "ReceberNet", "RecLancto",
  "Colaborador", "Turnos", "Acesso"
)
if ($Tables) { $AllTables = $Tables }

# Colunas binárias (fotos/bandeiras) e credenciais (senha, digital) — NUNCA exportadas.
# Acesso só entra para resolver o NOME de quem fez cada lançamento; usuários não são importados.
$Blobs = @("Hos_Foto", "Pai_Bandeira", "Col_Foto", "Ace_Senha", "Ace_Digital", "Ace_Foto")

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$conn = New-Object System.Data.Odbc.OdbcConnection("DSN=$Dsn")
$conn.Open()

function ConvertTo-Cell($v) {
  if ($v -is [System.DBNull] -or $null -eq $v) { return $null }
  if ($v -is [datetime]) { if ($v.Year -le 1) { return $null }; return $v.ToString("yyyy-MM-ddTHH:mm:ss") }
  if ($v -is [timespan]) { return $v.ToString("hh\:mm\:ss") }
  if ($v -is [string]) { $t = $v.TrimEnd(); if ($t -eq "") { return $null }; return $t }
  return $v
}

$summary = @()
foreach ($t in $AllTables) {
  # 1) descobre nomes/tipos das colunas (sem ler nenhuma linha)
  $cmd = $conn.CreateCommand(); $cmd.CommandText = "SELECT * FROM $t"
  $r = $cmd.ExecuteReader()
  $cols = @()
  for ($i = 0; $i -lt $r.FieldCount; $i++) {
    $ty = "?"; try { $ty = $r.GetFieldType($i).Name } catch {}
    $cols += [pscustomobject]@{ Name = $r.GetName($i); Type = $ty }
  }
  $r.Close()

  # 2) monta o SELECT com CAST nas colunas de tipo desconhecido
  $sel = @()
  foreach ($c in $cols) {
    if ($Blobs -contains $c.Name) { continue }
    if ($c.Type -eq "?") { $sel += "CAST($($c.Name) AS VARCHAR(40)) AS $($c.Name)" } else { $sel += $c.Name }
  }
  $cmd = $conn.CreateCommand(); $cmd.CommandText = "SELECT $($sel -join ', ') FROM $t"
  $r = $cmd.ExecuteReader()
  $rows = New-Object System.Collections.Generic.List[object]
  while ($r.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) { $o[$r.GetName($i)] = ConvertTo-Cell $r.GetValue($i) }
    $rows.Add($o)
  }
  $r.Close()

  $json = ConvertTo-Json -InputObject $rows.ToArray() -Depth 4 -Compress
  if ($rows.Count -eq 0) { $json = "[]" }
  [System.IO.File]::WriteAllText((Join-Path $OutDir "$t.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
  $summary += "{0,-22} {1,8} linhas" -f $t, $rows.Count
  Write-Host $summary[-1]
}
$conn.Close()
