module mckinsey.com/ark-broker-migrate

go 1.26.0

require github.com/golang-migrate/migrate/v4 v4.20.1

require (
	github.com/lib/pq v1.10.9 // indirect
	golang.org/x/sys v0.49.0 // indirect
)

replace (
	github.com/klauspost/compress => github.com/klauspost/compress v1.20.3
	golang.org/x/crypto => golang.org/x/crypto v0.58.0
	golang.org/x/net => golang.org/x/net v0.61.0
	golang.org/x/text => golang.org/x/text v0.41.0
	google.golang.org/grpc => google.golang.org/grpc v1.84.0
)
