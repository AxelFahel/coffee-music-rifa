/**
 * ReservaService.gs - Controle atômico de reservas com LockService e expiração
 */

/**
 * Cria uma nova reserva de forma atômica com validações rigorosas no backend
 */
function fazerReserva(dados) {
  if (!dados) {
    return { success: false, message: 'Dados da requisição não fornecidos.' };
  }

  // 1. Validação dos dados do participante
  var nome = String(dados.nome || '').trim();
  var whatsapp = String(dados.whatsapp || '').replace(/\D/g, '');
  var email = String(dados.email || '').trim();

  if (nome.length < 3 || nome.length > 120 || email.length > 150) {
    return { success: false, message: 'Por favor, informe seu nome completo.' };
  }
  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return { success: false, message: 'Por favor, informe um WhatsApp válido com DDD.' };
  }

  // 2. Validação dos números
  var numerosSolicitados = dados.numeros;
  if (!Array.isArray(numerosSolicitados) || numerosSolicitados.length === 0 || numerosSolicitados.length > 20) {
    return { success: false, message: 'Selecione pelo menos um número da ação.' };
  }

  // Sanitiza e formata os números (ex: "5" -> "005")
  var config = getActiveConfig_();
  var totalMax = config.totalNumeros;
  var numerosFormatados = [];
  var vistos = {};

  for (var i = 0; i < numerosSolicitados.length; i++) {
    if (!/^\d{1,3}$/.test(String(numerosSolicitados[i]))) return { success: false, message: 'Seleção inválida.' };
    var nInt = Number(numerosSolicitados[i]);
    if (isNaN(nInt) || nInt < 1 || nInt > totalMax) {
      return { success: false, message: 'Número inválido na seleção: ' + numerosSolicitados[i] };
    }
    var nPad = padNumero_(nInt, 3);
    if (!vistos[nPad]) {
      vistos[nPad] = true;
      numerosFormatados.push(nPad);
    }
  }

  if (numerosFormatados.length === 0) {
    return { success: false, message: 'Nenhum número válido foi selecionado.' };
  }

  try { limitar_('RESERVAS', 30, 60); } catch (err) { return { success: false, message: err.message }; }

  // 3. Controle de concorrência com LockService
  var lock = LockService.getScriptLock();
  try {
    // Aguarda até 25 segundos para adquirir o lock exclusivo
    var lockAdquirido = lock.tryLock(25000);
    if (!lockAdquirido) {
      return {
        success: false,
        message: 'O sistema está processando muitas reservas no momento. Por favor, tente novamente em alguns instantes.'
      };
    }

    var ss = getSpreadsheet_();
    var sheetNumeros = getOrCreateSheet_(ss, CONFIG.SHEETS.NUMEROS, [
      'numero', 'status', 'reservaId', 'participanteId', 'dataReserva', 'dataExpiracao', 'dataConfirmacao'
    ]);
    var dataNumeros = sheetNumeros.getDataRange().getValues();

    // Mapeia números existentes na planilha e suas linhas
    var mapaNumeros = {};
    for (var r = 1; r < dataNumeros.length; r++) {
      var numAtual = padNumero_(dataNumeros[r][0], 3);
      mapaNumeros[numAtual] = {
        rowIndex: r + 1,
        status: dataNumeros[r][1] || CONFIG.STATUS.DISPONIVEL,
        reservaId: dataNumeros[r][2] || '',
        dataExpiracao: dataNumeros[r][5] || ''
      };
    }

    var agora = new Date();
    var numerosIndisponiveis = [];

    // 4. Verificação de disponibilidade de cada número solicitado
    for (var k = 0; k < numerosFormatados.length; k++) {
      var numCheck = numerosFormatados[k];
      var registro = mapaNumeros[numCheck];

      if (!registro) {
        // Se a linha não existe, o número está indisponível
        numerosIndisponiveis.push(numCheck);
        continue;
      }

      var st = registro.status;
      // Se estiver reservado, verifica se já expirou
      if (st === CONFIG.STATUS.RESERVADO && registro.dataExpiracao) {
        var expDate = new Date(registro.dataExpiracao);
        if (expDate.getTime() < agora.getTime()) {
          st = CONFIG.STATUS.DISPONIVEL; // expirado, pode ser reassumido
        }
      }

      if (st !== CONFIG.STATUS.DISPONIVEL) {
        numerosIndisponiveis.push(numCheck);
      }
    }

    // Se qualquer número estiver indisponível, aborta com mensagem amigável
    if (numerosIndisponiveis.length > 0) {
      lock.releaseLock();
      return {
        success: false,
        code: 'UNAVAILABLE',
        numerosIndisponiveis: numerosIndisponiveis,
        message: 'Um ou mais números selecionados (' + numerosIndisponiveis.join(', ') + ') acabaram de ser reservados por outra pessoa. Atualizamos a lista de números disponíveis.'
      };
    }

    var existingParts = ss.getSheetByName(CONFIG.SHEETS.PARTICIPANTES);
    var existingRes = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    if (existingParts && existingRes) {
      var ids = existingParts.getDataRange().getValues().filter(function(row, i) {
        return i > 0 && String(row[2]).replace(/\D/g, '') === whatsapp;
      }).map(function(row) { return String(row[0]); });
      var active = existingRes.getDataRange().getValues().filter(function(row, i) {
        return i > 0 && ids.indexOf(String(row[1])) >= 0 &&
          (row[6] === CONFIG.STATUS.AGUARDANDO_VALIDACAO || (row[6] === CONFIG.STATUS.RESERVADO && new Date(row[8]).getTime() > Date.now()));
      });
      if (active.length >= 3) throw new Error('Há três reservas em aberto para este WhatsApp. Conclua-as antes de reservar novamente.');
    }

    // 5. Cálculo seguro do valor no servidor (NUNCA confiar no frontend)
    var valorUnitario = config.valorNumero;
    var valorTotal = numerosFormatados.length * valorUnitario;

    // 6. Geração de IDs e Prazos
    var protocolo = generateProtocolo_();
    var reservaToken = randomToken_();
    var participanteId = 'PART-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    var tempoMinutos = config.tempoReservaMinutos;
    var dataExpiracao = new Date(agora.getTime() + tempoMinutos * 60 * 1000);

    // 7. Salvar participante
    var sheetPart = getOrCreateSheet_(ss, CONFIG.SHEETS.PARTICIPANTES, [
      'id', 'nome', 'whatsapp', 'email', 'dataCadastro'
    ]);
    sheetPart.appendRow([participanteId, textoPlanilha_(nome), whatsapp, textoPlanilha_(email), formatDateTime_(agora)]);

    // 8. Salvar reserva
    var sheetReservas = getOrCreateSheet_(ss, CONFIG.SHEETS.RESERVAS, [
      'id', 'participanteId', 'numeros', 'quantidade', 'valorUnitario', 'valorTotal', 'status', 'dataReserva', 'dataExpiracao', 'tokenHash'
    ]);
    sheetReservas.appendRow([
      protocolo,
      participanteId,
      numerosFormatados.join(','),
      numerosFormatados.length,
      valorUnitario,
      valorTotal,
      CONFIG.STATUS.RESERVADO,
      agora.toISOString(),
      dataExpiracao.toISOString(),
      hash_(reservaToken)
    ]);

    // 9. Atualizar os números na aba NUMEROS
    for (var m = 0; m < numerosFormatados.length; m++) {
      var numAlvo = numerosFormatados[m];
      var infoAlvo = mapaNumeros[numAlvo];
      var row = infoAlvo.rowIndex;

      // Colunas: 1:numero, 2:status, 3:reservaId, 4:participanteId, 5:dataReserva, 6:dataExpiracao, 7:dataConfirmacao
      sheetNumeros.getRange(row, 2, 1, 5).setValues([[
        CONFIG.STATUS.RESERVADO,
        protocolo,
        participanteId,
        agora.toISOString(),
        dataExpiracao.toISOString()
      ]]);
    }

    // 10. Registrar Log
    logAction_('RESERVA_CRIADA', nome, {
      protocolo: protocolo,
      numeros: numerosFormatados,
      quantidade: numerosFormatados.length,
      valorTotal: valorTotal
    });

    // 11. Liberar lock
    lock.releaseLock();

    // 12. Gerar dados de pagamento PIX (Copia e Cola e QR Code)
    var pixCopiaECola = generatePixPayload_(
      config.chavePix,
      config.nomeFavorecido,
      config.cidadePix,
      valorTotal,
      protocolo
    );
    var qrCodeUrl = getQrCodeImageUrl_(pixCopiaECola);

    return {
      success: true,
      reserva: {
        token: reservaToken,
        id: protocolo,
        protocolo: protocolo,
        participanteNome: nome,
        whatsapp: dados.whatsapp,
        numeros: numerosFormatados,
        quantidade: numerosFormatados.length,
        valorUnitario: valorUnitario,
        valorTotal: valorTotal,
        valorTotalFormatado: formatCurrency_(valorTotal),
        dataReserva: formatDateTime_(agora),
        dataExpiracaoISO: dataExpiracao.toISOString(),
        tempoRestanteSegundos: tempoMinutos * 60,
        pix: {
          chave: config.chavePix,
          tipoChave: config.tipoChavePix,
          nomeFavorecido: config.nomeFavorecido,
          cidade: config.cidadePix,
          valorFormatado: formatCurrency_(valorTotal),
          copiaECola: pixCopiaECola,
          qrCodeUrl: qrCodeUrl
        }
      }
    };
  } catch (error) {
    if (lock) lock.releaseLock();
    Logger.log('Erro ao fazer reserva: ' + error.message);
    return {
      success: false,
      message: 'Ocorreu um erro ao processar sua reserva: ' + error.message
    };
  }
}

