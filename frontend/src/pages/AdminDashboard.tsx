import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, Line,
} from 'recharts'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface OverviewData {
  total_users: number
  total_repos: number
  total_sessions: number
  total_messages: number
  active_repos: number
  queries_today: number
  queries_this_week: number
  average_rating: number
}

interface UsagePoint {
  date: string
  queries: number
  ingestions: number
  messages: number
}

interface UserInfo {
  id: string
  email: string
  organization_role: string
  is_active: boolean
  preferred_llm_provider: string
  created_at: string | null
  repo_count: number
  session_count: number
}

const CHART_COLORS = ['#00d4ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#8b5cf6']

function StatCard({ label, value, icon, change }: {
  label: string
  value: string | number
  icon: string
  change?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      style={{
        padding: '1.25rem',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#7788aa' }}>{label}</span>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e0e0ff' }}>{value}</div>
      {change && (
        <div style={{ fontSize: '0.8rem', color: change.startsWith('+') ? '#6bcb77' : '#ff6b6b', marginTop: '0.25rem' }}>
          {change}
        </div>
      )}
    </motion.div>
  )
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [usage, setUsage] = useState<UsagePoint[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d')
  const [_loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('')

  const token = localStorage.getItem('token')

  useEffect(() => {
    fetchData()
  }, [period])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [overviewRes, usageRes, usersRes] = await Promise.all([
        axios.get(`${API}/api/v1/admin/analytics/overview`, { headers }),
        axios.get(`${API}/api/v1/admin/analytics/usage?period=${period}`, { headers }),
        axios.get(`${API}/api/v1/admin/users?limit=50`, { headers }),
      ])
      setOverview(overviewRes.data)
      setUsage(usageRes.data)
      setUsers(usersRes.data.users || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase())
      const matchRole = !selectedRole || u.organization_role === selectedRole
      return matchSearch && matchRole
    })
  }, [users, userSearch, selectedRole])

  const roleDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    users.forEach(u => {
      const role = u.organization_role || 'member'
      counts[role] = (counts[role] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [users])

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await axios.patch(
        `${API}/api/v1/admin/users/${userId}/role`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, organization_role: newRole } : u))
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update role')
    }
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ff6b6b' }}>
        <h2>⚠️ {error}</h2>
        <p style={{ color: '#7788aa' }}>You may need admin or owner permissions to access this page.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e0e0ff' }}>📊 Admin Dashboard</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as '7d' | '30d' | '90d')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#ccc',
            fontSize: '0.85rem',
          }}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Stat Cards */}
      {overview && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <StatCard label="Total Users" value={overview.total_users} icon="👥" />
          <StatCard label="Active Repos" value={overview.active_repos} icon="📦" />
          <StatCard label="Queries Today" value={overview.queries_today} icon="💬" />
          <StatCard label="Total Messages" value={overview.total_messages.toLocaleString()} icon="📨" />
          <StatCard label="Avg Rating" value={`${overview.average_rating}⭐`} icon="⭐" />
          <StatCard label="Weekly Queries" value={overview.queries_this_week} icon="📈" />
        </div>
      )}

      {/* Charts Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        {/* Usage Over Time */}
        <div style={{
          padding: '1.25rem',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h3 style={{ fontSize: '1rem', color: '#aabbcc', marginBottom: '1rem' }}>Usage Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={usage}>
              <defs>
                <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6bcb77" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6bcb77" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fill: '#667788', fontSize: 11 }} />
              <YAxis tick={{ fill: '#667788', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#ddd',
                }}
              />
              <Legend />
              <Area type="monotone" dataKey="queries" stroke="#00d4ff" fill="url(#colorQueries)" />
              <Area type="monotone" dataKey="messages" stroke="#6bcb77" fill="url(#colorMessages)" />
              <Line type="monotone" dataKey="ingestions" stroke="#ffd93d" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Role Distribution */}
        <div style={{
          padding: '1.25rem',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h3 style={{ fontSize: '1rem', color: '#aabbcc', marginBottom: '1rem' }}>User Roles</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={roleDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }: { name: string; value: number }) => `${name} (${value})`}
              >
                {roleDistribution.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#ddd',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* User Management Table */}
      <div style={{
        padding: '1.25rem',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', color: '#aabbcc' }}>User Management</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Search by email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#ccc',
                fontSize: '0.85rem',
                minWidth: '200px',
              }}
            />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#ccc',
                fontSize: '0.85rem',
              }}
            >
              <option value="">All Roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>Email</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>Role</th>
                <th style={{ textAlign: 'center', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>Repos</th>
                <th style={{ textAlign: 'center', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>Sessions</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>LLM</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: '#7788aa', fontWeight: 600 }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem', color: '#ccc' }}>{user.email}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <select
                      value={user.organization_role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#ccc',
                        fontSize: '0.8rem',
                      }}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', color: '#aabbcc' }}>{user.repo_count}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', color: '#aabbcc' }}>{user.session_count}</td>
                  <td style={{ padding: '0.75rem', color: '#7788aa' }}>{user.preferred_llm_provider}</td>
                  <td style={{ padding: '0.75rem', color: '#667788', fontSize: '0.8rem' }}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#556677' }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
