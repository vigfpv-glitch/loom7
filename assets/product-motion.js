(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, {rootMargin: '0px 0px -8% 0px', threshold: 0.12});

  function observeProducts(root) {
    const products = [];
    if (root.matches?.('.product')) products.push(root);
    products.push(...(root.querySelectorAll?.('.product') || []));

    products.forEach((product) => {
      if (product.hasAttribute('data-product-reveal')) return;
      product.dataset.productReveal = '';
      const index = Array.from(product.parentElement.children).indexOf(product);
      product.style.setProperty('--product-reveal-delay', `${(index % 4) * 70}ms`);
      observer.observe(product);
    });
  }

  observeProducts(document);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) observeProducts(node);
      });
    });
  }).observe(document.body, {childList: true, subtree: true});
})();
