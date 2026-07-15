-- Rename any admin-created futures_markets titles that still say
-- 'FIFA World Cup' to 'Int'l Soccer' for Apple 5.2.1 compliance.
-- Same reasoning as migration 256 (sports.name rename): FIFA-branded
-- competition names in user-facing content trigger Apple's 5.2.1
-- reject during active FIFA tournament windows.
UPDATE futures_markets
SET title = REPLACE(title, 'FIFA World Cup', 'Int''l Soccer')
WHERE title LIKE '%FIFA World Cup%';
