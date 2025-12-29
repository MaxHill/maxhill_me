package database

import (
	"context"
	"database/sql"
	"log"
	"sync/internal/repository"
	"sync/internal/utils"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Service interface {
	// Close terminates the database connection.
	Close() error

	Queries() *repository.Queries
	Begin() (*sql.Tx, error)
}

type service struct {
	db      *sql.DB
	queries *repository.Queries
}

var (
	dbInstance *service
)

type DBConfig struct {
	DBUrl           string
	BusyTimeout     int
	MaxOpenConns    int
	MaxIdleConns    int // Keep all connections ready
	ConnMaxLifetime time.Duration
}

func New(config DBConfig) Service {
	utils.Assert(config.DBUrl != "", "Database url may not be empty")
	utils.Assert(len(config.DBUrl) > 3, "Database url is too short %s", config.DBUrl)
	utils.Assert(config.BusyTimeout >= 0, "BusyTimeout cannot be negative %d", config.BusyTimeout)
	utils.Assert(config.MaxOpenConns > 0, "MaxOpenConns must be positive %d", config.MaxOpenConns)
	utils.Assert(config.MaxIdleConns >= 0, "MaxOpenConns cannot be negative %d", config.MaxIdleConns)
	utils.Assert(config.ConnMaxLifetime >= time.Duration(0), "ConnMaxLifetime must be positive %d", config.MaxOpenConns)

	if dbInstance != nil {
		return dbInstance
	}

	db, err := sql.Open("sqlite3", config.DBUrl+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		// This will not be a connection error, but a DSN parse error or
		// another initialization error.
		log.Fatal(err)
	}
	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)

	queries := repository.New(db)

	// Initialize schema
	err = queries.InitSchema(context.Background())
	if err != nil {
		log.Fatalf("Error initializing database schema: %v", err)
	}

	err = queries.InitializeServerVersion(context.Background())
	if err != nil {
		log.Fatalf("Error initializing server version: %v", err)
	}

	dbInstance = &service{
		db:      db,
		queries: queries,
	}

	utils.Assert(dbInstance.db != nil, "dbInstance.db cannot be nil")
	utils.Assert(dbInstance.queries != nil, "dbInstance.queries cannot be nil")
	utils.Assert(dbInstance.db.Stats().OpenConnections > 0, "OpenConnections should be above 0 since we just connected")
	return dbInstance
}

// Close closes the database connection.
func (s *service) Close() error {
	return s.db.Close()
}

func (s *service) Queries() *repository.Queries {
	return s.queries
}

func (s *service) Begin() (*sql.Tx, error) {
	return s.db.Begin()
}
