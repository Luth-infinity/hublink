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

  browser: {
    toggle: (on) => invoke('browser:toggle', on),
    addTab: (url) => invoke('tab:add', url),
    setBlockAds: (on) => invoke('browser:set-block-ads', on),
    toggleFavorite: () => invoke('favorites:toggle'),
    removeFavorite: (id) => invoke('favorites:remove', id),
    openFavorite: (id) => invoke('favorites:open', id),
    openHistory: (url) => invoke('history:open', url),
    removeHistory: (id) => invoke('history:remove', id),
    clearHistory: () => invoke('history:clear'),
    selectTab: (id) => invoke('tab:select', id),
    closeTab: (id) => invoke('tab:close', id),
    onTabMeta: (handler) => on('tab:meta', handler)
  },

  downloads: {
    reveal: (path) => invoke('download:reveal', path),
    open: (path) => invoke('download:open', path),
    onStarted: (handler) => on('download:started', handler),
    onProgress: (handler) => on('download:progress', handler),
    onDone: (handler) => on('download:done', handler)
  },

  updater: {
    canInstall: () => invoke('update:can-install'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    onProgress: (handler) => on('update:progress', handler)
  },

  media: {
    togglePictureInPicture: () => invoke('media:pip'),
    onPresent: (handler) => on('media:present', handler)
  },

  nav: {
    back: () => invoke('nav:back'),
    forward: () => invoke('nav:forward'),
    reload: (hard) => invoke('nav:reload', hard),
    stop: () => invoke('nav:stop'),
    home: () => invoke('nav:home'),
    go: (input) => invoke('nav:go', input),
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
  checkUpdate: () => invoke('update:check'),
  onUpdateAvailable: (handler) => on('update:available', handler),
  setTheme: (theme) => invoke('app:set-theme', theme),
  setAccent: (color) => invoke('app:set-accent', color),
  setSleepDelay: (minutes) => invoke('app:set-sleep', minutes),
  setBadge: (payload) => ipcRenderer.send('app:badge', payload),
  capturePage: (options) => invoke('capture:page', options),
  onToast: (handler) => on('app:toast', handler),
  onShortcut: (handler) => on('app:shortcut', handler)
});
