-- Set the post-payment redirect (Hutko response_url) for the тривога-нет site.
-- The service reads settings->>'paymentReturnUrl' and prefers it over the
-- https://<site.domain> fallback. Adjust the WHERE clause to match your row
-- (by name, domain, or id).

-- 1) Find the site first:
--    SELECT id, domain, name, settings FROM "Site";

-- 2) Merge the key into the existing JSON settings (jsonb):
UPDATE "Site"
SET settings = COALESCE(settings, '{}'::jsonb)
             || jsonb_build_object('paymentReturnUrl', 'https://www.xn--80adds5ajn.net')
WHERE name = 'тривога-нет';
-- or: WHERE domain = '<domain-in-db>';
-- or: WHERE id = '<site-id>';
