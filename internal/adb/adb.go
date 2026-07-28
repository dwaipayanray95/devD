package adb

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/dwaipayanray95/devD/internal/ui"
	qrcode "github.com/skip2/go-qrcode"
)

// CheckADBInstalled verifies if adb command is available in PATH
func CheckADBInstalled() bool {
	_, err := exec.LookPath("adb")
	return err == nil
}

// RunADBCommand executes adb with provided arguments
func RunADBCommand(args []string) (string, error) {
	cmd := exec.Command("adb", args...)
	out, err := cmd.CombinedOutput()
	outStr := strings.TrimSpace(string(out))
	if err != nil {
		return outStr, fmt.Errorf("adb failed: %w - %s", err, outStr)
	}
	return outStr, nil
}

// GetLocalIP returns the primary non-loopback local IPv4 address
func GetLocalIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				return ipNet.IP.String(), nil
			}
		}
	}
	return "", fmt.Errorf("no active IPv4 network interface found")
}

// GeneratePairingCode generates a secure 6-digit numeric pairing password
func GeneratePairingCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "123456"
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// RenderASCIIQRCode converts a go-qrcode matrix into ANSI Unicode block art
func RenderASCIIQRCode(content string) (string, error) {
	qr, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return "", err
	}

	bitmap := qr.Bitmap()
	size := len(bitmap)

	var sb strings.Builder
	// Render using Unicode half-block characters (▄ / █ / ▀) for compact square QR rendering
	for y := 0; y < size; y += 2 {
		sb.WriteString("   ")
		for x := 0; x < size; x++ {
			top := bitmap[y][x]
			bottom := false
			if y+1 < size {
				bottom = bitmap[y+1][x]
			}

			if top && bottom {
				sb.WriteString("█")
			} else if top && !bottom {
				sb.WriteString("▀")
			} else if !top && bottom {
				sb.WriteString("▄")
			} else {
				sb.WriteString(" ")
			}
		}
		sb.WriteString("\n")
	}
	return sb.String(), nil
}