/**
 * Rotina automática acionada por Trigger para liberar reservas que expiraram
 */
function liberarReservasExpiradas_() {
  var lock = LockService.getScriptLock();
  try {
    var lockAdquirido = lock.tryLock(20000);
    if (!lockAdquirido) {
      Logger.log('liberarReservasExpiradas_: Lock ocupado.');
      return;
    }

    var ss = getSpreadsheet_();
    var sheetReservas = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    var sheetNumeros = ss.getSheetByName(CONFIG.SHEETS.NUMEROS);
    var sheetPagamentos = ss.getSheetByName(CONFIG.SHEETS.PAGAMENTOS);

    if (!sheetReservas || !sheetNumeros) {
      lock.releaseLock();
      return;
    }

    var dataReservas = sheetReservas.getDataRange().getValues();
    if (dataReservas.length <= 1) {
      lock.releaseLock();
      return;
    }

    // Coleta IDs de reservas que já enviaram comprovante para NUNCA expirar
    var reservasComComprovante = {};
    if (sheetPagamentos) {
      var dataPag = sheetPagamentos.getDataRange().getValues();
      for (var p = 1; p < dataPag.length; p++) {
        var resId = String(dataPag[p][1] || '').trim();
        if (resId) reservasComComprovante[resId] = true;
      }
    }

    var agora = new Date().getTime();
    var reservasExpiradas = [];

    // Identifica reservas expiradas
    for (var i = 1; i < dataReservas.length; i++) {
      var row = dataReservas[i];
      var id = String(row[0]).trim();
      var st = String(row[6]).trim();
      var expStr = row[8];

      // Apenas status RESERVADO pode expirar
      if (st === CONFIG.STATUS.RESERVADO && expStr) {
        // Se já tiver comprovante enviado, não expira
        if (reservasComComprovante[id]) continue;

        var expTime = new Date(expStr).getTime();
        if (expTime < agora) {
          reservasExpiradas.push({
            id: id,
            rowIndex: i + 1,
            numeros: String(row[2]).split(',').map(function(s) { return s.trim(); })
          });
        }
      }
    }

    if (reservasExpiradas.length === 0) {
      lock.releaseLock();
      return;
    }

    // Mapeia números na planilha NUMEROS
    var dataNumeros = sheetNumeros.getDataRange().getValues();
    var mapaLinhasNumeros = {};
    for (var n = 1; n < dataNumeros.length; n++) {
      var numStr = padNumero_(dataNumeros[n][0], 3);
      mapaLinhasNumeros[numStr] = {
        rowIndex: n + 1,
        status: dataNumeros[n][1],
        reservaId: dataNumeros[n][2]
      };
    }

    // Processa cada reserva expirada
    for (var e = 0; e < reservasExpiradas.length; e++) {
      var expItem = reservasExpiradas[e];

      // Atualiza status na aba RESERVAS para EXPIRADO
      sheetReservas.getRange(expItem.rowIndex, 7).setValue(CONFIG.STATUS.EXPIRADO);

      // Libera os números correspondentes
      for (var numIdx = 0; numIdx < expItem.numeros.length; numIdx++) {
        var num = padNumero_(expItem.numeros[numIdx], 3);
        var reg = mapaLinhasNumeros[num];
        // Libera apenas se ainda estiver associado a esta reserva e não tiver sido confirmado
        if (reg && reg.reservaId === expItem.id && reg.status === CONFIG.STATUS.RESERVADO) {
          sheetNumeros.getRange(reg.rowIndex, 2, 1, 5).setValues([[
            CONFIG.STATUS.DISPONIVEL,
            '', // reservaId
            '', // participanteId
            '', // dataReserva
            ''  // dataExpiracao
          ]]);
        }
      }

      logAction_('RESERVA_EXPIRADA', 'TRIGGER_EXPIRACAO', {
        protocolo: expItem.id,
        numeros: expItem.numeros
      });
    }

    lock.releaseLock();
    Logger.log('Reservas expiradas liberadas: ' + reservasExpiradas.length);
  } catch (err) {
    if (lock) lock.releaseLock();
    Logger.log('Erro em liberarReservasExpiradas_: ' + err.message);
  }
}
