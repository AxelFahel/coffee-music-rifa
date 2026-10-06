/**
 * Config.gs - Configurações centrais do sistema Ação entre Amigos - Coffee Music
 */

var CONFIG = {
  // Dados da Campanha
  NOME_ESTABELECIMENTO: 'Coffee Music Cafeteria',
  NOME_CAMPANHA: 'Ação entre Amigos',
  PREMIO: 'Final de semana em uma linda casa de praia em Beberibe/CE',
  TOTAL_NUMEROS: 500,
  VALOR_NUMERO: 20.00,
  TEMPO_RESERVA_MINUTOS: 15,

  // Dados para Pagamento PIX (podem ser atualizados na aba CONFIGURACOES)
  CHAVE_PIX: 'coffeemusic.rifa@gmail.com', // Chave padrão (alterável no admin/planilha)
  TIPO_CHAVE_PIX: 'EMAIL', // EMAIL, CPF, CNPJ, TELEFONE, ALEATORIA
  NOME_FAVORECIDO: 'Coffee Music Cafeteria',
  CIDADE_PIX: 'Beberibe',
  WHATSAPP_CONTATO: '5585999998888', // WhatsApp oficial para contato

  // Segurança e Acesso

  // Pastas Google Drive
  NOME_PASTA_DRIVE: 'Coffee Music - Rifa Coberta',
  NOME_SUBPASTA_COMPROVANTES: 'Comprovantes',

  // Nomes das abas da Planilha
  SHEETS: {
    NUMEROS: 'NUMEROS',
    PARTICIPANTES: 'PARTICIPANTES',
    RESERVAS: 'RESERVAS',
    PAGAMENTOS: 'PAGAMENTOS',
    CONFIGURACOES: 'CONFIGURACOES',
    LOGS: 'LOGS'
  },

  // Estados possíveis dos números
  STATUS: {
    DISPONIVEL: 'DISPONIVEL',
    RESERVADO: 'RESERVADO',
    AGUARDANDO_VALIDACAO: 'AGUARDANDO_VALIDACAO',
    CONFIRMADO: 'CONFIRMADO',
    EXPIRADO: 'EXPIRADO',
    REJEITADO: 'REJEITADO'
  }
};

/**
 * Obtém o valor de uma configuração persistida (Planilha ou PropertiesService)
 * com fallback para os valores padrões definidos acima.
 */
function getConfigValue_(chave, valorPadrao) {
  try {
    var props = PropertiesService.getScriptProperties();
    var val = props.getProperty(chave);
    if (val !== null && val !== undefined && val !== '') {
      return val;
    }
  } catch (e) {
    // Falha silenciosa de properties
  }

  try {
    var sheetVal = getSheetConfig_(chave);
    if (sheetVal !== null && sheetVal !== undefined && sheetVal !== '') {
      return sheetVal;
    }
  } catch (e) {
    // Falha silenciosa de sheet
  }

  return valorPadrao;
}

/**
 * Retorna as configurações ativas consolidadas
 */
function getActiveConfig_() {
  return {
    nomeEstabelecimento: getConfigValue_('nomeEstabelecimento', CONFIG.NOME_ESTABELECIMENTO),
    nomeCampanha: getConfigValue_('nomeCampanha', CONFIG.NOME_CAMPANHA),
    premio: getConfigValue_('premio', CONFIG.PREMIO),
    totalNumeros: Number(getConfigValue_('quantidadeNumeros', CONFIG.TOTAL_NUMEROS)),
    valorNumero: Number(getConfigValue_('valorNumero', CONFIG.VALOR_NUMERO)),
    tempoReservaMinutos: Number(getConfigValue_('tempoReservaMinutos', CONFIG.TEMPO_RESERVA_MINUTOS)),
    chavePix: getConfigValue_('chavePix', CONFIG.CHAVE_PIX),
    tipoChavePix: getConfigValue_('tipoChavePix', CONFIG.TIPO_CHAVE_PIX),
    nomeFavorecido: getConfigValue_('nomeFavorecido', CONFIG.NOME_FAVORECIDO),
    cidadePix: getConfigValue_('cidadePix', CONFIG.CIDADE_PIX),
    whatsappContato: getConfigValue_('whatsappContato', CONFIG.WHATSAPP_CONTATO),
    driveFolderId: PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || '',
    spreadsheetId: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
  };
}
