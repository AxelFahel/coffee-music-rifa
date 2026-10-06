/**
 * Utils.gs - Funções utilitárias do sistema Ação entre Amigos
 */

/**
 * Formata um número como moeda brasileira (R$ XX,XX)
 */
function formatCurrency_(valor) {
  var num = Number(valor) || 0;
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
}

/**
 * Preenche o número com zeros à esquerda (ex: 5 -> "005")
 */
function padNumero_(num, len) {
  var s = String(num);
  len = len || 3;
  while (s.length < len) {
    s = '0' + s;
  }
  return s;
}

/**
 * Formata data no fuso de Fortaleza/Brasília (dd/MM/yyyy HH:mm:ss)
 */
function formatDateTime_(date) {
  if (!date) return '';
  var d = (date instanceof Date) ? date : new Date(date);
  return Utilities.formatDate(d, 'America/Fortaleza', 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Formata apenas a data (YYYY-MM-DD) para nomes de arquivos
 */
function formatDateISO_(date) {
  if (!date) date = new Date();
  var d = (date instanceof Date) ? date : new Date(date);
  return Utilities.formatDate(d, 'America/Fortaleza', 'yyyy-MM-dd');
}

/**
 * Gera protocolo único e amigável: CM-2026-XXXXXX
 */
function generateProtocolo_() {
  return 'CM-' + new Date().getFullYear() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
}

/**
 * Sanitiza texto para nome de arquivo seguro (sem acentos, minúsculas, hífens)
 */
function slugify_(text) {
  if (!text) return 'participante';
  return text.toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // remove caracteres especiais
    .replace(/[\s_-]+/g, '-') // substitui espaços por hífens
    .replace(/^-+|-+$/g, ''); // remove hífens das pontas
}

/**
 * Gera mensagem codificada para o WhatsApp da cafeteria
 */
function buildWhatsAppUrl_(telefoneDestino, nomeParticipante, numeros, valorTotal, protocolo) {
  var telLimpo = String(telefoneDestino).replace(/\D/g, '');
  if (!telLimpo.startsWith('55')) {
    telLimpo = '55' + telLimpo;
  }

  var numerosTexto = Array.isArray(numeros) ? numeros.join(', ') : String(numeros);
  var texto = 'Olá! Participei da Ação entre Amigos da Coffee Music.\n\n' +
              '*Protocolo:* ' + protocolo + '\n' +
              '*Nome:* ' + nomeParticipante + '\n' +
              '*Números:* ' + numerosTexto + '\n' +
              '*Valor:* ' + formatCurrency_(valorTotal) + '\n\n' +
              'Meu comprovante já foi enviado pelo sistema e aguarda validação.';

  return 'https://api.whatsapp.com/send?phone=' + telLimpo + '&text=' + encodeURIComponent(texto);
}

/**
 * Gera payload padrão EMV BR Code (PIX Copia e Cola)
 */
function generatePixPayload_(chavePix, nomeFavorecido, cidadePix, valor, txId) {
  function formatField(id, value) {
    var valStr = String(value);
    var len = padNumero_(valStr.length, 2);
    return id + len + valStr;
  }

  var chaveLimpa = chavePix.trim();
  var nomeLimpo = nomeFavorecido.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 25);
  var cidadeLimpa = cidadePix.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 15);
  var txIdLimpo = (txId || '***').substring(0, 25);

  // 00: Payload Format Indicator
  var payload = formatField('00', '01');

  // 26: Merchant Account Information (GUI: br.gov.bcb.pix)
  var merchantInfo = formatField('00', 'br.gov.bcb.pix') + formatField('01', chaveLimpa);
  payload += formatField('26', merchantInfo);

  // 52: Merchant Category Code
  payload += formatField('52', '0000');

  // 53: Transaction Currency (986 = BRL)
  payload += formatField('53', '986');

  // 54: Transaction Amount
  if (valor && Number(valor) > 0) {
    payload += formatField('54', Number(valor).toFixed(2));
  }

  // 58: Country Code
  payload += formatField('58', 'BR');

  // 59: Merchant Name
  payload += formatField('59', nomeLimpo);

  // 60: Merchant City
  payload += formatField('60', cidadeLimpa);

  // 62: Additional Data Field (TxID)
  var additionalData = formatField('05', txIdLimpo);
  payload += formatField('62', additionalData);

  // 63: CRC16-CCITT
  payload += '6304';
  var crc = calculateCRC16_(payload);
  payload += crc;

  return payload;
}

/**
 * Cálculo de CRC16 para o padrão PIX
 */
function calculateCRC16_(str) {
  var crc = 0xFFFF;
  var strlen = str.length;
  for (var c = 0; c < strlen; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (var i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  var hex = crc.toString(16).toUpperCase();
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  return hex;
}

/**
 * Retorna URL de imagem do QR Code
 */
function getQrCodeImageUrl_(text) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=' + encodeURIComponent(text);
}
