package content

type ProvisionParams struct {
	TargetPath  string
	Credentials map[string]string
	Config      map[string]interface{}
}

type Provisioner interface {
	Provision(params ProvisionParams) error
}
