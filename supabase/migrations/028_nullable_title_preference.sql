-- Allow null title_preference so new users default to they/them pronouns
ALTER TABLE users ALTER COLUMN title_preference DROP DEFAULT;
