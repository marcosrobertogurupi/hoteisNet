$env = Get-Content -Path '.env' -Raw
$db_url = ''
if ($env -match 'DATABASE_URL="([^"]+)"') { $db_url = $matches[1] }
if ($db_url) { $db_url | npx --yes vercel env add DATABASE_URL production }

$sup_url = ''
if ($env -match 'NEXT_PUBLIC_SUPABASE_URL="([^"]+)"') { $sup_url = $matches[1] }
if ($sup_url) { $sup_url | npx --yes vercel env add NEXT_PUBLIC_SUPABASE_URL production }

$sup_key = ''
if ($env -match 'NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"') { $sup_key = $matches[1] }
if ($sup_key) { $sup_key | npx --yes vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production }
