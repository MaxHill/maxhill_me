.PHONY: generate run

generate:
	protoc --go_out=. --go_opt=paths=source_relative -I=../../proto ../../proto/account.proto

run:
	go run main.go
