/* Copyright 2025. McKinsey & Company */

package config

import (
	"os"
	"sync"
)

type Config struct {
	DefaultExecutionMode string
	mu                   sync.RWMutex
}

func Load() *Config {
	return &Config{
		DefaultExecutionMode: getEnvOrDefault("ARK_DEFAULT_EXECUTION_MODE", "chat-completions"),
	}
}

func (c *Config) GetDefaultExecutionMode() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.DefaultExecutionMode
}

func (c *Config) SetDefaultExecutionMode(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.DefaultExecutionMode = mode
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

var globalConfig = Load()

func Global() *Config {
	return globalConfig
}
