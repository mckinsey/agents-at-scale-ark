package main

import (
	"errors"
	"flag"
	"log"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	path := flag.String("path", "", "directory containing migration files")
	database := flag.String("database", "", "database connection URL")
	flag.Parse()

	if *path == "" || *database == "" {
		log.Fatal("migrate: -path and -database are required")
	}

	m, err := migrate.New("file://"+*path, *database)
	if err != nil {
		log.Fatalf("migrate: init: %v", err)
	}
	defer func() { _, _ = m.Close() }()

	args := flag.Args()
	if len(args) == 0 {
		log.Fatal("migrate: expected a command: up or down")
	}

	switch args[0] {
	case "up":
		err = m.Up()
	case "down":
		if len(args) > 1 {
			n, perr := strconv.Atoi(args[1])
			if perr != nil {
				log.Fatalf("migrate: invalid down steps %q: %v", args[1], perr)
			}
			err = m.Steps(-n)
		} else {
			err = m.Down()
		}
	default:
		log.Fatalf("migrate: unknown command %q", args[0])
	}

	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("migrate: %v", err)
	}

	log.Println("migrate: done")
}
