/**
 * Database.gs - Camada de acesso e gerenciamento do Google Sheets
 */

/**
 * Obtém a planilha ativa (container-bound) ou busca por ID salvo nas propriedades.
 * Caso não exista, cria uma nova automaticamente.
 */
function getSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SPREADSHEET_ID');

  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      throw new Error('Não foi possível abrir a planilha configurada. Verifique o acesso no editor.');
    }
  }

  // Cria uma nova planilha caso não esteja vinculado a nenhuma
  var novaPlanilha = SpreadsheetApp.create('Coffee Music - Rifa Coberta (Banco de Dados)');
  props.setProperty('SPREADSHEET_ID', novaPlanilha.getId());
  Logger.log('Nova planilha criada com ID: ' + novaPlanilha.getId());
  return novaPlanilha;
}

/**
 * Obtém ou cria uma aba pelo nome
 */
function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#3b2314');
      headerRange.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Registra uma ação na aba LOGS
 */
function logAction_(acao, usuario, detalhes) {
  try {
    var ss = getSpreadsheet_();
    var sheet = getOrCreateSheet_(ss, CONFIG.SHEETS.LOGS, ['dataHora', 'acao', 'usuario', 'detalhes']);
    var dataHora = formatDateTime_(new Date());
    var detalhesStr = (typeof detalhes === 'object') ? JSON.stringify(detalhes) : String(detalhes || '');
    sheet.appendRow([dataHora, textoPlanilha_(acao), textoPlanilha_(usuario || 'SISTEMA'), textoPlanilha_(detalhesStr)]);
  } catch (e) {
    Logger.log('Falha ao registrar log: ' + e.message);
  }
}

/**
 * Lê uma configuração da aba CONFIGURACOES
 */
function getSheetConfig_(chave) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.CONFIGURACOES);
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === chave) {
        return data[i][1];
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Salva ou atualiza uma configuração na aba CONFIGURACOES
 */
function setSheetConfig_(chave, valor) {
  try {
    var ss = getSpreadsheet_();
    var sheet = getOrCreateSheet_(ss, CONFIG.SHEETS.CONFIGURACOES, ['chave', 'valor', 'descricao']);
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === chave) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(typeof valor === 'string' ? textoPlanilha_(valor) : valor);
    } else {
      sheet.appendRow([chave, typeof valor === 'string' ? textoPlanilha_(valor) : valor, '']);
    }

    // Sincroniza também no PropertiesService
    PropertiesService.getScriptProperties().setProperty(chave, String(valor));
    return true;
  } catch (e) {
    Logger.log('Erro ao salvar config ' + chave + ': ' + e.message);
    throw new Error('Falha ao salvar configuração. Tente novamente.');
  }
}

/**
 * Retorna todos os números em formato estruturado
 */
function getNumerosRaw_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var numeros = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    numeros.push({
      numero: padNumero_(row[0], 3),
      status: row[1] || CONFIG.STATUS.DISPONIVEL,
      reservaId: row[2] || '',
      participanteId: row[3] || '',
      dataReserva: row[4] || '',
      dataExpiracao: row[5] || '',
      dataConfirmacao: row[6] || '',
      rowIndex: i + 1 // linha real na planilha (1-indexed)
    });
  }
  return numeros;
}
