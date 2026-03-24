import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUp() {
  console.log("Cleaning up stale matches and invitations...");
  
  const { error: matchError } = await supabase
    .from('matches')
    .update({ status: 'finished' })
    .in('status', ['active', 'pending']);
    
  if (matchError) console.error("Error updating matches:", matchError);
  else console.log("✅ Stale matches finished.");

  const { error: inviteError } = await supabase
    .from('invitations')
    .update({ status: 'cancelled' })
    .in('status', ['pending', 'accepted']);
    
  if (inviteError) console.error("Error updating invitations:", inviteError);
  else console.log("✅ Stale invitations cancelled.");
  
  console.log("Cleanup complete!");
}

cleanUp();
