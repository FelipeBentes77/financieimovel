/* Página do ebook: preço e botão de compra conforme CONFIG.produto */
(function () {
  'use strict';
  CC.montarPagina('ebook'); CC.iniciarDados();
  var p = CC.CONFIG.produto, botao = CC.$('comprar');
  if (p.preco) { CC.$('preco').hidden = false; CC.$('preco').innerHTML = 'Por <b>' + CC.f.esc(p.preco) + '</b>'; }
  if (p.checkout && /^https:\/\//.test(p.checkout)) { botao.href = p.checkout; botao.rel = 'noopener'; }
  else {
    CC.$('notaLancamento').hidden = false;
    botao.firstChild.textContent = 'Lançamento em breve';
    botao.removeAttribute('href'); botao.setAttribute('aria-disabled', 'true'); botao.style.opacity = '.75'; botao.style.cursor = 'default';
  }
})();
