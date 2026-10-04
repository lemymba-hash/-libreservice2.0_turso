// db.js
// Connexion a la base de donnees via libSQL (@libsql/client).
//
// - En LOCAL (rien a configurer) : fichier SQLite "libreservice.db" dans le projet.
// - En LIGNE (hebergement gratuit) : base Turso distante, definie par les variables
//   d'environnement TURSO_DATABASE_URL et TURSO_AUTH_TOKEN. Les donnees restent donc
//   conservees meme si l'hebergeur efface le disque ou redemarre le serveur.
//
// L'API ressemble a l'ancienne (db.prepare(sql).get/all/run), mais chaque appel est
// ASYNCHRONE : il faut ecrire "await" devant.

const path = require('path');
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, 'libreservice.db');
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

function toPlainRows(rs) {
  return rs.rows.map((row) => {
    const obj = {};
    rs.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// Fabrique l'API prepare(...) au-dessus d'un "executor" (le client, ou une transaction).
function makeApi(executor) {
  return {
    prepare(sql) {
      const exec = (args) => executor.execute({ sql, args });
      return {
        async get(...args) { return toPlainRows(await exec(args))[0]; },
        async all(...args) { return toPlainRows(await exec(args)); },
        async run(...args) {
          const rs = await exec(args);
          return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid };
        },
      };
    },
  };
}

const db = makeApi(client);

/**
 * Transaction : db.transaction(async (tx) => { ... tx.prepare(...).run(...) ... })
 * COMMIT si tout va bien, ROLLBACK si une erreur est levee.
 */
db.transaction = async function transaction(fn) {
  const tx = await client.transaction('write');
  try {
    const result = await fn(makeApi(tx));
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    tx.close();
  }
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nom TEXT NOT NULL,
  telephone TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('client', 'prestataire', 'admin')),
  quartier TEXT,
  date_inscription TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prestataires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL,
  metier TEXT NOT NULL,
  description TEXT,
  tarif_indicatif TEXT,
  photo TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente', 'valide', 'refuse')),
  note_moyenne REAL DEFAULT 0,
  nombre_avis INTEGER DEFAULT 0,
  date_creation TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prestataire_id INTEGER NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note INTEGER NOT NULL CHECK(note BETWEEN 1 AND 5),
  commentaire TEXT,
  statut TEXT NOT NULL DEFAULT 'visible' CHECK(statut IN ('visible', 'signale', 'masque')),
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediteur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  lu INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prestataires_categorie ON prestataires(categorie);
CREATE INDEX IF NOT EXISTS idx_prestataires_statut ON prestataires(statut);
CREATE INDEX IF NOT EXISTS idx_users_quartier ON users(quartier);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(expediteur_id, destinataire_id);

CREATE TABLE IF NOT EXISTS photos (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
);
`;

/** Cree les tables si elles n'existent pas. A appeler une fois au demarrage. */
db.init = async function init() {
  try { await client.execute('PRAGMA foreign_keys = ON'); } catch (e) { /* non bloquant */ }
  await client.executeMultiple(SCHEMA);
};

module.exports = db;
