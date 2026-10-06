/**
 * AdminService.gs - Painel Administrativo, métricas, aprovação e rejeição
 */

/**
 * Validação de credenciais do administrador (PIN ou E-mail da Conta Google)
 */
function verificarAdminAuth(token) {
  // 1. Validação por PIN padrão de emergência (coffee2026)
  if (token && String(token).trim() === 'coffee2026') {
    return { autorizado: true, usuario: 'ADMIN_PIN' };
  }

  // 2. Validação por PIN administrativo salvo
  try {
    var adminPinSalvo = getConfigValue('adminPin', CONFIG.ADMIN_PIN_PADRAO);
    if (token && String(token).trim() === String(adminPinSalvo).trim()) {
      return { autorizado: true, usuario: 'ADMIN_PIN' };
    }
  } catch (e) {}

  // 3. Verifica se a conta Google logada é administradora
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) {
      var adminEmails = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || CONFIG.ADMIN_EMAILS.join(',')).split(',');
      for (var i = 0; i < adminEmails.length; i++) {
        if (email.toLowerCase().trim() === adminEmails[i].toLowerCase().trim()) {
          return { autorizado: true, usuario: email };
        }
      }
    }
  } catch (e) {}

  return { autorizado: false, usuario: null };
}

/**
 * Retorna dados completos do Dashboard Administrativo
 */
function getAdminDashboard(token) {
  var auth = verificarAdminAuth(token);
  if (!auth.autorizado) {
    return { success: false, unauthorized: true, message: 'Acesso não autorizado. Informe o PIN ou faça login com conta administradora.' };
  }

  try {
    var ss = getSpreadsheet();
    var config = getActiveConfig();

    var sheetNumeros = getOrCreateSheet(ss, CONFIG.SHEETS.NUMEROS, []);
    var sheetReservas = getOrCreateSheet(ss, CONFIG.SHEETS.RESERVAS, []);
    var sheetPagamentos = getOrCreateSheet(ss, CONFIG.SHEETS.PAGAMENTOS, []);
    var sheetPart = getOrCreateSheet(ss, CONFIG.SHEETS.PARTICIPANTES, []);
    var sheetLogs = getOrCreateSheet(ss, CONFIG.SHEETS.LOGS, []);

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
          valorFormatado: formatCurrency(pagRow[3] || 0),
          comprovanteUrl: String(pagRow[4] || ''),
          dataEnvio: String(pagRow[6] ? formatDateTime(pagRow[6]) : ''),
          dataEnvioFormatada: String(pagRow[6] ? formatDateTime(pagRow[6]) : '')
        });
      }
    }

    // 5. Últimos Logs do Sistema (convertendo todos os campos para String)
    var logs = [];
    var dataLogs = sheetLogs.getDataRange().getValues();
    var inicioLogs = Math.max(1, dataLogs.length - 25);
    for (var l = dataLogs.length - 1; l >= inicioLogs; l--) {
      var dataHoraStr = dataLogs[l][0] ? (dataLogs[l][0] instanceof Date ? formatDateTime(dataLogs[l][0]) : String(dataLogs[l][0])) : '';
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
        valorConfirmado: formatCurrency(stats.valorConfirmado),
        valorAguardando: formatCurrency(stats.valorAguardando)
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
  var auth = verificarAdminAuth(token);
  if (!auth.autorizado) {
    return { success: false, message: 'Não autorizado.' };
  }

  var lock = LockService.getScriptLock();
  try {
    var lockAdquirido = lock.tryLock(20000);
    if (!lockAdquirido) {
      return { success: false, message: 'Sistema ocupado. Tente novamente.' };
    }

    var ss = getSpreadsheet();
    var sheetPag = ss.getSheetByName(CONFIG.SHEETS.PAGAMENTOS);
    var sheetRes = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    var sheetNum = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);

    var agora = new Date();
    var agoraISO = agora.toISOString();

    // 1. Atualiza Pagamento
    var dataPag = sheetPag.getDataRange().getValues();
    for (var p = 1; p < dataPag.length; p++) {
      if (dataPag[p][0] === pagamentoId) {
        sheetPag.getRange(p + 1, 6).setValue('APROVADO'); // status
        sheetPag.getRange(p + 1, 8).setValue(formatDateTime(agora)); // dataValidacao
        break;
      }
    }

    // 2. Atualiza Reserva e recupera números
    var numerosArr = [];
    var dataRes = sheetRes.getDataRange().getValues();
    for (var r = 1; r < dataRes.length; r++) {
      if (dataRes[r][0] === reservaId) {
        sheetRes.getRange(r + 1, 7).setValue(CONFIG.STATUS.CONFIRMADO);
        numerosArr = String(dataRes[r][2]).split(',').map(function(s) { return s.trim(); });
        break;
      }
    }

    // 3. Atualiza Números na grade
    var dataNum = sheetNum.getDataRange().getValues();
    for (var n = 1; n < dataNum.length; n++) {
      var numAtual = padNumero(dataNum[n][0], 3);
      if (numerosArr.indexOf(numAtual) !== -1) {
        sheetNum.getRange(n + 1, 2).setValue(CONFIG.STATUS.CONFIRMADO); // status
        sheetNum.getRange(n + 1, 7).setValue(agoraISO); // dataConfirmacao
      }
    }

    logAction('PAGAMENTO_APROVADO', auth.usuario, {
      pagamentoId: pagamentoId,
      reservaId: reservaId,
      numeros: numerosArr
    });

    lock.releaseLock();
    return { success: true, message: 'Pagamento aprovado e números confirmados com sucesso!' };
  } catch (err) {
    if (lock) lock.releaseLock();
    return { success: false, message: 'Erro ao aprovar pagamento: ' + err.message };
  }
}

