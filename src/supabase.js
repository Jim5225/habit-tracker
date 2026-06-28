import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vrsqryjckxvkhfwhxxml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyc3FyeWpja3h2a2hmd2h4eG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODc3NDYsImV4cCI6MjA5ODE2Mzc0Nn0.tPE2g0_mg3m2VxoyLFU3Yo1Ec5kH1JODdGhC8S926og';

export const supabase = createClient(supabaseUrl, supabaseKey);
