/**
 * AdminService.gs - Painel Administrativo, métricas, aprovação e rejeição
 */

/**
 * Validação de credenciais do administrador (PIN ou E-mail da Conta Google)
 */
/**
 * Retorna dados completos do Dashboard Administrativo
 */
function getAdminDashboard(token) {
  var auth = verificarAdminAuth_(token);
  if (!auth.autorizado) {
    return { success: false, unauthorized: true, message: 'Acesso não autorizado. Informe o PIN ou faça login com conta administradora.' };
  }

  try {
    var ss = getSpreadsheet_();
    var config = getActiveConfig_();

    var sheetNumeros = getOrCreateSheet_(ss, CONFIG.SHEETS.NUMEROS, []);
    var sheetReservas = getOrCreateSheet_(ss, CONFIG.SHEETS.RESERVAS, []);
    var sheetPagamentos = getOrCreateSheet_(ss, CONFIG.SHEETS.PAGAMENTOS, []);
    var sheetPart = getOrCreateSheet_(ss, CONFIG.SHEETS.PARTICIPANTES, []);
    var sheetLogs = getOrCreateSheet_(ss, CONFIG.SHEETS.LOGS, []);

    // 1. Contagens dos Números
    var dataNumeros = sheetNumeros.getDataRange().getValues();
    var stats = {
      total: Number(config.totalNumeros || 500),
      disponiveis: 0,
      reservados: 0,
      aguardando: 0,
      confirmados: 0,
      valorConfirmado: 0,
      valorAguardando: 0
    };

    var agora = new Date().getTime();
    for (var n = 1; n < dataNumeros.length; n++) {
      var st = String(dataNumeros[n][1] || CONFIG.STATUS.DISPONIVEL);
      var expStr = dataNumeros[n][5];

      if (st === CONFIG.STATUS.RESERVADO && expStr && new Date(expStr).getTime() < agora) {
        st = CONFIG.STATUS.DISPONIVEL;
      }

      if (st === CONFIG.STATUS.DISPONIVEL) stats.disponiveis++;
      else if (st === CONFIG.STATUS.RESERVADO) stats.reservados++;
      else if (st === CONFIG.STATUS.AGUARDANDO_VALIDACAO) stats.aguardando++;
      else if (st === CONFIG.STATUS.CONFIRMADO) stats.confirmados++;
    }

    stats.valorConfirmado = stats.confirmados * Number(config.valorNumero || 20);
    stats.valorAguardando = stats.aguardando * Number(config.valorNumero || 20);

    // 2. Mapeamento de Participantes
    var mapaParticipantes = {};
    var dataPart = sheetPart.getDataRange().getValues();
    for (var p = 1; p < dataPart.length; p++) {
      mapaParticipantes[dataPart[p][0]] = {
        nome: String(dataPart[p][1] || ''),
        whatsapp: String(dataPart[p][2] || ''),
        email: String(dataPart[p][3] || '')
      };
    }

    // 3. Mapeamento de Reservas
    var mapaReservas = {};
    var dataRes = sheetReservas.getDataRange().getValues();
    for (var r = 1; r < dataRes.length; r++) {
      mapaReservas[dataRes[r][0]] = {
        participanteId: String(dataRes[r][1] || ''),
        numeros: String(dataRes[r][2] || ''),
        quantidade: Number(dataRes[r][3] || 0),
        valorTotal: Number(dataRes[r][5] || 0),
        status: String(dataRes[r][6] || ''),
        dataReserva: String(dataRes[r][7] || '')
      };
    }

    // 4. Pagamentos Pendentes de Validação
    var pendentes = [];
    var dataPag = sheetPagamentos.getDataRange().getValues();
    for (var k = 1; k < dataPag.length; k++) {
      var pagRow = dataPag[k];
      var pagStatus = String(pagRow[5] || '').trim();

      if (pagStatus === CONFIG.STATUS.AGUARDANDO_VALIDACAO) {
        var resId = String(pagRow[1] || '').trim();
        var partId = String(pagRow[2] || '').trim();
        var partInfo = mapaParticipantes[partId] || { nome: 'Não identificado', whatsapp: '', email: '' };
        var resInfo = mapaReservas[resId] || { numeros: '', quantidade: 0, valorTotal: pagRow[3] };

        pendentes.push({
          pagamentoId: String(pagRow[0] || ''),
          reservaId: resId,
          participanteId: partId,
          nome: String(partInfo.nome || ''),
          whatsapp: String(partInfo.whatsapp || ''),
          whatsappLimpo: String(partInfo.whatsapp || '').replace(/\D/g, ''),
          email: String(partInfo.email || ''),
          numeros: String(resInfo.numeros || '').split(',').map(function(s) { return s.trim(); }),
          quantidade: Number(resInfo.quantidade || 0),
          valor: Number(pagRow[3] || 0),
          valorFormatado: formatCurrency_(pagRow[3] || 0),
          comprovanteUrl: String(pagRow[4] || ''),
          dataEnvio: String(pagRow[6] ? formatDateTime_(pagRow[6]) : ''),
          dataEnvioFormatada: String(pagRow[6] ? formatDateTime_(pagRow[6]) : '')
        });
      }
    }

    // 5. Últimos Logs do Sistema (convertendo todos os campos para String)
    var logs = [];
    var dataLogs = sheetLogs.getDataRange().getValues();
    var inicioLogs = Math.max(1, dataLogs.length - 25);
    for (var l = dataLogs.length - 1; l >= inicioLogs; l--) {
      var dataHoraStr = dataLogs[l][0] ? (dataLogs[l][0] instanceof Date ? formatDateTime_(dataLogs[l][0]) : String(dataLogs[l][0])) : '';
      logs.push({
        dataHora: dataHoraStr,
        acao: String(dataLogs[l][1] || ''),
        usuario: String(dataLogs[l][2] || ''),
        detalhes: (typeof dataLogs[l][3] === 'object') ? JSON.stringify(dataLogs[l][3]) : String(dataLogs[l][3] || '')
      });
    }

    return {
      success: true,
      usuarioLogado: String(auth.usuario || 'ADMIN'),
      stats: stats,
      statsFormatado: {
        total: stats.total,
        disponiveis: stats.disponiveis,
        reservados: stats.reservados,
        aguardando: stats.aguardando,
        confirmados: stats.confirmados,
        valorConfirmado: formatCurrency_(stats.valorConfirmado),
        valorAguardando: formatCurrency_(stats.valorAguardando)
      },
      pendentes: pendentes,
      logs: logs,
      configuracoes: {
        chavePix: String(config.chavePix || ''),
        nomeFavorecido: String(config.nomeFavorecido || ''),
        cidadePix: String(config.cidadePix || ''),
        whatsappContato: String(config.whatsappContato || ''),
        valorNumero: Number(config.valorNumero || 20),
        tempoReservaMinutos: Number(config.tempoReservaMinutos || 15)
      }
    };
  } catch (err) {
    Logger.log('Erro em getAdminDashboard: ' + err.message);
    return { success: false, message: 'Erro ao carregar dados administrativos: ' + err.message };
  }
}

