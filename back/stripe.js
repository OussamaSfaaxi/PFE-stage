const express = require('express')
const Stripe   = require('stripe')
const jwt      = require('jsonwebtoken')
const pool     = require('./db')

const router = express.Router()
const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
const JWT_SECRET = process.env.JWT_SECRET || 'evoprint_secret_key_2025'

const PACKS = {
  dalle:   { price: 999,  label: 'DALL·E 3 Illimité' },
  mj_nano: { price: 1499, label: 'Midjourney + Nano Illimité' },
  bundle:  { price: 1999, label: 'Tout Débloquer' },
}

function getUser(req) {
  const header = req.headers.authorization
  if (!header) return null
  try { return jwt.verify(header.split(' ')[1], JWT_SECRET) }
  catch { return null }
}

// ── CRÉER UN PAYMENT INTENT ──────────────────────────────────
router.post('/create-payment-intent', async (req, res) => {
  const user = getUser(req)
  if (!user) return res.status(401).json({ error: 'Non authentifié' })

  const { pack } = req.body
  const packInfo = PACKS[pack]
  if (!packInfo) return res.status(400).json({ error: 'Pack invalide' })

  try {
    const intent = await stripe.paymentIntents.create({
      amount:   packInfo.price,
      currency: 'eur',
      metadata: { user_id: String(user.id), pack },
      description: `EvoPrint* — ${packInfo.label}`,
    })
    res.json({ clientSecret: intent.client_secret })
  } catch (err) {
    console.error('Stripe error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── CONFIRMER APRÈS PAIEMENT RÉUSSI ─────────────────────────
router.post('/confirm-payment', async (req, res) => {
  const user = getUser(req)
  if (!user) return res.status(401).json({ error: 'Non authentifié' })

  const { paymentIntentId, pack } = req.body
  if (!PACKS[pack]) return res.status(400).json({ error: 'Pack invalide' })

  try {
    // Vérifier que le paiement est bien réussi auprès de Stripe
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (intent.status !== 'succeeded')
      return res.status(400).json({ error: `Paiement non confirmé (status: ${intent.status})` })

    // Vérifier que le metadata correspond bien à cet utilisateur
    if (intent.metadata.user_id !== String(user.id))
      return res.status(403).json({ error: 'Paiement non autorisé' })

    // Débloquer en DB
    if (pack === 'dalle') {
      await pool.execute('UPDATE users SET dalle_unlocked = 1 WHERE id = ?', [user.id])
    } else if (pack === 'mj_nano') {
      await pool.execute('UPDATE users SET mj_nano_unlocked = 1 WHERE id = ?', [user.id])
    } else if (pack === 'bundle') {
      await pool.execute('UPDATE users SET dalle_unlocked = 1, mj_nano_unlocked = 1 WHERE id = ?', [user.id])
    }

    const [rows] = await pool.execute(
      'SELECT id, nom, prenom, email, role, plan, credits, dalle_free_used, dalle_unlocked, mj_nano_unlocked, mj_nano_week_uses FROM users WHERE id = ?',
      [user.id]
    )
    res.json({ success: true, user: rows[0] })
  } catch (err) {
    console.error('Confirm payment error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
