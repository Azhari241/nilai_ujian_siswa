-- Phase 5B / 4: grant the server role explicit access for trusted Edge Functions.
-- Client roles remain governed by the per-table grants and RLS policies above.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
