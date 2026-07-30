//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"os"
	"strconv"
	"testing"
)

func testConfig(t *testing.T) Config {
	t.Helper()
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}
	port := 5432
	if p := os.Getenv("POSTGRES_PORT"); p != "" {
		port, _ = strconv.Atoi(p)
	}
	user := os.Getenv("POSTGRES_USER")
	if user == "" {
		user = "postgres"
	}
	db := os.Getenv("POSTGRES_DB")
	if db == "" {
		db = "ark"
	}
	return Config{
		Host:     host,
		Port:     port,
		Database: db,
		User:     user,
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}
}
