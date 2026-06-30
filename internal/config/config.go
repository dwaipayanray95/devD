package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	GithubToken string `json:"githubToken,omitempty"`
	Theme       string `json:"theme,omitempty"`
}

func getConfigFile() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	configDir := filepath.Join(home, ".devd")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(configDir, "config.json"), nil
}

func GetStoredToken() string {
	file, err := getConfigFile()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return ""
	}
	var conf Config
	if err := json.Unmarshal(data, &conf); err != nil {
		return ""
	}
	return conf.GithubToken
}

func SaveStoredToken(token string) bool {
	file, err := getConfigFile()
	if err != nil {
		return false
	}
	var conf Config
	data, err := os.ReadFile(file)
	if err == nil {
		_ = json.Unmarshal(data, &conf)
	}
	conf.GithubToken = token
	bytes, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		return false
	}
	err = os.WriteFile(file, bytes, 0644)
	return err == nil
}

func GetTheme() string {
	file, err := getConfigFile()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return ""
	}
	var conf Config
	if err := json.Unmarshal(data, &conf); err != nil {
		return ""
	}
	return conf.Theme
}

func SaveTheme(theme string) bool {
	file, err := getConfigFile()
	if err != nil {
		return false
	}
	var conf Config
	data, err := os.ReadFile(file)
	if err == nil {
		_ = json.Unmarshal(data, &conf)
	}
	conf.Theme = theme
	bytes, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		return false
	}
	err = os.WriteFile(file, bytes, 0644)
	return err == nil
}

func GetVersion() string {
	return "1.1.0"
}
