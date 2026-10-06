# Sistema de Ação entre Amigos - Coffee Music Cafeteria ☕🌴

> **Campanha:** AÇÃO ENTRE AMIGOS  
> **Prêmio:** Final de semana em uma linda casa de praia em Beberibe/CE  
> **Pontos:** 500 números (001 a 500)  
> **Valor por Ponto:** R$ 20,00  
> **Tecnologia:** Google Apps Script Web App + Google Sheets + Google Drive (100% gratuito no ecossistema Google)

---

## 📁 Estrutura dos Arquivos do Projeto

| Arquivo | Função / Responsabilidade |
| :--- | :--- |
| **`appsscript.json`** | Manifesto do Apps Script com fuso de Fortaleza/CE e permissões de Web App |
| **`Code.gs`** | Ponto de entrada HTTP (`doGet`), roteamento (`index` e `admin`), helper `include_` e rotina `setupSistema()` |
| **`Config.gs`** | Configurações centrais, preços, chaves PIX, tempos de reserva e leitura dinâmica |
| **`Database.gs`** | Gerenciamento das abas do Google Sheets (`NUMEROS`, `PARTICIPANTES`, `RESERVAS`, `PAGAMENTOS`, `CONFIGURACOES`, `LOGS`) |
| **`Utils.gs`** | Formatação de moeda BRL, protocolos únicos (`CM-2026-XXXXXX`), gerador oficial de PIX Copia e Cola / QR Code com CRC16 |
| **`RifaService.gs`** | Consultas públicas dos números, status em tempo real e consulta de protocolo |
| **`ReservaService.gs`** | Reserva serializada com `LockService`, controle de concorrência e rotina periódica `liberarReservasExpiradas_()` |
| **`UploadService.gs`** | Upload seguro de comprovantes para o Google Drive em pasta organizada (`Coffee Music - Rifa Coberta / Comprovantes`) |
| **`PagamentoService.gs`** | Validação do envio de comprovante e transição para `AGUARDANDO_VALIDACAO` |
| **`Security.gs`** | Autenticação, sessões, limites de uso e migração de segurança |
| **`AdminService.gs`** | Dashboard administrativo com métricas financeiras, aprovação e rejeição com liberação de números |
| **`index.html`** | Página pública responsiva com identidade visual de cafeteria e praia (Beberibe/CE) |
| **`styles.html`** | Estilos CSS modernos (CSS Variables, Flexbox, Grid, animações, acessibilidade) |
| **`scripts.html`** | Lógica JavaScript do frontend público com polling a cada 12s, contador de 15 min e upload em Base64 |
| **`admin.html`** | Interface visual do painel administrativo |
| **`admin-scripts.html`** | Controle interativo do painel administrativo via `google.script.run` |
| **`local-preview.html`** | Simulador completo e independente para testar o sistema no navegador antes do deploy |

---

## 🚀 Como Publicar no Google Apps Script (Passo a Passo)

