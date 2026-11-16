/* Página inicial */
(function () {
  'use strict';
  var CC = window.CC, f = CC.f, $ = CC.$, P = CC.PREMISSAS;

  function cenario() {
    var imovel = f.inteiro($('imovel').value), entrada = Math.min(f.inteiro($('entrada').value), imovel);
    return {
      imovel: imovel, entrada: entrada, financiado: imovel - entrada, meses: +$('prazo').value * 12,
      sistema: 'sac', indexAA: P.tr, mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm
    };
  }
  var EXEMPLO = { imovel: 500000, financiado: 400000, meses: 360, sistema: 'sac', indexAA: P.tr, mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm };

  function tabela(linha, corpo, titulo, rotulo) {
    var lista = CC.taxasDe(linha, 'tr');
    if (lista.length) $(titulo).textContent = rotulo + ' a partir de ' + f.pct(lista[0].aa, 2);
    $(corpo).innerHTML = lista.slice(0, 6).map(function (t) {
      return '<tr><td>' + CC.selo(t, 'p') + (CC.paginaBanco(t.id) ? '<a href="' + CC.paginaBanco(t.id) + '">' + f.esc(t.nome) + '</a>' : '<span>' + f.esc(t.nome) + '</span>') + '</td><td><b>' + f.pct(t.aa, 2) + '</b></td><td>' +
        '<a href="comparar.html?l=' + linha + '">' + f.brl(CC.simular(EXEMPLO, t.aa).primeira) + '</a></td></tr>';
    }).join('');
  }

  function melhorParcela() {
    var c = cenario();
    var linha = c.imovel > CC.CONFIG.tetoSFH ? 'mer' : 'reg';
    var lista = CC.taxasDe(linha, 'tr');
    $('melhorParcela').textContent = c.financiado > 0 && lista.length ? f.brl(CC.simular(c, lista[0].aa).primeira) : '—';
  }

  function desenhar() {
    tabela('reg', 'tabReg', 'tituloReg', 'Linhas reguladas (SFH)');
    tabela('mer', 'tabMer', 'tituloMer', 'Linhas de mercado (SFI)');
    // faixa de logotipos: só instituições com logotipo, as de maior alcance primeiro
    var ORDEM = ['00360305', '00000000', '60701190', '60746948', '90400888', '00416968', '02038232', '01181521', '92702067', '00000208', '28127603', '00655522', '62232889', '04913711', '13009717'];
    var porId = {};
    CC.dados.taxas.forEach(function (t) { porId[t.id] = t; });
    var logos = window.LOGOS_BANCOS || {};
    $('faixaBancos').innerHTML = '<p>Comparamos as taxas de</p>' + ORDEM.filter(function (id) { return porId[id] && logos[id]; })
      .map(function (id) { return '<span class="nome">' + CC.selo(porId[id], 'p') + '</span>'; }).join('');
    melhorParcela();
  }

  $('imovel').addEventListener('input', function () {
    this.value = f.milhar(f.inteiro(this.value));
    $('entrada').value = f.milhar(f.inteiro(this.value) * f.num($('entradaPct').value) / 100);
    melhorParcela();
  });
  $('entrada').addEventListener('input', function () {
    this.value = f.milhar(f.inteiro(this.value));
    var im = f.inteiro($('imovel').value);
    $('entradaPct').value = im ? (f.inteiro(this.value) / im * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '';
    melhorParcela();
  });
  $('entradaPct').addEventListener('input', function () {
    $('entrada').value = f.milhar(f.inteiro($('imovel').value) * Math.min(f.num(this.value), 100) / 100);
    melhorParcela();
  });
  $('prazo').addEventListener('input', function () { $('prazoTxt').textContent = this.value + ' anos'; melhorParcela(); });
  $('busca').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = cenario();
    location.href = 'comparar.html?v=' + c.imovel + '&e=' + c.entrada + '&p=' + (c.meses / 12);
  });

  CC.montarPagina('inicio');
  CC.iniciarDados(desenhar);
  desenhar();
})();
