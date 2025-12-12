package internal

import (
	"database/sql"
	"fmt"
	"math"

	_ "github.com/mattn/go-sqlite3"
)

// Constants define bounds on all inputs.
// Following TIGER_STYLE: "Put a limit on everything because, in reality,
// this is what we expect—everything has a limit."
const (
	MaxAccountNameLength = 255
	MinAccountNameLength = 1
	MaxBalanceCents      = math.MaxInt64 / 2 // Leave room for arithmetic
	MinBalanceCents      = 0                 // Balances cannot be negative
)

// Compile-time assertions to verify constant relationships.
// Following TIGER_STYLE: "Assert the relationships of compile-time constants
// as a sanity check, and also to document and enforce subtle invariants."
func init() {
	// Ensure our balance bounds are reasonable
	assert(MaxBalanceCents > 0, "MaxBalanceCents must be positive")
	assert(MinBalanceCents >= 0, "MinBalanceCents must be non-negative")
	assert(MaxBalanceCents > MinBalanceCents, "MaxBalanceCents must exceed MinBalanceCents")

	// Ensure name length bounds are reasonable
	assert(MinAccountNameLength > 0, "MinAccountNameLength must be positive")
	assert(MaxAccountNameLength >= MinAccountNameLength, "MaxAccountNameLength must be >= MinAccountNameLength")
	assert(MaxAccountNameLength <= 1024, "MaxAccountNameLength should be reasonable (<=1024)")
}

type Database interface {
	CreateAccount(name string, balanceCents int64) (int64, error)
	GetAccount(id int64) (*Account, error)
	UpdateBalance(id int64, deltaCents int64) error
	Close() error
}

// DB provides SQLite database operations.
// Can be backed by file (production) or in-memory (testing/simulation).
type DB struct {
	conn *sql.DB
}

// NewDB creates a file-backed SQLite database for production use.
func NewDB(path string) (*DB, error) {
	// Assert preconditions
	assert(path != "", "database path cannot be empty")

	// Configure SQLite for performance.
	// Following TIGER_STYLE: "The best time to solve performance is in the design phase."
	dsn := path + "?_journal_mode=WAL&_synchronous=NORMAL&_cache_size=-64000&_busy_timeout=5000"
	conn, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database at %s: %w", path, err)
	}

	// Configure connection pooling.
	// SQLite performs best with single writer in WAL mode.
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	conn.SetConnMaxLifetime(0)

	return initDB(conn)
}

// NewInMemoryDB creates an in-memory SQLite database for testing and simulation.
// Data is lost when the DB is closed.
func NewInMemoryDB() (*DB, error) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		return nil, fmt.Errorf("failed to create in-memory database: %w", err)
	}

	// In-memory can handle more concurrency
	conn.SetMaxOpenConns(4)
	conn.SetMaxIdleConns(2)

	return initDB(conn)
}

