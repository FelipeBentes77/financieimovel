/* Página de banco: simulador com as taxas médias da instituição */
(function () {
  'use strict';
  var CC = window.CC, f = CC.f, $ = CC.$, P = CC.PREMISSAS;
  var caixa = document.querySelector('[data-banco]');
  CC.montarPagina('bancos');
  if (!caixa) { CC.iniciarDados(); return; }

  var id = String(caixa.getAttribute('data-banco')).replace(/\D/g, '');
  var LINHA = { reg: 'SFH', mer: 'SFI' }, IDX = { tr: 'TR', ipca: 'IPCA', pre: 'taxa fixa' };
  var sistema = function () { return document.querySelector('input[name=sistema]:checked').value; };
  var escolhida = '';

  function modalidades() {
    return CC.dados.taxas.filter(function (t) { return t.id === id; })
      .sort(function (a, b) { return (a.linha === 'reg' ? 0 : 1) - (b.linha === 'reg' ? 0 : 1) || a.aa - b.aa; });
  }

  function preencherModalidades() {
    var lista = modalidades(), sel = $('simModalidade');
    if (!lista.length) return;
    if (!escolhida) escolhida = sel.value || (lista[0].linha + '|' + lista[0].idx);
    sel.innerHTML = lista.map(function (t) {
      var chave = t.linha + '|' + t.idx;
      return '<option value="' + chave + '"' + (chave === escolhida ? ' selected' : '') + '>' + LINHA[t.linha] + ' · ' + IDX[t.idx] + ' · ' + f.pct(t.aa, 2) + ' a.a.</option>';
    }).join('');
    escolhida = sel.value;
  }

  function calcular() {
    var lista = modalidades();
    if (!lista.length) return;
    var p = $('simModalidade').value.split('|');
    var t = lista.filter(function (x) { return x.linha === p[0] && x.idx === p[1]; })[0] || lista[0];
    var imovel = f.inteiro($('simImovel').value), entrada = Math.min(f.inteiro($('simEntrada').value), imovel);
    var anos = +$('simPrazo').value, sis = sistema(), fin = Math.max(imovel - entrada, 0);
    $('simPrazoTxt').textContent = anos + ' anos';
    $('simEntradaPct').textContent = imovel > 0 ? Math.round(entrada / imovel * 100) + '% do imóvel' : '';
    if (fin <= 0) { $('simParcela').textContent = '—'; return; }
    var r = CC.simular({ financiado: fin, imovel: imovel, meses: anos * 12, sistema: sis,
      indexAA: t.idx === 'tr' ? P.tr : t.idx === 'ipca' ? P.ipca : 0, mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm }, t.aa);
    $('simParcela').textContent = f.brl(r.primeira);
    $('simUltima').textContent = f.brl(r.ultima);
    $('simJuros').textContent = f.brl(r.juros);
    $('simCet').textContent = f.pct(r.cet, 2) + ' a.a.';
    $('simRenda').textContent = f.brl(r.maior / 0.3);
    $('simFin').textContent = f.brl(fin);
    $('simAviso').hidden = entrada / imovel >= 0.2;
    $('simComparar').href = CC.R + 'comparar.html?v=' + imovel + '&e=' + entrada + '&p=' + anos + '&s=' + sis + '&i=' + t.idx + '&l=' + t.linha;
  }

  ['simImovel', 'simEntrada'].forEach(function (c) {
    $(c).addEventListener('input', function () { this.value = f.milhar(f.inteiro(this.value)); calcular(); });
  });
  $('simPrazo').addEventListener('input', calcular);
  $('simModalidade').addEventListener('change', function () { escolhida = this.value; calcular(); });
  $('simForm').addEventListener('change', calcular);
  $('simForm').addEventListener('submit', function (e) { e.preventDefault(); });

  var atualizar = function () { preencherModalidades(); calcular(); };
  CC.iniciarDados(atualizar);
  atualizar();
})();
