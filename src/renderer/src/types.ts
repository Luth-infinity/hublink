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
  /** Exempté de mise en veille, pour continuer à signaler ses non-lus. */
  keepAwake: boolean;
};

export type ServiceInput = {
  name: string;
  url: string;
  accountId: string;
  openLinks?: 'browser' | 'app';
  spoofChrome?: boolean;
  blockPasskeys?: boolean;
  notifications?: boolean;
  keepAwake?: boolean;
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

/** Un onglet du mode navigateur : aucun compte, session neutre partagée. */
export type Tab = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
};

/** Un favori du mode navigateur. */
export type Favorite = {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
};

/** Une page visitée en mode navigateur. */
export type HistoryEntry = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  /** Dernier passage, en millisecondes. */
  at: number;
};

export type Download = {
  id: string;
  name: string;
  path: string;
  total: number;
  received: number;
  /** 'progress' tant qu'il tourne, puis l'état final rendu par Electron. */
  state: 'progress' | 'completed' | 'cancelled' | 'interrupted';
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
  /** Navigateur neutre actif : les onglets remplacent les services. */
  browserMode: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  /** Bloqueur de pub du mode navigateur. Sans effet sur les comptes. */
  blockAds: boolean;
  favorites: Favorite[];
  history: HistoryEntry[];
  /** Masque les comptes autres que celui affiché, pour un partage d'écran. */
  discreet: boolean;
  /** Comptes repliés dans la vue « Tous ». */
  collapsedAccounts: string[];
  /** Teinte du shell en mode navigateur, faute de couleur de compte. */
  accentColor: string | null;
  extensions: ExtensionRecord[];
  window: { width: number; height: number; x: number | null; y: number | null; maximized: boolean };
};

export type ServiceMeta = { serviceId: string; badge?: number; favicon?: string };

export type TabMeta = { tabId: string; title?: string; url?: string; favicon?: string };

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

/** Une action ne peut pas traverser l'IPC : on décrit, le principal exécute. */
export type ToastAction = { kind: 'reveal'; label: string; path: string };

export type Toast = {
  variant: 'success' | 'error';
  message: string;
  action?: ToastAction;
};

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
        restore(): Promise<Service | null>;
        reorder(orderedIds: string[]): Promise<void>;
        setCollapsed(id: string, collapsed?: boolean): Promise<void>;
        pickAvatar(): Promise<string | null>;
      };

      services: {
        add(data: ServiceInput): Promise<Service>;
        update(id: string, patch: Partial<Service>): Promise<void>;
        remove(id: string): Promise<void>;
        restore(): Promise<Service | null>;
        select(id: string): Promise<void>;
        sleep(id: string): Promise<void>;
        copyPassword(id: string): Promise<boolean>;
        reorder(orderedIds: string[]): Promise<void>;
        pickIcon(): Promise<string | null>;
      };

      browser: {
        toggle(on?: boolean): Promise<boolean>;
        addTab(url?: string): Promise<Tab>;
        setBlockAds(on: boolean): Promise<void>;
        toggleFavorite(): Promise<boolean>;
        removeFavorite(id: string): Promise<void>;
        openFavorite(id: string): Promise<void>;
        openHistory(url: string): Promise<void>;
        removeHistory(id: string): Promise<void>;
        clearHistory(): Promise<void>;
        selectTab(id: string): Promise<void>;
        closeTab(id: string): Promise<void>;
        onTabMeta(handler: (meta: TabMeta) => void): () => void;
      };

      downloads: {
        reveal(path: string): Promise<void>;
        open(path: string): Promise<string>;
        onStarted(handler: (d: { id: string; name: string; total: number; path: string }) => void): () => void;
        onProgress(handler: (d: { id: string; received: number; total: number; paused: boolean }) => void): () => void;
        onDone(handler: (d: { id: string; name: string; path: string; state: string; total: number }) => void): () => void;
      };

      updater: {
        canInstall(): Promise<boolean>;
        download(): Promise<void>;
        install(): Promise<void>;
        onProgress(handler: (p: { percent: number }) => void): () => void;
      };

      media: {
        togglePictureInPicture(): Promise<string>;
        onPresent(handler: (m: { id: string; present: boolean }) => void): () => void;
      };

      nav: {
        back(): Promise<void>;
        forward(): Promise<void>;
        reload(hard?: boolean): Promise<void>;
        stop(): Promise<void>;
        home(): Promise<void>;
        go(input: string): Promise<void>;
        devtools(): Promise<void>;
        onState(handler: (state: NavState) => void): () => void;
      };

      extensions: {
        installFromFolder(): Promise<ExtensionRecord | null>;
        installFromFile(): Promise<ExtensionRecord | null>;
        installFromStore(idOrUrl: string): Promise<ExtensionRecord | null>;
        remove(id: string): Promise<void>;
        restore(): Promise<Service | null>;
        toggle(id: string, accountId: string, enabled: boolean): Promise<void>;
        loaded(accountId: string): Promise<LoadedExtension[]>;
        openPopup(chromeExtensionId: string): Promise<void>;
      };

      setContentBounds(bounds: { x: number; y: number; width: number; height: number }): void;
      /** Masque la vue web native, sinon elle recouvre les modales du shell. */
      setOverlay(active: boolean): void;
      /** Image figée de la page, à afficher derrière une modale. */
      viewStill(): Promise<string | null>;
      toggleSidebar(collapsed?: boolean): Promise<void>;
      popupMenu(items: MenuItem[]): Promise<string | null>;

      /** Pont du menu contextuel : le calque l'affiche, le shell le demande. */
      menu: {
        onOpen(
          handler: (demande: { id: number; items: MenuItem[]; ancre: { x: number; y: number } }) => void
        ): () => void;
        pick(id: number, picked: string | null): void;
      };
      openExternal(url: string): Promise<void>;
      about(): Promise<{ version: string; electron: string; chrome: string; userData: string }>;
      checkUpdate(): Promise<Update | null>;
      onUpdateAvailable(handler: (update: Update) => void): () => void;
      overlay: { setInteractive(on: boolean): void };

      /** Panneaux déroulants, dessinés par le calque. */
      panels: {
        toggle(
          kind: 'downloads' | 'history' | 'accounts',
          anchor: { x: number; y: number; width: number; height: number }
        ): void;
        close(): void;
        onState(
          handler: (
            p: {
              kind: 'downloads' | 'history' | 'accounts';
              anchor: { x: number; y: number; width: number; height: number };
            } | null
          ) => void
        ): () => void;
      };

      /** Liste des téléchargements, tenue par le processus principal. */
      downloadsList: {
        clear(): void;
        onList(handler: (list: Download[]) => void): () => void;
      };
      runToastAction(action: ToastAction): void;
      openAccountsSettings(): void;
      setTheme(theme: Theme): Promise<void>;
      setAccent(color: string | null): Promise<void>;
      setDiscreet(on?: boolean): Promise<boolean>;
      exportConfig(): Promise<string | null>;
      importConfig(): Promise<boolean>;
      /** 0 = jamais mettre en veille. */
      setSleepDelay(minutes: number): Promise<void>;
      setBadge(payload: { total: number; overlay: string | null }): void;
      capturePage(options: { fullPage: boolean; toClipboard: boolean }): Promise<string | null>;
      onToast(handler: (toast: Toast) => void): () => void;
      onShortcut(handler: (shortcut: Shortcut) => void): () => void;
    };
  }
}
