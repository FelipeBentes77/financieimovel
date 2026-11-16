// Gera tudo o que os buscadores precisam ler sem depender de JavaScript:
//  - uma página por banco (bancos/<nome>.html) e o índice bancos.html, com as taxas do mês
//  - a lista de artigos dentro de blog.html
//  - metadados de compartilhamento e endereço canônico em todas as páginas
//  - sitemap.xml e robots.txt
// Uso: node gerar-seo.mjs   (rode depois de atualizar-taxas.mjs e gerar-blog.mjs)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const gravar = (p, s) => writeFileSync(join(raiz, p), s, 'utf8');
const dominio = (JSON.parse(ler('site.config.json')).dominio || '').replace(/\/+$/, '');

/* ---------- carrega dados e o mesmo motor de cálculo usado no navegador ---------- */
const ctx = { window: {}, document: { documentElement: { getAttribute: () => '' }, querySelectorAll: () => [] }, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const arq of ['dados/taxas.js', 'dados/logos-bancos.js', 'dados/links-bancos.js', 'js/posts.js', 'js/comum.js']) {
  vm.runInContext(ler(arq), ctx, { filename: arq });
}
const W = ctx.window, CC = W.CC, f = CC.f, P = CC.PREMISSAS;
const snap = W.TAXAS_SNAPSHOT;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const [ano, mes] = snap.mes.split('-');
const rotuloMes = `${MESES[+mes - 1]} de ${ano}`; // mês dos contratos na última divulgação do Banco Central
// mês vigente (horário de Brasília): vai nos títulos; a rotina diária regrava as páginas quando o mês vira
const [anoAtual, mesAtual] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
const rotuloAtual = `${MESES[+mesAtual - 1]} de ${anoAtual}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SETA = CC.SETA;
const LINHA = { reg: 'SFH (taxas reguladas)', mer: 'SFI (taxas de mercado)' };
const IDX = { tr: 'TR', ipca: 'IPCA', pre: 'Taxa fixa' };
const EX = { imovel: 500000, financiado: 400000, meses: 360, sistema: 'sac', mip: P.mip / 100, dfi: P.dfi / 100, adm: P.adm };
const parcela = (t) => CC.simular({ ...EX, indexAA: t.idx === 'tr' ? P.tr : t.idx === 'ipca' ? P.ipca : 0 }, t.aa).primeira;

/* ---------- normaliza as taxas (mesma regra do navegador) ---------- */
const NOMES = {};
const taxas = snap.linhas.map((l) => {
  NOMES[l.cnpj8] = l.InstituicaoFinanceira;
  return {
    id: l.cnpj8,
    linha: /reguladas/.test(l.Modalidade) ? 'reg' : 'mer',
    idx: /Prefixado/.test(l.Modalidade) ? 'pre' : /IPCA/.test(l.Modalidade) ? 'ipca' : 'tr',
    aa: l.TaxaJurosAoAno
  };
});
// nomes amigáveis e avisos vêm do próprio comum.js (BANCOS não é público, então lemos do arquivo)
const BANCOS = vm.runInNewContext('(' + ler('js/comum.js').match(/var BANCOS = (\{[\s\S]*?\n  \});/)[1] + ')');
const nomeDe = (id) => (BANCOS[id] && BANCOS[id].nome) || NOMES[id].replace(/^BCO\b/, 'Banco').replace(/ S\.?A\.?$/, '');
const ids = [...new Set(taxas.map((t) => t.id))];
const pagina = Object.fromEntries(ids.map((id) => [id, `bancos/financiamento-imobiliario-${slug(nomeDe(id))}.html`]));
const ranking = (linha, idx) => taxas.filter((t) => t.linha === linha && t.idx === idx).sort((a, b) => a.aa - b.aa);
const logo = (id, r, classe = '') => W.LOGOS_BANCOS[id]
  ? `<span class="logo-banco ${classe}"><img src="${r}assets/bancos/${W.LOGOS_BANCOS[id]}" alt="${esc(nomeDe(id))}"></span>` : '';

const cabeca = (r, titulo, descricao) => `<!doctype html>
<html lang="pt-BR"${r ? ` data-raiz="${r}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="icon" href="${r}assets/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${r}css/site.css">
</head>
<body data-pagina="bancos">
<header id="cabecalho"></header>
<main>`;
const pe = (r) => `</main>
<footer id="rodape"></footer>
<script src="${r}dados/taxas.js"></script>
<script src="${r}dados/logos-bancos.js"></script>
<script src="${r}dados/links-bancos.js"></script>
<script src="${r}dados/paginas-bancos.js"></script>
<script src="${r}js/comum.js"></script>
<script src="${r}js/pagina.js"></script>
</body>
</html>
`;

// instituições tratadas no feminino ("a Caixa", "a Poupex", "a XP")
const FEMININO = ['00360305', '00655522', '33264668'];
const genero = (id, html) => {
  if (!FEMININO.includes(id)) return html;
  const n = esc(nomeDe(id));
  return html.split(`O ${n}`).join(`A ${n}`).split(` o ${n}`).join(` a ${n}`).split(` do ${n}`).join(` da ${n}`).split(` no ${n}`).join(` na ${n}`);
};

/* ---------- uma página por banco ---------- */
mkdirSync(join(raiz, 'bancos'), { recursive: true });
for (const id of ids) {
  const nome = nomeDe(id), b = BANCOS[id] || {}, minhas = taxas.filter((t) => t.id === id);
  const principal = minhas.find((t) => t.linha === 'reg' && t.idx === 'tr') || minhas.find((t) => t.idx === 'tr') || minhas[0];
  const rk = ranking(principal.linha, principal.idx), pos = rk.findIndex((t) => t.id === id) + 1;
  const link = W.LINKS_BANCOS[id];
  const linhasTab = minhas.sort((a, b2) => a.linha.localeCompare(b2.linha) * -1 || a.aa - b2.aa).map((t) => {
    const r = ranking(t.linha, t.idx), p = r.findIndex((x) => x.id === id) + 1;
    return `<tr><td>${LINHA[t.linha]}</td><td>${IDX[t.idx]}</td><td class="n"><b>${f.pct(t.aa, 2)}</b></td><td class="n">${p}º de ${r.length}</td><td class="n">${f.brl(parcela(t))}</td></tr>`;
  }).join('\n');
  const comparacao = rk.map((t, i) => `<tr${t.id === id ? ' style="background:var(--lavanda)"' : ''}><td>${i + 1}º</td><td>${t.id === id ? `<b>${esc(nome)}</b>` : `<a href="../${pagina[t.id]}">${esc(nomeDe(t.id))}</a>`}</td><td class="n"><b>${f.pct(t.aa, 2)}</b></td><td class="n">${f.brl(parcela(t))}</td></tr>`).join('\n');
  const titulo = `Financiamento imobiliário ${nome}: taxas de ${rotuloAtual}`;
  const descricao = `Financiamento imobiliário ${nome}: taxa média de ${f.pct(principal.aa, 2)} ao ano, atualizada em ${rotuloAtual}. Veja a parcela, a posição no ranking e compare com outros bancos.`;
  const avisos = [
    b.regiao ? `<p>O ${esc(nome)} tem atuação concentrada no estado: ${esc(b.regiao)}. Confirme se há atendimento na sua cidade.</p>` : '',
    b.coop ? `<p>O ${esc(nome)} é um sistema de cooperativas de crédito: para contratar é preciso associar-se a uma cooperativa.</p>` : ''
  ].join('');

  gravar(pagina[id], genero(id, cabeca('../', titulo, descricao) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="../index.html">Início</a> › <a href="../bancos.html">Taxas por banco</a> › ${esc(nome)}</p>
    <h1>Financiamento imobiliário ${esc(nome)}: taxas de ${rotuloAtual}</h1>
    <p>Taxa média de juros que o ${esc(nome)} cobra nos contratos de financiamento, segundo a divulgação mais recente do Banco Central.</p>
  </div>
</section>
<div class="container post">
  <article class="artigo">
    <p class="lide">Na divulgação mais recente do Banco Central, com os contratos de ${rotuloMes}, o ${esc(nome)} cobrou em média <b>${f.pct(principal.aa, 2)} ao ano</b> nos financiamentos imobiliários da linha ${LINHA[principal.linha]} com correção por ${IDX[principal.idx]}. Com isso ficou em <b>${pos}º lugar entre ${rk.length} instituições</b> nessa modalidade.</p>

    <h2>Taxas do ${esc(nome)} por modalidade</h2>
    <table>
      <thead><tr><th>Linha</th><th>Correção</th><th class="n">Taxa ao ano</th><th class="n">Posição</th><th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${linhasTab}
      </tbody>
    </table>
    <p class="nota">*Exemplo: R$ 400.000 financiados em 30 anos pela tabela SAC, imóvel de R$ 500.000, com seguros estimados. Fonte das taxas: Banco Central do Brasil, divulgação mais recente (contratos de ${rotuloMes}). Página atualizada em ${rotuloAtual}.</p>

    <div class="cta-linha"><p>Simule o seu valor no ${esc(nome)} e nos outros bancos.</p><a class="btn btn-acao" href="../comparar.html?l=${principal.linha}&i=${principal.idx}">Comparar bancos${SETA}</a></div>

    <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>

    <h2>Como o ${esc(nome)} se compara</h2>
    <p>Ranking atualizado em ${rotuloAtual} na linha ${LINHA[principal.linha]}, correção por ${IDX[principal.idx]}:</p>
    <table>
      <thead><tr><th>Posição</th><th>Instituição</th><th class="n">Taxa ao ano</th><th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${comparacao}
      </tbody>
    </table>

    <h2>O que esses números significam</h2>
    <p>A taxa publicada é a média de todos os contratos que a instituição fechou no mês. A taxa oferecida a você pode ser diferente: depende da sua renda, do relacionamento com o banco, do valor da entrada e do imóvel. Use a média como referência de quem costuma cobrar menos e peça propostas a mais de uma instituição.</p>
    ${avisos}
    <p>Para comparar propostas, olhe o Custo Efetivo Total, que soma juros, seguros e tarifas. Veja também os guias <a href="../guias.html#sac-price">SAC ou Price</a> e <a href="../guias.html#indexadores">TR, IPCA ou taxa fixa</a>.</p>
    ${link ? `<p><a class="btn btn-banco" href="${esc(link)}" target="_blank" rel="noopener sponsored">Ir para o site do ${esc(nome)}${SETA}</a></p>` : ''}

    <div data-promo="ebook"></div>
  </article>
  <aside class="lateral-post">
    ${logo(id, '../') ? `<div class="caixa centro">${logo(id, '../')}</div>` : ''}
    <div class="caixa"><h3>Compare os bancos</h3><p class="muted" style="font-size:.93rem">Parcela e custo total do seu financiamento em cada instituição.</p><a class="btn btn-acao btn-bloco" href="../comparar.html">Comparar agora${SETA}</a></div>
    <div class="anuncio" data-formato="retangulo" data-bloco="bancos_lateral"></div>
    <div data-promo="ebook-lateral"></div>
  </aside>
</div>
` + pe('../')));
}

/* ---------- índice de bancos ---------- */
const ordem = ranking('reg', 'tr').map((t) => t.id).concat(ids).filter((id, i, a) => a.indexOf(id) === i);
gravar('bancos.html', cabeca('', `Taxas de financiamento imobiliário por banco: ${rotuloAtual}`,
  `Taxa de juros do financiamento imobiliário em cada banco, atualizada em ${rotuloAtual}: Caixa, Banco do Brasil, Itaú, Bradesco, Santander e outros.`) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="index.html">Início</a> › Taxas por banco</p>
    <h1>Taxas de financiamento imobiliário por banco</h1>
    <p>Atualizado em ${rotuloAtual}, com a divulgação mais recente do Banco Central (contratos de ${rotuloMes}). Escolha uma instituição para ver as taxas em cada modalidade e a posição no ranking.</p>
  </div>
</section>
<div class="container">
  <div class="lista-bancos">
${ordem.map((id) => {
    const m = taxas.filter((t) => t.id === id);
    const p = m.find((t) => t.linha === 'reg' && t.idx === 'tr') || m.find((t) => t.idx === 'tr') || m[0];
    return `    <a class="cartao-banco" href="${pagina[id]}">${logo(id, '') || `<b>${esc(nomeDe(id))}</b>`}<span><b>${esc(nomeDe(id))}</b><small>${f.pct(p.aa, 2)} ao ano · ${p.linha === 'reg' ? 'SFH' : 'SFI'} · ${IDX[p.idx]}</small></span></a>`;
  }).join('\n')}
  </div>
  <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>
  <div data-promo="ebook"></div>
</div>
` + pe(''));
gravar('dados/paginas-bancos.js', '/* Gerado por gerar-seo.mjs */\nwindow.PAGINAS_BANCOS = ' + JSON.stringify(pagina, null, 1) + ';\n');

/* ---------- lista de artigos dentro de blog.html ---------- */
{
  const cartoes = (W.POSTS || []).map((p) => `<a class="cartao-post" href="blog/${p.slug}.html"><div class="capa" style="--cor:${p.cor}"><span>${esc(p.categoria)}</span></div><div class="txt"><h3>${esc(p.titulo)}</h3><p>${esc(p.resumo)}</p><small>${p.data} · ${p.minutos} min de leitura</small></div></a>`).join('\n');
  const html = ler('blog.html').replace(/<div class="blog-lista" id="blogLista">[\s\S]*?<\/div><!--fim-lista-->|<div class="blog-lista" id="blogLista"><\/div>/,
    `<div class="blog-lista" id="blogLista">\n${cartoes}\n</div><!--fim-lista-->`);
  gravar('blog.html', html);
}

// Política de segurança de conteúdo: só carrega código e dados das origens listadas.
// Com anúncios ligados (CONFIG.anuncios.cliente), libera também os domínios de publicidade do Google.
const comAnuncios = !!(CC.CONFIG.anuncios && CC.CONFIG.anuncios.cliente);
const leadOrigem = (() => { try { return new URL(CC.CONFIG.leadEndpoint).origin; } catch { return ''; } })();
// Com medição ligada (CONFIG.analytics.id), libera só os domínios do Google Analytics.
const comAnalytics = /^G-[A-Z0-9]{4,20}$/.test(String((CC.CONFIG.analytics && CC.CONFIG.analytics.id) || ''));
const GA_SCRIPT = 'https://www.googletagmanager.com';
const GA_DADOS = 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com';
const GOOGLE_ADS = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google';
const CSP = [
  "default-src 'self'",
  `script-src 'self'${comAnalytics ? ' ' + GA_SCRIPT : ''}${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data:${comAnuncios ? ' https:' : comAnalytics ? ' ' + GA_DADOS : ''}`,
  `connect-src 'self' https://olinda.bcb.gov.br${leadOrigem ? ' ' + leadOrigem : ''}${comAnalytics ? ' ' + GA_DADOS : ''}${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
  `frame-src ${comAnuncios ? GOOGLE_ADS : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
/* ---------- metadados em todas as páginas + sitemap ---------- */
const paginas = [
  ...readdirSync(raiz).filter((n) => n.endsWith('.html')),
  ...readdirSync(join(raiz, 'blog')).filter((n) => n.endsWith('.html')).map((n) => 'blog/' + n),
  ...readdirSync(join(raiz, 'bancos')).filter((n) => n.endsWith('.html')).map((n) => 'bancos/' + n)
];
// data das páginas no sitemap: a mais recente entre a virada do mês vigente e a última troca de taxas
const hojeISO = [`${anoAtual}-${mesAtual}-01`, (snap.geradoEm || '').slice(0, 10)].sort().pop();
const MARCA = ' | Financie Imóvel';
const texto = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`;
const ORG = { '@type': 'Organization', name: 'Financie Imóvel', url: `${dominio}/`, logo: `${dominio}/assets/logo.svg` };
const postDe = Object.fromEntries((W.POSTS || []).map((x) => [`blog/${x.slug}.html`, x]));
const SECAO = { 'comparar.html': 'Comparar bancos', 'quanto-posso-financiar.html': 'Quanto posso financiar', 'guias.html': 'Guias', 'blog.html': 'Blog', 'ebook.html': 'Ebook', 'bancos.html': 'Taxas por banco', 'privacidade.html': 'Privacidade e cookies' };
const migalhas = (itens) => ld({ '@type': 'BreadcrumbList', itemListElement: itens.map(([name, caminho], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${dominio}/${caminho}` })) });

