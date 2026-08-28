const store = require('./store');

// Régies publicitaires et traceurs les plus répandus. Une liste de domaines
// tenue à la main plutôt qu'un moteur de filtrage : quelques kilo-octets et une
// comparaison de chaîne par requête, là où EasyList imposerait une dépendance,
// plusieurs mégaoctets et un chargement au démarrage. On y perd le filtrage
// cosmétique — l'emplacement de la pub peut rester vide — mais la requête, elle,
// ne part pas.
const DOMAINS = new Set([
  // Google
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  // Régies programmatiques
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'criteo.com',
  'criteo.net',
  'smartadserver.com',
  'appnexus.com',
  'adform.net',
  'thetradedesk.com',
  'adsrvr.org',
  'bidswitch.net',
  'sharethrough.com',
  'triplelift.com',
  'indexww.com',
  'districtm.io',
  'yieldmo.com',
  'gumgum.com',
  'sonobi.com',
  '3lift.com',
  'media.net',
  'servebom.com',
  // Recommandation de contenu
  'taboola.com',
  'outbrain.com',
  'zemanta.com',
  'revcontent.com',
  'mgid.com',
  'plista.com',
  // Mesure d'audience et traceurs
  'scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'chartbeat.com',
  'chartbeat.net',
  'krxd.net',
  'bluekai.com',
  'demdex.net',
  'everesttech.net',
  'omtrdc.net',
  'adobedtm.com',
  'branch.io',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'mixpanel.com',
  'fullstory.com',
  'hotjar.com',
  'hotjar.io',
  'mouseflow.com',
  'crazyegg.com',
  'inspectlet.com',
  'luckyorange.com',
  'clarity.ms',
  'newrelic.com',
  'nr-data.net',
  'optimizely.com',
  'kissmetrics.com',
  'heapanalytics.com',
  'matomo.cloud',
  // Réseaux sociaux : pixels de conversion
  'connect.facebook.net',
  'facebook.net',
  'ads-twitter.com',
  'analytics.twitter.com',
  'ads.linkedin.com',
  'px.ads.linkedin.com',
  'bat.bing.com',
  'ads.pinterest.com',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  // Divers
  'moatads.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'imrworldwide.com',
  'agkn.com',
  'rlcdn.com',
  'crwdcntrl.net',
  'exelator.com',
  'tapad.com',
  'addthis.com',
  'sharethis.com',
  'popads.net',
  'propellerads.com',
  'adcash.com',
  'exoclick.com',
  'juicyads.com',
  'trafficjunky.net'
]);

/**
 * Un domaine est bloqué si lui-même ou l'un de ses parents figure dans la
 * liste : `pagead2.googlesyndication.com` doit tomber avec
 * `googlesyndication.com`, sans avoir à énumérer chaque sous-domaine.
 */
function isBlocked(hostname) {
  let name = hostname;
  for (;;) {
    if (DOMAINS.has(name)) return true;
    const dot = name.indexOf('.');
    if (dot === -1) return false;
    name = name.slice(dot + 1);
    if (!name.includes('.')) return false;
  }
}

/**
 * Posé sur la seule session du navigateur : les services ne paient donc rien
 * pour ce filtre, et le réglage est relu à chaque requête plutôt que de
 * réinstaller l'écouteur — le basculement prend effet aussitôt.
 */
function applyTo(session) {
  session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (!store.load().blockAds) return callback({});
    // Une navigation principale reste toujours permise : taper une adresse à la
    // main ne doit jamais aboutir sur une page morte.
    if (details.resourceType === 'mainFrame') return callback({});
    try {
      callback({ cancel: isBlocked(new URL(details.url).hostname) });
    } catch {
      callback({});
    }
  });
}

module.exports = { applyTo, isBlocked };
