export type Account = {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
  /** Partition Chromium ; figée à la création pour ne jamais perdre les sessions. */
  partition?: string;
};

export type Service = {
  id: string;
  name: string;
  url: string;
  /** Session partagée : deux services d'un même compte partagent leurs cookies. */
  accountId: string;
  favicon: string | null;
  /** Icône choisie à la main ; prioritaire sur le favicon. */
  icon: string | null;
  /** Emoji de la bibliothèque ; prioritaire sur tout le reste. */
  emoji: string | null;
  badge: number;
  openLinks: 'browser' | 'app';
  spoofChrome: boolean;
  /** Neutralise WebAuthn : évite la clé d'accès système sur le mauvais compte. */
  blockPasskeys: boolean;
  /** Notifications système de ce service. */
  notifications: boolean;
};

export type ServiceInput = {
  name: string;
  url: string;
  accountId: string;
  openLinks?: 'browser' | 'app';
  spoofChrome?: boolean;
  blockPasskeys?: boolean;
  notifications?: boolean;
  icon?: string | null;
  emoji?: string | null;
};

export type ExtensionRecord = {
  id: string;
  name: string;
  version: string;
  manifestVersion: number;
  /** Permissions déclarées, pour signaler celles qu'Electron ne gère pas. */
  permissions?: string[];
  dir: string;
  source: { type: 'folder' | 'file' | 'store'; id?: string; origin?: string };
  enabled: Record<string, boolean>;
};

export type Theme = 'system' | 'light' | 'dark';

export type AppState = {
  version: number;
  theme: Theme;
  sidebarCollapsed: boolean;
  sleepAfterMinutes: number;
  /** Filtre : null = tous les comptes, sinon un seul. */
  activeAccountId: string | null;
  accounts: Account[];
  services: Service[];
  activeServiceId: string | null;
  extensions: ExtensionRecord[];
  window: { width: number; height: number; x: number | null; y: number | null; maximized: boolean };
};

export type ServiceMeta = { serviceId: string; badge?: number; favicon?: string };

export type NavState = {
  serviceId: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
};

export type LoadedExtension = {
  chromeId: string;
  name: string;
  version: string;
  path: string;
  hasPopup: boolean;
};

export type Shortcut = { type: string; index?: number };

/** Version publiée plus récente que celle installée. */
export type Update = { version: string; url: string; page: string; notes: string };

export type Toast = { variant: 'success' | 'error'; message: string };

export type MenuItem =
  | { type: 'separator' }
  | { id: string; label: string; type?: 'normal'; enabled?: boolean };

declare global {
  interface Window {
    hublink: {
      platform: string;
      getState(): Promise<AppState>;
      onStateChanged(handler: (state: AppState) => void): () => void;
      onServiceMeta(handler: (meta: ServiceMeta) => void): () => void;
      onServiceSlept(handler: (ref: { serviceId: string }) => void): () => void;

      accounts: {
        filter(id: string | null): Promise<void>;
        add(data: { name: string; color: string; avatar?: string | null }): Promise<Account>;
        update(id: string, patch: Partial<Account>): Promise<void>;
        remove(id: string): Promise<void>;
        pickAvatar(): Promise<string | null>;
      };

      services: {
        add(data: ServiceInput): Promise<Service>;
        update(id: string, patch: Partial<Service>): Promise<void>;
        remove(id: string): Promise<void>;
        select(id: string): Promise<void>;
        reorder(orderedIds: string[]): Promise<void>;
        pickIcon(): Promise<string | null>;
      };

      nav: {
        back(): Promise<void>;
        forward(): Promise<void>;
        reload(hard?: boolean): Promise<void>;
        stop(): Promise<void>;
        home(): Promise<void>;
        devtools(): Promise<void>;
        onState(handler: (state: NavState) => void): () => void;
      };

      extensions: {
        installFromFolder(): Promise<ExtensionRecord | null>;
        installFromFile(): Promise<ExtensionRecord | null>;
        installFromStore(idOrUrl: string): Promise<ExtensionRecord | null>;
        remove(id: string): Promise<void>;
        toggle(id: string, accountId: string, enabled: boolean): Promise<void>;
        loaded(accountId: string): Promise<LoadedExtension[]>;
        openPopup(chromeExtensionId: string): Promise<void>;
      };

      setContentBounds(bounds: { x: number; y: number; width: number; height: number }): void;
      /** Masque la vue web native, sinon elle recouvre les modales du shell. */
      setOverlay(active: boolean): void;
      toggleSidebar(collapsed?: boolean): Promise<void>;
      popupMenu(items: MenuItem[]): Promise<string | null>;
      openExternal(url: string): Promise<void>;
      about(): Promise<{ version: string; electron: string; chrome: string; userData: string }>;
      checkUpdate(): Promise<Update | null>;
      onUpdateAvailable(handler: (update: Update) => void): () => void;
      setTheme(theme: Theme): Promise<void>;
      /** 0 = jamais mettre en veille. */
      setSleepDelay(minutes: number): Promise<void>;
      setBadge(payload: { total: number; overlay: string | null }): void;
      capturePage(options: { fullPage: boolean; toClipboard: boolean }): Promise<string | null>;
      onToast(handler: (toast: Toast) => void): () => void;
      onShortcut(handler: (shortcut: Shortcut) => void): () => void;
    };
  }
}
