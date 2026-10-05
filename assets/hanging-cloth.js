(() => {
  const cloth = document.createElement('img');
  cloth.className = 'hanging-cloth';
  cloth.src = 'assets/fly3.png';
  cloth.alt = '';
  cloth.setAttribute('aria-hidden', 'true');
  cloth.decoding = 'async';
  const anchor = document.querySelector('.topbar, .top');
  if (anchor) anchor.append(cloth);
})();
