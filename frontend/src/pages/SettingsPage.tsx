import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Profile {
  id: string
  email: string
  organization_role: string
  avatar_url: string | null
  preferred_llm_provider: string
  github_id: string | null
  created_at: string | null
}

interface APIKey {
  id: string
  name: string
  key_preview: string
  is_revoked: boolean
  created_at: string | null
  expires_at: string | null
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [_loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'apikeys' | 'github'>('profile')
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; github_username: string | null }>({
    connected: false,
    github_username: null,
  })

  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [profileRes, keysRes, githubRes] = await Promise.allSettled([
        axios.get(`${API}/api/v1/settings/profile`, { headers }),
        axios.get(`${API}/api/v1/settings/api-keys`, { headers }),
        axios.get(`${API}/api/v1/auth/github/status`, { headers }),
      ])
      if (profileRes.status === 'fulfilled') setProfile(profileRes.value.data)
      if (keysRes.status === 'fulfilled') setApiKeys(keysRes.value.data)
      if (githubRes.status === 'fulfilled') setGithubStatus(githubRes.value.data)
    } finally {
      setLoading(false)
    }
  }

  function showNotification(msg: string) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  async function updateProvider(provider: string) {
    try {
      setSaving(true)
      await axios.patch(`${API}/api/v1/settings/preferences`, { preferred_llm_provider: provider }, { headers })
      setProfile(prev => prev ? { ...prev, preferred_llm_provider: provider } : prev)
      showNotification(`LLM provider set to ${provider}`)
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function createAPIKey() {
    if (!newKeyName.trim()) return
    try {
      const res = await axios.post(
        `${API}/api/v1/settings/api-keys`,
        { name: newKeyName, expires_in_days: 90 },
        { headers },
      )
      setCreatedKey(res.data.key)
      setNewKeyName('')
      fetchAll()
      showNotification('API key created! Copy it now — it won\'t be shown again.')
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to create key')
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm('Are you sure you want to revoke this API key?')) return
    try {
      await axios.delete(`${API}/api/v1/settings/api-keys/${keyId}`, { headers })
      setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_revoked: true } : k))
      showNotification('API key revoked')
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Failed to revoke')
    }
  }

  const tabs = [
    { key: 'profile', label: '👤 Profile', icon: '👤' },
    { key: 'preferences', label: '⚙️ Preferences', icon: '⚙️' },
    { key: 'apikeys', label: '🔑 API Keys', icon: '🔑' },
    { key: 'github', label: '🐙 GitHub', icon: '🐙' },
  ] as const

  const sectionStyle: React.CSSProperties = {
    padding: '1.5rem',
    borderRadius: '16px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ccc',
    fontSize: '0.9rem',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Notification Toast */}
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            padding: '0.75rem 1.25rem',
            borderRadius: '10px',
            background: 'rgba(0, 136, 255, 0.2)',
            border: '1px solid rgba(0, 136, 255, 0.4)',
            color: '#4db8ff',
            fontSize: '0.85rem',
            zIndex: 1000,
          }}
        >
          {notification}
        </motion.div>
      )}

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0e0ff', marginBottom: '1.5rem' }}>
        ⚙️ Settings
      </h1>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '10px',
              background: activeTab === tab.key ? 'rgba(0, 136, 255, 0.15)' : 'rgba(255,255,255,0.04)',
              border: activeTab === tab.key ? '1px solid rgba(0, 136, 255, 0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: activeTab === tab.key ? '#4db8ff' : '#7788aa',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && profile && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e0e0ff', marginBottom: '1rem' }}>Profile</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#7788aa', display: 'block', marginBottom: '0.3rem' }}>Email</label>
              <input disabled value={profile.email} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#7788aa', display: 'block', marginBottom: '0.3rem' }}>Role</label>
              <input disabled value={profile.organization_role} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#7788aa', display: 'block', marginBottom: '0.3rem' }}>Member Since</label>
              <input disabled value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'} style={inputStyle} />
            </div>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e0e0ff', marginBottom: '1rem' }}>LLM Provider</h2>
          <p style={{ fontSize: '0.85rem', color: '#7788aa', marginBottom: '1rem' }}>
            Choose which AI model powers your code analysis.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '400px' }}>
            {['gemini', 'openai', 'anthropic'].map((provider) => (
              <motion.button
                key={provider}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => updateProvider(provider)}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: profile?.preferred_llm_provider === provider
                    ? 'rgba(0, 136, 255, 0.12)'
                    : 'rgba(255,255,255,0.04)',
                  border: profile?.preferred_llm_provider === provider
                    ? '1px solid rgba(0, 136, 255, 0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: profile?.preferred_llm_provider === provider ? '#4db8ff' : '#aabbcc',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                  {provider === 'gemini' ? '🌟 Gemini' : provider === 'openai' ? '🤖 OpenAI' : '🧠 Anthropic'}
                </span>
                {profile?.preferred_llm_provider === provider && <span>✓</span>}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'apikeys' && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e0e0ff', marginBottom: '1rem' }}>API Keys</h2>
          <p style={{ fontSize: '0.85rem', color: '#7788aa', marginBottom: '1rem' }}>
            Create and manage API keys for programmatic access.
          </p>

          {/* Create new key */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Key name (e.g., CI/CD Pipeline)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={createAPIKey}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0066ff, #0088ff)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
              }}
            >
              + Create
            </motion.button>
          </div>

          {/* Created key display */}
          {createdKey && (
            <div style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(0, 200, 100, 0.08)',
              border: '1px solid rgba(0, 200, 100, 0.3)',
              marginBottom: '1rem',
            }}>
              <p style={{ fontSize: '0.8rem', color: '#6bcb77', marginBottom: '0.5rem', fontWeight: 600 }}>
                ⚠️ Copy this key now! It won't be shown again.
              </p>
              <code style={{
                display: 'block',
                padding: '0.5rem',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.3)',
                color: '#e0e0ff',
                fontSize: '0.8rem',
                wordBreak: 'break-all',
              }}>
                {createdKey}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(createdKey); showNotification('Copied!') }}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ccc',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                📋 Copy
              </button>
            </div>
          )}

          {/* Key list */}
          {apiKeys.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {apiKeys.map((key) => (
                <div key={key.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  opacity: key.is_revoked ? 0.5 : 1,
                }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#ccc', fontSize: '0.9rem' }}>{key.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#667788', fontFamily: 'monospace' }}>
                      {key.key_preview}
                      {key.is_revoked && <span style={{ color: '#ff6b6b', marginLeft: '0.5rem' }}>REVOKED</span>}
                    </div>
                  </div>
                  {!key.is_revoked && (
                    <button
                      onClick={() => revokeKey(key.id)}
                      style={{
                        padding: '0.3rem 0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(255, 107, 107, 0.1)',
                        border: '1px solid rgba(255, 107, 107, 0.3)',
                        color: '#ff6b6b',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#556677', fontSize: '0.85rem' }}>No API keys created yet.</p>
          )}
        </div>
      )}

      {/* GitHub Tab */}
      {activeTab === 'github' && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e0e0ff', marginBottom: '1rem' }}>GitHub Integration</h2>
          <p style={{ fontSize: '0.85rem', color: '#7788aa', marginBottom: '1rem' }}>
            Connect your GitHub account to analyze private repositories.
          </p>

          {githubStatus.connected ? (
            <div style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(0, 200, 100, 0.08)',
              border: '1px solid rgba(0, 200, 100, 0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>✅</span>
                <div>
                  <p style={{ fontWeight: 600, color: '#6bcb77' }}>Connected</p>
                  <p style={{ fontSize: '0.85rem', color: '#7788aa' }}>@{githubStatus.github_username}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Disconnect GitHub? You will lose access to private repos.')) return
                  try {
                    await axios.delete(`${API}/api/v1/auth/github/disconnect`, { headers })
                    setGithubStatus({ connected: false, github_username: null })
                    showNotification('GitHub disconnected')
                  } catch { showNotification('Failed to disconnect') }
                }}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(255, 107, 107, 0.1)',
                  border: '1px solid rgba(255, 107, 107, 0.3)',
                  color: '#ff6b6b',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { window.location.href = `${API}/api/v1/auth/github/login` }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#e0e0ff',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              🐙 Connect GitHub Account
            </motion.button>
          )}
        </div>
      )}
    </div>
  )
}
