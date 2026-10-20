const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'evoprint_secret_key_2025';

function adminMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

// ── STATISTIQUES GLOBALES ────────────────────────────────────
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const [[{ total_users }]]       = await pool.execute('SELECT COUNT(*) as total_users FROM users');
    const [[{ total_generations }]] = await pool.execute('SELECT COUNT(*) as total_generations FROM generations');
    const [[{ total_posts }]]       = await pool.execute('SELECT COUNT(*) as total_posts FROM gallery_posts');
    const [[{ total_likes }]]       = await pool.execute('SELECT COUNT(*) as total_likes FROM gallery_likes');

    // Générations par jour (7 derniers jours)
    const [per_day] = await pool.execute(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM generations
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    // Modèles les plus utilisés
    const [models] = await pool.execute(`
      SELECT model, COUNT(*) as count
      FROM generations
      GROUP BY model
      ORDER BY count DESC
    `);

    // Secteurs les plus utilisés
    const [sectors] = await pool.execute(`
      SELECT sector, COUNT(*) as count
      FROM generations
      GROUP BY sector
      ORDER BY count DESC
    `);

    res.json({ success: true, stats: { total_users, total_generations, total_posts, total_likes, per_day, models, sectors } });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── LISTE DES UTILISATEURS ───────────────────────────────────
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT u.id, u.nom, u.prenom, u.email, u.role, u.plan, u.credits,
             u.is_blocked, u.created_at,
             COUNT(g.id) as generation_count
      FROM users u
      LEFT JOIN generations g ON g.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, users });
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── BLOQUER / DÉBLOQUER UN UTILISATEUR ──────────────────────
router.put('/users/:id/block', adminMiddleware, async (req, res) => {
  try {
    const { blocked } = req.body; // true | false
    await pool.execute('UPDATE users SET is_blocked = ? WHERE id = ?', [blocked ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── MODIFIER LES CRÉDITS D'UN UTILISATEUR ───────────────────
router.put('/users/:id/credits', adminMiddleware, async (req, res) => {
  try {
    const { credits } = req.body;
    await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [credits, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── SUPPRIMER UN UTILISATEUR ─────────────────────────────────
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GÉNÉRATIONS D'UN UTILISATEUR ─────────────────────────────
router.get('/users/:id/generations', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, prompt, image_url, model, support_type, sector, created_at FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    );
    res.json({ success: true, generations: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
