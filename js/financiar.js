/* Calculadora "Quanto posso financiar" */
(function () {
  'use strict';
  var CC = window.CC, f = CC.f, $ = CC.$, P = CC.PREMISSAS;
  var sistema = function () { return document.querySelector('input[name=sistema]:checked').value; };

  function taxaRef() {
    var modo = $('taxaRef').value;
    if (modo === 'outra') return f.num($('taxaOutra').value);
    var lista = CC.taxasDe('reg', 'tr').filter(function (t) { return !t.regiao; });
    if (!lista.length) return 11;
    return modo === 'menor' ? lista[0].aa : lista[Math.floor((lista.length - 1) / 2)].aa;
  }

  // maior parcela do contrato para um dado valor financiado
  function maiorParcela(fin, entrada, meses, sis, aa) {
    return CC.simular({ financiado: fin, imovel: fin + entrada, meses: meses, sistema: sis, indexAA: P.tr, mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm }, aa).maior;
  }

  function calcular() {
    var renda = f.inteiro($('renda').value), entrada = f.inteiro($('entrada').value);
    var anos = +$('prazo').value, meses = anos * 12, sis = sistema(), aa = taxaRef();
    var comp = +$('comp').value, limite = renda * comp / 100;
    $('campoTaxa').hidden = $('taxaRef').value !== 'outra';

    var fin = 0;
    if (limite > P.adm && aa > 0) {
      var lo = 0, hi = 20000000;
      for (var i = 0; i < 40; i++) {
        var meio = (lo + hi) / 2;
        if (maiorParcela(meio, entrada, meses, sis, aa) > limite) hi = meio; else lo = meio;
      }
      fin = Math.floor(lo / 1000) * 1000;
    }
    // os bancos financiam, em geral, até 80% do imóvel
    var porRenda = fin, tetoEntrada = entrada * 4, limitadoEntrada = false;
    if (fin > tetoEntrada) { fin = tetoEntrada; limitadoEntrada = true; }
    var imovel = fin + entrada;
    var parcela = fin > 0 ? maiorParcela(fin, entrada, meses, sis, aa) : 0;

    $('imovelMax').textContent = imovel > 0 ? f.brl(imovel) : '—';
    $('finMax').textContent = f.brl(fin);
    $('parcelaMax').textContent = f.brl(parcela);
    $('taxaUsada').textContent = f.pct(aa, 2) + ' a.a.';
    $('irComparar').href = 'comparar.html?v=' + imovel + '&e=' + entrada + '&p=' + anos + '&s=' + sis + '&r=' + renda;
    $('imovelRef').textContent = f.brl(imovel);
    $('custosRef').textContent = f.brl(imovel * 0.045);

    var av = $('avisoLimite');
    av.hidden = !limitadoEntrada && imovel <= CC.CONFIG.tetoSFH;
    if (limitadoEntrada) {
      av.textContent = 'Sua renda comportaria financiar até ' + f.brl(porRenda) + ', mas a entrada limita o resultado: os bancos costumam financiar no máximo 80% do imóvel. Com mais ' +
        f.brl(Math.ceil((porRenda / 4 - entrada) / 1000) * 1000) + ' de entrada você aproveitaria toda a capacidade da renda.';
    } else if (imovel > CC.CONFIG.tetoSFH) {
      av.textContent = 'Acima de ' + f.brl(CC.CONFIG.tetoSFH) + ' o imóvel sai do SFH e as taxas de mercado costumam ser maiores, o que reduz esse valor.';
    }
    $('explica').textContent = 'Com renda de ' + f.brl(renda) + ', a parcela pode chegar a ' + f.brl(limite) + ' (' + comp + '% da renda). A ' + f.pct(aa, 2) +
      ' ao ano, em ' + anos + ' anos pela tabela ' + (sis === 'sac' ? 'SAC' : 'Price') + ', essa parcela paga um financiamento de até ' + f.brl(porRenda) +
      '. Somando a entrada de ' + f.brl(entrada) + (limitadoEntrada ? ' e respeitando o limite de 80% financiados' : '') + ', chegamos ao valor do imóvel.';
  }

  ['renda', 'entrada'].forEach(function (id) {
    $(id).addEventListener('input', function () { this.value = f.milhar(f.inteiro(this.value)); calcular(); });
  });
  $('prazo').addEventListener('input', function () { $('prazoTxt').textContent = this.value + ' anos'; calcular(); });
  $('comp').addEventListener('input', function () { $('compTxt').textContent = this.value + '%'; calcular(); });
  $('taxaOutra').addEventListener('input', calcular);
  $('form').addEventListener('change', calcular);
  $('form').addEventListener('submit', function (e) { e.preventDefault(); });

  CC.montarPagina('financiar');
  CC.iniciarDados(calcular);
  calcular();
})();
