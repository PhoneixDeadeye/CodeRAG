import { lazy, Suspense, useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const HeroScene = lazy(() => import('../components/three/HeroScene'))

const FEATURES = [
  {
    icon: '🧠',
    title: 'AI-Powered Code Understanding',
    desc: 'Deep RAG-based analysis of any codebase. Ask questions, get precise answers with source references.',
  },
  {
    icon: '🔍',
    title: 'Semantic Code Search',
    desc: 'Find code by intent, not just keywords. Search across entire repositories with natural language.',
  },
  {
    icon: '📊',
    title: 'Smart Diff Analysis',
    desc: 'AI-explained code changes with impact analysis. Understand what changed and why it matters.',
  },
  {
    icon: '🌐',
    title: 'Multi-LLM Support',
    desc: 'Choose from Gemini, OpenAI, or Anthropic. Switch providers seamlessly based on your needs.',
  },
  {
    icon: '🔒',
    title: 'Enterprise Security',
    desc: 'Role-based access control, API key management, GitHub OAuth, and encrypted data at rest.',
  },
  {
    icon: '📈',
    title: 'Usage Analytics',
    desc: 'Track queries, monitor usage, visualize trends. Admin dashboard with real-time metrics.',
  },
]

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['3 repositories', '50 queries/day', '500MB storage', 'Gemini LLM', 'Community support'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    features: ['25 repositories', '500 queries/day', '5GB storage', 'Multi-LLM (Gemini, OpenAI, Claude)', 'Private repos', 'Priority support', 'Analytics'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    features: ['Unlimited repos', '10,000 queries/day', '50GB storage', 'Custom LLM config', 'SSO/SAML', 'Audit logs', 'Dedicated support', 'SLA guaranteed'],
    cta: 'Contact Sales',
    highlight: false,
  },
]

interface LandingPageProps {
  onLogin: () => void
  onRegister: () => void
}

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  const [show3D, setShow3D] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow3D(true), 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050510 0%, #0a0a20 30%, #080818 100%)',
      color: '#e0e0f0',
      overflow: 'hidden',
    }}>
      {/* Hero Section */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        {show3D && (
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        )}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{
            position: 'relative',
            zIndex: 10,
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1rem',
            borderRadius: '999px',
            background: 'rgba(0, 136, 255, 0.15)',
            border: '1px solid rgba(0, 136, 255, 0.3)',
            fontSize: '0.85rem',
            color: '#4db8ff',
            marginBottom: '1.5rem',
          }}>
            ✨ v5.0 — Multi-LLM · 3D Visualizations · Admin Dashboard
          </div>

          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '1.5rem',
            background: 'linear-gradient(135deg, #ffffff 0%, #00d4ff 50%, #0088ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Understand Any Codebase with AI
          </h1>

          <p style={{
            fontSize: '1.15rem',
            lineHeight: 1.6,
            color: '#8899bb',
            marginBottom: '2rem',
            maxWidth: '600px',
            margin: '0 auto 2rem',
          }}>
            CodeRAG uses retrieval-augmented generation to deeply understand your code.
            Ask questions, search semantically, analyze diffs — powered by your choice of LLM.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={onRegister}
              style={{
                padding: '0.85rem 2rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0066ff, #0088ff)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '1rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0, 102, 255, 0.4)',
              }}
            >
              Get Started Free →
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={onLogin}
              style={{
                padding: '0.85rem 2rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#ccc',
                fontWeight: 600,
                fontSize: '1rem',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
              }}
            >
              Sign In
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section style={{
        padding: '6rem 2rem',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            textAlign: 'center',
            fontSize: '2.2rem',
            fontWeight: 700,
            marginBottom: '3rem',
            color: '#e0e0ff',
          }}
        >
          Everything you need to understand code
        </motion.h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
        }}>
          {FEATURES.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.02, y: -4 }}
              style={{
                padding: '1.5rem',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(12px)',
                cursor: 'default',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{feature.icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e0e0ff' }}>
                {feature.title}
              </h3>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#7788aa' }}>
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section style={{
        padding: '6rem 2rem',
        maxWidth: '1100px',
        margin: '0 auto',
      }}>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            textAlign: 'center',
            fontSize: '2.2rem',
            fontWeight: 700,
            marginBottom: '3rem',
            color: '#e0e0ff',
          }}
        >
          Simple, transparent pricing
        </motion.h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          alignItems: 'stretch',
        }}>
          {PLANS.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              whileHover={{ y: -6 }}
              style={{
                padding: '2rem',
                borderRadius: '20px',
                background: plan.highlight
                  ? 'linear-gradient(135deg, rgba(0, 102, 255, 0.15), rgba(0, 170, 255, 0.08))'
                  : 'rgba(255, 255, 255, 0.03)',
                border: plan.highlight
                  ? '1px solid rgba(0, 136, 255, 0.4)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {plan.highlight && (
                <div style={{
                  fontSize: '0.75rem',
                  color: '#4db8ff',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.75rem',
                }}>
                  Most Popular
                </div>
              )}
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#e0e0ff', marginBottom: '0.5rem' }}>
                {plan.name}
              </h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff' }}>{plan.price}</span>
                <span style={{ color: '#667788', fontSize: '0.9rem' }}>{plan.period}</span>
              </div>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                flex: 1,
                marginBottom: '1.5rem',
              }}>
                {plan.features.map((f, j) => (
                  <li key={j} style={{
                    padding: '0.4rem 0',
                    fontSize: '0.9rem',
                    color: '#8899aa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span style={{ color: '#00d4ff' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRegister}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  background: plan.highlight
                    ? 'linear-gradient(135deg, #0066ff, #0088ff)'
                    : 'rgba(255, 255, 255, 0.08)',
                  color: plan.highlight ? '#fff' : '#bbb',
                  fontWeight: 600,
                  border: plan.highlight ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                {plan.cta}
              </motion.button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        color: '#556677',
        fontSize: '0.85rem',
      }}>
        <p>© 2026 CodeRAG. Built with AI, for developers.</p>
      </footer>
    </div>
  )
}
