-- Rename "Great Climb" to "Greatest Climb"
UPDATE records
SET display_name = 'Greatest Climb'
WHERE record_key = 'great_climb';
