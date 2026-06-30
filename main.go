package main

import (
	_ "embed"
	"encoding/json"

	"github.com/dwaipayanray95/devD/cmd"
)

//go:embed package.json
var packageJSON []byte

func main() {
	var pkg struct {
		Version string `json:"version"`
	}
	ver := "1.1.0"
	if err := json.Unmarshal(packageJSON, &pkg); err == nil && pkg.Version != "" {
		ver = pkg.Version
	}
	cmd.Execute(ver)
}
