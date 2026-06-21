package detector

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type PlatformInfo struct {
	PlatformName string
	RunCommand   string
	RunArgs      []string
	BuildCommand string
	BuildArgs    []string
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return false
	}
	return info.IsDir()
}

func DetectPlatform() *PlatformInfo {
	cwd, err := os.Getwd()
	if err != nil {
		return nil
	}

	// 1. Flutter
	if fileExists(filepath.Join(cwd, "pubspec.yaml")) {
		return &PlatformInfo{
			PlatformName: "Flutter",
			RunCommand:   "flutter",
			RunArgs:      []string{"run"},
			BuildCommand: "flutter",
			BuildArgs:    []string{"build", "apk"},
		}
	}

	// 2. Tauri
	if dirExists(filepath.Join(cwd, "src-tauri")) {
		return &PlatformInfo{
			PlatformName: "Tauri (Rust/JS)",
			RunCommand:   "npm",
			RunArgs:      []string{"run", "tauri", "dev"},
			BuildCommand: "npm",
			BuildArgs:    []string{"run", "tauri", "build"},
		}
	}

	// 3. Node.js (React/Vite/Next/Express etc.)
	pkgJSONPath := filepath.Join(cwd, "package.json")
	if fileExists(pkgJSONPath) {
		runArgs := []string{"start"}
		
		// Parse package.json scripts to see if "dev" or "build" are present
		if data, err := os.ReadFile(pkgJSONPath); err == nil {
			var pkg map[string]interface{}
			if err := json.Unmarshal(data, &pkg); err == nil {
				if scripts, ok := pkg["scripts"].(map[string]interface{}); ok {
					if _, hasDev := scripts["dev"]; hasDev {
						runArgs = []string{"run", "dev"}
					}
				}
			}
		}

		return &PlatformInfo{
			PlatformName: "Node.js (NPM)",
			RunCommand:   "npm",
			RunArgs:      runArgs,
			BuildCommand: "npm",
			BuildArgs:    []string{"run", "build"},
		}
	}

	// 4. Cargo / Rust
	if fileExists(filepath.Join(cwd, "Cargo.toml")) {
		return &PlatformInfo{
			PlatformName: "Rust (Cargo)",
			RunCommand:   "cargo",
			RunArgs:      []string{"run"},
			BuildCommand: "cargo",
			BuildArgs:    []string{"build", "--release"},
		}
	}

	// 5. Gradle / Java
	gradlew := "./gradlew"
	if fileExists(filepath.Join(cwd, "gradlew.bat")) && os.Getenv("OS") == "Windows_NT" {
		gradlew = "gradlew.bat"
	}
	if fileExists(filepath.Join(cwd, "build.gradle")) {
		return &PlatformInfo{
			PlatformName: "Java (Gradle)",
			RunCommand:   gradlew,
			RunArgs:      []string{"run"},
			BuildCommand: gradlew,
			BuildArgs:    []string{"build"},
		}
	}

	// 6. Go
	if fileExists(filepath.Join(cwd, "go.mod")) {
		return &PlatformInfo{
			PlatformName: "Go (Golang)",
			RunCommand:   "go",
			RunArgs:      []string{"run", "."},
			BuildCommand: "go",
			BuildArgs:    []string{"build"},
		}
	}

	// 7. Python
	if fileExists(filepath.Join(cwd, "requirements.txt")) {
		pyCmd := "python3"
		if fileExists(filepath.Join(cwd, "main.py")) {
			return &PlatformInfo{
				PlatformName: "Python",
				RunCommand:   pyCmd,
				RunArgs:      []string{"main.py"},
				BuildCommand: "echo",
				BuildArgs:    []string{"Python apps don't require compilation"},
			}
		}
	}

	return nil
}
