let items = $state<{ id: number; text: string }[]>([]);
let nextId = 0;

export const toasts = {
  get items() {
    return items;
  },
  push(text: string) {
    const id = nextId++;
    items = [...items.slice(-2), { id, text }];
    setTimeout(() => { items = items.filter((t) => t.id !== id); }, 2800);
  },
};
