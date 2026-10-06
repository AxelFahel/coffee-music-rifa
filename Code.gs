/**
 * Code.gs - Ponto de entrada do Web App (doGet), roteamento e setup inicial do sistema
 * Ação entre Amigos - Coffee Music Cafeteria
 */

/**
 * Ponto de entrada HTTP do Google Apps Script Web App
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var pagina = (params.pagina || '').toLowerCase();

  var template;
  var title;

  if (pagina === 'admin') {
    template = HtmlService.createTemplateFromFile('admin');
    title = 'Painel Administrativo | Ação entre Amigos - Coffee Music';
  } else {
    template = HtmlService.createTemplateFromFile('index');
    title = 'Ação entre Amigos | Coffee Music Cafeteria - Beberibe/CE';
  }

  var serviceUrl = '';
  try {
    serviceUrl = ScriptApp.getService().getUrl();
  } catch (err) {}
  if (!serviceUrl || !/^https:\/\/script\.google\.com\//.test(serviceUrl)) {
    throw new Error('Abra o endereço da implantação do App da Web. A URL de navegação não está disponível.');
  }
  template.serviceUrl = serviceUrl;

  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Helper para inclusão modular de arquivos HTML (CSS e JS) nos templates
 */
function include_(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    try {
      return HtmlService.createHtmlOutputFromFile(filename + '.html').getContent();
    } catch (e2) {
      Logger.log('Erro ao incluir ' + filename + ': ' + e.message);
      throw new Error('Arquivo obrigatório ausente: ' + filename + '. Atualize todos os arquivos da implantação.');
    }
  }
}

/**
 * FUNÇÃO DE SETUP AUTOMÁTICO DO SISTEMA (setupSistema_)
 * Executa todas as etapas de configuração inicial:
 * 1. Prepara a planilha e todas as 6 abas necessárias
 * 2. Preenche os 500 números de 001 a 500
 * 3. Cria as configurações padrão
 * 4. Prepara a pasta no Google Drive para comprovantes
 * 5. Cria o Trigger periódico para expiração de reservas (a cada 2 minutos)
 * É 100% idempotente (pode ser executada várias vezes sem duplicar).
 */
