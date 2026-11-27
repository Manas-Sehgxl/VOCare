package main

import (
	"path/filepath"
	"testing"
)

var savitri = Answers{Name: "Savitri Devi", Age: "approximately 55", Sex: "Female", Village: "Ramnagar", Complaint: "Pet mein teen din se dard hai"}

func TestTokensAreSequentialAndIdempotent(t *testing.T) {
	s := OpenStore("")
	a, created, err := s.Create(NewRecord{Kind: "registration", SessionID: "a", Answers: savitri, Raw: savitri})
	if err != nil || !created || a.Token != "OPD-001" || a.Status != StatusReview {
		t.Fatalf("first: %+v %v %v", a, created, err)
	}
	again, created, _ := s.Create(NewRecord{Kind: "registration", SessionID: "a", Answers: savitri})
	if created || again.Token != "OPD-001" || len(s.List()) != 1 {
		t.Fatalf("repeat confirm made a new record: %+v", again)
	}
	b, _, _ := s.Create(NewRecord{Kind: "registration", SessionID: "b", Answers: savitri})
	if b.Token != "OPD-002" || b.ID != "REG-0002" {
		t.Fatalf("second: %+v", b)
	}
}

func TestIncompleteRegistrationRejected(t *testing.T) {
	s := OpenStore("")
	_, _, err := s.Create(NewRecord{Kind: "registration", SessionID: "x", Answers: Answers{Name: "Savitri Devi"}})
	if err != ErrIncomplete {
		t.Fatalf("got %v", err)
	}
}

func TestAssistanceThenStaffRegisters(t *testing.T) {
	s := OpenStore("")
	r, _, err := s.Create(NewRecord{Kind: "assistance", SessionID: "h", Answers: Answers{Name: "Savitri Devi"}})
	if err != nil || r.Token != "" || r.Status != StatusAssistance {
		t.Fatalf("assistance: %+v %v", r, err)
	}
	if _, err := s.Update(r.ID, StaffUpdate{Answers: Answers{Name: "Savitri Devi"}, Department: "General OPD"}); err != ErrIncomplete {
		t.Fatalf("staff saved incomplete record: %v", err)
	}
	if _, err := s.Update(r.ID, StaffUpdate{Answers: savitri, Department: "Cardiology"}); err != ErrBadInput {
		t.Fatalf("accepted unknown department: %v", err)
	}
	done, err := s.Update(r.ID, StaffUpdate{Answers: savitri, Department: "Dental"})
	if err != nil || done.Status != StatusRegistered || done.Token != "OPD-001" || done.Department != "Dental" {
		t.Fatalf("staff update: %+v %v", done, err)
	}
}

func TestDepartmentOnlyForExplicitRequests(t *testing.T) {
	cases := map[string]string{
		"Pet mein teen din se dard hai": "General OPD",
		"Mujhe dentist ko dikhana hai":  "Dental",
		"ENT doctor se milna hai":       "ENT",
		"दाँत में दर्द है":              "General OPD",
		"Teen din se stomach pain hai":  "General OPD",
		"मुझे ईएनटी वाले डॉक्टर को दिखाना है": "ENT",
	}
	for in, want := range cases {
		if got := suggestDepartment(in); got != want {
			t.Errorf("%q: got %s, want %s", in, got, want)
		}
	}
}

func TestRecordsSurviveRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "records.json")
	s := OpenStore(path)
	s.Create(NewRecord{Kind: "registration", SessionID: "a", Answers: savitri})
	reopened := OpenStore(path)
	r, _, _ := reopened.Create(NewRecord{Kind: "registration", SessionID: "b", Answers: savitri})
	if r.Token != "OPD-002" {
		t.Fatalf("token after restart: %s", r.Token)
	}
}

func TestSexRequired(t *testing.T) {
	s := OpenStore("")
	noSex := savitri
	noSex.Sex = ""
	if _, _, err := s.Create(NewRecord{Kind: "registration", SessionID: "nosex", Answers: noSex}); err != ErrIncomplete {
		t.Fatalf("registration without sex: got %v, want ErrIncomplete", err)
	}
}
