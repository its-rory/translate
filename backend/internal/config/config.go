package config

import (
	"fmt"
	"os"
	"strings"
	"sync"
)

type Config struct {
	AdminUsername string
	AdminPassword string
	JWTSecret     string
	EncryptionKey string
	DBPath        string
	Port          string
}

var (
	cfg     *Config
	cfgOnce sync.Once
)

func GetConfig() *Config {
	cfgOnce.Do(func() {
		cfg = &Config{
			AdminUsername: getEnv("ADMIN_USERNAME", "admin"),
			AdminPassword: getEnv("ADMIN_PASSWORD", ""),
			JWTSecret:     getEnv("JWT_SECRET", ""),
			EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
			DBPath:        getEnv("DB_PATH", "./data/translate.db"),
			Port:          getEnv("PORT", "8080"),
		}
	})
	return cfg
}

func (c *Config) Validate() error {
	if c.AdminPassword == "" {
		return fmt.Errorf("ADMIN_PASSWORD environment variable is required")
	}
	if strings.EqualFold(c.AdminPassword, "admin") {
		return fmt.Errorf("ADMIN_PASSWORD must not use the default value 'admin'")
	}
	if c.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET environment variable is required")
	}
	if c.EncryptionKey == "" {
		return fmt.Errorf("ENCRYPTION_KEY environment variable is required")
	}
	return nil
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
