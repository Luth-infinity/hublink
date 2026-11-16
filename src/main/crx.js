const crypto = require('node:crypto');

/**
 * Vérification des paquets CRX3, comme le fait Chrome (crx_verifier.cc).
 *
 * electron-chrome-web-store lit l'en-tête mais ne vérifie aucune signature :
 * sans ceci, une réponse falsifiée sur le chemin du téléchargement installerait
 * n'importe quel code avec les droits d'une extension.
 *
 * Format : « Cr24 », version (3), taille de l'en-tête, en-tête protobuf
 * (CrxFileHeader), puis le zip. Chaque preuve signe :
 *   "CRX3 SignedData\0" + longueur (uint32 LE) + signed_header_data + zip.
 * Exigé : toutes les preuves valides, celle du développeur (dont la clé donne
 * l'identifiant) et celle du Chrome Web Store (clé d'éditeur de Google).
 */

// SHA-256 de la clé publique d'éditeur du Chrome Web Store (kPublisherKeyHash).
const EMPREINTE_WEB_STORE = Buffer.from(
  '61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf', 'hex'
);
const PREFIXE_SIGNE = Buffer.from('CRX3 SignedData\x00', 'binary');
const RSA = 2;
const ECDSA = 3;
const DONNEES_SIGNEES = 10000;

// ---- protobuf minimal : varints et champs à longueur ----

function lireVarint(b, pos) {
  let v = 0;
  let mul = 1;
  for (;;) {
    if (pos >= b.length) throw new Error('protobuf tronqué');
    const o = b[pos++];
    v += (o & 0x7f) * mul;
    if (o < 0x80) return [v, pos];
    mul *= 128;
    if (mul > 2 ** 49) throw new Error('varint trop long');
  }
}

/** [{ champ, valeur: Buffer }] pour les champs à longueur ; le reste est sauté. */
function lireMessage(b) {
  const champs = [];
  let pos = 0;
  while (pos < b.length) {
    let cle;
    [cle, pos] = lireVarint(b, pos);
    const champ = Math.floor(cle / 8);
    const type = cle & 7;
    if (type === 2) {
      let n;
      [n, pos] = lireVarint(b, pos);
      if (pos + n > b.length) throw new Error('protobuf tronqué');
      champs.push({ champ, valeur: b.subarray(pos, pos + n) });
      pos += n;
    } else if (type === 0) [, pos] = lireVarint(b, pos);
    else if (type === 1) pos += 8;
    else if (type === 5) pos += 4;
    else throw new Error(`type protobuf ${type}`);
  }
  return champs;
}

