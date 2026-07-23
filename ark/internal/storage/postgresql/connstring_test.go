/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"net"
	"strings"
	"testing"
)

func TestNew_UnreachableDatabase(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	_, err = New(Config{Host: "127.0.0.1", Port: port, Database: "ark", User: "ark", Password: "secret"}, nil)
	if err == nil {
		t.Fatal("expected error for unreachable database")
	}
	if !strings.Contains(err.Error(), "failed to connect") {
		t.Errorf("error = %q, want connect failure", err.Error())
	}
}

func TestBuildConnString(t *testing.T) {
	tests := []struct {
		name     string
		cfg      Config
		contains []string
		absent   []string
	}{
		{
			name:     "mode only",
			cfg:      Config{Host: "db", Port: 5432, User: "ark", Password: "pw", Database: "ark", SSLMode: "require"},
			contains: []string{"host='db'", "port=5432", "sslmode='require'"},
			absent:   []string{"sslrootcert=", "sslcert=", "sslkey="},
		},
		{
			name:     "verify-full with ca bundle",
			cfg:      Config{SSLMode: "verify-full", SSLRootCert: "/etc/ark/postgres-tls/ca.crt"},
			contains: []string{"sslmode='verify-full'", "sslrootcert='/etc/ark/postgres-tls/ca.crt'"},
			absent:   []string{"sslcert=", "sslkey="},
		},
		{
			name:     "mutual tls",
			cfg:      Config{SSLMode: "verify-full", SSLRootCert: "/c/ca.crt", SSLCert: "/c/tls.crt", SSLKey: "/c/tls.key"},
			contains: []string{"sslrootcert='/c/ca.crt'", "sslcert='/c/tls.crt'", "sslkey='/c/tls.key'"},
		},
		{
			name:     "password with space is quoted",
			cfg:      Config{Host: "db", Password: "pass word", SSLMode: "require"},
			contains: []string{"password='pass word'"},
		},
		{
			name:     "password with quote and backslash is escaped",
			cfg:      Config{Password: `a'b\c`, SSLMode: "require"},
			contains: []string{`password='a\'b\\c'`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildConnString(tt.cfg)
			for _, want := range tt.contains {
				if !strings.Contains(got, want) {
					t.Errorf("conn string %q missing %q", got, want)
				}
			}
			for _, no := range tt.absent {
				if strings.Contains(got, no) {
					t.Errorf("conn string %q should not contain %q", got, no)
				}
			}
		})
	}
}
