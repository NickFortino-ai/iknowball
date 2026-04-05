-- Rename global longest win streak to clarify it's all-sport
UPDATE records
SET display_name = 'Longest All-Sport Win Streak',
    description = 'Most consecutive correct picks across all sports — a loss in any sport breaks the streak'
WHERE record_key = 'longest_win_streak';
