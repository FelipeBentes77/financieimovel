/* Blog: lista de artigos, coluna lateral, relacionados e tabelas com taxas atuais */
(function () {
  'use strict';
  var CC = window.CC, f = CC.f, $ = CC.$, P = CC.PREMISSAS, R = CC.R, POSTS = window.POSTS || [];
  var MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  var dataCurta = function (iso) { var p = String(iso).split('-'); return p.length === 3 ? (+p[2]) + ' de ' + MESES[+p[1] - 1] + ' de ' + p[0] : String(iso); };
  var slugOk = function (v) { return /^[a-z0-9-]+$/.test(v) ? v : ''; };
  var cartao = function (p, i) {
    var destaque = i === 0, g = slugOk(p.slug);
    return '<a class="cartao-post' + (destaque ? ' destaque' : '') + '" href="' + R + 'blog/' + g + '.html"><div class="capa">' +
      '<img src="' + R + 'assets/blog/' + g + (destaque ? '' : '-p') + '.jpg" alt="" width="' + (destaque ? 1200 : 640) + '" height="' + (destaque ? 675 : 360) + '"' + (destaque ? '' : ' loading="lazy"') + '>' +
      '<span>' + f.esc(p.categoria) + '</span></div>' +
      '<div class="txt"><h3>' + f.esc(p.titulo) + '</h3><p>' + f.esc(p.resumo) + '</p><small>' + dataCurta(p.data) + ' · ' + Number(p.minutos) + ' min de leitura</small></div></a>';
  };

  // página de lista
  if ($('blogLista') && !$('blogLista').children.length) $('blogLista').innerHTML = POSTS.map(cartao).join('');

  // página de artigo
  var atual = location.pathname.split('/').pop().replace('.html', '');
  if ($('lateral')) {
    $('lateral').innerHTML =
      '<div class="caixa"><h3>Compare os bancos</h3><p class="muted" style="font-size:.93rem">Veja parcela e custo total do seu financiamento em cada banco, com as taxas de <span data-mes></span>.</p>' +
      '<a class="btn btn-acao btn-bloco" href="' + R + 'comparar.html">Comparar agora' + CC.SETA + '</a></div>' +
      '<div class="anuncio" data-formato="retangulo" data-bloco="blog_lateral"></div>' +
      '<div data-promo="ebook-lateral"></div>';
  }
  if ($('relacionados')) {
    $('relacionados').innerHTML = '<h3>Continue lendo</h3><div class="rel-lista">' + POSTS.filter(function (p) { return p.slug !== atual; }).slice(0, 3)
      .map(function (p) {
        var g = slugOk(p.slug);
        return '<a href="' + R + 'blog/' + g + '.html"><img src="' + R + 'assets/blog/' + g + '-p.jpg" alt="" width="640" height="360" loading="lazy">' +
          '<span><small>' + f.esc(p.categoria) + '</small>' + f.esc(p.titulo) + '</span></a>';
      }).join('') + '</div>';
  }

  // tabela "renda necessária por valor de imóvel", sempre com a taxa mediana do mês
  function tabelaRenda() {
    var el = document.querySelector('[data-tabela-renda]');
    if (!el) return;
    var lista = CC.taxasDe('reg', 'tr').filter(function (t) { return !t.regiao; });
    if (!lista.length) return;
    var aa = lista[Math.floor((lista.length - 1) / 2)].aa;
    var linhas = [200000, 300000, 400000, 500000, 700000, 1000000].map(function (v) {
      var base = { imovel: v, financiado: v * 0.8, meses: 360, indexAA: P.tr, mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm };
      var sac = CC.simular(Object.assign({ sistema: 'sac' }, base), aa), price = CC.simular(Object.assign({ sistema: 'price' }, base), aa);
      return '<tr><td>' + f.brl(v) + '</td><td class="n">' + f.brl(v * 0.2) + '</td><td class="n">' + f.brl(sac.primeira) + '</td><td class="n"><b>' + f.brl(sac.maior / 0.3) +
        '</b></td><td class="n"><b>' + f.brl(price.maior / 0.3) + '</b></td></tr>';
    }).join('');
    el.innerHTML = '<table><thead><tr><th>Imóvel</th><th class="n">Entrada (20%)</th><th class="n">1ª parcela SAC</th><th class="n">Renda mínima SAC</th><th class="n">Renda mínima Price</th></tr></thead><tbody>' + linhas +
      '</tbody></table><p class="nota">Cálculo com a taxa mediana dos bancos de atuação nacional, atualizada em ' + CC.dados.atual + ' (' + f.pct(aa, 2) +
      ' ao ano + TR), 30 anos, parcela limitada a 30% da renda, com seguros estimados. Atualizado automaticamente a cada novo mês de dados.</p>';
  }

  CC.montarPagina('blog');
  CC.iniciarDados(tabelaRenda);
  tabelaRenda();
})();
