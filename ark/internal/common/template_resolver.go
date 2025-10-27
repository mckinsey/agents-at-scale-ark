package common

import (
	"bytes"
	"text/template"
)

// ResolveTemplate resolves Go template strings using provided data.
// Returns the resolved string or the original template if an error occurs.
func ResolveTemplate(tmpl string, data map[string]any) (string, error) {
	if tmpl == "" {
		return "", nil
	}
	t, err := template.New("template").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}
