package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

type contextKey string

const UserIDKey contextKey = "userID"

// UserIDFromContext extracts the userID from the request context.
func UserIDFromContext(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(UserIDKey).(string)
	return v, ok
}

// Middleware validates JWT bearer tokens against a JWKS endpoint.
type Middleware struct {
	keySet jwk.Set
	cache  *jwk.Cache
}

// NewMiddleware creates auth middleware that fetches and caches JWKS from issuerURL.
// The issuerURL should be the base URL of the auth issuer (e.g. https://auth.example.com).
// JWKS will be fetched from {issuerURL}/.well-known/jwks.json.
func NewMiddleware(ctx context.Context, issuerURL string) (*Middleware, error) {
	jwksURL := strings.TrimRight(issuerURL, "/") + "/.well-known/jwks.json"
	cache := jwk.NewCache(ctx)
	err := cache.Register(jwksURL, jwk.WithMinRefreshInterval(5*time.Minute))
	if err != nil {
		return nil, err
	}

	// Perform initial fetch
	_, err = cache.Refresh(ctx, jwksURL)
	if err != nil {
		return nil, err
	}

	keySet := jwk.NewCachedSet(cache, jwksURL)

	return &Middleware{keySet: keySet, cache: cache}, nil
}

// NewMiddlewareWithKeySet creates auth middleware with a pre-built key set (useful for testing).
func NewMiddlewareWithKeySet(keySet jwk.Set) *Middleware {
	return &Middleware{keySet: keySet}
}

// Wrap returns an http.Handler that validates the JWT before calling next.
func (m *Middleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			writeError(w, http.StatusUnauthorized, "malformed authorization header")
			return
		}
		tokenStr := parts[1]

		token, err := jwt.Parse([]byte(tokenStr), jwt.WithKeySet(m.keySet))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}

		userID, ok := token.PrivateClaims()["userID"]
		if !ok {
			// Also try "sub" as fallback
			userID = token.Subject()
		}
		userIDStr, _ := userID.(string)
		if userIDStr == "" {
			writeError(w, http.StatusUnauthorized, "token missing userID claim")
			return
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userIDStr)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
