package workspace

type ProvisionRequest struct {
	QueryUID    string            `json:"queryUid"`
	Environment *EnvironmentSpec  `json:"environment,omitempty"`
	Content     *ContentSpec      `json:"content,omitempty"`
	MountPath   string            `json:"mountPath,omitempty"`
	Persistent  bool              `json:"persistent"`
	Credentials map[string]string `json:"credentials,omitempty"`
}

type EnvironmentSpec struct {
	Image      *ImageSpec `json:"image,omitempty"`
	SourcePath string     `json:"sourcePath,omitempty"`
}

type ImageSpec struct {
	Ref string `json:"ref"`
}

type ContentSpec struct {
	Git           *GitSpec           `json:"git,omitempty"`
	ObjectStorage *ObjectStorageSpec `json:"objectStorage,omitempty"`
	Archive       *ArchiveSpec       `json:"archive,omitempty"`
	Empty         *EmptySpec         `json:"empty,omitempty"`
}

type GitSpec struct {
	URL         string `json:"url"`
	Branch      string `json:"branch,omitempty"`
	Path        string `json:"path,omitempty"`
	Depth       int    `json:"depth,omitempty"`
	AuthToken   string `json:"authToken,omitempty"`
	SSHKeyPath  string `json:"sshKeyPath,omitempty"`
}

type ObjectStorageSpec struct {
	Provider  string `json:"provider"`
	Bucket    string `json:"bucket"`
	Prefix    string `json:"prefix,omitempty"`
	AuthToken string `json:"authToken,omitempty"`
}

type ArchiveSpec struct {
	URL       string `json:"url"`
	Format    string `json:"format,omitempty"`
	AuthToken string `json:"authToken,omitempty"`
}

type EmptySpec struct{}

type ProvisionResponse struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	ContentType string `json:"contentType,omitempty"`
}

type AcquireRequest struct {
	QueryUID  string `json:"queryUid"`
	SessionID string `json:"sessionId,omitempty"`
}

type AcquireResponse struct {
	Path      string `json:"path"`
	SessionID string `json:"sessionId"`
}

type ReleaseRequest struct {
	QueryUID      string         `json:"queryUid"`
	AutoCommit    *AutoCommitConfig `json:"autoCommit,omitempty"`
}

type AutoCommitConfig struct {
	Enabled    bool   `json:"enabled"`
	Message    string `json:"message,omitempty"`
	PushBranch string `json:"pushBranch,omitempty"`
	UserName   string `json:"userName,omitempty"`
	UserEmail  string `json:"userEmail,omitempty"`
}

type StatusResponse struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Phase       string `json:"phase"`
	ContentType string `json:"contentType,omitempty"`
	QueryUID    string `json:"queryUid,omitempty"`
}
