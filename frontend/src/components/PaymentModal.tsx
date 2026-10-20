import { API_URL } from '../api'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import './PaymentModal.css'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '')

const PACKS = {
  dalle:   { label: 'DALL·E 3 Illimité',          price: '9.99€',  desc: 'Générations illimitées DALL·E 3',              pack: 'dalle'   },
  mj_nano: { label: 'Midjourney + Nano Illimité',  price: '14.99€', desc: 'Générations illimitées Midjourney & Nano',     pack: 'mj_nano' },
  bundle:  { label: 'Tout Débloquer',              price: '19.99€', desc: 'DALL·E 3 + Midjourney + Nano — tout illimité', pack: 'bundle'  },
}

const CARD_STYLE = {
  style: {
    base: {
      color: '#e2e8f0',
      fontSize: '15px',
      fontFamily: 'inherit',
      '::placeholder': { color: '#475569' },
    },
    invalid: { color: '#f87171' },
  },
}

// ── Formulaire Stripe (à l'intérieur de <Elements>) ──────────
function CheckoutForm({
  pack, onSuccess, onClose,
}: {
  pack: 'dalle' | 'mj_nano' | 'bundle'
  onSuccess: () => void
  onClose: () => void
}) {
  const stripe   = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [name,    setName]    = useState('')

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)

    try {
      // 1. Obtenir le clientSecret depuis le backend
      const token = localStorage.getItem('evoprint_token')
      const res = await fetch(`${API_URL}/api/stripe/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pack }),
      })
      const { clientSecret, error: backErr } = await res.json()
      if (backErr) throw new Error(backErr)

      // 2. Confirmer le paiement avec Stripe
      const cardEl = elements.getElement(CardNumberElement)!
      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardEl, billing_details: { name } },
      })
      if (stripeErr) throw new Error(stripeErr.message)

      // 3. Confirmer en backend → débloquer en DB
      const confirmRes = await fetch(`${API_URL}/api/stripe/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIntentId: paymentIntent!.id, pack }),
      })
      const confirmData = await confirmRes.json()
      if (!confirmData.success) throw new Error(confirmData.error)

      localStorage.setItem('evoprint_user', JSON.stringify(confirmData.user))
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handlePay} className="card-form">
      <div className="field-group">
        <label>Numéro de carte</label>
        <div className="stripe-input"><CardNumberElement options={CARD_STYLE} /></div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label>Expiration</label>
          <div className="stripe-input"><CardExpiryElement options={CARD_STYLE} /></div>
        </div>
        <div className="field-group">
          <label>CVV</label>
          <div className="stripe-input"><CardCvcElement options={CARD_STYLE} /></div>
        </div>
      </div>
      <div className="field-group">
        <label>Nom sur la carte</label>
        <input
          placeholder="Omar Benali"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>
      {error && <div className="stripe-error">⚠️ {error}</div>}
      <div className="secure-note">🔒 Paiement sécurisé par Stripe</div>
      <div className="payment-actions">
        <button type="button" className="pay-cancel" onClick={onClose}>Annuler</button>
        <button type="submit" className="pay-submit" disabled={loading || !stripe}>
          {loading ? '⏳ Traitement...' : `✓ Payer ${PACKS[pack].price}`}
        </button>
      </div>
    </form>
  )
}

// ── Modal principale ─────────────────────────────────────────
interface Props {
  reason: 'dalle_limit' | 'mj_nano_limit'
  onSuccess: () => void
  onClose: () => void
}

export default function PaymentModal({ reason, onSuccess, onClose }: Props) {
  const [selected, setSelected] = useState<'dalle' | 'mj_nano' | 'bundle'>(
    reason === 'dalle_limit' ? 'dalle' : 'mj_nano'
  )
  const [step, setStep] = useState<'pick' | 'card' | 'success'>('pick')

  return (
    <div className="payment-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="payment-modal animate-slide-up">

        {step === 'pick' && (
          <>
            <div className="payment-header">
              <h2>🔓 Débloquer l'accès</h2>
              <p>
                {reason === 'dalle_limit'
                  ? 'Vous avez utilisé votre génération gratuite DALL·E 3.'
                  : 'Vous avez atteint votre limite hebdomadaire (2/semaine).'}
              </p>
            </div>
            <div className="pack-list">
              {Object.values(PACKS).map(p => (
                <div
                  key={p.pack}
                  className={`pack-card ${selected === p.pack ? 'selected' : ''}`}
                  onClick={() => setSelected(p.pack as any)}
                >
                  <div className="pack-info">
                    <span className="pack-label">{p.label}</span>
                    <span className="pack-desc">{p.desc}</span>
                  </div>
                  <span className="pack-price">{p.price}<small>/mois</small></span>
                </div>
              ))}
            </div>
            <div className="payment-actions">
              <button className="pay-cancel" onClick={onClose}>Annuler</button>
              <button className="pay-next" onClick={() => setStep('card')}>
                Continuer → {PACKS[selected].price}
              </button>
            </div>
          </>
        )}

        {step === 'card' && (
          <>
            <div className="payment-header">
              <button className="back-link" onClick={() => setStep('pick')}>← Retour</button>
              <h2>💳 Paiement Stripe</h2>
              <p>{PACKS[selected].label} — <strong>{PACKS[selected].price}/mois</strong></p>
            </div>
            <Elements stripe={stripePromise}>
              <CheckoutForm pack={selected} onSuccess={() => setStep('success')} onClose={onClose} />
            </Elements>
          </>
        )}

        {step === 'success' && (
          <div className="payment-success">
            <div className="success-icon">✅</div>
            <h2>Paiement confirmé !</h2>
            <p>{PACKS[selected].label} activé avec succès.</p>
            <button className="pay-next" onClick={onSuccess}>Continuer la génération →</button>
          </div>
        )}

      </div>
    </div>
  )
}
