package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	StatusAssistance = "Needs Assistance"
	StatusReview     = "Awaiting Department Review"
	StatusRegistered = "Registered"
)

var departments = []string{"General OPD", "Dental", "ENT"}

// Answers holds the five registration details. The same shape is used for the
// cleaned values shown on screen and for the patient's original words.
type Answers struct {
	Name      string `json:"name"`
	Age       string `json:"age"`
	Sex       string `json:"sex"`
	Village   string `json:"village"`
	Complaint string `json:"complaint"`
}

func (a Answers) complete() bool {
	return a.Name != "" && a.Age != "" && a.Sex != "" && a.Village != "" && a.Complaint != ""
}

func (a *Answers) trim() {
	for _, f := range []*string{&a.Name, &a.Age, &a.Sex, &a.Village, &a.Complaint} {
		*f = limit(*f, 500)
	}
}

type Record struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"sessionId"`
	Token      string    `json:"token"`
	Status     string    `json:"status"`
	Department string    `json:"department"`
	Language   string    `json:"language"`
	Answers    Answers   `json:"answers"`
	Raw        Answers   `json:"raw"`
	Gloss      string    `json:"gloss"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// NewRecord is what the kiosk sends. Kind is "registration" once the patient
// has confirmed every detail, or "assistance" when they asked for staff.
type NewRecord struct {
	Kind      string  `json:"kind"`
	SessionID string  `json:"sessionId"`
	Language  string  `json:"language"`
	Answers   Answers `json:"answers"`
	Raw       Answers `json:"raw"`
	Gloss     string  `json:"gloss"`
	Reason    string  `json:"reason"`
}

// StaffUpdate is what the staff desk sends when it saves a record.
type StaffUpdate struct {
	Answers    Answers `json:"answers"`
	Department string  `json:"department"`
}

var (
	ErrNotFound   = errors.New("record not found")
	ErrIncomplete = errors.New("all five details are required")
	ErrBadInput   = errors.New("invalid request")
)

type Store struct {
	mu      sync.Mutex
	records []Record
	path    string // empty means memory only
	subs    map[chan []byte]struct{}
}

func OpenStore(path string) *Store {
	s := &Store{path: path, subs: map[chan []byte]struct{}{}}
	if path == "" {
		return s
	}
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, &s.records); err != nil {
			fmt.Fprintf(os.Stderr, "ignoring unreadable %s: %v\n", path, err)
			s.records = nil
		}
	}
	return s
}

func (s *Store) List() []Record {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Record{}, s.records...)
}

// Create adds a record unless one already exists for the session, so a patient
// confirming twice (or a retried request) still gets exactly one token.
func (s *Store) Create(in NewRecord) (Record, bool, error) {
	in.SessionID = strings.TrimSpace(in.SessionID)
	if in.SessionID == "" || len(in.SessionID) > 100 {
		return Record{}, false, ErrBadInput
	}
	in.Answers.trim()
	in.Raw.trim()
	if in.Kind != "registration" && in.Kind != "assistance" {
		return Record{}, false, ErrBadInput
	}
	if in.Kind == "registration" && !in.Answers.complete() {
		return Record{}, false, ErrIncomplete
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.records {
		if r.SessionID == in.SessionID {
			return r, false, nil
		}
	}
	now := time.Now().UTC()
	r := Record{
		ID:         fmt.Sprintf("REG-%04d", len(s.records)+1),
		SessionID:  in.SessionID,
		Language:   in.Language,
		Answers:    in.Answers,
		Raw:        in.Raw,
		Gloss:      limit(in.Gloss, 300),
		Reason:     limit(in.Reason, 200),
		Department: suggestDepartment(in.Raw.Complaint + " " + in.Answers.Complaint),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if in.Kind == "registration" {
		r.Token = s.nextToken()
		r.Status = StatusReview
	} else {
		r.Status = StatusAssistance
	}
	s.records = append(s.records, r)
	s.changed()
	return r, true, nil
}

// Update applies staff corrections and marks the record registered.
func (s *Store) Update(id string, u StaffUpdate) (Record, error) {
	u.Answers.trim()
	if !u.Answers.complete() {
		return Record{}, ErrIncomplete
	}
	if !validDepartment(u.Department) {
		return Record{}, ErrBadInput
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.records {
		r := &s.records[i]
		if r.ID != id {
			continue
		}
		r.Answers = u.Answers
		r.Department = u.Department
		r.Status = StatusRegistered
		if r.Token == "" {
			r.Token = s.nextToken()
		}
		r.UpdatedAt = time.Now().UTC()
		s.changed()
		return *r, nil
	}
	return Record{}, ErrNotFound
}

// nextToken must be called with s.mu held.
func (s *Store) nextToken() string {
	max := 0
	for _, r := range s.records {
		if n, err := strconv.Atoi(strings.TrimPrefix(r.Token, "OPD-")); err == nil && n > max {
			max = n
		}
	}
	return fmt.Sprintf("OPD-%03d", max+1)
}

func (s *Store) Subscribe() chan []byte {
	ch := make(chan []byte, 4)
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()
	return ch
}

func (s *Store) Unsubscribe(ch chan []byte) {
	s.mu.Lock()
	delete(s.subs, ch)
	s.mu.Unlock()
}

// changed saves to disk and pushes the new list to every open staff desk.
// It must be called with s.mu held.
func (s *Store) changed() {
	data, _ := json.Marshal(s.records)
	if s.path != "" {
		if err := writeFile(s.path, data); err != nil {
			fmt.Fprintf(os.Stderr, "could not save %s: %v (keeping records in memory)\n", s.path, err)
			s.path = ""
		}
	}
	for ch := range s.subs {
		select {
		case ch <- data:
		default: // a slow client gets the next update instead
		}
	}
}

func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// suggestDepartment is mock administrative routing: only explicit requests
// for a dentist or ENT move away from General OPD. It never diagnoses.
func suggestDepartment(complaint string) string {
	c := strings.ToLower(complaint)
	for _, w := range []string{"dentist", "dental", "daant ka doctor", "दांत के डॉक्टर", "दाँत के डॉक्टर", "डेंटिस्ट", "दंत चिकित्सक"} {
		if strings.Contains(c, w) {
			return "Dental"
		}
	}
	for _, w := range []string{" ent ", "e.n.t", "ईएनटी", "ई एन टी", "ent doctor", "ent wale", "नाक कान गला"} {
		if strings.Contains(" "+c+" ", w) {
			return "ENT"
		}
	}
	return "General OPD"
}

func validDepartment(d string) bool {
	for _, x := range departments {
		if d == x {
			return true
		}
	}
	return false
}

// limit trims spaces and cuts s to n characters without splitting a
// Devanagari letter in half.
func limit(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
