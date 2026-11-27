// Command server runs the VOCare kiosk: it serves the web app from dist/ and
// keeps the demo registration list that the kiosk and staff desk share.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	port := env("PORT", "3000")
	static := env("STATIC_DIR", "dist")
	store := OpenStore(env("DATA_FILE", "data/records.json"))

	mux := http.NewServeMux()
	mux.Handle("GET /", noCache(http.FileServer(http.Dir(static))))
	mux.HandleFunc("GET /api/records", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.List())
	})
	mux.HandleFunc("POST /api/records", func(w http.ResponseWriter, r *http.Request) {
		var in NewRecord
		if !readJSON(w, r, &in) {
			return
		}
		rec, created, err := store.Create(in)
		if err != nil {
			writeError(w, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		writeJSON(w, status, rec)
	})
	mux.HandleFunc("PATCH /api/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		var u StaffUpdate
		if !readJSON(w, r, &u) {
			return
		}
		rec, err := store.Update(r.PathValue("id"), u)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rec)
	})
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		events(w, r, store)
	})

	addr := ":" + port
	log.Printf("VOCare on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// events streams the full record list to a staff desk with Server-Sent
// Events: once on connect, then after every change.
func events(w http.ResponseWriter, r *http.Request, store *Store) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := store.Subscribe()
	defer store.Unsubscribe(ch)
	first, _ := json.Marshal(store.List())
	fmt.Fprintf(w, "data: %s\n\n", first)
	flusher.Flush()

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case data := <-ch:
			fmt.Fprintf(w, "data: %s\n\n", data)
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
		}
		flusher.Flush()
	}
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, ErrIncomplete), errors.Is(err, ErrBadInput):
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		http.Error(w, "server error", http.StatusInternalServerError)
	}
}

// noCache makes browsers revalidate the app files, so a redeploy shows up
// on the kiosk without a hard refresh.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
