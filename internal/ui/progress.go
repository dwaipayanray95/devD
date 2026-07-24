package ui

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/progress"
	tea "github.com/charmbracelet/bubbletea"
)

type progressMsg float64
type progressDoneMsg struct {
	err error
}

type ProgressDownloadModel struct {
	Title     string
	URL       string
	DestPath  string
	Progress  progress.Model
	Err       error
	Done      bool
	Downloaded int64
	Total      int64
}

type progressWriter struct {
	total      int64
	downloaded int64
	program    *tea.Program
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	pw.downloaded += int64(n)
	if pw.total > 0 && pw.program != nil {
		ratio := float64(pw.downloaded) / float64(pw.total)
		pw.program.Send(progressMsg(ratio))
	}
	return n, nil
}

func NewProgressDownloadModel(title, url, destPath string) ProgressDownloadModel {
	pg := progress.New(
		progress.WithDefaultGradient(),
	)
	return ProgressDownloadModel{
		Title:    title,
		URL:      url,
		DestPath: destPath,
		Progress: pg,
	}
}

func (m ProgressDownloadModel) Init() tea.Cmd {
	return nil
}

func (m ProgressDownloadModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case progressMsg:
		cmd := m.Progress.SetPercent(float64(msg))
		return m, cmd

	case progressDoneMsg:
		m.Done = true
		m.Err = msg.err
		return m, tea.Quit

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" || msg.String() == "esc" {
			m.Done = true
			m.Err = fmt.Errorf("CANCELLED")
			return m, tea.Quit
		}

	case progress.FrameMsg:
		progressModel, cmd := m.Progress.Update(msg)
		m.Progress = progressModel.(progress.Model)
		return m, cmd
	}
	return m, nil
}

func (m ProgressDownloadModel) View() string {
	if m.Done {
		return ""
	}
	var s strings.Builder
	s.WriteString(RenderBanner(Version))
	s.WriteString(RenderDivider("Downloading Update", 54) + "\n\n")
	s.WriteString(fmt.Sprintf("   %s\n\n", Bright.Render(m.Title)))
	s.WriteString("   " + m.Progress.View() + "\n\n")
	s.WriteString(Dim.Render("  ────────────────────────────────────────────────────") + "\n")
	s.WriteString("   " + Muted.Render("Downloading binary release asset...") + "\n")
	return s.String()
}

func DownloadFileWithProgress(title, downloadUrl, destPath string) error {
	fmt.Print("\033[H\033[2J")
	m := NewProgressDownloadModel(title, downloadUrl, destPath)
	p := tea.NewProgram(m)

	go func() {
		resp, err := http.Get(downloadUrl)
		if err != nil {
			p.Send(progressDoneMsg{err: err})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusFound || resp.StatusCode == http.StatusMovedPermanently {
			loc := resp.Header.Get("Location")
			if loc != "" {
				resp, err = http.Get(loc)
				if err != nil {
					p.Send(progressDoneMsg{err: err})
					return
				}
				defer resp.Body.Close()
			}
		}

		if resp.StatusCode != http.StatusOK {
			p.Send(progressDoneMsg{err: fmt.Errorf("status code %d", resp.StatusCode)})
			return
		}

		out, err := os.Create(destPath)
		if err != nil {
			p.Send(progressDoneMsg{err: err})
			return
		}
		defer out.Close()

		pw := &progressWriter{
			total:   resp.ContentLength,
			program: p,
		}

		_, err = io.Copy(out, io.TeeReader(resp.Body, pw))
		p.Send(progressDoneMsg{err: err})
	}()

	finalModel, err := p.Run()
	if err != nil {
		return err
	}
	if pm, ok := finalModel.(ProgressDownloadModel); ok {
		return pm.Err
	}
	return nil
}
