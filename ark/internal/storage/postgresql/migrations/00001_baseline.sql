-- +goose Up
CREATE TABLE IF NOT EXISTS resources (
	id SERIAL PRIMARY KEY,
	kind TEXT NOT NULL,
	namespace TEXT NOT NULL,
	name TEXT NOT NULL,
	resource_version BIGSERIAL,
	generation BIGINT DEFAULT 1,
	uid TEXT NOT NULL,
	spec JSONB NOT NULL DEFAULT '{}',
	status JSONB DEFAULT '{}',
	labels JSONB DEFAULT '{}',
	annotations JSONB DEFAULT '{}',
	finalizers JSONB DEFAULT '[]',
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	deleted_at TIMESTAMPTZ
);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS finalizers JSONB DEFAULT '[]';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS owner_references JSONB DEFAULT '[]';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS deletion_timestamp TIMESTAMPTZ;

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_kind_namespace_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_unique_active ON resources(kind, namespace, name) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace ON resources(kind, namespace);
CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace_name ON resources(kind, namespace, name);
CREATE INDEX IF NOT EXISTS idx_resources_labels ON resources USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_resources_lookup ON resources(kind, namespace, name, resource_version);
CREATE INDEX IF NOT EXISTS idx_resources_deleted ON resources(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resources_kind_rv ON resources(kind, resource_version);
CREATE INDEX IF NOT EXISTS idx_resources_rv ON resources(resource_version);

CREATE TABLE IF NOT EXISTS storage_metadata (
	key TEXT PRIMARY KEY,
	value BIGINT NOT NULL
);

DROP TRIGGER IF EXISTS resource_change_trigger ON resources;
DROP FUNCTION IF EXISTS notify_resource_change();

-- +goose StatementBegin
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'ark_cdc') THEN
		CREATE PUBLICATION ark_cdc FOR TABLE resources;
	END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP PUBLICATION IF EXISTS ark_cdc;
DROP TABLE IF EXISTS storage_metadata;
DROP TABLE IF EXISTS resources;
