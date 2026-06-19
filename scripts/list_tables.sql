-- Count tables in public schema
SELECT count(*) AS total_tables FROM pg_catalog.pg_tables WHERE schemaname = 'public';

-- List table names
SELECT string_agg(tablename, ', ') AS table_names 
FROM pg_catalog.pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
