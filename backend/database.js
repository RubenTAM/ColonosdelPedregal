const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const db = new sqlite3.Database("./niveles.db", (err) => {
  if (err) {
    console.error("Error al abrir base de datos:", err.message);
  } else {
    console.log("Base de datos SQLite conectada");
  }
});

db.configure("busyTimeout", 5000);

function ensureHistoricoColumn(name) {
  db.get(
    `SELECT 1
     FROM pragma_table_info('niveles_historicos')
     WHERE name = ?`,
    [name],
    (err, row) => {
      if (err) {
        console.error(`Error verificando columna ${name}:`, err.message);
        return;
      }

      if (row) return;

      db.run(
        `ALTER TABLE niveles_historicos
         ADD COLUMN ${name} REAL NOT NULL DEFAULT 0`,
        (alterErr) => {
          if (alterErr) {
            console.error(`Error agregando columna ${name}:`, alterErr.message);
          } else {
            console.log(`Columna ${name} agregada a niveles_historicos`);
          }
        }
      );
    }
  );
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS niveles_historicos_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planta REAL NOT NULL,
      cabo_viejo REAL NOT NULL,
      falcone REAL NOT NULL,
      cinco REAL NOT NULL,
      seis REAL NOT NULL,
      marilu REAL NOT NULL,
      pacifico REAL NOT NULL,
      cuadrada REAL NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS niveles_historicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planta REAL NOT NULL,
      cabo_viejo REAL NOT NULL,
      falcone REAL NOT NULL,
      cinco REAL NOT NULL,
      seis REAL NOT NULL,
      marilu REAL NOT NULL,
      pacifico REAL NOT NULL,
      cuadrada REAL NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  ["cinco", "seis", "marilu", "pacifico", "cuadrada"].forEach(
    ensureHistoricoColumn
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      role TEXT,
      success INTEGER NOT NULL,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_config (
      tank_key TEXT PRIMARY KEY,
      min REAL NOT NULL,
      max REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  [
    "planta",
    "cabo_viejo",
    "falcone",
    "cinco",
    "seis",
    "marilu",
    "pacifico",
    "cuadrada",
  ].forEach((tankKey) => {
    db.run(
      `
      INSERT OR IGNORE INTO level_config (tank_key, min, max)
      VALUES (?, 0, 140)
      `,
      [tankKey]
    );
  });

  const adminUser = "admin";
  const adminPass = "TAM$123";
  const adminRole = "admin";

  db.get(
    `SELECT id FROM users WHERE username = ?`,
    [adminUser],
    (err, row) => {
      if (err) {
        console.error("Error verificando admin:", err.message);
        return;
      }

      if (!row) {
        const hash = bcrypt.hashSync(adminPass, 10);
        db.run(
          `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
          [adminUser, hash, adminRole],
          (insertErr) => {
            if (insertErr) {
              console.error("Error creando admin inicial:", insertErr.message);
            } else {
              console.log("Usuario admin inicial creado");
            }
          }
        );
      }
    }
  );
});

module.exports = db;