/**
 * Aprova o pagamento e confirma definitivamente os números
 */
function aprovarPagamento(token, pagamentoId, reservaId) {
  return decidirPagamento_(token, pagamentoId, reservaId, 'APROVAR', '', '');
}

function rejeitarPagamento(token, pagamentoId, reservaId, motivo, acaoNumeros) {
  if (typeof motivo !== 'string' || !motivo.trim() || motivo.length > 300 || ['LIBERAR', 'MANTER'].indexOf(acaoNumeros) < 0) {
    return { success: false, message: 'Informe um motivo válido e a ação dos números.' };
  }
  return decidirPagamento_(token, pagamentoId, reservaId, 'REJEITAR', motivo.trim(), acaoNumeros);
}

function decidirPagamento_(token, pagamentoId, reservaId, decisao, motivo, acao) {
  var lock = LockService.getScriptLock();
  try {
    if (!verificarAdminAuth_(token).autorizado) return { success: false, unauthorized: true, message: 'Sessão expirada. Entre novamente.' };
    if (!lock.tryLock(20000)) throw new Error('Sistema ocupado. Tente novamente.');
    // Revalida após esperar pelo lock.
    if (!verificarAdminAuth_(token).autorizado) throw new Error('Sessão expirada.');
    var ss = getSpreadsheet_();
    var pag = ss.getSheetByName(CONFIG.SHEETS.PAGAMENTOS);
    var res = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    var num = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);
    var pagamentos = pag.getDataRange().getValues();
    var reservas = res.getDataRange().getValues();
    var pi = pagamentos.findIndex(function(row, i) { return i > 0 && String(row[0]) === pagamentoId; });
    var ri = reservas.findIndex(function(row, i) { return i > 0 && String(row[0]) === reservaId; });
    if (pi < 0 || ri < 0 || String(pagamentos[pi][1]) !== reservaId || String(pagamentos[pi][2]) !== String(reservas[ri][1])) throw new Error('Pagamento e reserva não correspondem.');
    if (String(pagamentos[pi][5]) !== CONFIG.STATUS.AGUARDANDO_VALIDACAO || String(reservas[ri][6]) !== CONFIG.STATUS.AGUARDANDO_VALIDACAO) throw new Error('Este pagamento já foi processado ou não está pendente.');
    if (Number(pagamentos[pi][3]) !== Number(reservas[ri][5])) throw new Error('Valores inconsistentes.');
    var numeros = String(reservas[ri][2]).split(',').map(function(n) { return n.trim(); });
    var rows = validarNumerosReserva_(num, reservaId, numeros, CONFIG.STATUS.AGUARDANDO_VALIDACAO);
    var novoStatus = decisao === 'APROVAR' ? CONFIG.STATUS.CONFIRMADO : (acao === 'LIBERAR' ? 'REJEITADO_LIBERADO' : 'REJEITADO_RETIDO');
    rows.forEach(function(row) {
      if (decisao === 'APROVAR') {
        num.getRange(row, 2).setValue(CONFIG.STATUS.CONFIRMADO);
        num.getRange(row, 7).setValue(new Date().toISOString());
      } else if (acao === 'LIBERAR') {
        num.getRange(row, 2, 1, 6).setValues([[CONFIG.STATUS.DISPONIVEL, '', '', '', '', '']]);
      }
    });
    res.getRange(ri + 1, 7).setValue(novoStatus);
    pag.getRange(pi + 1, 6).setValue(decisao === 'APROVAR' ? 'APROVADO' : 'REJEITADO');
    pag.getRange(pi + 1, 8, 1, 2).setValues([[formatDateTime_(new Date()), textoPlanilha_(motivo)]]);
    SpreadsheetApp.flush();
    logAction_('PAGAMENTO_' + decisao, 'ADMIN', { pagamentoId: pagamentoId, reservaId: reservaId, acao: acao });
    return { success: true, message: decisao === 'APROVAR' ? 'Pagamento aprovado.' : 'Pagamento rejeitado.' };
  } catch (err) { return { success: false, message: err.message }; }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

