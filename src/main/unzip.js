// Dezippeur minimal, sans dependance, pour transformer un .crx ou un .zip
// d'extension en dossier décompressé -- Electron ne sait charger que de
// l'unpacked (cf. https://www.electronjs.org/docs/latest/api/extensions).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

// Un .crx est un en-tete de signature suivi d'un .zip standard. On saute l'en-tete.
function stripCrxHeader(buf) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') return buf;
  const version = buf.readUInt32LE(4);
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error(`Format CRX v${version} non supporté`);
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('Archive invalide : fin de repertoire central introuvable');
}

// Bloque toute entree qui tenterait de s'ecrire hors du dossier cible (zip slip).
function safeJoin(destDir, entryName) {
  const target = path.resolve(destDir, entryName);
  const root = path.resolve(destDir);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Chemin d'archive suspect : ${entryName}`);
  }
  return target;
}

function extract(fileBuffer, destDir) {
  const buf = stripCrxHeader(fileBuffer);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  if (offset === 0xffffffff || count === 0xffff) {
    throw new Error('Archives ZIP64 non supportées');
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== SIG_CENTRAL) throw new Error('Repertoire central corrompu');

    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) {
      fs.mkdirSync(safeJoin(destDir, name), { recursive: true });
      continue;
    }

    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new Error(`En-tete local corrompu (${name})`);
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let content;
    if (method === 0) content = raw;
    else if (method === 8) content = zlib.inflateRawSync(raw);
    else throw new Error(`Compression ${method} non supportée (${name})`);

    const target = safeJoin(destDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

module.exports = { extract };
