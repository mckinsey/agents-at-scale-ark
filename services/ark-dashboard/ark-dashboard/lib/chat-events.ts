export type ChatType = 'model' | 'team' | 'agent';

export const openFloatingChat = (
  name: string,
  type: ChatType,
  strategy?: string,
) => {
  window.dispatchEvent(
    new CustomEvent('open-floating-chat', { detail: { name, type, strategy } }),
  );
};

export const toggleFloatingChat = (
  name: string,
  type: ChatType,
  strategy?: string,
) => {
  window.dispatchEvent(
    new CustomEvent('toggle-floating-chat', {
      detail: { name, type, strategy },
    }),
  );
};
