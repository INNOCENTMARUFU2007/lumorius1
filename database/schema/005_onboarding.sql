ALTER TABLE users
ADD COLUMN IF NOT EXISTS onboarding_completed
BOOLEAN NOT NULL DEFAULT FALSE;

-- Preserve the existing demo workspace accounts.
UPDATE users
SET onboarding_completed = TRUE
WHERE email LIKE '%@demo.lumorius.com';