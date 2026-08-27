const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

function on(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('hublink', {
  platform: process.platform,

  getState: () => invoke('state:get'),
  onStateChanged: (handler) => on('state:changed', handler),
  /** Delta léger badge / favicon, hors du flux d'état complet. */
  onServiceMeta: (handler) => on('service:meta', handler),
  onServiceSlept: (handler) => on('service:slept', handler),

  accounts: {
    filter: (id) => invoke('account:filter', id),
    add: (data) => invoke('account:add', data),
    update: (id, patch) => invoke('account:update', { id, patch }),
    remove: (id) => invoke('account:remove', id),
    pickAvatar: () => invoke('account:pick-avatar')
  },

  services: {
    add: (data) => invoke('service:add', data),
    update: (id, patch) => invoke('service:update', { id, patch }),
    remove: (id) => invoke('service:remove', id),
    select: (id) => invoke('service:select', id),
    reorder: (orderedIds) => invoke('service:reorder', orderedIds),
    pickIcon: () => invoke('service:pick-icon')
  },

  nav: {
    back: () => invoke('nav:back'),
    forward: () => invoke('nav:forward'),
    reload: (hard) => invoke('nav:reload', hard),
    stop: () => invoke('nav:stop'),
    home: () => invoke('nav:home'),
    devtools: () => invoke('nav:devtools'),
    onState: (handler) => on('nav:state', handler)
  },

  extensions: {
    installFromFolder: () => invoke('ext:install-folder'),
    installFromFile: () => invoke('ext:install-file'),
    installFromStore: (idOrUrl) => invoke('ext:install-store', idOrUrl),
    remove: (id) => invoke('ext:remove', id),
    toggle: (id, accountId, enabled) => invoke('ext:toggle', { id, accountId, enabled }),
    loaded: (accountId) => invoke('ext:loaded', accountId),
    openPopup: (chromeExtensionId) => invoke('ext:popup', chromeExtensionId)
  },

  setContentBounds: (bounds) => ipcRenderer.send('layout:bounds', bounds),
  setOverlay: (active) => ipcRenderer.send('layout:overlay', active),
  toggleSidebar: (collapsed) => invoke('layout:toggle-sidebar', collapsed),
  popupMenu: (items) => invoke('menu:popup', items),
  openExternal: (url) => invoke('app:open-external', url),
  about: () => invoke('app:about'),
  setTheme: (theme) => invoke('app:set-theme', theme),
  setSleepDelay: (minutes) => invoke('app:set-sleep', minutes),
  setBadge: (payload) => ipcRenderer.send('app:badge', payload),
  capturePage: (options) => invoke('capture:page', options),
  onToast: (handler) => on('app:toast', handler),
  onShortcut: (handler) => on('app:shortcut', handler)
});
