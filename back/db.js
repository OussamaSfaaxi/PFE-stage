const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               process.env.DB_PORT || 3306,
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME || 'pfeprojet',
  waitForConnections: true,
  connectionLimit:    10,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000,
});

// Créer les tables si elles n'existent pas
async function initDB() {
  try {
    const conn = await pool.getConnection();

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        nom                 VARCHAR(100) NOT NULL,
        prenom              VARCHAR(100) NOT NULL,
        email               VARCHAR(150) UNIQUE NOT NULL,
        password            VARCHAR(255) NOT NULL,
        role                ENUM('user','admin') DEFAULT 'user',
        plan                ENUM('gratuit','pro','premium') DEFAULT 'gratuit',
        credits             INT DEFAULT 5,
        dalle_free_used     TINYINT(1) DEFAULT 0,
        dalle_unlocked      TINYINT(1) DEFAULT 0,
        mj_nano_unlocked    TINYINT(1) DEFAULT 0,
        mj_nano_week_uses   INT DEFAULT 0,
        mj_nano_week_start  DATE DEFAULT NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS generations (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        prompt       TEXT NOT NULL,
        image_url    LONGTEXT NOT NULL,
        model        VARCHAR(50) DEFAULT 'stability',
        support_type VARCHAR(50) DEFAULT 'poster',
        sector       VARCHAR(50) DEFAULT 'corporate',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Ajouter colonnes si table users existait déjà sans elles
    const alterCols = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS dalle_free_used    TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS dalle_unlocked     TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS mj_nano_unlocked   TINYINT(1) DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS mj_nano_week_uses  INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS mj_nano_week_start DATE DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked         TINYINT(1) DEFAULT 0",
    ]
    for (const sql of alterCols) {
      try { await conn.execute(sql) } catch (_) {}
    }

    // ── Galerie publique ──
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS gallery_posts (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        generation_id INT NOT NULL,
        title        VARCHAR(200) DEFAULT '',
        likes_count  INT DEFAULT 0,
        is_public    TINYINT(1) DEFAULT 1,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS gallery_likes (
        id      INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        UNIQUE KEY unique_like (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES gallery_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS gallery_comments (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        post_id    INT NOT NULL,
        user_id    INT NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES gallery_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    conn.release();
    console.log('✅ Base de données connectée — tables prêtes');
  } catch (err) {
    console.error('❌ Erreur DB:', err.message);
  }
}

initDB();

module.exports = pool;
