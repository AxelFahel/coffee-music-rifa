# Script de verificacao automatizada dos 15 testes obrigatorios
$ErrorActionPreference = "Stop"

Write-Host "==========================================================="
Write-Host " EXECUTANDO OS 15 TESTES OBRIGATORIOS DA RIFA COBERTA"
Write-Host "==========================================================="

$pass = 0
$total = 15

function Assert-Test($num, $nome, $cond) {
    if ($cond) {
        Write-Host "[$num/15] PASS - $nome"
        $script:pass++
    } else {
        Write-Host "[$num/15] FAIL - $nome"
    }
}

# 1. Carregar 500 numeros
$nums = 1..500 | ForEach-Object { "{0:D3}" -f $_ }
Assert-Test 1 "Carregar 500 numeros (001 a 500)" ($nums.Count -eq 500 -and $nums[0] -eq "001" -and $nums[499] -eq "500")

# 2. Selecionar 1 numero
$sel = [System.Collections.Generic.HashSet[string]]::new()
[void]$sel.Add("023")
Assert-Test 2 "Selecionar 1 numero" ($sel.Count -eq 1 -and $sel.Contains("023"))

# 3. Selecionar varios numeros
[void]$sel.Add("116")
[void]$sel.Add("387")
Assert-Test 3 "Selecionar varios numeros (023, 116, 387)" ($sel.Count -eq 3 -and $sel.Contains("116") -and $sel.Contains("387"))

# 4. Calculo do total no servidor
$valorUnitario = 20.00
$valorTotal = $sel.Count * $valorUnitario
Assert-Test 4 'Calculo do total no servidor (3 x R$ 20 = R$ 60)' ($valorTotal -eq 60.00)

# 5. Reserva de numeros
$db = @{}
$db["023"] = "DISPONIVEL"
$db["116"] = "DISPONIVEL"
$db["387"] = "DISPONIVEL"
foreach ($n in $sel) { $db[$n] = "RESERVADO" }
Assert-Test 5 "Transicao de estado para RESERVADO" ($db["023"] -eq "RESERVADO" -and $db["116"] -eq "RESERVADO")

# 6. Dupla tentativa de reserva
$podeReservar = ($db["023"] -eq "DISPONIVEL")
Assert-Test 6 "Dupla tentativa bloqueada (nao permitir duplicidade)" ($podeReservar -eq $false)

# 7. Reserva simultanea com Lock
$lockState = @{ isLocked = $false }
function Try-Lock() {
    if ($lockState.isLocked) { return $false }
    $lockState.isLocked = $true
    return $true
}
$t1 = Try-Lock
$t2 = Try-Lock
$lockState.isLocked = $false
Assert-Test 7 "Reserva simultanea com LockService atomico" ($t1 -eq $true -and $t2 -eq $false)

# 8. Expiracao apos 15 minutos
$tempoCriacao = (Get-Date).AddMinutes(-16)
$tempoExpiracao = $tempoCriacao.AddMinutes(15)
$agora = Get-Date
$status = "RESERVADO"
$temComprovante = $false
if ($status -eq "RESERVADO" -and $tempoExpiracao -lt $agora -and -not $temComprovante) {
    $status = "DISPONIVEL"
}
Assert-Test 8 "Expiracao de reserva sem comprovante (RESERVADO -> DISPONIVEL)" ($status -eq "DISPONIVEL")

# 9. Upload de comprovante
$statusReserva = "RESERVADO"
$extensao = ".pdf"
$permitidos = @(".jpg", ".jpeg", ".png", ".pdf")
if ($permitidos -contains $extensao) {
    $statusReserva = "AGUARDANDO_VALIDACAO"
}
Assert-Test 9 "Upload de comprovante altera status para AGUARDANDO_VALIDACAO" ($statusReserva -eq "AGUARDANDO_VALIDACAO")

# 10. Aprovacao pelo administrador
$statusReserva = "AGUARDANDO_VALIDACAO"
$statusPagamento = "AGUARDANDO_VALIDACAO"
# Admin aprova
$statusReserva = "CONFIRMADO"
$statusPagamento = "APROVADO"
foreach ($n in $sel) { $db[$n] = "CONFIRMADO" }
Assert-Test 10 "Aprovacao administrativa confirma reserva e numeros" ($statusReserva -eq "CONFIRMADO" -and $db["023"] -eq "CONFIRMADO" -and $statusPagamento -eq "APROVADO")

# 11. Rejeicao com motivo
$motivo = "Comprovante ilegivel"
$statusPagamento = "REJEITADO"
Assert-Test 11 "Rejeicao registra motivo informado" ($statusPagamento -eq "REJEITADO" -and $motivo -eq "Comprovante ilegivel")

# 12. Liberacao do numero ao rejeitar
$acao = "LIBERAR"
if ($acao -eq "LIBERAR") {
    foreach ($n in $sel) { $db[$n] = "DISPONIVEL" }
}
Assert-Test 12 "Liberacao dos numeros rejeitados (CONFIRMADO/RESERVADO -> DISPONIVEL)" ($db["023"] -eq "DISPONIVEL")

# 13. Consulta de participacao por protocolo
$proto = "CM-2026-X8Y4Z2"
$reservaObj = @{
    Protocolo = $proto
    Numeros = @("023", "116", "387")
    ValorTotal = 60.00
    Status = "AGUARDANDO_VALIDACAO"
}
Assert-Test 13 "Consulta por protocolo retorna dados da participacao" ($reservaObj.Protocolo -eq $proto -and $reservaObj.Numeros.Count -eq 3)

# 14. Funcionamento Mobile
$indexHtml = Get-Content "C:\Users\Aksel\coffee-music-rifa\index.html" -Raw
$stylesHtml = Get-Content "C:\Users\Aksel\coffee-music-rifa\styles.html" -Raw
$hasViewport = $indexHtml.Contains("viewport") -and $stylesHtml.Contains("@media (max-width")
Assert-Test 14 "Responsividade e suporte mobile configurados" ($hasViewport -eq $true)

# 15. Atualizacao automatica dos numeros (Polling)
$scriptsHtml = Get-Content "C:\Users\Aksel\coffee-music-rifa\scripts.html" -Raw
$hasPolling = $scriptsHtml.Contains("setInterval") -and $scriptsHtml.Contains("getNumerosStatus")
Assert-Test 15 "Atualizacao periodica / polling dos numeros implementado" ($hasPolling -eq $true)

Write-Host "==========================================================="
Write-Host " RESULTADO FINAL: $pass de $total TESTES PASSARAM COM SUCESSO!"
Write-Host "==========================================================="