for (const p of paginas) {
  let h = ler(p);
  const oculta = p === '404.html';
  // título longo demais é cortado no resultado da busca: tira a marca do fim quando passa de 65 caracteres
  let titulo = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  if (titulo.length > 65 && titulo.endsWith(MARCA)) { titulo = titulo.slice(0, -MARCA.length); h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`); }
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const url = dominio && !oculta ? `${dominio}/${p === 'index.html' ? '' : p}` : '';
  const h1 = texto((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || titulo);

  const dadosEstruturados = [];
  if (dominio && !oculta) {
    if (p === 'index.html') {
      dadosEstruturados.push(ld({ '@type': 'WebSite', name: 'Financie Imóvel', alternateName: 'Simulador de financiamento imobiliário', url: `${dominio}/`, inLanguage: 'pt-BR', publisher: ORG }));
      const faq = [...((h.match(/id="duvidas"[\s\S]*?<\/section>/) || [''])[0]).matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)];
      if (faq.length) dadosEstruturados.push(ld({ '@type': 'FAQPage', mainEntity: faq.map((m) => ({ '@type': 'Question', name: texto(m[1]), acceptedAnswer: { '@type': 'Answer', text: texto(m[2]) } })) }));
    } else if (postDe[p]) {
      const x = postDe[p];
      dadosEstruturados.push(ld({ '@type': 'Article', headline: x.titulo, description: x.descricao || x.resumo, datePublished: x.data, dateModified: hojeISO, inLanguage: 'pt-BR',
        image: `${dominio}/assets/og.png`, mainEntityOfPage: url, author: ORG, publisher: ORG }));
      dadosEstruturados.push(migalhas([['Início', ''], ['Blog', 'blog.html'], [x.titulo, p]]));
    } else if (p.startsWith('bancos/')) {
      dadosEstruturados.push(ld({ '@type': 'WebPage', name: h1, description: desc, url, dateModified: hojeISO, inLanguage: 'pt-BR', isPartOf: { '@type': 'WebSite', name: 'Financie Imóvel', url: `${dominio}/` } }));
      dadosEstruturados.push(migalhas([['Início', ''], ['Taxas por banco', 'bancos.html'], [h1, p]]));
    } else {
      if (p === 'ebook.html') {
        const pr = CC.CONFIG.produto, valor = (String(pr.preco).match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.');
        if (valor && pr.checkout) dadosEstruturados.push(ld({ '@type': 'Product', name: `${pr.nome}: ${pr.subtitulo}`, description: desc, image: `${dominio}/assets/ebook-capa.png`, category: 'Ebook',
          brand: { '@type': 'Brand', name: 'Financie Imóvel' }, offers: { '@type': 'Offer', price: Number(valor).toFixed(2), priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url } }));
      }
      if (p === 'comparar.html' || p === 'quanto-posso-financiar.html') dadosEstruturados.push(ld({ '@type': 'WebApplication', name: h1, description: desc, url, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', inLanguage: 'pt-BR',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' } }));
      dadosEstruturados.push(migalhas([['Início', ''], [SECAO[p] || h1, p]]));
    }
  }

  const bloco = `<!--seo:inicio-->
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="robots" content="${oculta ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="theme-color" content="#101a4a">
${url ? `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">\n` : ''}<meta property="og:site_name" content="Financie Imóvel">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${p.startsWith('blog/') ? 'article' : 'website'}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
${dominio ? `<meta property="og:image" content="${dominio}/assets/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="${dominio}/assets/og.png">\n` : ''}<meta name="twitter:card" content="summary_large_image">
${dadosEstruturados.join('\n')}${dadosEstruturados.length ? '\n' : ''}<!--seo:fim-->`;
  h = h.replace(/<meta property="og:(type|title|description)"[^>]*>\n/g, '');
  h = /<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/.test(h) ? h.replace(/<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/, () => bloco)
    : h.replace(/(<meta name="description"[^>]*>\n)/, (m) => `${m}${bloco}\n`);
  gravar(p, h);
}
const hoje = hojeISO;
gravar('robots.txt', `User-agent: *\nAllow: /\n${dominio ? `\nSitemap: ${dominio}/sitemap.xml\n` : ''}`);
if (dominio) {
  gravar('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paginas.filter((p) => p !== '404.html').map((p) => `  <url><loc>${dominio}/${p === 'index.html' ? '' : p}</loc><lastmod>${hoje}</lastmod></url>`).join('\n') + '\n</urlset>\n');
}
console.log(`OK: ${ids.length} páginas de banco, índice, lista do blog e metadados em ${paginas.length} páginas.` +
  (dominio ? ' sitemap.xml gerado.' : ' ATENÇÃO: preencha "dominio" em site.config.json para gerar sitemap.xml e endereços canônicos.'));
