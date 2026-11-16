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
const rotuloMes = `${MESES[+mes - 1]} de ${ano}`;
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
  const titulo = `Financiamento imobiliário ${nome}: taxa de juros em ${rotuloMes}`;
  const descricao = `O ${nome} cobrou em média ${f.pct(principal.aa, 2)} ao ano no financiamento imobiliário em ${rotuloMes} (${LINHA[principal.linha]}, ${IDX[principal.idx]}). Veja parcela, posição no ranking e compare com outros bancos.`;
  const avisos = [
    b.regiao ? `<p>O ${esc(nome)} tem atuação concentrada no estado: ${esc(b.regiao)}. Confirme se há atendimento na sua cidade.</p>` : '',
    b.coop ? `<p>O ${esc(nome)} é um sistema de cooperativas de crédito: para contratar é preciso associar-se a uma cooperativa.</p>` : ''
  ].join('');

  gravar(pagina[id], genero(id, cabeca('../', `${titulo} | Financie Imóvel`, descricao) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="../index.html">Início</a> › <a href="../bancos.html">Taxas por banco</a> › ${esc(nome)}</p>
    <h1>Financiamento imobiliário ${esc(nome)}: taxas de ${rotuloMes}</h1>
    <p>Taxa média de juros que o ${esc(nome)} cobrou nos contratos fechados no mês, segundo o Banco Central.</p>
  </div>
</section>
<div class="container post">
  <article class="artigo">
    <p class="lide">Em ${rotuloMes}, o ${esc(nome)} cobrou em média <b>${f.pct(principal.aa, 2)} ao ano</b> nos financiamentos imobiliários da linha ${LINHA[principal.linha]} com correção por ${IDX[principal.idx]}. Com isso ficou em <b>${pos}º lugar entre ${rk.length} instituições</b> nessa modalidade.</p>

    <h2>Taxas do ${esc(nome)} por modalidade</h2>
    <table>
      <thead><tr><th>Linha</th><th>Correção</th><th class="n">Taxa ao ano</th><th class="n">Posição</th><th class="n">1ª parcela*</th></tr></thead>
      <tbody>
${linhasTab}
      </tbody>
    </table>
    <p class="nota">*Exemplo: R$ 400.000 financiados em 30 anos pela tabela SAC, imóvel de R$ 500.000, com seguros estimados. Fonte das taxas: Banco Central do Brasil, ${rotuloMes}.</p>

    <div class="cta-linha"><p>Simule o seu valor no ${esc(nome)} e nos outros bancos.</p><a class="btn btn-acao" href="../comparar.html?l=${principal.linha}&i=${principal.idx}">Comparar bancos${SETA}</a></div>

    <div class="anuncio" data-formato="faixa" data-bloco="bancos"></div>

    <h2>Como o ${esc(nome)} se compara</h2>
    <p>Ranking de ${rotuloMes} na linha ${LINHA[principal.linha]}, correção por ${IDX[principal.idx]}:</p>
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
gravar('bancos.html', cabeca('', `Taxas de financiamento imobiliário por banco em ${rotuloMes} | Financie Imóvel`,
  `Taxa de juros do financiamento imobiliário em cada banco em ${rotuloMes}: Caixa, Banco do Brasil, Itaú, Bradesco, Santander e outros, com dados do Banco Central.`) + `
<section class="topo-pag">
  <div class="container">
    <p class="migalhas"><a href="index.html">Início</a> › Taxas por banco</p>
    <h1>Taxas de financiamento imobiliário por banco</h1>
    <p>Referência: ${rotuloMes}. Escolha uma instituição para ver as taxas em cada modalidade e a posição no ranking.</p>
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
const GOOGLE_ADS = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google';
const CSP = [
  "default-src 'self'",
  `script-src 'self'${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data:${comAnuncios ? ' https:' : ''}`,
  `connect-src 'self' https://olinda.bcb.gov.br${leadOrigem ? ' ' + leadOrigem : ''}${comAnuncios ? ' ' + GOOGLE_ADS : ''}`,
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
for (const p of paginas) {
  let h = ler(p);
  const titulo = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const url = dominio ? `${dominio}/${p === 'index.html' ? '' : p}` : '';
  const bloco = `<!--seo:inicio-->
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
${url ? `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">\n` : ''}<meta property="og:site_name" content="Financie Imóvel">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${p.startsWith('blog/') ? 'article' : 'website'}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
<meta name="twitter:card" content="summary">
<!--seo:fim-->`;
  h = h.replace(/<meta property="og:(type|title|description)"[^>]*>\n/g, '');
  h = /<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/.test(h) ? h.replace(/<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/, bloco)
    : h.replace(/(<meta name="description"[^>]*>\n)/, `$1${bloco}\n`);
  gravar(p, h);
}
const hoje = (snap.geradoEm || new Date().toISOString()).slice(0, 10);
gravar('robots.txt', `User-agent: *\nAllow: /\n${dominio ? `\nSitemap: ${dominio}/sitemap.xml\n` : ''}`);
if (dominio) {
  gravar('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paginas.filter((p) => p !== 'privacidade.html').map((p) => `  <url><loc>${dominio}/${p === 'index.html' ? '' : p}</loc><lastmod>${hoje}</lastmod></url>`).join('\n') + '\n</urlset>\n');
}
console.log(`OK: ${ids.length} páginas de banco, índice, lista do blog e metadados em ${paginas.length} páginas.` +
  (dominio ? ' sitemap.xml gerado.' : ' ATENÇÃO: preencha "dominio" em site.config.json para gerar sitemap.xml e endereços canônicos.'));
