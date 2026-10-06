# Atualização de segurança — 05/10/2026

## Instalação no projeto existente

1. Atualize **todos** os arquivos `.gs` e os quatro HTML `index`, `admin`, `scripts` e `admin-scripts` juntos. Adicione o novo arquivo de script `Security`. Preserve `styles.html` e o manifesto atual.
2. Salve o projeto. No arquivo `Security.gs`, selecione **configurarSeguranca** e execute com a conta proprietária. A rotina é protegida pela identidade Google e não pode ser executada por visitantes anônimos ou outra conta.
3. A rotina remove o PIN antigo, limpa os detalhes dos logs antigos de configurações, restringe o compartilhamento por link dos comprovantes existentes, adiciona a coluna `tokenHash` e atualiza o acionador de expiração. Se ocorrer erro, corrija a permissão indicada e execute novamente. Não é necessário executar `setupSistema` em uma base já criada.
4. Em **Implantar → Gerenciar implantações → Editar → Nova versão**, atualize a implantação existente. Mantenha sua URL `/exec` e as permissões atuais. Versões antigas de outras implantações continuam vulneráveis: arquive quaisquer implantações antigas que ainda estejam ativas.
5. Reabra a página em uma nova aba. O botão Admin e o link para a página pública agora abrem a URL da implantação em outra aba, sem tentar ler a janela de outro domínio.

## Acesso administrativo

- O botão **Entrar com a conta Google proprietária** autentica somente quando o e-mail da conta ativa corresponde à conta sob a qual o aplicativo é executado. Se o Google não disponibilizar essa identidade, o acesso é negado; use a senha configurada.
- O PIN `coffee2026` foi desativado. Não há senha de emergência.
- Para definir uma senha, entre como proprietário e use **Configurações & PIX → senha administrativa**, com 12 a 128 caracteres exclusivos. A troca invalida todas as sessões.
- Alternativa pelo editor: em **Configurações do projeto → Propriedades do script**, adicione `ADMIN_NEW_PIN` com sua senha; execute `configurarSeguranca`. A rotina armazena somente o hash com salt e remove a propriedade temporária. Não publique a senha nem a coloque no código.
- Sessões duram no máximo uma hora; o cache do Google pode encerrá-las antes. Sair revoga a sessão. O navegador armazena apenas o token temporário, nunca a senha.
- Comprovantes são privados no Drive. Para vê-los, use a conta proprietária; se outro administrador precisar, compartilhe explicitamente os arquivos/pasta somente com essa pessoa.

## Reservas existentes e novos limites

- Reservas anteriores à atualização não têm token de envio. Seus dados e pagamentos permanecem na planilha; comprovantes antigos ainda podem ser analisados. Para reservas antigas sem comprovante, contate o responsável ou aguarde expirar e faça uma nova reserva.
- Novas reservas recebem um token secreto, cujo hash é gravado na coluna J de RESERVAS. O protocolo público sozinho não permite anexar arquivos.
- Até 20 números por reserva e três reservas abertas por WhatsApp. O telefone não é verificado por SMS, portanto esse limite é uma redução de abuso, não uma identificação garantida.
- Limites globais persistentes: 10 logins/15 min, 30 reservas/min, 20 envios/min e 120 consultas/min. Apps Script não fornece IP confiável; tráfego abusivo pode temporariamente afetar usuários legítimos.
- JPG, PNG e PDF: limite de 8 MB, verificação da assinatura inicial do arquivo e compartilhamento privado. Isso não substitui um antivírus.
- Reenvios, aprovação repetida, pagamentos de outra reserva e alterações em números reassociados são rejeitados antes da escrita.

## Verificação

Execute `node tests/security.test.cjs` (Node 22 ou compatível). Os testes executam o código real com simuladores dos serviços do Google e verificam autenticação, expiração de sessão, limites, propriedade dos números, uploads, configuração, migração, navegação renderizada e inserção de conteúdo malicioso.

O arquivo `verify-tests.ps1` e o HTML `test-suite.html` antigos são demonstrações e não comprovam a segurança da implantação. `local-preview.html` também é somente uma demonstração independente.

Valide no Google: login com a conta proprietária, logout, links públicos e leitura dos comprovantes. Testes de pagamento/reserva devem usar uma implantação e planilha separadas. Não execute pagamentos reais para testar.

## Limites da plataforma

Google Sheets não fornece transação entre as várias abas: falhas de quota ou rede durante uma escrita exigem conferência dos registros. LockService serializa as operações, mas não oferece rollback. Para volume maior ou pagamentos automáticos, migre a persistência para um banco transacional e use confirmação do provedor de pagamentos.

A migração remove senhas dos dados atuais, mas não apaga o histórico de versões do Google. A senha antiga continua inválida. O login por senha usa hash SHA-256 com salt e limite de tentativas; use senha longa e exclusiva e restrinja os editores do projeto e da planilha.
