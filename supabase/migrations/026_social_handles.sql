-- Add social media handle columns to users
ALTER TABLE users ADD COLUMN x_handle text;
ALTER TABLE users ADD COLUMN instagram_handle text;
ALTER TABLE users ADD COLUMN tiktok_handle text;
ALTER TABLE users ADD COLUMN snapchat_handle text;
