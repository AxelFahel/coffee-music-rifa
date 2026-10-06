/**
 * UploadService.gs - Upload seguro de comprovantes no Google Drive
 */

/**
 * Obtém ou cria a pasta no Google Drive para armazenar os comprovantes
 */
function getComprovantesFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('DRIVE_FOLDER_ID');

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('Pasta do Drive não encontrada pelo ID salvo, recriando estrutura...');
    }
  }

  // Busca ou cria a pasta principal
  var mainFolders = DriveApp.getFoldersByName(CONFIG.NOME_PASTA_DRIVE);
  var mainFolder;
  if (mainFolders.hasNext()) {
    mainFolder = mainFolders.next();
  } else {
    mainFolder = DriveApp.createFolder(CONFIG.NOME_PASTA_DRIVE);
  }

  // Busca ou cria a subpasta de comprovantes
  var subFolders = mainFolder.getFoldersByName(CONFIG.NOME_SUBPASTA_COMPROVANTES);
  var targetFolder;
  if (subFolders.hasNext()) {
    targetFolder = subFolders.next();
  } else {
    targetFolder = mainFolder.createFolder(CONFIG.NOME_SUBPASTA_COMPROVANTES);
  }

  props.setProperty('DRIVE_FOLDER_ID', targetFolder.getId());
  return targetFolder;
}

/**
 * Salva o arquivo de comprovante no Drive com nomenclatura padronizada
 */
function salvarComprovanteDrive_(filePayload, participanteNome, numeros, dataReferencia) {
  if (!filePayload || !filePayload.base64Data) {
    throw new Error('Nenhum arquivo enviado.');
  }

  // Valida tipo MIME
  var mimeType = filePayload.mimeType || 'application/octet-stream';
  var tiposPermitidos = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'application/pdf': '.pdf'
  };

  var extensao = tiposPermitidos[mimeType.toLowerCase()];
  if (!extensao) {
    throw new Error('Tipo de arquivo não permitido. Envie apenas JPG, PNG ou PDF.');
  }

  // Decodifica Base64
  var base64Content = filePayload.base64Data;
  if (typeof base64Content !== 'string' || base64Content.length > 11200000) {
    throw new Error('Arquivo inválido ou maior que 8MB.');
  }
  // Remove prefixo data URI se houver (ex: data:image/jpeg;base64,...)
  if (base64Content.indexOf(';base64,') !== -1) {
    base64Content = base64Content.split(';base64,')[1];
  }

  var bytes = Utilities.base64Decode(base64Content);

  // Limite razoável de tamanho (8 MB)
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
    throw new Error('O arquivo excede o limite máximo permitido de 8MB.');
  }

  var unsigned = bytes.slice(0, 8).map(function(b) { return (b + 256) % 256; });
  var signature = unsigned.map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  var valid = mimeType.toLowerCase() === 'application/pdf' ? signature.indexOf('255044462d') === 0 :
    (mimeType.toLowerCase() === 'image/png' ? signature === '89504e470d0a1a0a' : signature.indexOf('ffd8ff') === 0);
  if (!valid) throw new Error('O conteúdo do arquivo não corresponde a JPG, PNG ou PDF.');

  // Padrão de nomeação: YYYY-MM-DD_nome-participante_023-116-387.ext
  var dataISO = formatDateISO_(dataReferencia || new Date());
  var nomeSlug = slugify_(participanteNome || 'participante');

  var numerosArr = Array.isArray(numeros) ? numeros : String(numeros).split(',');
  var numerosStr = '';
  if (numerosArr.length <= 4) {
    numerosStr = numerosArr.map(function(n) { return padNumero_(n.trim(), 3); }).join('-');
  } else {
    numerosStr = numerosArr.slice(0, 3).map(function(n) { return padNumero_(n.trim(), 3); }).join('-') + '-e-mais-' + (numerosArr.length - 3);
  }

  var nomeArquivoFinal = dataISO + '_' + nomeSlug + '_' + numerosStr + extensao;

  var blob = Utilities.newBlob(bytes, mimeType, nomeArquivoFinal);
  var pasta = getComprovantesFolder_();
  var file = pasta.createFile(blob);

  // Comprovantes contêm dados pessoais: acesso restrito ao proprietário do Drive.
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (e) {
    file.setTrashed(true);
    throw new Error('Não foi possível garantir a privacidade do comprovante.');
  }

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: nomeArquivoFinal
  };
}
