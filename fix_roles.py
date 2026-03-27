import os

files = [
    'app/api/routers/admin.py', 
    'app/api/routers/auth.py', 
    'app/api/routers/oauth.py', 
    'app/api/routers/settings_router.py', 
    'app/services/rbac.py', 
    'app/core/database.py'
]

for f in files:
    if os.path.exists(f):
        content = open(f, encoding='utf-8').read()
        content = content.replace('organization_role: str', 'role: str')
        content = content.replace('User.organization_role', 'User.role')
        content = content.replace('user.organization_role', 'user.role')
        content = content.replace('.organization_role', '.role')
        content = content.replace('"organization_role":', '"role":')
        content = content.replace('organization_role="member"', 'role="User"')
        content = content.replace('organization_role=', 'role=')
        open(f, 'w', encoding='utf-8').write(content)

print("Done")