function varint(n) {
  const octets = [];
  while (n >= 0x80) {
    octets.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  octets.push(n);
  return Buffer.from(octets);
}
const champLongueur = (champ, valeur) => Buffer.concat([varint(champ * 8 + 2), varint(valeur.length), valeur]);

// ---- CRX ----

function decouper(buffer) {
  if (buffer.length < 12 || buffer.toString('binary', 0, 4) !== 'Cr24') throw new Error('pas un CRX');
  const version = buffer.readUInt32LE(4);
  if (version !== 3) throw new Error(`version CRX ${version} refusée`);
  const taille = buffer.readUInt32LE(8);
  if (12 + taille > buffer.length) throw new Error('en-tête tronqué');
  return { entete: buffer.subarray(12, 12 + taille), archive: buffer.subarray(12 + taille) };
}

function lireEntete(entete) {
  const preuves = [];
  let donneesSignees = null;
  for (const { champ, valeur } of lireMessage(entete)) {
    if (champ === RSA || champ === ECDSA) {
      const p = { algo: champ, cle: null, signature: null };
      for (const f of lireMessage(valeur)) {
        if (f.champ === 1) p.cle = f.valeur;
        if (f.champ === 2) p.signature = f.valeur;
      }
      if (!p.cle || !p.signature) throw new Error('preuve incomplète');
      preuves.push(p);
    } else if (champ === DONNEES_SIGNEES) donneesSignees = valeur;
  }
  return { preuves, donneesSignees };
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

/** Identifiant d'extension : 16 premiers octets du SHA-256 de la clé, en lettres a-p. */
function identifiant(cle) {
  return [...sha256(cle).subarray(0, 16).toString('hex')]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
}

/**
 * `cle` est la clé publique du développeur : posée en `manifest.key`, elle garde
 * à l'extension chargée en dossier son identifiant du Store.
 * @returns {{ ok: true, id: string, cle: Buffer } | { ok: false, raison: string }}
 */
function verifier(buffer, { id: attendu } = {}) {
  try {
    const { entete, archive } = decouper(buffer);
    const { preuves, donneesSignees } = lireEntete(entete);
    if (!donneesSignees) return { ok: false, raison: 'données signées absentes' };
    const crxId = lireMessage(donneesSignees).find((f) => f.champ === 1)?.valeur;
    if (!crxId || crxId.length !== 16) return { ok: false, raison: 'identifiant déclaré absent' };
    const id = [...crxId.toString('hex')].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

    const longueur = Buffer.alloc(4);
    longueur.writeUInt32LE(donneesSignees.length);
    const message = Buffer.concat([PREFIXE_SIGNE, longueur, donneesSignees, archive]);

    let developpeur = null;
    let webStore = false;
    for (const p of preuves) {
      const cle = crypto.createPublicKey({ key: p.cle, format: 'der', type: 'spki' });
      if (!crypto.verify('sha256', message, cle, p.signature)) return { ok: false, raison: 'signature invalide' };
      if (p.algo === RSA && identifiant(p.cle) === id) developpeur = p.cle;
      if (sha256(p.cle).equals(EMPREINTE_WEB_STORE)) webStore = true;
    }
    if (!developpeur) return { ok: false, raison: 'preuve du développeur absente' };
    if (!webStore) return { ok: false, raison: 'preuve du Chrome Web Store absente' };
    if (attendu && attendu !== id) return { ok: false, raison: `identifiant ${id} au lieu de ${attendu}` };
    const zip = inspecterZip(archive);
    if (!zip.ok) return zip;
    return { ok: true, id, cle: developpeur };
  } catch (e) {
    return { ok: false, raison: e.message };
  }
}

// ---- inspection du zip, avant que adm-zip ne le décompresse ----
// adm-zip (dépendance de electron-chrome-web-store) a des failles connues sans
// correctif : liens symboliques suivis à l'extraction, bombes de
// décompression, bits SUID conservés, doublons. On refuse ces archives avant.
const TAILLE_MAX = 512 * 1024 * 1024;
const ENTREES_MAX = 20000;
const RATIO_MAX = 1000;

function inspecterZip(zip) {
  try {
    let fin = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        fin = i;
        break;
      }
    }
    if (fin < 0) return { ok: false, raison: 'fin de zip introuvable' };
    const n = zip.readUInt16LE(fin + 10);
    const debutCd = zip.readUInt32LE(fin + 16);
    if (n === 0xffff || debutCd === 0xffffffff) return { ok: false, raison: 'zip64 refusé' };
    if (n > ENTREES_MAX) return { ok: false, raison: 'trop de fichiers' };
    const vus = new Set();
    let total = 0;
    let pos = debutCd;
    for (let k = 0; k < n; k++) {
      if (zip.readUInt32LE(pos) !== 0x02014b50) return { ok: false, raison: 'répertoire central corrompu' };
      const systeme = zip.readUInt16LE(pos + 4) >> 8;
      const methode = zip.readUInt16LE(pos + 10);
      const compresse = zip.readUInt32LE(pos + 20);
      const taille = zip.readUInt32LE(pos + 24);
      const lgNom = zip.readUInt16LE(pos + 28);
      const lgExtra = zip.readUInt16LE(pos + 30);
      const lgComm = zip.readUInt16LE(pos + 32);
      const attributs = zip.readUInt32LE(pos + 38);
      const nom = zip.toString('utf8', pos + 46, pos + 46 + lgNom);
      pos += 46 + lgNom + lgExtra + lgComm;

      if (!nom || nom.startsWith('/') || nom.includes('\\') || /^[a-z]:/i.test(nom) || nom.split('/').includes('..') || nom.includes('\0')) {
        return { ok: false, raison: `chemin refusé : ${nom}` };
      }
      const cle = nom.toLowerCase();
      if (vus.has(cle)) return { ok: false, raison: `fichier en double : ${nom}` };
      vus.add(cle);
      if (systeme === 3) {
        const mode = attributs >>> 16;
        if ((mode & 0o170000) === 0o120000) return { ok: false, raison: `lien symbolique : ${nom}` };
        if (mode & 0o6000) return { ok: false, raison: `bit SUID/SGID : ${nom}` };
      }
      const dossier = nom.endsWith('/');
      if (!dossier && methode !== 0 && taille === 0 && compresse > 16) return { ok: false, raison: `taille déclarée nulle : ${nom}` };
      if (compresse > 0 && taille / compresse > RATIO_MAX) return { ok: false, raison: `taux de compression suspect : ${nom}` };
      total += taille;
      if (total > TAILLE_MAX) return { ok: false, raison: 'archive trop volumineuse une fois décompressée' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: `zip illisible : ${e.message}` };
  }
}

/** Pour les tests : le même CRX sans la preuve dont la clé a cette empreinte. */
function retirerPreuve(buffer, empreinte) {
  const { entete, archive } = decouper(buffer);
  const morceaux = [];
  for (const { champ, valeur } of lireMessage(entete)) {
    if (champ === RSA || champ === ECDSA) {
      const cle = lireMessage(valeur).find((f) => f.champ === 1).valeur;
      if (sha256(cle).equals(empreinte)) continue;
    }
    morceaux.push(champLongueur(champ, valeur));
  }
  const nouvel = Buffer.concat(morceaux);
  const tete = Buffer.alloc(12);
  tete.write('Cr24', 0, 'binary');
  tete.writeUInt32LE(3, 4);
  tete.writeUInt32LE(nouvel.length, 8);
  return Buffer.concat([tete, nouvel, archive]);
}

module.exports = { verifier, identifiant, retirerPreuve, inspecterZip, decouper, EMPREINTE_WEB_STORE };
