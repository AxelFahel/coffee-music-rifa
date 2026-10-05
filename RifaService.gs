/**
 * RifaService.gs - Serviços de consulta pública e status dos números
 */

/**
 * Retorna dados completos para o carregamento inicial da página pública
 */
function getPublicData() {
  try {
    var config = getActiveConfig();
    var numerosRaw = getNumerosRaw();

    var counts = {
      total: config.totalNumeros,
      disponiveis: 0,
      reservados: 0,
      aguardando: 0,
      confirmados: 0
    };

    var numerosList = [];

    // Se a lista estiver vazia (primeira execução), gera dinamicamente para o frontend não quebrar
    if (numerosRaw.length === 0) {
      for (var i = 1; i <= config.totalNumeros; i++) {
        var numStr = padNumero(i, 3);
        numerosList.push({ n: numStr, s: CONFIG.STATUS.DISPONIVEL });
        counts.disponiveis++;
      }
    } else {
      for (var j = 0; j < numerosRaw.length; j++) {
        var item = numerosRaw[j];
        var st = item.status || CONFIG.STATUS.DISPONIVEL;

        // Se estiver como RESERVADO, checa se já expirou
        if (st === CONFIG.STATUS.RESERVADO && item.dataExpiracao) {
          var exp = new Date(item.dataExpiracao);
          if (exp.getTime() < new Date().getTime()) {
            st = CONFIG.STATUS.DISPONIVEL; // trata como disponível visualmente
          }
        }

        numerosList.push({ n: item.numero, s: st });

        if (st === CONFIG.STATUS.DISPONIVEL) counts.disponiveis++;
        else if (st === CONFIG.STATUS.RESERVADO) counts.reservados++;
        else if (st === CONFIG.STATUS.AGUARDANDO_VALIDACAO) counts.aguardando++;
        else if (st === CONFIG.STATUS.CONFIRMADO) counts.confirmados++;
      }
    }

    return {
      success: true,
      campanha: {
        nomeEstabelecimento: config.nomeEstabelecimento,
        nomeCampanha: config.nomeCampanha,
        premio: config.premio,
        totalPontos: config.totalNumeros,
        valorUnitario: config.valorNumero,
        valorUnitarioFormatado: formatCurrency(config.valorNumero),
        tempoReservaMinutos: config.tempoReservaMinutos,
        whatsappContato: config.whatsappContato,
        chavePix: config.chavePix,
        nomeFavorecido: config.nomeFavorecido,
        cidadePix: config.cidadePix
      },
      resumo: counts,
      numeros: numerosList
    };
  } catch (error) {
    Logger.log('Erro em getPublicData: ' + error.message);
    return {
      success: false,
      message: 'Não foi possível carregar os dados da rifa: ' + error.message
    };
  }
}

/**
 * Consulta leve e rápida para atualização periódica (polling a cada 10-15s)
 */
function getNumerosStatus() {
  try {
    var config = getActiveConfig();
    var numerosRaw = getNumerosRaw();

    var counts = {
      disponiveis: 0,
      reservados: 0,
      aguardando: 0,
      confirmados: 0
    };

    var statusArray = [];

    for (var i = 0; i < numerosRaw.length; i++) {
      var item = numerosRaw[i];
      var st = item.status || CONFIG.STATUS.DISPONIVEL;

      if (st === CONFIG.STATUS.RESERVADO && item.dataExpiracao) {
        var exp = new Date(item.dataExpiracao);
        if (exp.getTime() < new Date().getTime()) {
          st = CONFIG.STATUS.DISPONIVEL;
        }
      }

      statusArray.push({ n: item.numero, s: st });

      if (st === CONFIG.STATUS.DISPONIVEL) counts.disponiveis++;
      else if (st === CONFIG.STATUS.RESERVADO) counts.reservados++;
      else if (st === CONFIG.STATUS.AGUARDANDO_VALIDACAO) counts.aguardando++;
      else if (st === CONFIG.STATUS.CONFIRMADO) counts.confirmados++;
    }

    return {
      success: true,
      resumo: counts,
      numeros: statusArray
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Consulta dados de uma participação pelo código de protocolo
 */
function consultarProtocolo(protocolo) {
  if (!protocolo || typeof protocolo !== 'string') {
    return { success: false, message: 'Protocolo inválido ou não informado.' };
  }

  var protoLimpo = protocolo.trim().toUpperCase();

  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.RESERVAS);
    if (!sheet) {
      return { success: false, message: 'Base de reservas não encontrada.' };
    }

    var data = sheet.getDataRange().getValues();
    // Headers: id, participanteId, numeros, quantidade, valorUnitario, valorTotal, status, dataReserva, dataExpiracao
    var reserva = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === protoLimpo) {
        reserva = {
          protocolo: data[i][0],
          participanteId: data[i][1],
          numeros: String(data[i][2]).split(',').map(function(n) { return n.trim(); }),
          quantidade: data[i][3],
          valorUnitario: data[i][4],
          valorTotal: data[i][5],
          status: data[i][6],
          dataReserva: data[i][7],
          dataExpiracao: data[i][8]
        };
        break;
      }
    }

    if (!reserva) {
      return { success: false, message: 'Nenhuma participação encontrada para o protocolo informado.' };
    }

    // Busca nome do participante
    var nomeMascarado = 'Participante';
    var sheetPart = ss.getSheetByName(CONFIG.SHEETS.PARTICIPANTES);
    if (sheetPart) {
      var dataPart = sheetPart.getDataRange().getValues();
      for (var p = 1; p < dataPart.length; p++) {
        if (dataPart[p][0] === reserva.participanteId) {
          var nomeCompleto = String(dataPart[p][1] || '').trim();
          var partes = nomeCompleto.split(' ');
          if (partes.length > 1) {
            nomeMascarado = partes[0] + ' ' + partes[partes.length - 1][0] + '.';
          } else {
            nomeMascarado = partes[0];
          }
          break;
        }
      }
    }

    return {
      success: true,
      dados: {
        protocolo: reserva.protocolo,
        participante: nomeMascarado,
        numeros: reserva.numeros,
        quantidade: reserva.quantidade,
        valorTotalFormatado: formatCurrency(reserva.valorTotal),
        status: reserva.status,
        dataReservaFormatada: formatDateTime(reserva.dataReserva),
        expirado: (reserva.status === CONFIG.STATUS.RESERVADO && new Date(reserva.dataExpiracao).getTime() < new Date().getTime())
      }
    };
  } catch (err) {
    return { success: false, message: 'Erro ao consultar protocolo: ' + err.message };
  }
}
