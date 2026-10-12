-- +goose Up
ALTER TABLE resources ADD COLUMN api_version TEXT NOT NULL DEFAULT '';
UPDATE resources SET api_version = '' WHERE api_version IS NULL;

-- +goose Down
ALTER TABLE resources DROP COLUMN api_version;
