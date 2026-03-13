const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./niveles.db", (err) => {
  if (err) {
    console.error("Error al abrir base de datos:", err.message);
  } else {
    console.log("Base de datos SQLite conectada");
  }
});

db.configure("busyTimeout", 5000);

db.serialize(() => {
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
});

module.exports = db;