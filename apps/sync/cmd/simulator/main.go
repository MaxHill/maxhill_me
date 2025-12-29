package main

import (
	"flag"
	"fmt"
	"log"
)

func main() {
	fileName := flag.String("file", "./cmd/simulator/client.go", "Path to client file")
	flag.Parse()

	client, err := StartClient(*fileName)
	if err != nil {
		log.Fatal(err)
	}

	var count = 1
	for range 30 {
		err = client.Call(map[string]int{"n": count}, &count)
		if err != nil {
			log.Fatal(err)
		}

		fmt.Println(count)
	}
}