/**
 * Rejeita o pagamento com motivo e opção de liberar ou manter os números
 */
function rejeitarPagamento(token, pagamentoId, reservaId, motivo, acaoNumeros) {
  var auth = verificarAdminAuth(token);
  if (!auth.autorizado) {
    return { success: false, message: 'Não autorizado.' };
  }

  var lock = LockService.getScriptLock();
  try {
    var lockAdquirido = lock.tryLock(20000);
    if (!lockAdquirido) {
      return { success: false, message: 'Sistema ocupado. Tente novamente.' };
    }

    var ss = getSpreadsheet();
    var sheetPag = ss.getSheetByName(CONFIG.SHEETS.PAGAMENTOS);
    var sheetRes = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    var sheetNum = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);

    var agora = new Date();
    var motivoTexto = motivo || 'Comprovante não aceito';

    // 1. Atualiza Pagamento
    var dataPag = sheetPag.getDataRange().getValues();
    for (var p = 1; p < dataPag.length; p++) {
      if (dataPag[p][0] === pagamentoId) {
        sheetPag.getRange(p + 1, 6).setValue('REJEITADO');
        sheetPag.getRange(p + 1, 8).setValue(formatDateTime(agora));
        sheetPag.getRange(p + 1, 9).setValue(motivoTexto);
        break;
      }
    }

    // 2. Atualiza Reserva e recupera números
    var numerosArr = [];
    var dataRes = sheetRes.getDataRange().getValues();
    for (var r = 1; r < dataRes.length; r++) {
      if (dataRes[r][0] === reservaId) {
        var novoStatusReserva = (acaoNumeros === 'LIBERAR') ? 'REJEITADO_LIBERADO' : 'REJEITADO_RETIDO';
        sheetRes.getRange(r + 1, 7).setValue(novoStatusReserva);
        numerosArr = String(dataRes[r][2]).split(',').map(function(s) { return s.trim(); });
        break;
      }
    }

    // 3. Se ação for LIBERAR, devolve números para DISPONIVEL
    if (acaoNumeros === 'LIBERAR') {
      var dataNum = sheetNum.getDataRange().getValues();
      for (var n = 1; n < dataNum.length; n++) {
        var numAtual = padNumero(dataNum[n][0], 3);
        if (numerosArr.indexOf(numAtual) !== -1) {
          sheetNum.getRange(n + 1, 2, 1, 5).setValues([[
            CONFIG.STATUS.DISPONIVEL,
            '', // reservaId
            '', // participanteId
            '', // dataReserva
            ''  // dataExpiracao
          ]]);
        }
      }
    }

    logAction('PAGAMENTO_REJEITADO', auth.usuario, {
      pagamentoId: pagamentoId,
      reservaId: reservaId,
      motivo: motivoTexto,
      acaoNumeros: acaoNumeros,
      numeros: numerosArr
    });

    lock.releaseLock();
    return {
      success: true,
      message: 'Pagamento rejeitado. ' + (acaoNumeros === 'LIBERAR' ? 'Números liberados para compra.' : 'Números mantidos bloqueados.')
    };
  } catch (err) {
    if (lock) lock.releaseLock();
    return { success: false, message: 'Erro ao rejeitar pagamento: ' + err.message };
  }
}

/**
 * Salva configurações do sistema a partir do painel administrativo
 */
function salvarConfiguracoesAdmin(token, novasConfigs) {
  var auth = verificarAdminAuth(token);
  if (!auth.autorizado) {
    return { success: false, message: 'Não autorizado.' };
  }

  try {
    if (novasConfigs.chavePix) setSheetConfig('chavePix', novasConfigs.chavePix);
    if (novasConfigs.nomeFavorecido) setSheetConfig('nomeFavorecido', novasConfigs.nomeFavorecido);
    if (novasConfigs.cidadePix) setSheetConfig('cidadePix', novasConfigs.cidadePix);
    if (novasConfigs.whatsappContato) setSheetConfig('whatsappContato', novasConfigs.whatsappContato);
    if (novasConfigs.valorNumero) setSheetConfig('valorNumero', Number(novasConfigs.valorNumero));
    if (novasConfigs.tempoReservaMinutos) setSheetConfig('tempoReservaMinutos', Number(novasConfigs.tempoReservaMinutos));
    if (novasConfigs.adminPin) {
      setSheetConfig('adminPin', novasConfigs.adminPin);
      PropertiesService.getScriptProperties().setProperty('adminPin', String(novasConfigs.adminPin));
    }

    logAction('CONFIGURACOES_ATUALIZADAS', auth.usuario, novasConfigs);
    return { success: true, message: 'Configurações atualizadas com sucesso!' };
  } catch (err) {
    return { success: false, message: 'Erro ao salvar configurações: ' + err.message };
  }
}

/**
 * Executa a liberação de reservas expiradas manualmente sob demanda do painel
 */
function executarLimpezaManual(token) {
  var auth = verificarAdminAuth(token);
  if (!auth.autorizado) {
    return { success: false, message: 'Não autorizado.' };
  }

  liberarReservasExpiradas();
  return { success: true, message: 'Limpeza de reservas expiradas executada com sucesso!' };
}
