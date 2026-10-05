(() => {
  const anchor = document.querySelector('.topbar, .top');
  if (!anchor) return;

  [
    {className: 'hanging-cloth hanging-cloth--dress', src: 'assets/fly3-hanging.png'},
    {className: 'hanging-cloth hanging-cloth--shirt', src: 'assets/fly1-hanging.png'},
  ].forEach(({className, src}) => {
    const cloth = document.createElement('img');
    cloth.className = className;
    cloth.src = src;
    cloth.alt = '';
    cloth.setAttribute('aria-hidden', 'true');
    cloth.decoding = 'async';
    anchor.append(cloth);
  });
})();