// initDB initializes the database schema.
// Shared by both file-backed and in-memory constructors.
func initDB(conn *sql.DB) (*DB, error) {
	assert(conn != nil, "sql.DB connection cannot be nil")

	// Verify connection actually works.
	// sql.Open doesn't connect immediately, so we need to ping.
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Create schema with SQL-level constraints for defense in depth.
	// Following TIGER_STYLE: "Pair assertions" - validate at multiple layers.
	// Note: SQLite CHECK constraints must use literals, not parameters.
	createTableSQL := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL CHECK(length(name) >= %d AND length(name) <= %d),
			balance INTEGER NOT NULL CHECK(balance >= %d)
		)
	`, MinAccountNameLength, MaxAccountNameLength, MinBalanceCents)

	_, err := conn.Exec(createTableSQL)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	db := &DB{conn: conn}

	// Assert postcondition
	assert(db.conn != nil, "DB.conn must not be nil after initialization")

	return db, nil
}

// CreateAccount creates a new account with the given name and initial balance.
// balanceCents is the initial balance in cents (e.g., 1000 = $10.00).
// Returns the new account ID on success.
func (db *DB) CreateAccount(name string, balanceCents int64) (int64, error) {
	// Assert preconditions - validate all inputs.
	// Following TIGER_STYLE: "Assert all function arguments and return values,
	// pre/postconditions and invariants."
	assert(db != nil, "DB receiver cannot be nil")
	assert(db.conn != nil, "DB.conn cannot be nil")

	// Assert positive space (what we expect)
	assertf(len(name) >= MinAccountNameLength,
		"account name too short: minimum %d characters, got %d",
		MinAccountNameLength, len(name))
	assertf(len(name) <= MaxAccountNameLength,
		"account name too long: maximum %d characters, got %d",
		MaxAccountNameLength, len(name))
	assertf(balanceCents >= MinBalanceCents,
		"balance cannot be negative: got %d cents",
		balanceCents)
	assertf(balanceCents <= MaxBalanceCents,
		"balance exceeds maximum: got %d, max is %d",
		balanceCents, MaxBalanceCents)

	// Execute insert
	result, err := db.conn.Exec(
		"INSERT INTO accounts (name, balance) VALUES (?, ?)",
		name,
		balanceCents,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to insert account: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert ID: %w", err)
	}

	// Assert postconditions
	assert(id > 0, "account ID must be positive after insert")

	return id, nil
}

// GetAccount retrieves an account by ID.
// Returns an error if the account does not exist.
func (db *DB) GetAccount(id int64) (*Account, error) {
	// Assert preconditions
	assert(db != nil, "DB receiver cannot be nil")
	assert(db.conn != nil, "DB.conn cannot be nil")
	assertf(id > 0, "account ID must be positive, got %d", id)

	var account Account
	err := db.conn.QueryRow(
		"SELECT id, name, balance FROM accounts WHERE id = ?",
		id,
	).Scan(&account.ID, &account.Name, &account.Balance)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("account not found: id=%d", id)
		}
		return nil, fmt.Errorf("failed to query account id=%d: %w", id, err)
	}

	// Assert invariants on data read from database.
	// Following TIGER_STYLE: "Pair assertions" - check data immediately after reading.
	// This catches database corruption early.
	assert(account.ID == id, "returned account ID must match requested ID")
	assert(account.ID > 0, "account ID must be positive")
	assertf(account.Balance >= MinBalanceCents,
		"data corruption: account %d has negative balance %d",
		account.ID, account.Balance)
	assertf(len(account.Name) >= MinAccountNameLength,
		"data corruption: account %d has name too short: %d characters",
		account.ID, len(account.Name))
	assertf(len(account.Name) <= MaxAccountNameLength,
		"data corruption: account %d has name too long: %d characters",
		account.ID, len(account.Name))

	return &account, nil
}

// UpdateBalance adjusts the account balance by the specified delta.
// deltaCents can be positive (deposit) or negative (withdrawal).
// Returns an error if the operation would result in a negative balance.
func (db *DB) UpdateBalance(id int64, deltaCents int64) error {
	// Assert preconditions
	assert(db != nil, "DB receiver cannot be nil")
	assert(db.conn != nil, "DB.conn cannot be nil")
	assertf(id > 0, "account ID must be positive, got %d", id)

	// Use a transaction to atomically read, check, and update balance.
	// This prevents TOCTOU (time-of-check-time-of-use) races.
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Safe: no-op if already committed

	// Read current balance
	var currentBalanceCents int64
	err = tx.QueryRow("SELECT balance FROM accounts WHERE id = ?", id).Scan(&currentBalanceCents)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("account not found: id=%d", id)
		}
		return fmt.Errorf("failed to query balance for id=%d: %w", id, err)
	}

	// Assert current balance is valid (database invariant)
	assertf(currentBalanceCents >= MinBalanceCents,
		"data corruption: account %d has negative balance %d before update",
		id, currentBalanceCents)

	// Check for integer overflow in arithmetic.
	// Following TIGER_STYLE: "Put a limit on everything" including arithmetic results.
	var newBalanceCents int64
	if deltaCents > 0 {
		// Check for overflow on addition
		if currentBalanceCents > MaxBalanceCents-deltaCents {
			return fmt.Errorf("balance overflow: current=%d, delta=%d would exceed max=%d",
				currentBalanceCents, deltaCents, MaxBalanceCents)
		}
		newBalanceCents = currentBalanceCents + deltaCents
	} else {
		// Check for underflow (negative balance)
		newBalanceCents = currentBalanceCents + deltaCents
		if newBalanceCents < MinBalanceCents {
			return fmt.Errorf("insufficient balance: current=%d, delta=%d would result in=%d",
				currentBalanceCents, deltaCents, newBalanceCents)
		}
	}

	// Assert the new balance is within bounds (positive space check)
	assert(newBalanceCents >= MinBalanceCents, "new balance must be non-negative")
	assert(newBalanceCents <= MaxBalanceCents, "new balance must not exceed maximum")

	// Perform update
	result, err := tx.Exec("UPDATE accounts SET balance = ? WHERE id = ?", newBalanceCents, id)
	if err != nil {
		return fmt.Errorf("failed to update balance for id=%d: %w", id, err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}

	// Assert exactly one row was updated
	assertf(rows == 1, "expected 1 row updated, got %d", rows)

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	assert(db != nil, "DB receiver cannot be nil")
	if db.conn == nil {
		return nil // Already closed
	}
	return db.conn.Close()
}
