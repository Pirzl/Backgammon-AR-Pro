# PGRST201 Error Analysis - Dashboard Loading Failure

## Error Summary

**Error Code:** `PGRST201`  
**Message:** "Could not embed because more than one relationship was found for 'profiles' and 'wallets'"  
**Location:** `useClientData.ts:190` (also affects `useClients.ts:73`)

## Technical Analysis

### What is PGRST201?

PGRST201 is a PostgREST error that occurs when trying to embed (JOIN) related tables using the query syntax:
```javascript
.supabase
  .from('profiles')
  .select('*, wallets(saldo_actual)')
```

PostgREST cannot determine which foreign key relationship to use when multiple exist.

### Root Cause

The `wallets` table historically had **multiple foreign keys** pointing to `profiles`, creating ambiguous relationships:
- PostgREST sees more than one path to connect `profiles` ↔ `wallets`
- The query engine refuses to guess which relationship to use

### Why Database Fix Didn't Immediately Work

1. **PostgREST Schema Cache** - Supabase caches the database schema. Even after dropping duplicate FKs, the cache may still reference old relationships.

2. **Schema Refresh Required** - Changes to FKs require PostgREST to reload schema metadata.

## Solutions Attempted

### SQL Fix Applied
```sql
-- Drop ALL foreign keys on wallets table
DO $$
DECLARE fk text;
BEGIN
    FOR fk IN SELECT constraint_name FROM information_schema.table_constraints 
              WHERE constraint_type = 'FOREIGN KEY' AND table_name = 'wallets' AND table_schema = 'public'
    LOOP
        EXECUTE 'ALTER TABLE public.wallets DROP CONSTRAINT ' || fk;
    END LOOP;
END $$;

-- Add exactly one clean FK
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

**Result:** SQL executed successfully, but error persists.

## Recommended Solutions

### Option A: Force Schema Refresh (Recommended First)

1. Go to **Supabase Dashboard → Settings → API**
2. Look for "Refresh Schema" button
3. Click to force PostgREST to reload database schema
4. Wait 5-10 minutes for changes to propagate
5. Hard refresh browser (Ctrl+Shift+R)

### Option B: Frontend Fix - Use JOIN Instead of Embed

Modify the queries in:
- `src/features/client/hooks/useClientData.ts` (line 28)
- `src/features/admin/hooks/useClients.ts` (line 16)

**Current code (problematic):**
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('*, wallets(saldo_actual)')
  .eq('id', userId)
  .single();
```

**Fix - Use explicit JOIN:**
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('*, wallets!inner(saldo_actual)')
  .eq('id', userId)
  .single();
```

**Alternative - Separate queries:**
```javascript
// Query profile
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();

// Query wallet separately
const { data: wallet } = await supabase
  .from('wallets')
  .select('saldo_actual')
  .eq('user_id', userId)
  .single();

// Combine manually
const combined = { ...profile, wallets: wallet };
```

## Verification Steps

After applying fix:

1. Open browser DevTools (F12)
2. Go to `/dashboard` route
3. Check Console for errors
4. If no PGRST201 errors, the fix worked

## Affected Files

| File | Line | Query |
|------|------|-------|
| `src/features/client/hooks/useClientData.ts` | 28 | `.select('*, wallets(saldo_actual)')` |
| `src/features/admin/hooks/useClients.ts` | 16 | `.select('*, wallets(saldo_actual)')` |

## Related Issues

- This error also appears in the full audit report under "CRITICAL - Duplicate FK on wallets"
- The SQL migration file `fix_duplicate_keys_and_admin_tools.sql` was created but needs schema refresh

## Status

- [x] SQL migration executed (FKs cleaned)
- [ ] PostgREST schema refreshed
- [ ] Frontend fix applied (if needed)
- [ ] Error resolved

---
*Generated: 2026-02-27*
*Related Audit: Comprehensive System Security & Usability Audit*
