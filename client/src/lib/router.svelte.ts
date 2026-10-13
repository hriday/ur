let path = $state(location.pathname);

window.addEventListener('popstate', () => {
  path = location.pathname;
});

export const route = {
  get path() {
    return path;
  },
};

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  path = location.pathname;
  window.scrollTo(0, 0);
}

/** Svelte action: client-side navigation for internal links. */
export function link(node: HTMLAnchorElement) {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(node.getAttribute('href') ?? '/');
  };
  node.addEventListener('click', onClick);
  return { destroy: () => node.removeEventListener('click', onClick) };
}
