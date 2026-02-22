ALTER TABLE users ADD COLUMN title_preference TEXT DEFAULT 'king' CHECK (title_preference IN ('king', 'queen'));