/**
 * Salva configurações do sistema a partir do painel administrativo
 */
function salvarConfiguracoesAdmin(token, novasConfigs) {
  var lock = LockService.getScriptLock();
  try {
    if (!verificarAdminAuth_(token).autorizado) return { success: false, unauthorized: true, message: 'Sessão expirada.' };
    if (!novasConfigs || typeof novasConfigs !== 'object') throw new Error('Configurações inválidas.');
    var cfg = {};
    ['chavePix', 'nomeFavorecido', 'cidadePix', 'whatsappContato'].forEach(function(k) {
      var v = novasConfigs[k];
      if (typeof v !== 'string' || !v.trim() || v.length > 150) throw new Error('Preencha os dados de PIX e contato corretamente.');
      cfg[k] = v.trim();
    });
    cfg.valorNumero = Number(novasConfigs.valorNumero);
    cfg.tempoReservaMinutos = Number(novasConfigs.tempoReservaMinutos);
    if (!isFinite(cfg.valorNumero) || cfg.valorNumero <= 0 || cfg.valorNumero > 10000) throw new Error('Valor por número inválido.');
    if (!Number.isInteger(cfg.tempoReservaMinutos) || cfg.tempoReservaMinutos < 1 || cfg.tempoReservaMinutos > 1440) throw new Error('Prazo inválido (1 a 1440 minutos).');
    if (novasConfigs.adminPin) validarPin_(novasConfigs.adminPin);
    if (!lock.tryLock(20000)) throw new Error('Sistema ocupado.');
    if (!verificarAdminAuth_(token).autorizado) throw new Error('Sessão expirada.');
    Object.keys(cfg).forEach(function(k) { setSheetConfig_(k, cfg[k]); });
    if (novasConfigs.adminPin) definirPin_(novasConfigs.adminPin);
    logAction_('CONFIGURACOES_ATUALIZADAS', 'ADMIN', { campos: Object.keys(cfg), senhaAlterada: !!novasConfigs.adminPin });
    return { success: true, relogin: !!novasConfigs.adminPin, message: novasConfigs.adminPin ? 'Senha alterada. Entre novamente.' : 'Configurações salvas.' };
  } catch (err) { return { success: false, message: err.message }; }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

/**
 * Executa a liberação de reservas expiradas manualmente sob demanda do painel
 */
function executarLimpezaManual(token) {
  var auth = verificarAdminAuth_(token);
  if (!auth.autorizado) {
    return { success: false, message: 'Não autorizado.' };
  }

  liberarReservasExpiradas_();
  return { success: true, message: 'Limpeza de reservas expiradas executada com sucesso!' };
}