### Passo 1: Criar o Projeto no Google Apps Script
1. Acesse **[script.google.com](https://script.google.com)** com sua conta Google.
2. Clique em **+ Novo projeto**.
3. Renomeie o projeto no topo de `Projeto sem título` para:  
   `Coffee Music - Rifa Coberta`.

### Passo 2: Copiar os Arquivos
No editor do Google Apps Script:
1. **Arquivos `.gs`:**
   - Abra o `Código.gs` existente e cole o conteúdo de `Code.gs`.
   - Clique no ícone `+` ao lado de *Arquivos* > selecione **Script** e crie os arquivos:
     - `Config` (cole `Config.gs`)
     - `Database` (cole `Database.gs`)
     - `Utils` (cole `Utils.gs`)
     - `RifaService` (cole `RifaService.gs`)
     - `ReservaService` (cole `ReservaService.gs`)
     - `UploadService` (cole `UploadService.gs`)
     - `PagamentoService` (cole `PagamentoService.gs`)
     - `AdminService` (cole `AdminService.gs`)
     - `Security` (cole `Security.gs`)

2. **Arquivos `.html`:**
   - Clique no ícone `+` > selecione **HTML** e crie:
     - `index` (cole `index.html`)
     - `styles` (cole `styles.html`)
     - `scripts` (cole `scripts.html`)
     - `admin` (cole `admin.html`)
     - `admin-scripts` (cole `admin-scripts.html`)

3. **Manifesto `appsscript.json` (opcional / recomendado):**
   - Vá em **Configurações do Projeto** (ícone de engrenagem à esquerda).
   - Marque a opção: *Mostrar arquivo de manifesto "appsscript.json" no editor*.
   - Volte ao editor e cole o conteúdo de `appsscript.json`.

---

### Passo 3: Executar a Configuração Inicial Automática (`setupSistema`)
1. No menu superior do editor, na caixa de seleção de funções, escolha:  
   **`setupSistema`**
2. Clique no botão **Executar**.
3. O Google exibirá a tela de **Autorização necessária**:
   - Clique em **Revisar permissões**.
   - Escolha sua conta Google.
   - Clique em **Avançado** > **Acessar Coffee Music - Rifa Coberta (não seguro)**.
   - Clique em **Permitir**.
4. A função `setupSistema()` irá:
   - Criar automaticamente a Planilha Google estruturada com as 6 abas (`NUMEROS`, `PARTICIPANTES`, `RESERVAS`, `PAGAMENTOS`, `CONFIGURACOES`, `LOGS`).
   - Preencher os **500 números de 001 a 500**.
   - Criar no seu Google Drive a pasta `Coffee Music - Rifa Coberta / Comprovantes`.
   - Instalar o **Trigger automático** para liberar reservas expiradas a cada minuto.
5. Verifique o **Registro de Execução** (Log) para obter a URL da sua planilha criada.

---

Antes de publicar, execute `configurarSeguranca` no arquivo `Security.gs`, com a conta proprietária. Consulte [o guia de atualização](ATUALIZACAO-SEGURANCA.md).

### Passo 4: Fazer o Deploy como Web App
1. No canto superior direito, clique em **Implantar** > **Nova implantação**.
2. Clique na engrenagem ao lado de "Selecionar tipo" e escolha **App da Web**.
3. Preencha as opções:
   - **Descrição:** `Versão 1.0 - Ação entre Amigos`
   - **Executar como:** `Eu (<seu-email>)`
   - **Quem pode acessar:** `Qualquer pessoa` (Any)
4. Clique em **Implantar**.
5. Copie a **URL do app da Web** gerada (exemplo: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## 🌐 URLs de Acesso

- **Página Pública dos Clientes:**  
  `https://script.google.com/macros/s/.../exec`
  
- **Painel Administrativo:**  
  `https://script.google.com/macros/s/.../exec?pagina=admin`  
  **Acesso:** conta Google proprietária ou senha exclusiva configurada. O PIN antigo foi removido. Veja [ATUALIZACAO-SEGURANCA.md](ATUALIZACAO-SEGURANCA.md).

---

## 🔒 Segurança e Concorrência

1. **LockService:** Impede reservas duplicadas mesmo que dezenas de usuários cliquem no mesmo número no mesmo milissegundo.
2. **Cálculo no Servidor:** O frontend nunca define o valor total; o backend recalcula rigorosamente `quantidade * VALOR_NUMERO`.
3. **Reserva Temporária de 15 Minutos:** Registrada com timestamp UTC/Fortaleza.
4. **Trigger de Expiração:** Executa a cada minuto liberando apenas números cujo status ainda seja `RESERVADO` e sem comprovante enviado.
5. **Proteção de Comprovante:** Assim que o cliente envia o comprovante, o status transita para `AGUARDANDO_VALIDACAO`, blindando os números contra expiração automática.

