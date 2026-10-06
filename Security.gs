/** Helpers privados: nunca expor configuração, arquivos ou credenciais via RPC. */
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function safeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function validarPin_(pin) {
  if (typeof pin !== 'string' || pin.length < 12 || pin.length > 128 || /coffee2026/i.test(pin)) {
    throw new Error('Use uma senha exclusiva de 12 a 128 caracteres, diferente do PIN antigo.');
  }
}

// Entradas de manutenção visíveis no editor; RPC só pode executá-las como o dono.
function exigirProprietario_() {
  var ativo = Session.getActiveUser().getEmail();
  var efetivo = Session.getEffectiveUser().getEmail();
  if (!ativo || !efetivo || ativo.toLowerCase() !== efetivo.toLowerCase()) throw new Error('Execute esta manutenção pelo editor, com a conta proprietária.');
}

function configurarSeguranca() {
  exigirProprietario_();
  return migrarSeguranca_();
}

function setupSistema() {
  exigirProprietario_();
  return setupSistema_();
}

function definirPin_(pin) {
  validarPin_(pin);
  var salt = randomToken_();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PIN_SALT: salt, ADMIN_PIN_HASH: hash_(salt + ':' + pin), ADMIN_SESSION_VERSION: randomToken_()
  });
}

// Limite global persistente: Apps Script não fornece IP confiável do visitante.
// Os nomes das categorias são fixos para não permitir crescimento ilimitado.
function limitar_(categoria, maximo, segundos) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Sistema ocupado. Tente novamente em instantes.');
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'RATE_' + categoria;
    var state = JSON.parse(props.getProperty(key) || 'null');
    var now = Date.now();
    if (!state || now >= state.until) state = { count: 0, until: now + segundos * 1000 };
    if (state.count >= maximo) throw new Error('Limite de tentativas atingido. Aguarde alguns minutos.');
    state.count++;
    props.setProperty(key, JSON.stringify(state));
  } finally { lock.releaseLock(); }
}

function loginAdmin(pin) {
  try {
    limitar_('LOGIN', 10, 900);
    var props = PropertiesService.getScriptProperties();
    var salt = props.getProperty('ADMIN_PIN_SALT');
    var digest = props.getProperty('ADMIN_PIN_HASH');
    var proprietario = false;
    if (pin === '') {
      try { exigirProprietario_(); proprietario = true; } catch (err) {}
    }
    if (!proprietario && (!digest || !salt)) return { success: false, message: 'Entre com a conta Google proprietária. A senha administrativa ainda não foi configurada.' };
    if (!proprietario && (typeof pin !== 'string' || pin.length > 128 || !safeEqual_(hash_(salt + ':' + pin), digest))) {
      return { success: false, message: 'Credenciais inválidas.' };
    }
    if (!props.getProperty('ADMIN_SESSION_VERSION')) props.setProperty('ADMIN_SESSION_VERSION', randomToken_());
    var token = randomToken_();
    CacheService.getScriptCache().put('SESSION_' + hash_(token), JSON.stringify({
      version: props.getProperty('ADMIN_SESSION_VERSION'), expires: Date.now() + 3600000
    }), 3600);
    return { success: true, token: token };
  } catch (err) { return { success: false, message: err.message }; }
}

function verificarAdminAuth_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return { autorizado: false };
  var data = CacheService.getScriptCache().get('SESSION_' + hash_(token));
  if (!data) return { autorizado: false };
  var session = JSON.parse(data);
  return { autorizado: session.expires > Date.now() && session.version === PropertiesService.getScriptProperties().getProperty('ADMIN_SESSION_VERSION'), usuario: 'ADMIN' };
}

function logoutAdmin(token) {
  if (typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token)) CacheService.getScriptCache().remove('SESSION_' + hash_(token));
  return { success: true };
}

function textoPlanilha_(value) {
  var text = String(value == null ? '' : value);
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
}

function validarNumerosReserva_(sheet, reservaId, numeros, statusEsperado) {
  var data = sheet.getDataRange().getValues();
  var rows = [];
  numeros.forEach(function(numero) {
    var index = data.findIndex(function(row, i) { return i > 0 && padNumero_(row[0], 3) === numero; });
    if (index < 0 || String(data[index][2]) !== reservaId || String(data[index][1]) !== statusEsperado) {
      throw new Error('Os números não pertencem mais a esta reserva ou seu estado mudou. Atualize o painel.');
    }
    rows.push(index + 1);
  });
  if (!rows.length) throw new Error('Reserva sem números.');
  return rows;
}

/** Executar SOMENTE pelo editor, após definir ADMIN_NEW_PIN nas propriedades. */
function migrarSeguranca_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var pin = props.getProperty('ADMIN_NEW_PIN');
    if (pin) definirPin_(pin);
    props.deleteProperty('ADMIN_NEW_PIN');
    props.deleteProperty('adminPin');
    var ss = getSpreadsheet_();
    var reservas = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    if (reservas) reservas.getRange(1, 10).setValue('tokenHash');
    var cfg = ss.getSheetByName(CONFIG.SHEETS.CONFIGURACOES);
    if (cfg) {
      var data = cfg.getDataRange().getValues();
      for (var i = data.length - 1; i > 0; i--) if (String(data[i][0]) === 'adminPin') cfg.deleteRow(i + 1);
    }
    var logs = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    if (logs) {
      var logRows = logs.getDataRange().getValues();
      for (var l = 1; l < logRows.length; l++) {
        if (String(logRows[l][1]) === 'CONFIGURACOES_ATUALIZADAS') logs.getRange(l + 1, 4).setValue('Registro legado: detalhes removidos para eliminar credenciais.');
      }
    }
    // Fecha o compartilhamento por link da pasta e de TODOS os comprovantes antigos.
    var folder = getComprovantesFolder_();
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    var files = folder.getFiles();
    while (files.hasNext()) files.next().setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    instalarTriggerExpiracao_();
    Logger.log('Migração concluída. Senhas antigas e sessões anteriores não dão acesso.');
    if (!props.getProperty('ADMIN_PIN_HASH')) Logger.log('Senha ainda não configurada. Use a conta Google proprietária para entrar no admin ou configure ADMIN_NEW_PIN e execute configurarSeguranca novamente.');
  } finally { lock.releaseLock(); }
}
