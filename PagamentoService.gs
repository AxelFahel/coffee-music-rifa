/**
 * PagamentoService.gs - Processamento de comprovantes e controle de pagamentos
 */

/**
 * Registra o envio do comprovante de pagamento e muda o estado da reserva para AGUARDANDO_VALIDACAO
 */
function confirmarEnvioComprovante(payload) {
  if (!payload || !payload.reservaId || !payload.filePayload) {
    return { success: false, message: 'Dados incompletos para envio do comprovante.' };
  }

  var protocolo = String(payload.reservaId).trim().toUpperCase();
  if (protocolo.length > 40 || typeof payload.reservaToken !== 'string' || !/^[a-f0-9]{64}$/i.test(payload.reservaToken)) {
    return { success: false, message: 'Acesso à reserva inválido. Reservas anteriores à atualização precisam de atendimento pelo responsável.' };
  }
  try { limitar_('UPLOADS', 20, 60); } catch (err) { return { success: false, message: err.message }; }
  var lock = LockService.getScriptLock();

  try {
    var lockAdquirido = lock.tryLock(25000);
    if (!lockAdquirido) {
      return { success: false, message: 'Servidor ocupado. Tente novamente em alguns segundos.' };
    }

    var ss = getSpreadsheet_();
    var sheetReservas = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    var sheetNumeros = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);
    var sheetPart = ss.getSheetByName(CONFIG.SHEETS.PARTICIPANTES);
    var sheetPag = getOrCreateSheet_(ss, CONFIG.SHEETS.PAGAMENTOS, [
      'id', 'reservaId', 'participanteId', 'valor', 'comprovanteUrl', 'status', 'dataEnvio', 'dataValidacao', 'observacao'
    ]);

    if (!sheetReservas || !sheetNumeros) {
      lock.releaseLock();
      return { success: false, message: 'Estrutura de dados não encontrada.' };
    }

    // Localiza a reserva
    var dataReservas = sheetReservas.getDataRange().getValues();
    var reservaIndex = -1;
    var reservaRow = null;

    for (var i = 1; i < dataReservas.length; i++) {
      if (String(dataReservas[i][0]).trim().toUpperCase() === protocolo) {
        reservaIndex = i + 1;
        reservaRow = dataReservas[i];
        break;
      }
    }

    if (!reservaRow) {
      lock.releaseLock();
      return { success: false, message: 'Protocolo de reserva não encontrado: ' + protocolo };
    }

    if (!reservaRow[9] || !safeEqual_(hash_(payload.reservaToken), reservaRow[9])) {
      throw new Error('Acesso à reserva inválido.');
    }

    var statusAtual = String(reservaRow[6]);
    var participanteId = String(reservaRow[1]);
    var numerosStr = String(reservaRow[2]);
    var numerosArr = numerosStr.split(',').map(function(s) { return s.trim(); });
    var valorTotal = reservaRow[5];
    var dataExpiracao = new Date(reservaRow[8]);

    if (statusAtual !== CONFIG.STATUS.RESERVADO) {
      throw new Error(statusAtual === CONFIG.STATUS.AGUARDANDO_VALIDACAO ? 'Comprovante já recebido. Aguarde a análise.' : 'Esta reserva não aceita novos comprovantes.');
    }
    if (!isFinite(dataExpiracao.getTime())) throw new Error('Prazo de reserva inválido.');
    var linhasNumeros = validarNumerosReserva_(sheetNumeros, protocolo, numerosArr, CONFIG.STATUS.RESERVADO);
    var pagamentosExistentes = sheetPag.getDataRange().getValues();
    if (pagamentosExistentes.some(function(row, i) { return i > 0 && String(row[1]) === protocolo; })) {
      throw new Error('Já existe um comprovante para esta reserva. Procure o responsável.');
    }

    if (statusAtual === CONFIG.STATUS.CONFIRMADO) {
      lock.releaseLock();
      return { success: false, message: 'Esta participação já foi confirmada anteriormente.' };
    }

    // Se já estiver expirado e ainda sem envio anterior
    if (statusAtual === CONFIG.STATUS.EXPIRADO || (statusAtual === CONFIG.STATUS.RESERVADO && dataExpiracao.getTime() < new Date().getTime())) {
      lock.releaseLock();
      return {
        success: false,
        message: 'O tempo limite de 15 minutos para esta reserva expirou e os números foram liberados.'
      };
    }

    // Localiza nome do participante
    var nomeParticipante = 'Participante';
    var telParticipante = '';
    if (sheetPart) {
      var dataPart = sheetPart.getDataRange().getValues();
      for (var p = 1; p < dataPart.length; p++) {
        if (dataPart[p][0] === participanteId) {
          nomeParticipante = dataPart[p][1] || 'Participante';
          telParticipante = dataPart[p][2] || '';
          break;
        }
      }
    }

    // 1. Faz upload do arquivo para o Google Drive
    var uploadResult = salvarComprovanteDrive_(
      payload.filePayload,
      nomeParticipante,
      numerosArr,
      new Date()
    );

    var agora = new Date();
    var pagamentoId = 'PAG-' + Utilities.getUuid().substring(0, 8).toUpperCase();

    // 2. Atualiza a reserva para AGUARDANDO_VALIDACAO
    sheetReservas.getRange(reservaIndex, 7).setValue(CONFIG.STATUS.AGUARDANDO_VALIDACAO);

    // 3. Atualiza os números para AGUARDANDO_VALIDACAO (protegendo contra expiração automática)
    var dataNumeros = sheetNumeros.getDataRange().getValues();
    for (var n = 1; n < dataNumeros.length; n++) {
      var numSheet = padNumero_(dataNumeros[n][0], 3);
      if (numerosArr.indexOf(numSheet) !== -1) {
        sheetNumeros.getRange(n + 1, 2).setValue(CONFIG.STATUS.AGUARDANDO_VALIDACAO);
      }
    }

    // 4. Registra na aba PAGAMENTOS
    sheetPag.appendRow([
      pagamentoId,
      protocolo,
      participanteId,
      valorTotal,
      uploadResult.fileUrl,
      CONFIG.STATUS.AGUARDANDO_VALIDACAO,
      formatDateTime_(agora),
      '', // dataValidacao
      ''  // observacao
    ]);

    // 5. Registra log
    logAction_('COMPROVANTE_ENVIADO', nomeParticipante, {
      protocolo: protocolo,
      arquivo: uploadResult.fileName,
      url: uploadResult.fileUrl,
      valor: valorTotal
    });

    lock.releaseLock();

    // 6. Prepara link do WhatsApp para notificar a cafeteria
    var config = getActiveConfig_();
    var whatsappUrl = buildWhatsAppUrl_(
      config.whatsappContato,
      nomeParticipante,
      numerosArr,
      valorTotal,
      protocolo
    );

    return {
      success: true,
      protocolo: protocolo,
      numeros: numerosArr,
      valorTotalFormatado: formatCurrency_(valorTotal),
      status: CONFIG.STATUS.AGUARDANDO_VALIDACAO,
      mensagem: 'Comprovante recebido com sucesso! Seu pagamento está aguardando validação.',
      whatsappUrl: whatsappUrl
    };
  } catch (err) {
    if (lock) lock.releaseLock();
    Logger.log('Erro ao confirmar envio de comprovante: ' + err.message);
    return {
      success: false,
      message: 'Falha ao processar o comprovante: ' + err.message
    };
  }
}