function setupSistema_() {
  Logger.log('Iniciando setupSistema_()...');
  var ss = getSpreadsheet_();
  var config = CONFIG;

  // 1. Aba NUMEROS
  var sheetNumeros = getOrCreateSheet_(ss, config.SHEETS.NUMEROS, [
    'numero', 'status', 'reservaId', 'participanteId', 'dataReserva', 'dataExpiracao', 'dataConfirmacao'
  ]);

  var qtdAtual = sheetNumeros.getLastRow();
  if (qtdAtual <= 1) {
    Logger.log('Inserindo 500 números iniciais...');
    var linhasNumeros = [];
    for (var i = 1; i <= config.TOTAL_NUMEROS; i++) {
      var numFmt = padNumero_(i, 3);
      linhasNumeros.push([
        numFmt,
        config.STATUS.DISPONIVEL,
        '', '', '', '', ''
      ]);
    }
    sheetNumeros.getRange(2, 1, linhasNumeros.length, 7).setValues(linhasNumeros);
    // Formata coluna de números como texto
    sheetNumeros.getRange(2, 1, linhasNumeros.length, 1).setNumberFormat('@');
    Logger.log('500 números cadastrados com sucesso!');
  } else {
    Logger.log('Aba NUMEROS já possui dados (' + (qtdAtual - 1) + ' registros).');
  }

  // 2. Aba PARTICIPANTES
  getOrCreateSheet_(ss, config.SHEETS.PARTICIPANTES, [
    'id', 'nome', 'whatsapp', 'email', 'dataCadastro'
  ]);

  // 3. Aba RESERVAS
  getOrCreateSheet_(ss, config.SHEETS.RESERVAS, [
    'id', 'participanteId', 'numeros', 'quantidade', 'valorUnitario', 'valorTotal', 'status', 'dataReserva', 'dataExpiracao', 'tokenHash'
  ]);

  // 4. Aba PAGAMENTOS
  getOrCreateSheet_(ss, config.SHEETS.PAGAMENTOS, [
    'id', 'reservaId', 'participanteId', 'valor', 'comprovanteUrl', 'status', 'dataEnvio', 'dataValidacao', 'observacao'
  ]);

  // 5. Aba CONFIGURACOES
  var sheetConfig = getOrCreateSheet_(ss, config.SHEETS.CONFIGURACOES, ['chave', 'valor', 'descricao']);
  var configsPadrao = [
    ['valorNumero', 20, 'Valor de cada ponto da ação em R$'],
    ['tempoReservaMinutos', 15, 'Tempo de reserva dos números antes de expirar'],
    ['nomeCampanha', 'Ação entre Amigos', 'Nome da campanha'],
    ['nomeEstabelecimento', 'Coffee Music Cafeteria', 'Nome da cafeteria'],
    ['premio', 'Final de semana em uma linda casa de praia em Beberibe/CE', 'Descrição do prêmio'],
    ['quantidadeNumeros', 500, 'Total de números da ação'],
    ['chavePix', 'coffeemusic.rifa@gmail.com', 'Chave PIX para recebimento'],
    ['tipoChavePix', 'EMAIL', 'Tipo da chave PIX'],
    ['nomeFavorecido', 'Coffee Music Cafeteria', 'Nome do titular da conta bancária'],
    ['cidadePix', 'Beberibe', 'Cidade do recebedor PIX'],
    ['whatsappContato', '5585999998888', 'WhatsApp oficial da cafeteria']
  ];

  var configsExistentes = {};
  if (sheetConfig.getLastRow() > 1) {
    var dadosAtuais = sheetConfig.getDataRange().getValues();
    for (var c = 1; c < dadosAtuais.length; c++) {
      configsExistentes[String(dadosAtuais[c][0]).trim()] = true;
    }
  }

  for (var k = 0; k < configsPadrao.length; k++) {
    var itemCfg = configsPadrao[k];
    if (!configsExistentes[itemCfg[0]]) {
      sheetConfig.appendRow(itemCfg);
      PropertiesService.getScriptProperties().setProperty(itemCfg[0], String(itemCfg[1]));
    }
  }

  // 6. Aba LOGS
  getOrCreateSheet_(ss, config.SHEETS.LOGS, ['dataHora', 'acao', 'usuario', 'detalhes']);

  // 7. Pasta do Google Drive para Comprovantes
  var pastaDrive = getComprovantesFolder_();
  Logger.log('Pasta do Drive configurada: ' + pastaDrive.getName() + ' (ID: ' + pastaDrive.getId() + ')');

  // 8. Instalação do Trigger Periódico de Expiração (a cada 2 minutos)
  instalarTriggerExpiracao_();

  // 9. Log de conclusão do setup
  logAction_('SISTEMA_CONFIGURADO', 'SETUP_INICIAL', {
    spreadsheetId: ss.getId(),
    driveFolderId: pastaDrive.getId()
  });

  Logger.log('=== SETUP CONCLUÍDO COM SUCESSO! ===');
  Logger.log('Planilha ID: ' + ss.getId());
  Logger.log('Planilha URL: ' + ss.getUrl());
  Logger.log('Pasta Drive ID: ' + pastaDrive.getId());

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderId: pastaDrive.getId()
  };
}

/**
 * Instala o trigger de tempo para executar liberarReservasExpiradas_ periodicamente
 */
function instalarTriggerExpiracao_() {
  var triggers = ScriptApp.getProjectTriggers();
  var jaInstalado = false;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'liberarReservasExpiradas') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
    if (triggers[i].getHandlerFunction() === 'liberarReservasExpiradas_') {
      jaInstalado = true;
    }
  }

  if (!jaInstalado) {
    ScriptApp.newTrigger('liberarReservasExpiradas_')
      .timeBased()
      .everyMinutes(1) // Verifica a cada minuto
      .create();
    Logger.log('Trigger para liberarReservasExpiradas_ instalado a cada 1 minuto.');
  } else {
    Logger.log('Trigger para liberarReservasExpiradas_ já estava configurado.');
  }
}