// ShowADBMenu renders the interactive Android & ADB Debugging Menu
func ShowADBMenu() {
	if !CheckADBInstalled() {
		ui.PrintBanner(ui.GetProjectInfo())
		fmt.Println(ui.Error.Render("✖ Android Debug Bridge ('adb') is not installed or not in PATH."))
		fmt.Println(ui.Muted.Render("  Please install Android Platform Tools via brew, apt, or Android Studio."))
		ui.PressEnterToContinue()
		return
	}

	for {
		ui.PrintBanner(ui.GetProjectInfo())
		fmt.Println(ui.RenderDivider("Android & ADB Debugging Suite", 54))
		fmt.Println()

		choices := []string{
			"📶  Wireless Debugging QR Pairing (adbqr)",
			"📱  List Connected Devices & Status",
			"📷  Capture Device Screenshot to Workspace",
			"📹  Record Device Screen (.mp4)",
			"🖥️   Launch Scrcpy Mirroring (if installed)",
			"📋  Stream Device Crash Logs (Logcat)",
			"🔄  Restart ADB Server",
			"◁  Back to main menu",
		}

		chosen, err := ui.PromptSelect("Select ADB operation:", choices)
		if err != nil || strings.Contains(chosen, "Back") || strings.Contains(chosen, "◁") {
			return
		}

		switch {
		case strings.Contains(chosen, "Wireless Debugging QR"):
			StartWirelessQRPairing()

		case strings.Contains(chosen, "List Connected Devices"):
			out, err := ui.RunTaskWithSpinner("Polling ADB Devices", func() (string, error) {
				res, err := RunADBCommand([]string{"devices", "-l"})
				if err != nil {
					return "", err
				}
				if res == "" {
					return "No Android devices connected.", nil
				}
				return "Connected ADB Devices:\n\n" + res, nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Connected Devices", out)
			}

		case strings.Contains(chosen, "Capture Device Screenshot"):
			cwd, _ := os.Getwd()
			localPath := filepath.Join(cwd, "screenshot.png")

			out, err := ui.RunTaskWithSpinner("Capturing Screenshot from Device", func() (string, error) {
				_, err := RunADBCommand([]string{"exec-out", "screencap", "-p"})
				if err != nil {
					return "", err
				}

				// Execute screencap to local file
				file, err := os.Create(localPath)
				if err != nil {
					return "", err
				}
				defer file.Close()

				cmd := exec.Command("adb", "exec-out", "screencap", "-p")
				cmd.Stdout = file
				if err := cmd.Run(); err != nil {
					return "", err
				}
				return fmt.Sprintf("✔ Screenshot captured successfully!\nSaved to: %s", localPath), nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Screenshot Captured", out)
			}

		case strings.Contains(chosen, "Record Device Screen"):
			cwd, _ := os.Getwd()
			localPath := filepath.Join(cwd, "screenrecord.mp4")

			ui.PrintBanner(ui.GetProjectInfo())
			fmt.Println(ui.Info.Render("Recording screen for 10 seconds (or until interrupted)..."))
			
			res, err := ui.RunTaskWithSpinner("Recording Device Screen (10s)", func() (string, error) {
				// Record to /sdcard/demo.mp4 for 10s
				_, _ = RunADBCommand([]string{"shell", "screenrecord", "--time-limit", "10", "/sdcard/demo.mp4"})
				// Pull to computer
				_, err := RunADBCommand([]string{"pull", "/sdcard/demo.mp4", localPath})
				// Clean up phone storage
				_, _ = RunADBCommand([]string{"shell", "rm", "/sdcard/demo.mp4"})
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("✔ Screen recording saved successfully!\nSaved to: %s", localPath), nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Screen Recording", res)
			}

		case strings.Contains(chosen, "Launch Scrcpy"):
			if _, err := exec.LookPath("scrcpy"); err != nil {
				ui.PrintBanner(ui.GetProjectInfo())
				fmt.Println(ui.Error.Render("✖ 'scrcpy' is not installed."))
				fmt.Println(ui.Muted.Render("  Install it via: brew install scrcpy (macOS) or choco install scrcpy (Windows)"))
				ui.PressEnterToContinue()
			} else {
				cmd := exec.Command("scrcpy")
				_ = cmd.Start()
				fmt.Println(ui.Success.Render("\n✔ Launched scrcpy screen mirroring!"))
				ui.PressEnterToContinue()
			}

		case strings.Contains(chosen, "Stream Device Crash Logs"):
			out, err := ui.RunTaskWithSpinner("Fetching Device Logcat Crashes", func() (string, error) {
				res, err := RunADBCommand([]string{"logcat", "-d", "*:E"})
				if err != nil {
					return "", err
				}
				if res == "" {
					return "No error/crash logs found in device logcat buffer.", nil
				}
				return res, nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Logcat Error Stream", out)
			}

		case strings.Contains(chosen, "Restart ADB Server"):
			out, err := ui.RunTaskWithSpinner("Restarting ADB Daemon Server", func() (string, error) {
				_, _ = RunADBCommand([]string{"kill-server"})
				res, err := RunADBCommand([]string{"start-server"})
				if err != nil {
					return "", err
				}
				return "✔ ADB Server restarted successfully.\n" + res, nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Server Status", out)
			}
		}
	}
}

// StartWirelessQRPairing generates Android 11+ Wireless Pairing QR Code & starts adb pair
func StartWirelessQRPairing() {
	ip, err := GetLocalIP()
	if err != nil {
		ui.PrintBanner(ui.GetProjectInfo())
		fmt.Println(ui.Error.Render("✖ Could not detect local Wi-Fi IP address: " + err.Error()))
		ui.PressEnterToContinue()
		return
	}

	port := "5555"
	code := GeneratePairingCode()
	// Android Wireless Debugging pairing format: WIFI:S:name;T:ADB;P:password;;
	qrSchema := fmt.Sprintf("WIFI:T:ADB;S:devD-ADB-%s;P:%s;;", ip, code)

	qrArt, err := RenderASCIIQRCode(qrSchema)
	if err != nil {
		ui.PrintBanner(ui.GetProjectInfo())
		fmt.Println(ui.Error.Render("✖ Failed to render QR code: " + err.Error()))
		ui.PressEnterToContinue()
		return
	}

	ui.PrintBanner(ui.GetProjectInfo())
	fmt.Println(ui.Accent.Render("  │  Android 11+ Wireless Debugging Pairing (adbqr)"))
	fmt.Println()
	fmt.Println(ui.Info.Render("  1. Connect your Android phone to the same Wi-Fi network."))
	fmt.Println(ui.Info.Render("  2. Open Settings > Developer Options > Wireless Debugging."))
	fmt.Println(ui.Info.Render("  3. Tap 'Pair device with QR code' and scan the code below:\n"))

	fmt.Println(qrArt)
	fmt.Printf("   %s IP Address: %s\n", ui.Bright.Render("✦"), ui.Info.Render(ip))
	fmt.Printf("   %s Pairing Code: %s\n\n", ui.Bright.Render("✦"), ui.Success.Render(code))

	pairChoice, _ := ui.PromptConfirm("Would you like to manually connect to IP:Port now?", false)
	if pairChoice {
		connectTarget, err := ui.PromptInput(fmt.Sprintf("Enter Android IP:Port (e.g. %s:5555):", ip), ip+":"+port)
		if err == nil && connectTarget != "" {
			resp, err := ui.RunTaskWithSpinner("Connecting Wireless ADB to "+connectTarget, func() (string, error) {
				res, err := RunADBCommand([]string{"connect", connectTarget})
				if err != nil {
					return "", err
				}
				return "✔ Wireless ADB Connection Result:\n" + res, nil
			})
			if err != nil {
				fmt.Println(ui.Error.Render("\nError: " + err.Error()))
				ui.PressEnterToContinue()
			} else {
				ui.ShowViewport("ADB Wireless Connect Result", resp)
			}
		}
	}
}
