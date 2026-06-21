package logger

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxLogLines = 200

func GetLogDirPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".devd")
}

func GetLogFilePath() string {
	return filepath.Join(GetLogDirPath(), "devd.log")
}

func LogMessage(message string, level string) {
	logDir := GetLogDirPath()
	_ = os.MkdirAll(logDir, 0755)
	logFile := GetLogFilePath()

	timestamp := time.Now().Format(time.RFC3339)
	formattedLine := fmt.Sprintf("[%s] [%s] %s", timestamp, level, message)

	var lines []string
	if file, err := os.Open(logFile); err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
		file.Close()
	}

	lines = append(lines, formattedLine)
	if len(lines) > maxLogLines {
		lines = lines[len(lines)-maxLogLines:]
	}

	if file, err := os.Create(logFile); err == nil {
		writer := bufio.NewWriter(file)
		for _, line := range lines {
			_, _ = writer.WriteString(line + "\n")
		}
		_ = writer.Flush()
		file.Close()
	}
}

func GetLastLines(count int) string {
	logFile := GetLogFilePath()
	var lines []string
	if file, err := os.Open(logFile); err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
		file.Close()
	}

	if len(lines) == 0 {
		return ""
	}

	if len(lines) > count {
		lines = lines[len(lines)-count:]
	}

	return strings.Join(lines, "\n")
}
