package main

import (
	"fmt"
	"os"
	"time"
)

// Spinner represents a simple command-line spinner.
type Spinner struct {
	stopChan chan struct{}
	doneChan chan struct{}
	frames   []string
	interval time.Duration
	active   bool
	text     string
	textChan chan string
}

var defaultSpinnerFrames = []string{"—", "\\", "|", "/"}

// NewSpinner creates a new Spinner with default frames and interval.
func NewSpinner() *Spinner {
	return &Spinner{
		stopChan: make(chan struct{}),
		doneChan: make(chan struct{}),
		frames:   defaultSpinnerFrames,
		interval: 100 * time.Millisecond,
		active:   false,
		textChan: make(chan string, 1),
	}
}

// Start begins the spinner animation.
func (s *Spinner) Start() {
	if s.active {
		return
	}

	s.active = true
	go func() {
		defer close(s.doneChan)
		for i := 0; ; i++ {
			select {
			case <-s.stopChan:
				fmt.Fprintf(os.Stderr, "\r\033[K")
				return
			case newText := <-s.textChan:
				s.text = newText
			case <-time.After(s.interval):
				if s.text != "" {
					fmt.Fprintf(os.Stderr, "\r\033[K%s %s", s.frames[i%len(s.frames)], s.text)
				} else {
					fmt.Fprintf(os.Stderr, "\r%s", s.frames[i%len(s.frames)])
				}
			}
		}
	}()
}

func (s *Spinner) SetText(text string) {
	if !s.active {
		return
	}
	select {
	case s.textChan <- text:
	default:
	}
}

// Stop halts the spinner animation.
func (s *Spinner) Stop() {
	if !s.active {
		return
	}

	close(s.stopChan)
	<-s.doneChan // Wait for the spinner goroutine to finish
	s.active = false
	s.text = ""
	s.stopChan = make(chan struct{})
	s.doneChan = make(chan struct{})
	s.textChan = make(chan string, 1)
}
