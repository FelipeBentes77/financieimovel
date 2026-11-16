/* Página do comparador */
(function () {
  'use strict';
  var CC = window.CC, f = CC.f, $ = CC.$, P = CC.PREMISSAS;
  var CORES = ['#ff5c39', '#2f54eb', '#0f8a5f', '#a23bd1'];
  var IDX = { tr: 'TR', ipca: 'IPCA', pre: 'taxa fixa' };

  var estado = { ajustes: {}, ofertas: [], marcados: null, abertos: {}, ultimo: [] };
  // propostas salvas no navegador: aceita só itens no formato esperado
  try {
    var salvas = JSON.parse(localStorage.getItem('cc_ofertas') || '[]');
    estado.ofertas = (Array.isArray(salvas) ? salvas : []).filter(function (o) {
      return o && /^p\d{1,16}$/.test(o.id) && typeof o.nome === 'string' && o.nome.length <= 40 && typeof o.aa === 'number' && o.aa > 0 && o.aa < 40;
    }).slice(0, 20);
  } catch (e) { /* sem storage */ }

  var radio = function (n) { return document.querySelector('input[name=' + n + ']:checked').value; };
  var marcar = function (n, v) { var el = document.querySelector('input[name=' + n + '][value="' + v + '"]'); if (el) el.checked = true; };
  var virgula = function (n) { return String(n).replace('.', ','); };

  /* ---------- estado inicial a partir do link ---------- */
  (function () {
    var q = new URLSearchParams(location.search);
    var v = f.inteiro(q.get('v') || '') || 500000;
    var e = q.has('e') ? Math.min(f.inteiro(q.get('e')), v) : Math.round(v * 0.2);
    var p = Math.min(Math.max(parseInt(q.get('p'), 10) || 30, 5), 35);
    $('imovel').value = f.milhar(v);
    $('entrada').value = f.milhar(e);
    $('entradaPct').value = (e / v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    $('prazo').value = p; $('prazoTxt').textContent = p + ' anos';
    $('renda').value = f.milhar(f.inteiro(q.get('r') || ''));
    marcar('sistema', q.get('s') === 'price' ? 'price' : 'sac');
    marcar('indexador', IDX[q.get('i')] ? q.get('i') : 'tr');
    marcar('linha', q.get('l') === 'mer' ? 'mer' : 'reg');
    $('trAA').value = virgula(P.tr); $('ipcaAA').value = virgula(P.ipca);
    $('mip').value = virgula(P.mip); $('dfi').value = virgula(P.dfi); $('adm').value = P.adm;
  })();

  function cenario() {
    var imovel = f.inteiro($('imovel').value), entrada = Math.min(f.inteiro($('entrada').value), imovel);
    var idx = radio('indexador');
    return {
      imovel: imovel, entrada: entrada, financiado: imovel - entrada,
      meses: +$('prazo').value * 12, renda: f.inteiro($('renda').value),
      sistema: radio('sistema'), idx: idx, linha: radio('linha'),
      indexAA: idx === 'tr' ? f.num($('trAA').value) : idx === 'ipca' ? f.num($('ipcaAA').value) : 0,
      mip: f.num($('mip').value) / 100, dfi: f.num($('dfi').value) / 100, adm: f.num($('adm').value)
    };
  }
  var chave = function (id, c) { return id + '|' + c.linha + '|' + c.idx; };
  var descricao = function (c) {
    return (c.linha === 'reg' ? 'SFH' : 'SFI') + ' · ' + (c.sistema === 'sac' ? 'SAC' : 'Price') + ' · ' + IDX[c.idx];
  };

  function calcular() {
    var c = cenario();
    avisos(c);
    var soNac = $('soNacionais').checked;
    var opcoes = CC.taxasDe(c.linha, c.idx).filter(function (t) { return !(soNac && t.regiao); })
      .concat(estado.ofertas.map(function (o) {
        return { id: o.id, nome: o.nome, aa: o.aa, propria: true, sigla: o.nome.slice(0, 2).toUpperCase(), cor: '#565c80' };
      }));
    var res = [];
    if (c.financiado > 0) {
      res = opcoes.map(function (o) {
        var aj = estado.ajustes[chave(o.id, c)], aa = aj != null ? aj : o.aa;
        var s = CC.simular(c, aa);
        s.op = o; s.aa = aa; s.ajustada = aj != null;
        return s;
      });
    }
    var ordem = $('ordem').value;
    res.sort(function (a, b) { return ordem === 'taxa' ? a.aa - b.aa : ordem === 'primeira' ? a.primeira - b.primeira : a.total - b.total; });
    estado.ultimo = res;
    desenhar(c, res);
    gravarLink(c);
  }

  function avisos(c) {
    var pe = c.imovel ? c.entrada / c.imovel * 100 : 0;
    var av = $('aviso-entrada');
    av.hidden = pe >= 20 || !c.imovel;
    av.textContent = 'Com ' + f.pct(pe, 0) + ' de entrada, poucos bancos aprovam: o usual é financiar até 80% do imóvel.';
    [].forEach.call(document.querySelectorAll('[data-pct]'), function (b) {
      b.setAttribute('aria-pressed', Math.abs(pe - +b.dataset.pct) < 0.05);
    });
    var acima = c.imovel > CC.CONFIG.tetoSFH;
    var reg = document.querySelector('input[name=linha][value=reg]');
    reg.disabled = acima;
    if (acima && reg.checked) { marcar('linha', 'mer'); c.linha = 'mer'; }
    var al = $('aviso-linha');
    al.hidden = !acima;
    al.textContent = 'Imóveis avaliados acima de ' + f.brl(CC.CONFIG.tetoSFH) + ' ficam fora do SFH. Mostrando linhas de mercado.';
  }

  function gravarLink(c) {
    var q = 'v=' + c.imovel + '&e=' + c.entrada + '&p=' + (c.meses / 12) + '&s=' + c.sistema + '&i=' + c.idx + '&l=' + c.linha + (c.renda ? '&r=' + c.renda : '');
    try { history.replaceState(null, '', location.pathname + '?' + q); } catch (e) { /* arquivo local */ }
  }

  /* ---------- desenho ---------- */
  function desenhar(c, res) {
    $('resumo').innerHTML = c.financiado > 0
      ? 'Financiando <b>' + f.brl(c.financiado) + '</b> de um imóvel de <b>' + f.brl(c.imovel) + '</b> em <b>' + (c.meses / 12) + ' anos</b> · ' + descricao(c)
      : 'Informe o valor do imóvel e a entrada.';
    $('contagem').textContent = res.length ? res.length + (res.length === 1 ? ' opção encontrada' : ' opções encontradas') : 'Nenhuma opção';

    var vazio = $('vazio');
    vazio.hidden = res.length > 0;
    vazio.textContent = c.financiado > 0
      ? 'Nenhuma instituição informou taxa ao Banco Central nesta combinação. Troque a correção ou o tipo de linha, ou adicione uma proposta abaixo.'
      : 'Informe o valor do imóvel e uma entrada menor que ele para ver o ranking.';

    var totais = res.map(function (r) { return r.total; });
    var menor = Math.min.apply(null, totais), maior = Math.max.apply(null, totais);
    var ids = res.map(function (r) { return r.op.id; });
    var marcados = (estado.marcados || ids.slice(0, 3)).filter(function (id) { return ids.indexOf(id) >= 0; });

    $('lista').innerHTML = res.map(function (r, n) {
      var o = r.op, melhor = r.total === menor && res.length > 1;
      var compromete = c.renda ? r.maior / c.renda * 100 : 0;
      var saber = '';
      if (c.renda) saber += compromete <= 30
        ? '<span class="ok">Parcela cabe em 30% da sua renda</span>'
        : '<span class="at">Compromete ' + f.pct(compromete, 0) + ' da renda informada</span>';
      else saber += '<span class="ok">Renda familiar a partir de ' + f.brl(r.maior / 0.3) + '</span>';
      if (o.coop) saber += '<span class="at">Exige associação à cooperativa</span>';
      if (o.regiao) saber += '<span class="at">Atuação concentrada: ' + o.regiao + '</span>';
      if (o.propria) saber += '<span class="ok">Proposta informada por você</span>';
      if (r.ajustada) saber += '<span class="at">Taxa alterada por você</span>';
      var aberto = !!estado.abertos[o.id];
      var id = f.esc(o.id);

      return '<article class="oferta">' +
        (melhor ? '<div class="fita">Menor custo total: ' + f.brl(maior - menor) + ' a menos que a opção mais cara</div>' : '') +
        '<div class="oferta-corpo">' +
          '<div class="oferta-cab">' + CC.selo(o) + '<div><h3>' + (CC.paginaBanco(o.id) ? '<a href="' + CC.paginaBanco(o.id) + '" title="Ver todas as taxas deste banco">' + f.esc(o.nome) + '</a>' : f.esc(o.nome)) + '</h3><p>' + descricao(c) + '</p></div><span class="pos">' + (n + 1) + 'º de ' + res.length + '</span></div>' +
          '<div class="faixa">' +
            '<div class="celulas">' +
              '<div><span>1ª parcela</span><b>' + f.brl(r.primeira) + '</b></div>' +
              '<div><span>Taxa ao ano</span><div class="taxa-ed"><input data-taxa="' + id + '" value="' + r.aa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '" inputmode="decimal" title="Clique para ajustar a taxa" aria-label="Taxa ao ano de ' + f.esc(o.nome) + '"><b>%</b></div></div>' +
              '<div><span>Última parcela</span><b>' + f.brl(r.ultima) + '</b></div>' +
              '<div><span>Total pago</span><b>' + f.brl(r.total) + '</b>' + (r.total > menor ? '<small>+' + f.brl(r.total - menor) + '</small>' : '') + '</div>' +
              '<div><span>Custo efetivo</span><b>' + f.pct(r.cet, 2) + '</b></div>' +
            '</div>' +
            '<div class="botoes">' +
              (CC.linkBanco(o.id) ? '<a class="btn btn-banco" href="' + f.esc(CC.linkBanco(o.id)) + '" target="_blank" rel="noopener sponsored" data-saida="' + id + '">Ir ao site oficial' + CC.SETA + '</a>' : '') +
              '<button class="btn btn-claro" type="button" data-lead="' + id + '">Quero ajuda com esta proposta' + CC.SETA + '</button>' +
            '</div>' +
          '</div>' +
          '<p class="exemplo"><b>Exemplo desta simulação:</b> ' + f.brl(c.financiado) + ' em ' + c.meses + ' meses a ' + f.pct(r.aa, 2) + ' a.a.' +
            (c.idx !== 'pre' ? ' + ' + IDX[c.idx] + ' projetada de ' + f.pct(c.indexAA, 1) + ' a.a.' : '') +
            '. Total de ' + f.brl(r.total) + ', sendo ' + f.brl(r.juros) + ' de juros, ' + f.brl(r.correcao) + ' de correção e ' + f.brl(r.seguros) + ' de seguros e tarifas estimados.</p>' +
          '<div class="saber">' + saber +
            '<span class="dir"><label class="check"><input type="checkbox" data-marca="' + id + '"' + (marcados.indexOf(o.id) >= 0 ? ' checked' : '') + '> Comparar no gráfico</label>' +
            '<button class="link" type="button" data-abre="' + id + '">' + (aberto ? 'Fechar tabela' : 'Ver ano a ano') + '</button>' +
            (o.propria ? '<button class="link" type="button" data-remove="' + id + '">Remover</button>' : '') +
            (r.ajustada ? '<button class="link" type="button" data-reset="' + id + '">Desfazer taxa</button>' : '') +
          '</span></div>' +
          (aberto ? tabelaAnos(r) : '') +
        '</div></article>';
    }).join('');

    grafico(res.filter(function (r) { return marcados.indexOf(r.op.id) >= 0; }));
  }

  function tabelaAnos(r) {
    return '<div class="detalhe"><table><thead><tr><th>Período</th><th>Parcela inicial</th><th>Parcela final</th><th>Amortizado</th><th>Juros</th><th>Seguros e tarifa</th><th>Saldo devedor</th></tr></thead><tbody>' +
      r.anos.map(function (a) {
        return '<tr><td>Ano ' + a.ano + '</td><td>' + f.brl(a.primeira) + '</td><td>' + f.brl(a.ultima) + '</td><td>' + f.brl(a.amort) + '</td><td>' + f.brl(a.juros) + '</td><td>' + f.brl(a.seg) + '</td><td>' + f.brl(a.saldo) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function grafico(sel) {
    var box = $('grafico'), leg = $('legenda');
    if (!sel.length) { box.innerHTML = '<p class="muted">Nenhum banco marcado.</p>'; leg.innerHTML = ''; return; }
    var W = 1000, H = 300, ml = 70, mr = 16, mt = 12, mb = 32, n = sel[0].parcelas.length;
    var max = Math.max.apply(null, sel.map(function (r) { return r.maior; })) * 1.05;
    var x = function (k) { return ml + (W - ml - mr) * k / (n - 1); };
    var y = function (v) { return mt + (H - mt - mb) * (1 - v / max); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolução da parcela mensal por banco">';
    for (var g = 0; g <= 4; g++) {
      var v = max * g / 4;
      s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#d6daee"/><text x="' + (ml - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + f.brl(v) + '</text>';
    }
    var anos = n / 12, passo = anos > 20 ? 5 : anos > 10 ? 2 : 1;
    for (var a = 0; a <= anos; a += passo) {
      s += '<text x="' + x(Math.min(a * 12, n - 1)) + '" y="' + (H - 9) + '" text-anchor="' + (a === 0 ? 'start' : a === anos ? 'end' : 'middle') + '">' + (a === 0 ? 'início' : 'ano ' + a) + '</text>';
    }
    sel.forEach(function (r, i) {
      var d = '';
      for (var k = 0; k < n; k += 3) d += (d ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(r.parcelas[k]).toFixed(1);
      d += 'L' + x(n - 1).toFixed(1) + ' ' + y(r.parcelas[n - 1]).toFixed(1);
      s += '<path d="' + d + '" fill="none" stroke="' + CORES[i % 4] + '" stroke-width="2.6" stroke-linejoin="round"/>';
    });
    box.innerHTML = s + '</svg>';
    leg.innerHTML = sel.map(function (r, i) {
      return '<span><i style="background:' + CORES[i % 4] + '"></i>' + f.esc(r.op.nome) + ' · ' + f.pct(r.aa, 2) + ' a.a.</span>';
    }).join('');
  }

  /* ---------- eventos do formulário ---------- */
  var mascara = function (el) { el.value = f.milhar(f.inteiro(el.value)); };
  function definirPct(p) {
    $('entradaPct').value = p.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    $('entrada').value = f.milhar(f.inteiro($('imovel').value) * p / 100);
  }
  $('imovel').addEventListener('input', function () { mascara(this); definirPct(f.num($('entradaPct').value)); calcular(); });
  $('entrada').addEventListener('input', function () {
    mascara(this);
    var im = f.inteiro($('imovel').value);
    $('entradaPct').value = im ? (f.inteiro(this.value) / im * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '';
    calcular();
  });
  $('entradaPct').addEventListener('input', function () {
    $('entrada').value = f.milhar(f.inteiro($('imovel').value) * Math.min(f.num(this.value), 100) / 100);
    calcular();
  });
  $('renda').addEventListener('input', function () { mascara(this); calcular(); });
  $('prazo').addEventListener('input', function () { $('prazoTxt').textContent = this.value + ' anos'; calcular(); });
  ['trAA', 'ipcaAA', 'mip', 'dfi', 'adm'].forEach(function (id) { $(id).addEventListener('input', calcular); });
  $('form').addEventListener('change', calcular);
  $('form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('ordem').addEventListener('change', calcular);
  document.querySelector('.pilulas').addEventListener('click', function (e) {
    if (e.target.dataset.pct) { definirPct(+e.target.dataset.pct); calcular(); }
  });
  $('copiar').addEventListener('click', function () {
    var b = this, volta = function (t) { b.textContent = t; setTimeout(function () { b.textContent = 'Copiar link desta simulação'; }, 2200); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { volta('Link copiado'); }, function () { volta('Copie o endereço da barra do navegador'); });
    else volta('Copie o endereço da barra do navegador');
  });

  /* ---------- eventos do ranking ---------- */
  function salvarOfertas() { try { localStorage.setItem('cc_ofertas', JSON.stringify(estado.ofertas)); } catch (e) { /* sem storage */ } }
  $('lista').addEventListener('change', function (e) {
    var t = e.target, c = cenario();
    if (t.dataset.taxa != null) {
      var v = f.num(t.value);
      if (v > 0 && v < 40) {
        var of = estado.ofertas.filter(function (o) { return o.id === t.dataset.taxa; })[0];
        if (of) { of.aa = v; salvarOfertas(); } else estado.ajustes[chave(t.dataset.taxa, c)] = v;
      }
      calcular();
    } else if (t.dataset.marca != null) {
      var m = [].map.call(document.querySelectorAll('[data-marca]:checked'), function (x) { return x.dataset.marca; });
      if (m.length > 4) { t.checked = false; return; }
      estado.marcados = m; calcular();
    }
  });
  $('lista').addEventListener('click', function (e) {
    var alvo = e.target.closest('[data-abre],[data-reset],[data-remove],[data-lead]');
    if (!alvo) return;
    var d = alvo.dataset, c = cenario();
    if (d.lead != null) { abrirLead(d.lead, c); return; }
    if (d.abre != null) estado.abertos[d.abre] = !estado.abertos[d.abre];
    else if (d.reset != null) delete estado.ajustes[chave(d.reset, c)];
    else if (d.remove != null) { estado.ofertas = estado.ofertas.filter(function (o) { return o.id !== d.remove; }); salvarOfertas(); }
    calcular();
  });
  $('formOferta').addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = $('ofertaNome').value.trim(), aa = f.num($('ofertaTaxa').value);
    if (!nome || !(aa > 0 && aa < 40)) { $('ofertaTaxa').focus(); return; }
    estado.ofertas.push({ id: 'p' + Date.now(), nome: nome, aa: aa });
    salvarOfertas(); this.reset(); calcular();
  });

  /* ---------- pedido de proposta ---------- */
  var leadAtual = null;
  function abrirLead(id, c) {
    var r = estado.ultimo.filter(function (x) { return x.op.id === id; })[0];
    if (!r) return;
    leadAtual = { banco: r.op.nome, taxa: r.aa, c: c };
    $('leadTitulo').textContent = 'Receber proposta: ' + r.op.nome;
    $('leadResumo').textContent = f.brl(c.financiado) + ' em ' + (c.meses / 12) + ' anos · ' + descricao(c) + ' · 1ª parcela estimada de ' + f.brl(r.primeira);
    $('leadMsg').hidden = true;
    $('dlgLead').showModal();
  }
  $('fecharLead').addEventListener('click', function () { $('dlgLead').close(); });
  $('dlgLead').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  $('formLead').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('leadMsg');
    msg.hidden = false; msg.className = 'aviso';
    if (!this.checkValidity()) { msg.textContent = 'Preencha nome, WhatsApp, e-mail e marque a autorização.'; return; }
    if (!/^https:\/\//.test(CC.CONFIG.leadEndpoint)) { msg.textContent = 'O envio de pedidos ainda não está ativo neste site. Seus dados não foram enviados.'; return; }
    var c = leadAtual.c;
    fetch(CC.CONFIG.leadEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: $('leadNome').value, whatsapp: $('leadFone').value, email: $('leadEmail').value,
        banco: leadAtual.banco, taxa: leadAtual.taxa,
        cenario: { imovel: c.imovel, entrada: c.entrada, meses: c.meses, sistema: c.sistema, indexador: c.idx, linha: c.linha, renda: c.renda }
      })
    }).then(function (r) {
      if (!r.ok) throw new Error();
      msg.className = 'aviso ok'; msg.textContent = 'Pedido recebido. Entraremos em contato.';
    }).catch(function () { msg.textContent = 'Não foi possível enviar agora. Tente de novo em instantes.'; });
  });

  CC.montarPagina('comparar');
  CC.iniciarDados(calcular);
  calcular();
})();
