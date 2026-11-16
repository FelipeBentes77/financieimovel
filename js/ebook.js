/* Página do ebook: preço e botões de compra conforme CONFIG.produto */
(function () {
  'use strict';
  CC.montarPagina('ebook'); CC.iniciarDados();
  var p = CC.CONFIG.produto, aVenda = /^https:\/\//.test(p.checkout);
  if (p.preco) {
    CC.$('preco').hidden = false; CC.$('preco').innerHTML = 'Por <b>' + CC.f.esc(p.preco) + '</b>, pagamento único';
    [].forEach.call(document.querySelectorAll('[data-preco]'), function (el) { el.hidden = false; el.textContent = p.preco; });
    [].forEach.call(document.querySelectorAll('[data-preco-nota]'), function (el) { el.hidden = false; });
  }
  [].forEach.call(document.querySelectorAll('[data-comprar]'), function (botao) {
    if (aVenda) { botao.href = p.checkout; botao.rel = 'noopener'; return; }
    botao.firstChild.textContent = 'Lançamento em breve';
    botao.removeAttribute('href'); botao.setAttribute('aria-disabled', 'true'); botao.style.opacity = '.75'; botao.style.cursor = 'default';
  });
  CC.$('notaLancamento').hidden = aVenda;
})();
