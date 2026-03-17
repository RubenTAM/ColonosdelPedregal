const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const usersDb = new sqlite3.Database("./users.db", (err) => {
  if (err) {
    console.error("Error al abrir users.db:", err.message);
  } else {
    console.log("Base de datos users.db conectada");
  }
});

usersDb.serialize(() => {
  usersDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  usersDb.run(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  usersDb.get(
    `SELECT * FROM users WHERE username = ?`,
    ["admin"],
    (err, row) => {
      if (err) {
        console.error("Error consultando admin:", err.message);
        return;
      }

      if (!row) {
        const hash = bcrypt.hashSync("TAM$123", 10);

        usersDb.run(
          `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
          ["admin", hash, "admin"],
          (insertErr) => {
            if (insertErr) {
              console.error("Error creando usuario admin:", insertErr.message);
            } else {
              console.log("Usuario admin creado en users.db");
            }
          }
        );
      }
    }
  );
});

module.exports = usersDb;