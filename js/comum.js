/* Financie Imóvel — base compartilhada: dados, cálculo, cabeçalho e rodapé */
window.CC = (function () {
  'use strict';

  var CONFIG = {
    // URL que recebe os contatos por POST (JSON). Vazio = captação ainda não conectada.
    leadEndpoint: '',
    // Teto de avaliação do imóvel no SFH (Resolução CMN de out/2025).
    tetoSFH: 2250000,
    urlBCB: 'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes' +
      "?$top=400&$format=json&$orderby=anoMes%20desc&$filter=contains(Modalidade,'imobili')",

    // PUBLICIDADE (Google AdSense). Preencha "cliente" com o código ca-pub-... e o número de cada bloco.
    // Enquanto "cliente" estiver vazio, "demonstrar: true" mostra onde cada anúncio vai ficar.
    anuncios: {
      cliente: '',
      demonstrar: false,
      blocos: { home: '', comparador_topo: '', comparador: '', calculadora: '', bancos: '', bancos_lateral: '', guias: '', blog_topo: '', blog_meio: '', blog_lateral: '', blog_fim: '' }
    },

    // PRODUTO DIGITAL. "checkout" é o link de pagamento (Hotmart, Kiwify etc.). Vazio = pré-lançamento.
    produto: {
      nome: 'Do Sonho às Chaves',
      subtitulo: 'O guia completo para financiar, comprar e reformar seu imóvel',
      preco: 'R$ 37',
      // Link de pagamento na Hotmart (produto 8985563, vendas ativas desde 15/11/2026)
      checkout: 'https://pay.hotmart.com/E108516263H'
    },

    // LINKS DOS BANCOS. Para trocar o destino de um banco por um link de parceria ou afiliado,
    // informe aqui: { '00360305': 'https://...' }. Tem prioridade sobre dados/links-bancos.js.
    linksParceiros: {}
  };

  // Nome, sigla e cor de identificação por raiz de CNPJ (não são logotipos oficiais)
  var BANCOS = {
    '00360305': { nome: 'Caixa', sigla: 'CX', cor: '#0b62a8' },
    '00000000': { nome: 'Banco do Brasil', sigla: 'BB', cor: '#f6d500', tinta: '#0b3a8f' },
    '60701190': { nome: 'Itaú', sigla: 'IT', cor: '#ec7000' },
    '60746948': { nome: 'Bradesco', sigla: 'BR', cor: '#cc092f' },
    '90400888': { nome: 'Santander', sigla: 'SA', cor: '#e30613' },
    '00416968': { nome: 'Inter', sigla: 'IN', cor: '#ff7a00' },
    '33264668': { nome: 'XP', sigla: 'XP', cor: '#15151a' },
    '02038232': { nome: 'Sicoob', sigla: 'SC', cor: '#00353e', coop: true },
    '01181521': { nome: 'Sicredi', sigla: 'SI', cor: '#3a9b1c', coop: true },
    '00655522': { nome: 'Poupex', sigla: 'PX', cor: '#1d4f91' },
    '00556603': { nome: 'Banco Bari', sigla: 'BA', cor: '#123c69' },
    '00795423': { nome: 'Banco Semear', sigla: 'SE', cor: '#0a7d3b' },
    '62232889': { nome: 'Daycoval', sigla: 'DY', cor: '#0b2a5b' },
    '92702067': { nome: 'Banrisul', sigla: 'RS', cor: '#0054a6', regiao: 'Rio Grande do Sul' },
    '04913711': { nome: 'Banpará', sigla: 'PA', cor: '#c8161d', regiao: 'Pará' },
    '13009717': { nome: 'Banese', sigla: 'SE', cor: '#00843d', regiao: 'Sergipe' },
    '28127603': { nome: 'Banestes', sigla: 'ES', cor: '#005ca9', regiao: 'Espírito Santo' },
    '00000208': { nome: 'BRB', sigla: 'BRB', cor: '#0033a0', regiao: 'Distrito Federal' }
  };
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* ---------- formatação ---------- */
  var f = {
    brl: function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); },
    pct: function (v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'; },
    num: function (s) { var v = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isFinite(v) ? v : 0; },
    inteiro: function (s) { return parseInt(String(s).replace(/\D/g, ''), 10) || 0; },
    milhar: function (n) { return n ? Math.round(n).toLocaleString('pt-BR') : ''; },
    esc: function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  };
  var $ = function (id) { return document.getElementById(id); };
  var R = document.documentElement.getAttribute('data-raiz') || '';
  var SETA = '<span class="seta" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  var LOGO = '<svg class="logo-marca" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2.5 37 16v18a3.5 3.5 0 0 1-3.5 3.5h-27A3.5 3.5 0 0 1 3 34V16z" fill="#ff5c39"/><circle cx="20" cy="20.5" r="5" fill="var(--logo-furo,#101a4a)"/><path d="M17.6 23h4.8l1.9 9.5h-8.6z" fill="var(--logo-furo,#101a4a)"/></svg>';

  /* ---------- dados ---------- */
  var dados = { taxas: [], mes: '', rotulo: '' };
  function carregar(snap) {
    dados.mes = snap.mes;
    var p = snap.mes.split('-');
    dados.rotulo = MESES[+p[1] - 1] + ' de ' + p[0];
    dados.taxas = snap.linhas.filter(function (l) { return /^\d{8}$/.test(String(l.cnpj8)) && Number(l.TaxaJurosAoAno) > 0; }).map(function (l) {
      var b = BANCOS[l.cnpj8] || {};
      var nome = b.nome || l.InstituicaoFinanceira.replace(/^BCO\b/, 'Banco').replace(/ S\.?A\.?$/, '');
      return {
        id: l.cnpj8, nome: nome, sigla: b.sigla || nome.slice(0, 2).toUpperCase(), cor: b.cor || '#4b5381', tinta: b.tinta || '#fff',
        coop: !!b.coop, regiao: b.regiao || '',
        linha: /reguladas/.test(l.Modalidade) ? 'reg' : 'mer',
        idx: /Prefixado/.test(l.Modalidade) ? 'pre' : /IPCA/.test(l.Modalidade) ? 'ipca' : 'tr',
        aa: Number(l.TaxaJurosAoAno) || 0
      };
    });
    [].forEach.call(document.querySelectorAll('[data-mes]'), function (el) { el.textContent = dados.rotulo; });
  }
  // usa o snapshot local e tenta trocar pelo mês mais recente do Banco Central
  function iniciarDados(aoAtualizar) {
    if (window.TAXAS_SNAPSHOT) carregar(window.TAXAS_SNAPSHOT);
    fetch(CONFIG.urlBCB).then(function (r) { return r.json(); }).then(function (j) {
      var mes = j.value.map(function (l) { return String(l.anoMes); }).sort().pop();
      if (!/^\d{4}-\d{2}$/.test(mes || '') || mes <= dados.mes) return;
      carregar({ mes: mes, linhas: j.value.filter(function (l) { return l.anoMes === mes; }) });
      if (aoAtualizar) aoAtualizar();
    }).catch(function () { /* fica com o snapshot */ });
  }
  function taxasDe(linha, idx) {
    return dados.taxas.filter(function (t) { return t.linha === linha && t.idx === idx; })
      .sort(function (a, b) { return a.aa - b.aa; });
  }
  // logotipo do banco (assets/bancos) ou, se não houver arquivo, selo com a sigla
  function selo(t, classe) {
    var arq = (window.LOGOS_BANCOS || {})[t.id];
    if (arq) return '<span class="logo-banco ' + (classe || '') + '"><img src="' + R + 'assets/bancos/' + arq + '" alt="' + f.esc(t.nome) + '"></span>';
    return '<span class="selo-banco ' + (classe || '') + '" style="background:' + t.cor + ';color:' + (t.tinta || '#fff') + '">' + f.esc(t.sigla || t.nome.slice(0, 2).toUpperCase()) + '</span>';
  }

  /* ---------- matemática ---------- */
  // c: {financiado, imovel, meses, sistema, indexAA, mip, dfi, adm}
  function simular(c, taxaAA) {
    var n = c.meses;
    var i = Math.pow(1 + taxaAA / 100, 1 / 12) - 1;
    var corr = Math.pow(1 + c.indexAA / 100, 1 / 12) - 1;
    var saldo = c.financiado, parcelas = [], anos = [];
    var total = 0, juros = 0, seguros = 0, correcao = 0, ano = null;
    for (var k = 1; k <= n; k++) {
      var cm = saldo * corr; saldo += cm;
      var j = saldo * i, resta = n - k + 1, amort;
      if (c.sistema === 'sac') amort = saldo / resta;
      else amort = (i > 0 ? saldo * i / (1 - Math.pow(1 + i, -resta)) : saldo / resta) - j;
      var seg = saldo * c.mip + c.imovel * c.dfi + c.adm;
      var p = amort + j + seg;
      saldo -= amort;
      parcelas.push(p); total += p; juros += j; seguros += seg; correcao += cm;
      if ((k - 1) % 12 === 0) { ano = { ano: (k - 1) / 12 + 1, primeira: p, juros: 0, amort: 0, seg: 0 }; anos.push(ano); }
      ano.juros += j; ano.amort += amort; ano.seg += seg; ano.ultima = p; ano.saldo = Math.max(saldo, 0);
    }
    return {
      parcelas: parcelas, anos: anos, total: total, juros: juros, seguros: seguros, correcao: correcao,
      primeira: parcelas[0], ultima: parcelas[n - 1], maior: Math.max.apply(null, parcelas),
      cet: custoEfetivo(c.financiado, parcelas)
    };
  }
  function custoEfetivo(valor, parcelas) {
    var lo = 0, hi = 0.05;
    for (var it = 0; it < 50; it++) {
      var m = (lo + hi) / 2, vp = 0, fator = 1;
      for (var k = 0; k < parcelas.length; k++) { fator /= (1 + m); vp += parcelas[k] * fator; }
      if (vp > valor) lo = m; else hi = m;
    }
    return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
  }
  var PREMISSAS = { tr: 1.5, ipca: 4.5, mip: 0.025, dfi: 0.008, adm: 25 };

  /* ---------- cabeçalho e rodapé ---------- */
  function montarPagina(ativa) {
    var links = [
      ['comparar.html', 'Comparar bancos', 'comparar'],
      ['quanto-posso-financiar.html', 'Quanto posso financiar', 'financiar'],
      ['guias.html', 'Guias', 'guias'],
      ['blog.html', 'Blog', 'blog'],
      ['ebook.html', 'Ebook', 'ebook']
    ];
    var nav = links.map(function (l) {
      return '<a href="' + R + l[0] + '"' + (l[2] === ativa ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
    }).join('');
    $('cabecalho').innerHTML =
      '<div class="container cab-in">' +
        '<a class="logo" href="' + R + 'index.html" aria-label="Financie Imóvel, página inicial">' + LOGO + '<span>financie<b>imóvel</b></span></a>' +
        '<nav class="menu" id="menu">' + nav + '</nav>' +
        '<a class="btn btn-acao cab-cta" href="' + R + 'comparar.html">Comparar agora' + SETA + '</a>' +
        '<button class="menu-btn" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu"><i></i><i></i><i></i></button>' +
      '</div>';
    var botao = document.querySelector('.menu-btn');
    botao.addEventListener('click', function () {
      var aberto = $('cabecalho').classList.toggle('aberto');
      botao.setAttribute('aria-expanded', aberto);
    });

    var a = function (href, txt) { return '<a href="' + R + href + '">' + txt + '</a>'; };
    $('rodape').innerHTML =
      '<div class="container">' +
        '<div class="rod-grade">' +
          '<div><a class="logo" href="' + R + 'index.html">' + LOGO + '<span>financie<b>imóvel</b></span></a>' +
            '<p>Comparador independente de crédito imobiliário. Não somos instituição financeira e não concedemos crédito.</p></div>' +
          '<div><h4>Ferramentas</h4>' + a('comparar.html', 'Comparar bancos') + a('bancos.html', 'Taxas por banco') + a('quanto-posso-financiar.html', 'Quanto posso financiar') + a('comparar.html?s=price', 'Simular tabela Price') + a('comparar.html?s=sac', 'Simular tabela SAC') + '</div>' +
          '<div><h4>Aprenda</h4>' + a('blog.html', 'Blog') + a('guias.html', 'Guias rápidos') + a('ebook.html', 'Ebook: ' + CONFIG.produto.nome) + a('guias.html#metodologia', 'Metodologia') + '</div>' +
          '<div><h4>Sobre</h4>' + a('index.html#como-funciona', 'Como funciona') + a('index.html#duvidas', 'Dúvidas frequentes') + '</div>' +
        '</div>' +
        '<p class="rod-legal">As simulações são estimativas, não constituem oferta de crédito nem garantia de aprovação. Taxas de juros: Banco Central do Brasil, dados abertos, referência <span data-mes></span>. Nomes e logotipos pertencem às respectivas instituições e são usados apenas para identificá-las, sem indicar parceria. Este site exibe publicidade e pode receber comissão de parceiros; isso não altera a ordem do ranking. Condições finais dependem da análise de cada banco.</p>' +
      '</div>';
    if (dados.rotulo) [].forEach.call(document.querySelectorAll('[data-mes]'), function (el) { el.textContent = dados.rotulo; });
    montarAnuncios();
    montarPromo();
  }

  /* ---------- publicidade ---------- */
  // Uso no HTML: <div class="anuncio" data-formato="faixa|retangulo" data-bloco="home"></div>
  function montarAnuncios() {
    var cfg = CONFIG.anuncios, espacos = document.querySelectorAll('.anuncio');
    if (!espacos.length) return;
    if (!cfg.cliente) {
      // enquanto o AdSense não está configurado, o espaço divulga o ebook
      [].forEach.call(espacos, function (el) {
        var prox = el.nextElementSibling;
        if (document.body.getAttribute('data-pagina') === 'ebook' || (prox && prox.hasAttribute('data-promo'))) { el.hidden = true; return; }
        el.classList.add('casa');
        var p = CONFIG.produto, lateral = el.getAttribute('data-formato') === 'retangulo';
        el.innerHTML = '<a class="anuncio-ebook' + (lateral ? ' lateral' : '') + '" href="' + R + 'ebook.html">' +
          '<span class="mini-capa" aria-hidden="true"><b>Do Sonho</b><em>às Chaves</em></span>' +
          '<span class="txt"><small>Ebook Financie Imóvel</small><strong>O passo a passo para financiar, comprar e reformar pagando menos</strong>' +
          '<span class="det">23 capítulos e 3 planilhas' + (p.preco ? ' · ' + f.esc(p.preco) : '') + '</span></span>' +
          '<span class="btn btn-acao">' + (p.checkout ? 'Quero o ebook' : 'Conhecer') + SETA + '</span></a>';
      });
      return;
    }
    var sc = document.createElement('script');
    sc.async = true; sc.crossOrigin = 'anonymous';
    sc.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.cliente);
    document.head.appendChild(sc);
    [].forEach.call(espacos, function (el) {
      var bloco = cfg.blocos[el.getAttribute('data-bloco')];
      if (!bloco) { el.hidden = true; return; }
      el.classList.add('ativo');
      el.innerHTML = '<small>Publicidade</small><ins class="adsbygoogle" style="display:block" data-ad-client="' + f.esc(cfg.cliente) +
        '" data-ad-slot="' + f.esc(bloco) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  }

  /* ---------- chamada para o ebook ---------- */
  // Uso no HTML: <div data-promo="ebook"></div> (faixa larga) ou data-promo="ebook-lateral"
  function montarPromo() {
    var p = CONFIG.produto;
    [].forEach.call(document.querySelectorAll('[data-promo]'), function (el) {
      var lateral = el.getAttribute('data-promo') === 'ebook-lateral';
      el.className = 'promo' + (lateral ? ' lateral' : '');
      el.innerHTML = '<div><span class="etiqueta">Ebook' + (p.checkout ? '' : ' · em breve') + '</span><h3>' + f.esc(p.nome) + '</h3><p>' + f.esc(p.subtitulo) +
        '. Planejamento, crédito, compra e reforma em um passo a passo.</p></div>' +
        '<a class="btn btn-acao" href="' + R + 'ebook.html">Conhecer o ebook' + SETA + '</a>';
    });
  }

  /* ---------- página do banco dentro do site ---------- */
  function paginaBanco(id) {
    var p = (window.PAGINAS_BANCOS || {})[id];
    return p ? R + p : '';
  }

  /* ---------- link para o site do banco ---------- */
  function linkBanco(id) {
    var url = CONFIG.linksParceiros[id] || (window.LINKS_BANCOS || {})[id] || '';
    return /^https:\/\//.test(url) ? url : '';
  }

  return {
    CONFIG: CONFIG, PREMISSAS: PREMISSAS, SETA: SETA, f: f, $: $, dados: dados,
    iniciarDados: iniciarDados, taxasDe: taxasDe, selo: selo,
    simular: simular, montarPagina: montarPagina, linkBanco: linkBanco, paginaBanco: paginaBanco, R: R
  };
})();
